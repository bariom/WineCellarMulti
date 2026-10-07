"""Run a bounded provider pilot in an isolated, disposable cellar database.

Usage (from backend): python -m scripts.probe_sensory_agent --budget 1 --output report.json
Uses configured provider credentials; never changes the application catalog.
"""

import argparse
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.core.legal import LEGAL_DOCUMENT_VERSION
from app.db.base import Base
from app.models import Household, Membership, User, UserSession, Wine, WineSensoryProfile
from app.services.ai_credits import create_ai_credit_transaction
from app.services.sensory_application import application_preview
from app.services.sensory_autonomous import WineResearchTools, research_autonomously
from app.services.shared_wine_data import resolve_shared_identity
from app.services.taste_profiles import SENSORY_DIMENSIONS


def controlled_source_payload():
    fixture = json.loads(
        (Path(__file__).parents[1] / "tests/fixtures/testamatta_2018_sources.json").read_text(
            encoding="utf-8"
        )
    )
    observations = {key: [] for key in SENSORY_DIMENSIONS}
    for source in fixture["sources"]:
        for item in source["observations"]:
            observations[item["dimension"]].append(
                dict(
                    source_url=source["url"],
                    excerpt=item["quote"],
                    attribution_excerpt=source["heading"],
                    scope="exact_vintage",
                    vintage="2018",
                    published_year=None,
                    publisher=item.get("publisher", source["publisher"]),
                    role=source["role"],
                )
            )
    first = fixture["sources"][0]
    identity = dict(observations["fruit"][0], excerpt=first["heading"])
    payload = dict(
        name=fixture["name"],
        producer=fixture["producer"],
        vintage=fixture["vintage"],
        identity_confirmed=True,
        vintage_confirmed=True,
        identity_evidence=identity,
        summary="Controlled source verification, not autonomous provider research.",
        limitations="Editorial estimates; conflicting traits are not applicable.",
        dimensions={
            key: dict(proofs[0], value=0.5, basis="inferred", intensity_supported=True)
            if proofs
            else None
            for key, proofs in observations.items()
        },
        comparisons=[
            dict(
                dimension=key,
                agreement="conflicting",
                independent=True,
                explanation="Contrasting published descriptions.",
                evidence=proofs,
            )
            for key, proofs in observations.items()
            if len(proofs) > 1
        ],
        references=[],
        aromas=[],
    )
    return fixture, payload


def source_probe(wine, baseline):
    fixture, payload = controlled_source_payload()
    runtime = WineResearchTools(wine, baseline)
    runtime.sources = {
        source["url"]: {"url": source["url"], "title": source["publisher"]}
        for source in fixture["sources"]
    }
    for url in runtime.sources:
        runtime.read({"url": url})
    runtime.review(payload)
    result = runtime.last_review
    assert result is not None
    result.application = application_preview(result, baseline, 0.72)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--budget", type=Decimal, default=Decimal("1"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--sources-only",
        action="store_true",
        help="Verify fixed source quotations, without calling OpenAI",
    )
    args = parser.parse_args()
    if not Decimal("0.05") <= args.budget <= Decimal("1"):
        parser.error("Pilot budget must be between 0.05 and 1 USD")
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        household = Household(name="Isolated sensory pilot")
        user = User(
            email="sensory-pilot@example.test",
            display_name="Sensory pilot",
            password_hash="unused",
            is_app_admin=True,
            locale="it",
            privacy_policy_version=LEGAL_DOCUMENT_VERSION,
            terms_version=LEGAL_DOCUMENT_VERSION,
            privacy_policy_accepted_at=datetime.now(UTC),
            terms_accepted_at=datetime.now(UTC),
        )
        db.add_all([household, user])
        db.flush()
        create_ai_credit_transaction(db, user, amount_usd=Decimal("10"), source="pilot")
        membership = Membership(user_id=user.id, household_id=household.id, role="owner")
        session = UserSession(
            user_id=user.id,
            active_household_id=household.id,
            token_hash="isolated-pilot",
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        wine = Wine(
            household_id=household.id,
            name="Testamatta",
            producer="Bibi Graetz",
            vintage="2018",
            type="Red",
            region="Tuscany",
            appellation="Toscana IGT",
            grapes=["Sangiovese"],
        )
        db.add_all([membership, session, wine])
        db.flush()
        identity = resolve_shared_identity(db, wine, create=True)
        db.flush()
        assert identity is not None
        db.add(
            WineSensoryProfile(
                identity_id=identity.id,
                source="hybrid",
                validated=True,
                confidence=0.72,
                dimensions=dict(
                    body=0.64,
                    acidity=0.69,
                    tannin=0.64,
                    sweetness=0.08,
                    aromatic_intensity=0.62,
                    fruit=0.67,
                    wood=0.38,
                    spice=0.46,
                    minerality=0.38,
                ),
            )
        )
        db.commit()
        context = CurrentContext(
            user=user, household=household, membership=membership, session=session
        )
        if args.sources_only:
            result = source_probe(
                wine,
                dict(
                    body=0.64,
                    acidity=0.69,
                    tannin=0.64,
                    sweetness=0.08,
                    aromatic_intensity=0.62,
                    fruit=0.67,
                    wood=0.38,
                    spice=0.46,
                    minerality=0.38,
                ),
            )
        else:
            result = research_autonomously(db, context, wine, args.budget)
        if result is None:
            raise SystemExit("No provider call: budget below the configured reservation")
        args.output.write_text(result.model_dump_json(indent=2), encoding="utf-8")
        print(
            json.dumps(
                {
                    "status": result.status,
                    "identity_confirmed": result.identity_confirmed,
                    "vintage_confirmed": result.vintage_confirmed,
                    "coverage": result.coverage,
                    "cost_usd": str(result.cost_usd),
                    "steps": len(result.agent_steps),
                    "warnings": result.warnings,
                },
                ensure_ascii=False,
            )
        )
        if (
            result.status == "failed"
            or not result.identity_confirmed
            or not result.vintage_confirmed
        ):
            raise SystemExit(1)
        candidates = result.application.candidates if result.application else {}
        if not candidates:
            raise SystemExit("No supported, non-conflicting traits available")
        if args.sources_only and (
            set(candidates) != {"acidity", "fruit", "minerality"}
            or any(
                result.complete_profile[key].issue != "conflicting_sources"
                for key in ("body", "aromatic_intensity")
            )
        ):
            raise SystemExit("Controlled source regression: inspect the saved report")
    engine.dispose()


if __name__ == "__main__":
    main()
