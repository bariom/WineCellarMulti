import importlib.util
from io import StringIO
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_half_star_tasting_migration_preserves_scores():
    path = Path(__file__).parents[1] / "alembic/versions/0123_half_star_tastings.py"
    spec = importlib.util.spec_from_file_location("half_star_tasting_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    assert migration.down_revision == "0122_half_star_ratings"
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        for table in migration.TABLES:
            connection.execute(sa.text(f"CREATE TABLE {table} (rating INTEGER NOT NULL)"))
            connection.execute(sa.text(f"INSERT INTO {table} VALUES (0), (4), (6)"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        for table in migration.TABLES:
            assert connection.execute(sa.text(f"SELECT rating FROM {table}")).scalars().all() == [
                0,
                4,
                6,
            ]
            connection.execute(sa.text(f"UPDATE {table} SET rating = 4.5 WHERE rating = 4"))
            assert (
                connection.execute(
                    sa.text(f"SELECT rating FROM {table} WHERE rating = 4.5")
                ).scalar_one()
                == 4.5
            )
    engine.dispose()

    sql = StringIO()
    migration.op = Operations(
        MigrationContext.configure(
            dialect_name="postgresql", opts={"as_sql": True, "output_buffer": sql}
        )
    )
    migration.downgrade()
    assert sql.getvalue().count("USING round(rating)::integer") == 2
