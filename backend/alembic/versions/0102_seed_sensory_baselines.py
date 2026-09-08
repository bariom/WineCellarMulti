"""seed editable sensory baseline catalogue

Revision ID: 0102_seed_sensory_baselines
Revises: 0101_taste_profiles
"""
# ruff: noqa: E501

from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa

from alembic import op

revision = "0102_seed_sensory_baselines"
down_revision = "0101_taste_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    table = sa.table(
        "sensory_profile_baselines",
        sa.column("id", sa.Uuid()),
        sa.column("entity_type", sa.String()),
        sa.column("entity_key", sa.String()),
        sa.column("dimensions", sa.JSON()),
        sa.column("confidence", sa.Float()),
        sa.column("is_active", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    now = datetime.now(UTC)
    # Conservative, editable reference values. They are inferred profiles, never admin validation.
    entries = [
        (
            "wine_type",
            "red",
            0.68,
            {
                "body": 0.68,
                "acidity": 0.55,
                "tannin": 0.62,
                "sweetness": 0.08,
                "aromatic_intensity": 0.62,
                "fruit": 0.66,
                "wood": 0.35,
                "spice": 0.38,
                "minerality": 0.30,
            },
        ),
        (
            "wine_type",
            "white",
            0.68,
            {
                "body": 0.38,
                "acidity": 0.70,
                "tannin": 0.08,
                "sweetness": 0.12,
                "aromatic_intensity": 0.58,
                "fruit": 0.55,
                "wood": 0.18,
                "spice": 0.15,
                "minerality": 0.48,
            },
        ),
        (
            "wine_type",
            "sparkling",
            0.72,
            {
                "body": 0.30,
                "acidity": 0.82,
                "tannin": 0.05,
                "sweetness": 0.18,
                "aromatic_intensity": 0.62,
                "fruit": 0.48,
                "wood": 0.08,
                "spice": 0.12,
                "minerality": 0.57,
            },
        ),
        (
            "wine_type",
            "sweet",
            0.68,
            {
                "body": 0.52,
                "acidity": 0.56,
                "tannin": 0.12,
                "sweetness": 0.82,
                "aromatic_intensity": 0.68,
                "fruit": 0.74,
                "wood": 0.18,
                "spice": 0.20,
                "minerality": 0.24,
            },
        ),
        (
            "grape",
            "nebbiolo",
            0.78,
            {
                "body": 0.75,
                "acidity": 0.80,
                "tannin": 0.90,
                "fruit": 0.58,
                "wood": 0.45,
                "spice": 0.62,
                "minerality": 0.52,
            },
        ),
        (
            "grape",
            "sangiovese",
            0.76,
            {
                "body": 0.62,
                "acidity": 0.76,
                "tannin": 0.66,
                "fruit": 0.68,
                "wood": 0.38,
                "spice": 0.48,
                "minerality": 0.42,
            },
        ),
        (
            "grape",
            "cabernet sauvignon",
            0.78,
            {
                "body": 0.82,
                "acidity": 0.62,
                "tannin": 0.84,
                "fruit": 0.70,
                "wood": 0.58,
                "spice": 0.52,
                "minerality": 0.28,
            },
        ),
        (
            "grape",
            "merlot",
            0.74,
            {
                "body": 0.70,
                "acidity": 0.52,
                "tannin": 0.48,
                "fruit": 0.76,
                "wood": 0.45,
                "spice": 0.32,
                "minerality": 0.24,
            },
        ),
        (
            "grape",
            "pinot noir",
            0.76,
            {
                "body": 0.48,
                "acidity": 0.68,
                "tannin": 0.32,
                "fruit": 0.70,
                "wood": 0.32,
                "spice": 0.42,
                "minerality": 0.48,
            },
        ),
        (
            "grape",
            "syrah",
            0.76,
            {
                "body": 0.78,
                "acidity": 0.56,
                "tannin": 0.66,
                "fruit": 0.72,
                "wood": 0.42,
                "spice": 0.72,
                "minerality": 0.28,
            },
        ),
        (
            "grape",
            "chardonnay",
            0.76,
            {
                "body": 0.56,
                "acidity": 0.62,
                "tannin": 0.06,
                "fruit": 0.58,
                "wood": 0.42,
                "spice": 0.20,
                "minerality": 0.52,
            },
        ),
        (
            "grape",
            "riesling",
            0.78,
            {
                "body": 0.32,
                "acidity": 0.82,
                "tannin": 0.04,
                "sweetness": 0.28,
                "fruit": 0.66,
                "wood": 0.04,
                "spice": 0.18,
                "minerality": 0.62,
            },
        ),
        (
            "appellation",
            "barolo",
            0.84,
            {
                "body": 0.82,
                "acidity": 0.78,
                "tannin": 0.92,
                "fruit": 0.58,
                "wood": 0.52,
                "spice": 0.66,
                "minerality": 0.56,
            },
        ),
        (
            "appellation",
            "barbaresco",
            0.82,
            {
                "body": 0.74,
                "acidity": 0.78,
                "tannin": 0.84,
                "fruit": 0.62,
                "wood": 0.42,
                "spice": 0.58,
                "minerality": 0.54,
            },
        ),
        (
            "appellation",
            "champagne",
            0.84,
            {
                "body": 0.34,
                "acidity": 0.86,
                "tannin": 0.04,
                "sweetness": 0.16,
                "fruit": 0.50,
                "wood": 0.12,
                "spice": 0.14,
                "minerality": 0.66,
            },
        ),
        (
            "region",
            "piemonte",
            0.65,
            {
                "body": 0.66,
                "acidity": 0.70,
                "tannin": 0.68,
                "fruit": 0.60,
                "wood": 0.38,
                "spice": 0.52,
                "minerality": 0.48,
            },
        ),
        (
            "region",
            "toscana",
            0.65,
            {
                "body": 0.68,
                "acidity": 0.66,
                "tannin": 0.62,
                "fruit": 0.66,
                "wood": 0.42,
                "spice": 0.48,
                "minerality": 0.36,
            },
        ),
    ]
    op.bulk_insert(
        table,
        [
            {
                "id": uuid5(NAMESPACE_URL, f"vinaris-sensory:{kind}:{key}"),
                "entity_type": kind,
                "entity_key": key,
                "dimensions": values,
                "confidence": confidence,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
            for kind, key, confidence, values in entries
        ],
    )


def downgrade() -> None:
    table = sa.table("sensory_profile_baselines", sa.column("id", sa.Uuid()))
    entries = [
        ("wine_type", "red"),
        ("wine_type", "white"),
        ("wine_type", "sparkling"),
        ("wine_type", "sweet"),
        ("grape", "nebbiolo"),
        ("grape", "sangiovese"),
        ("grape", "cabernet sauvignon"),
        ("grape", "merlot"),
        ("grape", "pinot noir"),
        ("grape", "syrah"),
        ("grape", "chardonnay"),
        ("grape", "riesling"),
        ("appellation", "barolo"),
        ("appellation", "barbaresco"),
        ("appellation", "champagne"),
        ("region", "piemonte"),
        ("region", "toscana"),
    ]
    op.execute(
        table.delete().where(
            table.c.id.in_(
                [uuid5(NAMESPACE_URL, f"vinaris-sensory:{kind}:{key}") for kind, key in entries]
            )
        )
    )
