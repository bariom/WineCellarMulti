import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_migration_deletes_only_wine_pulse_notifications():
    path = Path(__file__).parents[1] / "alembic/versions/0124_drop_wine_pulse_notifications.py"
    spec = importlib.util.spec_from_file_location("drop_pulse_notifications_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert len(migration.revision) <= 32
    assert migration.down_revision == "0123_half_star_tastings"
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE user_notifications (kind TEXT, title TEXT)"))
        connection.execute(sa.text("CREATE TABLE user_notification_dismissals (fingerprint TEXT)"))
        connection.execute(
            sa.text(
                "INSERT INTO user_notifications VALUES "
                "('wine_pulse_edition', 'Wine Pulse è aggiornato'), "
                "('wine_pulse_edition', 'Wine Pulse is updated'), "
                "('coownership_agreement', 'Accordo da valutare')"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO user_notification_dismissals VALUES "
                "('wine_pulse:run:1'), ('delivery:wine:2')"
            )
        )
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(sa.text("SELECT kind FROM user_notifications")).scalars().all() == [
            "coownership_agreement"
        ]
        assert connection.execute(
            sa.text("SELECT fingerprint FROM user_notification_dismissals")
        ).scalars().all() == ["delivery:wine:2"]
    engine.dispose()
