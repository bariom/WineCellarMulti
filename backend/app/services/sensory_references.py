"""Curated documentary references; never numerical sensory ground truth.

Global catalog access is restricted to application administrators by the router.
No provider calls, household data, or automatic profile writes are involved.
"""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import SharedWineFact, SharedWineIdentity, WineSensoryProfile
from app.schemas.sensory_reference import ReferenceDossier, ReferencePreview, ReferenceRow
from app.services.shared_wine_data import identity_key, normalize_identity_part

FEATURE = "sensory_reference"
BUNDLE = Path(__file__).with_name("sensory_reference_seed.json")


def preview_references(db: Session) -> ReferencePreview:
    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    rows = []
    for raw in bundle["wines"]:
        dossier = ReferenceDossier.model_validate(raw)
        parts = tuple(
            normalize_identity_part(v) for v in (dossier.name, dossier.producer, dossier.vintage)
        )
        key = identity_key((parts[0], parts[1], parts[2]))
        identity = db.scalar(
            select(SharedWineIdentity).where(SharedWineIdentity.identity_key == key)
        )
        row = ReferenceRow(dossier=dossier, status="new")
        if identity is None:
            # Conservative ambiguity check: same vintage and overlapping wine names.
            candidates = db.scalars(
                select(SharedWineIdentity).where(SharedWineIdentity.normalized_vintage == parts[2])
            )
            row.conflicts = [
                f"{c.producer} · {c.name} · {c.vintage}"
                for c in candidates
                if parts[0] in c.normalized_name or c.normalized_name in parts[0]
            ]
            if row.conflicts:
                row.status = "conflict"
        else:
            row.identity_id = str(identity.id)
            row.status = "matched"
            fact = db.scalar(
                select(SharedWineFact).where(
                    SharedWineFact.identity_id == identity.id,
                    SharedWineFact.feature == FEATURE,
                )
            )
            if fact:
                row.status = (
                    "imported"
                    if fact.payload.get("dossier") == dossier.model_dump(mode="json")
                    else "conflict"
                )
                if row.status == "conflict":
                    row.conflicts = [
                        "Dossier già presente con contenuti diversi: nessuna sovrascrittura."
                    ]
            profile = db.scalar(
                select(WineSensoryProfile).where(WineSensoryProfile.identity_id == identity.id)
            )
            if profile:
                row.existing_dimensions = profile.dimensions or {}
                row.previously_approved = profile.validated
        rows.append(row)
    payload = {"rows": [r.model_dump(mode="json") for r in rows], "excluded": bundle["excluded"]}
    revision = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    return ReferencePreview(
        revision=revision,
        rows=rows,
        excluded=bundle["excluded"],
        profiles_to_review=db.scalar(select(func.count()).select_from(WineSensoryProfile)) or 0,
        previously_approved_profiles=db.scalar(
            select(func.count())
            .select_from(WineSensoryProfile)
            .where(WineSensoryProfile.validated.is_(True))
        )
        or 0,
    )


def import_references(db: Session, revision: str, ids: list[str], actor: str) -> int:
    preview = preview_references(db)
    if preview.revision != revision:
        raise ValueError("Anteprima scaduta: ricarica i riferimenti prima di importare.")
    selected = set(ids)
    rows = [r for r in preview.rows if r.dossier.id in selected]
    if len(rows) != len(selected) or any(r.status == "conflict" for r in rows):
        raise ValueError("Selezione sconosciuta o con conflitti: nessun dato importato.")
    count = 0
    for row in rows:
        if row.status == "imported":
            continue
        d = row.dossier
        parts = (
            normalize_identity_part(d.name),
            normalize_identity_part(d.producer),
            normalize_identity_part(d.vintage),
        )
        identity = db.scalar(
            select(SharedWineIdentity)
            .where(SharedWineIdentity.identity_key == identity_key(parts))
            .with_for_update()
        )
        if identity is None:
            identity = SharedWineIdentity(
                identity_key=identity_key(parts),
                name=d.name,
                producer=d.producer,
                vintage=d.vintage,
                normalized_name=parts[0],
                normalized_producer=parts[1],
                normalized_vintage=parts[2],
            )
            db.add(identity)
            db.flush()
        db.add(
            SharedWineFact(
                identity_id=identity.id,
                feature=FEATURE,
                status="documented",
                payload={
                    "dossier": d.model_dump(mode="json"),
                    "review_status": "needs_evidence_review",
                    "imported_by": actor,
                },
                sources=[
                    {
                        "url": str(d.source_url),
                        "publisher": d.producer,
                        "checked_on": d.checked_on.isoformat(),
                        "method": "editorial_review",
                    }
                ],
                verified_at=datetime.combine(d.checked_on, datetime.min.time(), tzinfo=UTC),
            )
        )
        count += 1
    db.flush()
    return count
