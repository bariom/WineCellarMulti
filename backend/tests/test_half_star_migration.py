import importlib.util
from io import StringIO
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_half_star_migration_preserves_ratings_and_nullable_command_snapshots():
    path = Path(__file__).parents[1] / "alembic/versions/0122_half_star_ratings.py"
    spec = importlib.util.spec_from_file_location("half_star_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        for table, column, nullable in [
            ("wines", "rating", False),
            ("user_wine_ratings", "rating", False),
            ("cellar_ai_commands", "previous_rating", True),
        ]:
            nullability = "" if nullable else "NOT NULL"
            connection.execute(sa.text(f"CREATE TABLE {table} ({column} INTEGER {nullability})"))
            connection.execute(sa.text(f"INSERT INTO {table} VALUES (0), (4), (6)"))
        connection.execute(sa.text("INSERT INTO cellar_ai_commands VALUES (NULL)"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        for table, column in [
            ("wines", "rating"),
            ("user_wine_ratings", "rating"),
            ("cellar_ai_commands", "previous_rating"),
        ]:
            assert connection.execute(
                sa.text(f"SELECT {column} FROM {table} LIMIT 3")
            ).scalars().all() == [0, 4, 6]
            connection.execute(sa.text(f"UPDATE {table} SET {column} = 4.5 WHERE {column} = 4"))
            assert (
                connection.execute(
                    sa.text(f"SELECT {column} FROM {table} WHERE {column} = 4.5")
                ).scalar_one()
                == 4.5
            )
        assert (
            connection.execute(
                sa.text("SELECT count(*) FROM cellar_ai_commands WHERE previous_rating IS NULL")
            ).scalar_one()
            == 1
        )
    engine.dispose()

    sql = StringIO()
    migration.op = Operations(
        MigrationContext.configure(
            dialect_name="postgresql", opts={"as_sql": True, "output_buffer": sql}
        )
    )
    migration.downgrade()
    assert "USING round(rating)::integer" in sql.getvalue()
