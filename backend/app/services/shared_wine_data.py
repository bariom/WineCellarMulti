from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AiAuditLog, SharedWineFact, SharedWineIdentity, Wine

SHARED_FEATURES = ("notes", "drink_window", "value", "grapes", "scores")
LOCALE_FEATURES = {"notes", "drink_window", "value"}
FORMAT_FEATURES = {"drink_window", "value"}
VALUE_TTL = timedelta(days=14)


def normalize_identity_part(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "").strip().casefold())
    ascii_value = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", ascii_value).strip()


def normalize_format(value: object) -> str:
    normalized = normalize_identity_part(value).replace(" ", "")
    if (
        normalized in {"", "bottle", "bottiglia"}
        or "75cl" in normalized
        or "750ml" in normalized
        or "075l" in normalized
    ):
        return "750ml"
    if (
        "magnum" in normalized
        or "150cl" in normalized
        or "1500ml" in normalized
        or normalized in {"15l"}
    ):
        return "1500ml"
    return normalized[:80]


def identity_parts(wine: Wine) -> tuple[str, str, str] | None:
    name = normalize_identity_part(wine.name)
    producer = normalize_identity_part(wine.producer)
    vintage = normalize_identity_part(wine.vintage)
    if not name or not producer or not vintage:
        return None
    return name, producer, vintage


