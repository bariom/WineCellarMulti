import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_migration_adds_opt_out_and_campaign_tables():
    path = Path(__file__).parents[1] / "alembic/versions/0128_email_campaigns.py"
    spec = importlib.util.spec_from_file_location("email_campaigns_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    assert migration.down_revision == "0127_retire_themes"
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE users (id CHAR(32) PRIMARY KEY, email TEXT)"))
        connection.execute(sa.text("INSERT INTO users VALUES ('a', 'a@example.test')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        # Existing accounts keep receiving news until they opt out.
        assert connection.execute(sa.text("SELECT news_email_opt_out FROM users")).scalar() in (
            0,
            False,
        )
        tables = set(sa.inspect(connection).get_table_names())
        assert {"email_campaigns", "email_campaign_deliveries", "email_assets"} <= tables
        migration.downgrade()
        assert "email_campaigns" not in set(sa.inspect(connection).get_table_names())
    engine.dispose()
