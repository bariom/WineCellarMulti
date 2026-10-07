import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_refinement_migration_round_trip_preserves_existing_tables():
    path = Path(__file__).parents[1] / "alembic/versions/0116_sensory_refinement.py"
    spec = importlib.util.spec_from_file_location("refinement_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        for table in ["households", "users", "wines", "shared_wine_identities"]:
            connection.execute(sa.text(f"CREATE TABLE {table} (id TEXT PRIMARY KEY)"))
        connection.execute(sa.text("INSERT INTO wines VALUES ('existing')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            columns = {
                item["name"]
                for item in sa.inspect(connection).get_columns("sensory_refinement_runs")
            }
            assert {
                "household_id",
                "user_id",
                "wine_id",
                "identity_id",
                "proposal",
                "status",
            } <= columns
            migration.downgrade()
            assert "sensory_refinement_runs" not in sa.inspect(connection).get_table_names()
            assert connection.execute(sa.text("SELECT id FROM wines")).scalar_one() == "existing"
