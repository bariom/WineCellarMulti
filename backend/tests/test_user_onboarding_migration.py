import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_onboarding_migration_preserves_users_and_marks_setup_as_pending():
    spec = importlib.util.spec_from_file_location("onboarding_migration", Path(__file__).parents[1] / "alembic/versions/0111_user_onboarding.py")
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(sa.text("INSERT INTO users VALUES ('existing')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            row = connection.execute(sa.text("SELECT id, onboarding_completed_at FROM users")).one()
            assert row == ("existing", None)
            migration.downgrade()
            assert connection.execute(sa.text("SELECT id FROM users")).scalar() == "existing"
