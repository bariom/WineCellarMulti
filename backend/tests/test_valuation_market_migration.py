import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_market_migration_preserves_legacy_data_and_separates_cache():
    path = Path(__file__).parents[1] / "alembic/versions/0110_valuation_market.py"
    spec = importlib.util.spec_from_file_location("market_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    for name in ("users", "wines", "wishlist_items"):
        sa.Table(name, metadata, sa.Column("id", sa.String, primary_key=True))
    cache = sa.Table("shared_wine_facts", metadata,
        sa.Column("id", sa.String, primary_key=True),
        *(sa.Column(name, sa.String, nullable=False) for name in ("identity_id", "feature", "locale", "format_key", "currency", "verified_at")),
        sa.UniqueConstraint("identity_id", "feature", "locale", "format_key", "currency", name="uq_shared_wine_fact_scope"),
    )
    with engine.begin() as connection:
        metadata.create_all(connection)
        for name in ("users", "wines", "wishlist_items"):
            connection.execute(metadata.tables[name].insert().values(id="existing"))
        legacy = {"id": "legacy", "identity_id": "wine", "feature": "value", "locale": "it", "format_key": "750ml", "currency": "EUR", "verified_at": "2026-09-01"}
        connection.execute(cache.insert().values(**legacy))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert connection.execute(sa.text("SELECT market_country FROM users")).scalar() == ""
            assert connection.execute(sa.text("SELECT market_country FROM shared_wine_facts")).scalar() == ""
            connection.execute(sa.text("INSERT INTO shared_wine_facts (id, identity_id, feature, locale, format_key, currency, verified_at, market_country) VALUES ('new', 'wine', 'value', 'it', '750ml', 'EUR', '2026-09-29', 'IT')"))
            assert connection.execute(sa.text("SELECT COUNT(*) FROM shared_wine_facts")).scalar() == 2
            migration.downgrade()
            assert connection.execute(sa.text("SELECT id FROM shared_wine_facts")).scalar() == "new"
            assert "market_country" not in {column["name"] for column in sa.inspect(connection).get_columns("users")}
            assert connection.execute(sa.text("SELECT id FROM users")).scalar() == "existing"
