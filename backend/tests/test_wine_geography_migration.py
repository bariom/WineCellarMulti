import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_geography_migration_preserves_existing_region_and_locality():
    path = Path(__file__).parents[1] / "alembic/versions/0121_wine_geography.py"
    spec = importlib.util.spec_from_file_location("geography_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE wines (id INTEGER PRIMARY KEY, region TEXT, vineyard_locality TEXT)"
            )
        )
        connection.execute(
            sa.text("CREATE TABLE wine_catalog_entries (id INTEGER PRIMARY KEY, region TEXT)")
        )
        connection.execute(sa.text("INSERT INTO wines VALUES (1, 'Piemonte', 'Castagnito')"))
        connection.execute(sa.text("INSERT INTO wine_catalog_entries VALUES (1, 'Piemonte')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(
            sa.text("SELECT region, vineyard_locality, wine_zone FROM wines")
        ).one() == ("Piemonte", "Castagnito", "")
        assert connection.execute(
            sa.text("SELECT region, locality, wine_zone FROM wine_catalog_entries")
        ).one() == ("Piemonte", "", "")
        migration.downgrade()
        assert connection.execute(sa.text("SELECT region, vineyard_locality FROM wines")).one() == (
            "Piemonte",
            "Castagnito",
        )
    engine.dispose()
