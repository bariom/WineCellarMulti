import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_announcements_migration_is_additive_and_reversible():
    path = Path(__file__).parents[1] / "alembic/versions/0109_admin_announcements.py"
    spec = importlib.util.spec_from_file_location("announcements_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE users (id CHAR(32) PRIMARY KEY)"))
        connection.execute(sa.text("INSERT INTO users VALUES ('existing')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert "admin_announcements" in sa.inspect(connection).get_table_names()
            assert connection.execute(sa.text("SELECT id FROM users")).scalar() == "existing"
            migration.downgrade()
            assert "admin_announcements" not in sa.inspect(connection).get_table_names()
            assert connection.execute(sa.text("SELECT id FROM users")).scalar() == "existing"
