"""Delete the Wine Pulse edition notifications, which are no longer sent."""

from alembic import op

revision = "0124_drop_pulse_notifications"
down_revision = "0123_half_star_tastings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A user away for a while found one notification per edition; Wine Pulse
    # now speaks for itself in its view.
    op.execute("DELETE FROM user_notifications WHERE kind = 'wine_pulse_edition'")
    op.execute("DELETE FROM user_notification_dismissals WHERE fingerprint LIKE 'wine_pulse:%'")


def downgrade() -> None:
    # Deleted notifications cannot be brought back.
    pass
