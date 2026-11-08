import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def load_migration():
    path = Path(__file__).parents[1] / "alembic/versions/0131_wishlist_wine_profile.py"
    spec = importlib.util.spec_from_file_location("wishlist_wine_profile_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_existing_wishlist_items_get_an_empty_profile_and_downgrade_removes_it():
    migration = load_migration()
    assert len(migration.revision) <= 32
    assert migration.down_revision == "0130_session_resume_user"
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE wishlist_items (id TEXT, name TEXT)"))
        connection.execute(sa.text("INSERT INTO wishlist_items VALUES ('1', 'Barolo')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        row = connection.execute(
            sa.text(
                "SELECT grapes, grapes_source_url, grapes_source_title, country, wine_zone, "
                "ai_notes FROM wishlist_items"
            )
        ).one()
        assert tuple(row) == ("[]", "", "", "", "", "")
        migration.downgrade()
        columns = {
            column["name"] for column in sa.inspect(connection).get_columns("wishlist_items")
        }
        assert columns == {"id", "name"}
