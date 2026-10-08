"""Admin-reviewed, conservative metadata/profile corrections from curated descriptions.

Bands are editorial policy, NOT a learned calibration or an accuracy claim.
No arithmetic average of reviewers, no midpoint replacement, no paid provider.
"""

import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SharedWineFact, SharedWineIdentity, WineSensoryProfile
from app.schemas.sensory_review_workflow import ReviewChoice, ReviewProposal
from app.services.sensory_references import review_wine

POLICY = "curated_review_v1"
HISTORY = "sensory_review_history"
# Only explicitly reviewed intensity descriptors; fruit/spice presence is insufficient.
BANDS = {
    ("bibi-graetz-testamatta-2018", "acidity"): (0.55, 0.85),
    ("bibi-graetz-testamatta-2018", "tannin"): (0.55, 0.85),
    ("zind-roche-calcaire-2022", "acidity"): (0.55, 0.85),
    ("zind-roche-calcaire-2022", "sweetness"): (0.0, 0.15),
    ("loimer-gruner-veltliner-2024", "acidity"): (0.35, 0.70),
    ("loimer-gruner-veltliner-2024", "sweetness"): (0.0, 0.20),
    ("klein-vin-de-constance-2020", "body"): (0.60, 0.90),
}


def snapshot(profile: WineSensoryProfile) -> dict:
    return {
        key: getattr(profile, key)
        for key in (
            "dimensions",
            "provenance",
            "source",
            "confidence",
            "validated",
            "model",
            "generation_status",
        )
    }


