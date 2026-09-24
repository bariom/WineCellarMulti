import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_personal_dashboard_migration_preserves_users_and_is_reversible():
    path = Path(__file__).parents[1] / "alembic/versions/0108_personal_dashboard.py"
    spec = importlib.util.spec_from_file_location("personal_dashboard_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY, display_name TEXT)")
        )
        connection.execute(sa.text("INSERT INTO users VALUES (1, 'Existing user')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            row = connection.execute(
                sa.text("SELECT display_name, personal_dashboard_widgets FROM users")
            ).one()
            assert row == ("Existing user", None)
            migration.downgrade()
            assert (
                connection.execute(sa.text("SELECT display_name FROM users")).scalar()
                == "Existing user"
            )
