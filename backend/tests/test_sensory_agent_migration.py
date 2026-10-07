import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_provenance_migration_preserves_existing_profiles():
    path = Path(__file__).parents[1] / "alembic/versions/0115_sensory_provenance.py"
    spec = importlib.util.spec_from_file_location("sensory_provenance_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE wine_sensory_profiles (id TEXT PRIMARY KEY, dimensions JSON NOT NULL)"
            )
        )
        connection.execute(
            sa.text("INSERT INTO wine_sensory_profiles VALUES ('existing', '{\"body\": 0.7}')")
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            row = connection.execute(
                sa.text("SELECT dimensions, provenance FROM wine_sensory_profiles")
            ).one()
            assert row == ('{"body": 0.7}', "{}")
            migration.downgrade()
            assert (
                connection.execute(
                    sa.text("SELECT dimensions FROM wine_sensory_profiles")
                ).scalar_one()
                == '{"body": 0.7}'
            )


def test_sensory_agent_migration_round_trip_preserves_existing_tables():
    path = Path(__file__).parents[1] / "alembic/versions/0114_sensory_agent.py"
    spec = importlib.util.spec_from_file_location("sensory_agent_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE households (id TEXT PRIMARY KEY)"))
        connection.execute(sa.text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(sa.text("INSERT INTO households VALUES ('existing')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            columns = {
                column["name"]
                for column in sa.inspect(connection).get_columns("sensory_agent_runs")
            }
            assert {"household_id", "user_id", "budget_usd", "results", "status"} <= columns
            migration.downgrade()
            assert "sensory_agent_runs" not in sa.inspect(connection).get_table_names()
            assert connection.execute(sa.text("SELECT id FROM households")).scalar() == "existing"