def get_profile(db: Session, identity_id: UUID, *, lock: bool = False):
    if lock:
        db.scalar(
            select(SharedWineIdentity).where(SharedWineIdentity.id == identity_id).with_for_update()
        )
    query = select(WineSensoryProfile).where(WineSensoryProfile.identity_id == identity_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return db.scalar(query)


def proposal(db: Session, identity_id: UUID) -> ReviewProposal:
    review = review_wine(db, identity_id)
    if review is None:
        raise LookupError("Wine identity not found")
    profile = get_profile(db, identity_id)
    payload = {
        "profile": snapshot(profile) if profile else None,
        "review": review.model_dump(mode="json"),
        "policy": POLICY,
        "bands": sorted((str(k), v) for k, v in BANDS.items()),
    }
    revision = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    choices = []
    for trait in review.traits:
        choice = ReviewChoice(
            trait=trait,
            action="blocked",
            proposed_value=trait.current_value,
            advice="Mantieni il valore e cerca ulteriori prove; caratteristica non applicabile.",
        )
        if trait.current_value is None:
            choice.advice = (
                "Prima genera il profilo dai metadati del vino; poi riapri la revisione."
            )
        elif trait.status == "described" and review.dossier:
            if review.dossier.id == "ridge-monte-bello-2022" and trait.dimension == "body":
                choice.advice = (
                    "Descrizioni discordanti nel dossier: mantieni il corpo da approfondire."
                )
                choices.append(choice)
                continue
            choice.action = "retain"
            choice.advice = (
                "Mantieni il valore e collega la descrizione: la fonte non misura l’intensità."
            )
            band = BANDS.get((review.dossier.id, trait.dimension))
            if band:
                choice.lower, choice.upper = band
                choice.proposed_value = max(band[0], min(band[1], trait.current_value))
                if choice.proposed_value != trait.current_value:
                    choice.action = "adjust"
                    choice.advice = (
                        "Valore fuori dall’intervallo editoriale: proposta al limite più vicino. "
                        "Esamina le prove prima di selezionarla."
                    )
                else:
                    choice.advice = (
                        "Valore compatibile con l’intervallo editoriale: "
                        "mantienilo e collega le prove."
                    )
            proof = (profile.provenance or {}).get(trait.dimension, {}) if profile else {}
            if (
                proof.get("calculation_method") == POLICY
                and proof.get("reviewed_trait") == trait.model_dump(mode="json")
                and choice.proposed_value == trait.current_value
            ):
                choice.action = "recorded"
                choice.advice = "Prove già collegate a questo valore; nessuna azione necessaria."
        choices.append(choice)
    previous = db.scalar(
        select(SharedWineFact)
        .where(
            SharedWineFact.identity_id == identity_id,
            SharedWineFact.feature == HISTORY,
            SharedWineFact.status == "applied",
        )
        .order_by(SharedWineFact.created_at.desc())
        .limit(1)
    )
    undo_id = (
        previous.id if previous and previous.payload.get("after_revision") == revision else None
    )
    return ReviewProposal(
        identity_id=identity_id,
        revision=revision,
        policy=POLICY,
        choices=choices,
        previously_approved=review.previously_approved,
        undo_history_id=undo_id,
    )


def apply_review(
    db: Session, identity_id: UUID, revision: str, dimensions: list[str], actor: UUID
) -> UUID:
    profile = get_profile(db, identity_id, lock=True)
    current = proposal(db, identity_id)
    if current.revision != revision:
        raise ValueError("Il profilo o le prove sono cambiati: ricarica la proposta.")
    selected = set(dimensions)
    allowed = {c.trait.dimension: c for c in current.choices if c.action in {"retain", "adjust"}}
    if not profile or not selected or not selected.issubset(allowed):
        raise ValueError("Selezione non applicabile: nessun valore modificato.")
    history_id = uuid4()
    before = snapshot(profile)
    values = dict(profile.dimensions)
    proofs = dict(profile.provenance or {})
    # Preserve usable weights on untouched legacy dimensions when starting provenance.
    for key, value in values.items():
        proofs.setdefault(
            key,
            {
                "value": value,
                "origin": "unknown",
                "confidence": profile.confidence,
                "issue": "Stima precedente, non rivalidata.",
            },
        )
    for key in selected:
        choice = allowed[key]
        values[key] = choice.proposed_value
        proofs[key] = {
            "value": choice.proposed_value,
            "origin": "wine_style",
            "confidence": min(float(proofs[key].get("confidence", 0)), 0.45),
            "sensory_support": "description",
            "calculation_method": POLICY,
            "rationale": choice.advice,
            "lower": choice.lower,
            "upper": choice.upper,
            "issue": "Stima editoriale approvata, non intensità misurata.",
            "reviewed_trait": {
                **choice.trait.model_dump(mode="json"),
                "current_value": choice.proposed_value,
            },
            "documentary_evidence": [
                item.model_dump(mode="json") for item in choice.trait.evidence
            ],
            "reviewed_by": str(actor),
            "reviewed_at": datetime.now(UTC).isoformat(),
        }
    profile.dimensions = values
    profile.provenance = proofs
    profile.validated = False
    profile.source = "hybrid"
    profile.confidence = min(profile.confidence, 0.45)
    profile.last_modified_by_user_id = actor
    profile.generated_at = datetime.now(UTC)
    db.flush()
    after_revision = proposal(db, identity_id).revision
    db.add(
        SharedWineFact(
            id=history_id,
            identity_id=identity_id,
            feature=HISTORY,
            format_key=history_id.hex,
            status="applied",
            payload={
                "before": before,
                "after_revision": after_revision,
                "selected": sorted(selected),
                "actor": str(actor),
                "policy": POLICY,
                "proposal": current.model_dump(mode="json"),
            },
        )
    )
    db.flush()
    return history_id


def undo_review(
    db: Session, identity_id: UUID, history_id: UUID, revision: str, actor: UUID
) -> None:
    profile = get_profile(db, identity_id, lock=True)
    history = db.scalar(
        select(SharedWineFact)
        .where(
            SharedWineFact.id == history_id,
            SharedWineFact.identity_id == identity_id,
            SharedWineFact.feature == HISTORY,
        )
        .with_for_update()
    )
    if (
        profile is None
        or history is None
        or history.status != "applied"
        or history.payload.get("after_revision") != revision
        or proposal(db, identity_id).revision != revision
    ):
        raise ValueError("Ripristino non disponibile: il profilo o le prove sono cambiati.")
    for key, value in history.payload["before"].items():
        setattr(profile, key, value)
    profile.last_modified_by_user_id = actor
    profile.generated_at = datetime.now(UTC)
    history.status = "reverted"
    history.payload = {
        **history.payload,
        "reverted_by": str(actor),
        "reverted_at": datetime.now(UTC).isoformat(),
    }
    db.flush()
