import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.core.themes import RETIRED_THEMES


def load_migration():
    path = Path(__file__).parents[1] / "alembic/versions/0127_retire_themes.py"
    spec = importlib.util.spec_from_file_location("retire_themes_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_migration_stores_retired_themes_as_signature_themes():
    migration = load_migration()
    assert len(migration.revision) <= 32
    assert migration.down_revision == "0126_taste_declarations"
    # The migration keeps its own copy; it must match what the app stores,
    # except Pietra & Vigna, retired by 0127 and reinstated afterwards.
    assert {
        k: v for k, v in migration.RETIRED_THEMES.items() if k != "pietra-vigna"
    } == RETIRED_THEMES
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE users (email TEXT, theme_preference VARCHAR(32))"))
        connection.execute(
            sa.text(
                "INSERT INTO users VALUES "
                "('a', 'midnight-ledger'), ('b', 'sepia'), ('c', 'pietra-vigna'), "
                "('d', 'burgundy'), "
                "('e', 'system'), ('f', 'dark'), ('g', 'cave-privee'), ('h', 'atelier')"
            )
        )
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        rows = dict(connection.execute(sa.text("SELECT email, theme_preference FROM users")).all())
    engine.dispose()
    assert rows == {
        "a": "cave-privee",
        "b": "maison-champagne",
        "c": "atelier",
        "d": "private-cellar",
        "e": "system",
        "f": "dark",
        "g": "cave-privee",
        "h": "atelier",
    }
