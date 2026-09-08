"""expand the editable sensory baseline catalogue

Revision ID: 0103_expand_sensory_baselines
Revises: 0102_seed_sensory_baselines
"""

from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa

from alembic import op

revision = "0103_expand_sensory_baselines"
down_revision = "0102_seed_sensory_baselines"
branch_labels = None
depends_on = None


DIMENSIONS = (
    "body",
    "acidity",
    "tannin",
    "sweetness",
    "aromatic_intensity",
    "fruit",
    "wood",
    "spice",
    "minerality",
)


def _dimensions(values: tuple[float, ...]) -> dict[str, float]:
    return dict(zip(DIMENSIONS, values, strict=True))


# Normalized keys and deliberately conservative reference profiles. These are editable
# starting points, not vintage- or producer-specific tasting claims.
ENTRIES: list[tuple[str, str, float, tuple[float, ...]]] = [
    ("wine_type", "rose", 0.66, (0.36, 0.65, 0.15, 0.16, 0.52, 0.65, 0.08, 0.12, 0.35)),
    ("grape", "barbera", 0.74, (0.58, 0.78, 0.36, 0.08, 0.62, 0.74, 0.28, 0.32, 0.38)),
    ("grape", "aglianico", 0.76, (0.84, 0.72, 0.88, 0.06, 0.68, 0.64, 0.42, 0.60, 0.45)),
    ("grape", "montepulciano", 0.70, (0.72, 0.58, 0.68, 0.08, 0.62, 0.74, 0.38, 0.44, 0.30)),
    ("grape", "primitivo", 0.72, (0.82, 0.48, 0.64, 0.14, 0.76, 0.82, 0.42, 0.52, 0.22)),
    ("grape", "corvina", 0.72, (0.58, 0.68, 0.50, 0.10, 0.68, 0.74, 0.32, 0.46, 0.38)),
    ("grape", "tempranillo", 0.74, (0.72, 0.58, 0.68, 0.08, 0.62, 0.68, 0.52, 0.50, 0.30)),
    ("grape", "grenache", 0.72, (0.76, 0.45, 0.48, 0.12, 0.70, 0.80, 0.30, 0.54, 0.22)),
    ("grape", "malbec", 0.74, (0.80, 0.55, 0.72, 0.08, 0.70, 0.78, 0.50, 0.50, 0.26)),
    ("grape", "carmenere", 0.70, (0.76, 0.55, 0.62, 0.08, 0.72, 0.72, 0.46, 0.58, 0.24)),
    ("grape", "zinfandel", 0.70, (0.82, 0.48, 0.58, 0.16, 0.78, 0.84, 0.48, 0.56, 0.20)),
    ("grape", "gamay", 0.72, (0.40, 0.70, 0.22, 0.08, 0.70, 0.78, 0.10, 0.28, 0.38)),
    ("grape", "cabernet franc", 0.74, (0.62, 0.68, 0.58, 0.07, 0.72, 0.66, 0.35, 0.55, 0.35)),
    ("grape", "sauvignon blanc", 0.78, (0.34, 0.82, 0.03, 0.08, 0.78, 0.62, 0.06, 0.20, 0.55)),
    ("grape", "pinot grigio", 0.72, (0.32, 0.68, 0.03, 0.10, 0.48, 0.58, 0.06, 0.10, 0.40)),
    ("grape", "pinot bianco", 0.70, (0.36, 0.70, 0.03, 0.10, 0.52, 0.55, 0.08, 0.12, 0.48)),
    ("grape", "glera", 0.72, (0.28, 0.74, 0.03, 0.16, 0.60, 0.66, 0.04, 0.08, 0.42)),
    ("grape", "moscato bianco", 0.76, (0.36, 0.58, 0.02, 0.58, 0.90, 0.82, 0.04, 0.22, 0.24)),
    ("grape", "gewurztraminer", 0.76, (0.50, 0.46, 0.03, 0.24, 0.92, 0.78, 0.08, 0.46, 0.18)),
    ("grape", "viognier", 0.72, (0.62, 0.48, 0.04, 0.12, 0.84, 0.76, 0.22, 0.34, 0.22)),
    ("grape", "chenin blanc", 0.76, (0.44, 0.82, 0.03, 0.22, 0.74, 0.70, 0.12, 0.20, 0.58)),
    ("grape", "vermentino", 0.74, (0.38, 0.76, 0.03, 0.08, 0.66, 0.58, 0.06, 0.20, 0.62)),
    ("grape", "garganega", 0.72, (0.40, 0.68, 0.04, 0.10, 0.58, 0.60, 0.10, 0.18, 0.54)),
    ("grape", "cortese", 0.74, (0.30, 0.80, 0.03, 0.08, 0.52, 0.50, 0.04, 0.10, 0.62)),
    ("grape", "arneis", 0.70, (0.42, 0.60, 0.04, 0.10, 0.64, 0.66, 0.06, 0.18, 0.42)),
    ("grape", "falanghina", 0.72, (0.42, 0.72, 0.03, 0.10, 0.70, 0.68, 0.08, 0.22, 0.52)),
    ("grape", "fiano", 0.74, (0.54, 0.66, 0.04, 0.10, 0.76, 0.68, 0.18, 0.34, 0.48)),
    ("grape", "greco", 0.74, (0.50, 0.76, 0.04, 0.08, 0.68, 0.58, 0.10, 0.24, 0.62)),
    ("grape", "verdicchio", 0.76, (0.38, 0.80, 0.03, 0.08, 0.62, 0.54, 0.06, 0.18, 0.68)),
    (
        "appellation",
        "brunello di montalcino",
        0.82,
        (0.84, 0.68, 0.82, 0.06, 0.78, 0.68, 0.62, 0.58, 0.46),
    ),
    (
        "appellation",
        "chianti classico",
        0.80,
        (0.68, 0.74, 0.68, 0.07, 0.68, 0.70, 0.42, 0.48, 0.42),
    ),
    ("appellation", "chianti", 0.75, (0.60, 0.72, 0.58, 0.08, 0.62, 0.72, 0.30, 0.40, 0.38)),
    (
        "appellation",
        "amarone della valpolicella",
        0.82,
        (0.92, 0.48, 0.72, 0.16, 0.86, 0.84, 0.60, 0.66, 0.28),
    ),
    (
        "appellation",
        "valpolicella ripasso",
        0.78,
        (0.72, 0.56, 0.54, 0.12, 0.72, 0.78, 0.48, 0.50, 0.30),
    ),
    ("appellation", "valpolicella", 0.74, (0.48, 0.68, 0.34, 0.09, 0.66, 0.76, 0.20, 0.34, 0.36)),
    ("appellation", "bolgheri", 0.80, (0.82, 0.58, 0.78, 0.07, 0.74, 0.74, 0.62, 0.52, 0.28)),
    ("appellation", "etna rosso", 0.80, (0.62, 0.78, 0.62, 0.06, 0.72, 0.66, 0.26, 0.58, 0.70)),
    ("appellation", "prosecco", 0.80, (0.28, 0.72, 0.03, 0.20, 0.62, 0.72, 0.03, 0.08, 0.38)),
    ("appellation", "franciacorta", 0.80, (0.38, 0.78, 0.04, 0.14, 0.68, 0.54, 0.16, 0.18, 0.58)),
    ("appellation", "soave", 0.77, (0.36, 0.70, 0.03, 0.09, 0.58, 0.58, 0.08, 0.18, 0.56)),
    ("appellation", "gavi", 0.79, (0.30, 0.80, 0.03, 0.07, 0.54, 0.50, 0.04, 0.10, 0.64)),
    (
        "appellation",
        "rosso di montalcino",
        0.76,
        (0.68, 0.68, 0.62, 0.07, 0.68, 0.72, 0.36, 0.46, 0.38),
    ),
    (
        "appellation",
        "montepulciano d abruzzo",
        0.77,
        (0.74, 0.58, 0.68, 0.08, 0.66, 0.76, 0.38, 0.44, 0.30),
    ),
    ("appellation", "taurasi", 0.81, (0.86, 0.72, 0.88, 0.06, 0.72, 0.66, 0.50, 0.62, 0.48)),
    ("appellation", "barbera d asti", 0.78, (0.60, 0.78, 0.38, 0.08, 0.68, 0.76, 0.34, 0.36, 0.40)),
    (
        "appellation",
        "langhe nebbiolo",
        0.78,
        (0.70, 0.78, 0.82, 0.06, 0.72, 0.64, 0.34, 0.56, 0.50),
    ),
    ("appellation", "rioja", 0.78, (0.72, 0.60, 0.64, 0.08, 0.68, 0.70, 0.58, 0.52, 0.30)),
    (
        "appellation",
        "ribera del duero",
        0.79,
        (0.82, 0.58, 0.78, 0.06, 0.72, 0.72, 0.56, 0.52, 0.28),
    ),
    ("appellation", "bordeaux", 0.76, (0.76, 0.62, 0.72, 0.07, 0.68, 0.68, 0.55, 0.48, 0.32)),
    ("appellation", "chablis", 0.82, (0.34, 0.84, 0.03, 0.06, 0.62, 0.48, 0.06, 0.12, 0.76)),
    ("appellation", "sauternes", 0.80, (0.64, 0.58, 0.03, 0.88, 0.88, 0.82, 0.35, 0.42, 0.24)),
    ("region", "veneto", 0.62, (0.58, 0.62, 0.44, 0.12, 0.66, 0.70, 0.30, 0.38, 0.36)),
    ("region", "sicilia", 0.60, (0.66, 0.58, 0.52, 0.10, 0.70, 0.72, 0.26, 0.44, 0.46)),
    ("region", "lombardia", 0.58, (0.46, 0.70, 0.28, 0.12, 0.62, 0.58, 0.20, 0.26, 0.48)),
    ("region", "alto adige", 0.62, (0.40, 0.76, 0.16, 0.10, 0.72, 0.62, 0.14, 0.28, 0.58)),
    (
        "region",
        "friuli venezia giulia",
        0.62,
        (0.42, 0.72, 0.14, 0.10, 0.72, 0.62, 0.14, 0.28, 0.56),
    ),
    ("region", "puglia", 0.60, (0.76, 0.48, 0.58, 0.14, 0.72, 0.80, 0.34, 0.48, 0.24)),
    ("region", "campania", 0.62, (0.58, 0.70, 0.46, 0.09, 0.72, 0.64, 0.22, 0.38, 0.56)),
    ("region", "borgogna", 0.62, (0.46, 0.72, 0.24, 0.07, 0.66, 0.62, 0.28, 0.30, 0.58)),
    ("region", "bordeaux", 0.62, (0.74, 0.60, 0.68, 0.07, 0.66, 0.68, 0.48, 0.44, 0.32)),
    ("region", "rioja", 0.62, (0.70, 0.58, 0.60, 0.08, 0.66, 0.68, 0.48, 0.46, 0.30)),
]


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
    bind = op.get_bind()
    existing = set(bind.execute(sa.select(table.c.entity_type, table.c.entity_key)).tuples())
    now = datetime.now(UTC)
    rows = [
        {
            "id": uuid5(NAMESPACE_URL, f"vinaris-sensory:{kind}:{key}"),
            "entity_type": kind,
            "entity_key": key,
            "dimensions": _dimensions(values),
            "confidence": confidence,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        for kind, key, confidence, values in ENTRIES
        if (kind, key) not in existing
    ]
    if rows:
        op.bulk_insert(table, rows)


def downgrade() -> None:
    table = sa.table("sensory_profile_baselines", sa.column("id", sa.Uuid()))
    op.execute(
        table.delete().where(
            table.c.id.in_(
                [
                    uuid5(NAMESPACE_URL, f"vinaris-sensory:{kind}:{key}")
                    for kind, key, _, _ in ENTRIES
                ]
            )
        )
    )