def identity_key(parts: tuple[str, str, str]) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def resolve_shared_identity(
    db: Session, wine: Wine, *, create: bool
) -> SharedWineIdentity | None:
    parts = identity_parts(wine)
    if parts is None:
        wine.shared_identity_id = None
        return None
    key = identity_key(parts)
    identity = db.scalar(select(SharedWineIdentity).where(SharedWineIdentity.identity_key == key))
    if identity is None and create:
        identity = SharedWineIdentity(
            identity_key=key,
            normalized_name=parts[0],
            normalized_producer=parts[1],
            normalized_vintage=parts[2],
            name=wine.name.strip(),
            producer=wine.producer.strip(),
            vintage=wine.vintage.strip(),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(identity)
        db.flush()
    wine.shared_identity_id = identity.id if identity is not None else None
    return identity


def fact_scope(wine: Wine, feature: str, locale: str) -> tuple[str, str, str]:
    return (
        locale if feature in LOCALE_FEATURES else "",
        normalize_format(wine.format) if feature in FORMAT_FEATURES else "",
        wine.currency.strip().upper()[:8] if feature == "value" else "",
    )


def get_shared_fact(
    db: Session, wine: Wine, feature: str, *, locale: str = "it"
) -> SharedWineFact | None:
    if feature not in SHARED_FEATURES:
        return None
    identity = resolve_shared_identity(db, wine, create=False)
    if identity is None:
        return None
    fact_locale, format_key, currency = fact_scope(wine, feature, locale)
    fact = db.scalar(
        select(SharedWineFact).where(
            SharedWineFact.identity_id == identity.id,
            SharedWineFact.feature == feature,
            SharedWineFact.locale == fact_locale,
            SharedWineFact.format_key == format_key,
            SharedWineFact.currency == currency,
            SharedWineFact.status == "available",
        )
    )
    if fact is None:
        return None
    expires_at = fact.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= datetime.now(UTC):
            return None
    return fact


def publish_shared_fact(
    db: Session,
    wine: Wine,
    feature: str,
    payload: dict[str, Any],
    *,
    locale: str = "it",
    sources: list[dict] | None = None,
    model: str = "",
    prompt_version: str = "1",
) -> SharedWineFact | None:
    if feature not in SHARED_FEATURES or not payload:
        return None
    identity = resolve_shared_identity(db, wine, create=True)
    if identity is None:
        return None
    fact_locale, format_key, currency = fact_scope(wine, feature, locale)
    fact = db.scalar(
        select(SharedWineFact).where(
            SharedWineFact.identity_id == identity.id,
            SharedWineFact.feature == feature,
            SharedWineFact.locale == fact_locale,
            SharedWineFact.format_key == format_key,
            SharedWineFact.currency == currency,
        )
    )
    now = datetime.now(UTC)
    if fact is None:
        fact = SharedWineFact(
            identity_id=identity.id,
            feature=feature,
            locale=fact_locale,
            format_key=format_key,
            currency=currency,
            created_at=now,
        )
        db.add(fact)
    fact.status = "available"
    fact.payload = payload
    fact.sources = sources or []
    fact.model = model[:120]
    fact.prompt_version = prompt_version[:32]
    fact.verified_at = now
    fact.expires_at = now + VALUE_TTL if feature == "value" else None
    fact.updated_at = now
    return fact


def mark_shared_feature(wine: Wine, feature: str) -> None:
    features = [item for item in (wine.shared_data_features or []) if item in SHARED_FEATURES]
    if feature not in features:
        features.append(feature)
    wine.shared_data_features = features
    wine.shared_data_updated_at = datetime.now(UTC)


def mark_local_feature(wine: Wine, feature: str) -> None:
    wine.shared_data_features = [
        item for item in (wine.shared_data_features or []) if item != feature
    ]


def apply_shared_fact(wine: Wine, fact: SharedWineFact, *, only_missing: bool) -> bool:
    payload = fact.payload or {}
    feature = fact.feature
    changed = False
    if feature == "notes" and (not only_missing or not wine.ai_notes):
        value = str(payload.get("ai_notes") or "").strip()[:4000]
        if value and value != wine.ai_notes:
            wine.ai_notes = value
            changed = True
    elif feature == "drink_window" and (
        not only_missing
        or not any(
            (wine.drink_from, wine.drink_peak_from, wine.drink_peak_to, wine.drink_to)
        )
    ):
        try:
            values = [
                int(payload[key])
                for key in ("drink_from", "drink_peak_from", "drink_peak_to", "drink_to")
            ]
        except (KeyError, TypeError, ValueError):
            values = []
        if len(values) == 4 and values[0] <= values[1] <= values[2] <= values[3]:
            wine.drink_from, wine.drink_peak_from, wine.drink_peak_to, wine.drink_to = values
            wine.drink_window_notes = str(payload.get("notes") or "")[:2000]
            changed = True
    elif feature == "value" and (not only_missing or wine.current_value is None):
        try:
            value = Decimal(str(payload["current_value"])).quantize(Decimal("0.01"))
        except (InvalidOperation, KeyError, TypeError):
            value = Decimal("-1")
        if value >= 0:
            wine.current_value = value
            wine.currency = str(payload.get("currency") or wine.currency)[:8]
            wine.ai_value_notes = str(payload.get("notes") or "")[:2000]
            wine.ai_value_estimated_at = fact.verified_at
            wine.value_not_found = False
            changed = True
    elif feature == "grapes" and (not only_missing or not wine.grapes):
        grapes = payload.get("grapes")
        source_url = str(payload.get("source_url") or "").strip()
        if isinstance(grapes, list) and grapes and source_url:
            wine.grapes = grapes
            wine.grapes_source_url = source_url[:500]
            wine.grapes_source_title = str(payload.get("source_title") or "")[:200]
            wine.grapes_verified_at = fact.verified_at
            wine.grapes_not_applicable = False
            changed = True
    elif feature == "scores" and not wine.scores_not_applicable:
        shared_scores = payload.get("scores")
        if isinstance(shared_scores, list) and shared_scores:
            current = [dict(item) for item in (wine.scores or []) if isinstance(item, dict)]
            known = {
                (str(item.get("critic") or "").casefold(), str(item.get("score") or "").casefold())
                for item in current
            }
            for item in shared_scores:
                if not isinstance(item, dict):
                    continue
                key = (
                    str(item.get("critic") or "").casefold(),
                    str(item.get("score") or "").casefold(),
                )
                if key in known or not any(key):
                    continue
                known.add(key)
                current.append(dict(item))
                changed = True
            if changed:
                wine.scores = current[:8]
    if changed:
        mark_shared_feature(wine, feature)
    return changed


def hydrate_wine_from_shared(db: Session, wine: Wine, *, locale: str) -> list[str]:
    identity = resolve_shared_identity(db, wine, create=True)
    if identity is None:
        return []
    promote_existing_verified_wine_data(db, wine, identity, locale=locale)
    db.flush()
    applied: list[str] = []
    for feature in SHARED_FEATURES:
        if feature == "grapes" and wine.grapes_not_applicable:
            continue
        if feature == "scores" and wine.scores_not_applicable:
            continue
        fact = get_shared_fact(db, wine, feature, locale=locale)
        if fact is not None and apply_shared_fact(wine, fact, only_missing=True):
            applied.append(feature)
    return applied


def promote_existing_verified_wine_data(
    db: Session,
    target: Wine,
    identity: SharedWineIdentity,
    *,
    locale: str,
) -> None:
    """Seed central facts from existing AI-audited wines without copying private fields."""
    target_parts = identity_parts(target)
    if target_parts is None:
        return
    candidates = [
        candidate
        for candidate in db.scalars(
            select(Wine).where(Wine.vintage == target.vintage, Wine.id != target.id)
        )
        if identity_parts(candidate) == target_parts
    ]
    if not candidates:
        return
    candidate_ids = [candidate.id for candidate in candidates]
    audits = list(
        db.scalars(
            select(AiAuditLog)
            .where(
                AiAuditLog.entity_type == "wine",
                AiAuditLog.entity_id.in_(candidate_ids),
            )
            .order_by(AiAuditLog.created_at.desc())
        )
    )
    audits_by_wine: dict[object, list[AiAuditLog]] = {}
    for audit in audits:
        audits_by_wine.setdefault(audit.entity_id, []).append(audit)

    def evidence(candidate: Wine, *features: str) -> AiAuditLog | None:
        return next(
            (
                audit
                for audit in audits_by_wine.get(candidate.id, [])
                if audit.feature in features
            ),
            None,
        )

    for candidate in candidates:
        note_audit = evidence(candidate, "ai_notes", "wine_full_enrichment")
        if (
            note_audit
            and candidate.ai_notes
            and (
                note_audit.summary == candidate.ai_notes
                or (
                    note_audit.feature == "wine_full_enrichment"
                    and note_audit.summary.endswith(candidate.ai_notes)
                )
            )
            and get_shared_fact(db, target, "notes", locale=locale) is None
        ):
            publish_shared_fact(
                db,
                candidate,
                "notes",
                {"ai_notes": candidate.ai_notes},
                locale=locale,
                sources=note_audit.sources or [],
                model=note_audit.model,
            )
        window_audit = evidence(candidate, "drink_window", "wine_full_enrichment")
        if (
            window_audit
            and all(
                value is not None
                for value in (
                    candidate.drink_from,
                    candidate.drink_peak_from,
                    candidate.drink_peak_to,
                    candidate.drink_to,
                )
            )
            and (
                f"{candidate.drink_from}-{candidate.drink_to}: "
                f"{candidate.drink_window_notes}"
            ).startswith(window_audit.summary)
            and get_shared_fact(db, target, "drink_window", locale=locale) is None
        ):
            publish_shared_fact(
                db,
                candidate,
                "drink_window",
                {
                    "drink_from": candidate.drink_from,
                    "drink_peak_from": candidate.drink_peak_from,
                    "drink_peak_to": candidate.drink_peak_to,
                    "drink_to": candidate.drink_to,
                    "notes": candidate.drink_window_notes,
                },
                locale=locale,
                sources=window_audit.sources or [],
                model=window_audit.model,
            )
        value_audit = evidence(candidate, "ai_value", "wine_full_enrichment")
        estimated_at = candidate.ai_value_estimated_at
        if estimated_at is not None and estimated_at.tzinfo is None:
            estimated_at = estimated_at.replace(tzinfo=UTC)
        if (
            value_audit
            and candidate.current_value is not None
            and estimated_at is not None
            and estimated_at + VALUE_TTL > datetime.now(UTC)
            and value_audit.summary.startswith(
                f"{candidate.currency} {candidate.current_value}"
            )
            and get_shared_fact(db, target, "value", locale=locale) is None
        ):
            fact = publish_shared_fact(
                db,
                candidate,
                "value",
                {
                    "current_value": str(candidate.current_value),
                    "currency": candidate.currency,
                    "notes": candidate.ai_value_notes,
                },
                locale=locale,
                sources=value_audit.sources or [],
                model=value_audit.model,
            )
            if fact is not None:
                fact.verified_at = estimated_at
                fact.expires_at = estimated_at + VALUE_TTL
        grape_audit = evidence(candidate, "grapes", "wine_full_enrichment")
        if (
            grape_audit
            and candidate.grapes
            and candidate.grapes_source_url
            and get_shared_fact(db, target, "grapes", locale=locale) is None
        ):
            publish_shared_fact(
                db,
                candidate,
                "grapes",
                {
                    "grapes": candidate.grapes,
                    "source_url": candidate.grapes_source_url,
                    "source_title": candidate.grapes_source_title,
                },
                sources=grape_audit.sources or [],
                model=grape_audit.model,
            )
