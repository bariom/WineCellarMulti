import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_assistant_feedback_migration_creates_and_drops_its_table():
    path = Path(__file__).parents[1] / "alembic/versions/0125_assistant_feedback.py"
    spec = importlib.util.spec_from_file_location("assistant_feedback_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    assert migration.down_revision == "0124_drop_pulse_notifications"
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE households (id CHAR(32) PRIMARY KEY)"))
        connection.execute(sa.text("CREATE TABLE users (id CHAR(32) PRIMARY KEY)"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        columns = {column["name"] for column in sa.inspect(connection).get_columns("assistant_feedback")}
        assert {"rating", "question", "answer", "comment", "model", "tools_used"} <= columns
        migration.downgrade()
        assert "assistant_feedback" not in sa.inspect(connection).get_table_names()
    engine.dispose()
