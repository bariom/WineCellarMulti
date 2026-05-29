"""encrypt user ai keys

Revision ID: 0008_encrypt_user_ai_keys
Revises: 0007_ai_usage_costs
Create Date: 2026-05-29 22:00:00
"""

from alembic import op
import sqlalchemy as sa

from app.core.crypto import decrypt_secret, encrypt_secret


revision = "0008_encrypt_user_ai_keys"
down_revision = "0007_ai_usage_costs"
branch_labels = None
depends_on = None


user_ai_settings = sa.table(
    "user_ai_settings",
    sa.column("user_id", sa.Uuid()),
    sa.column("openai_api_key", sa.Text()),
)


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(sa.select(user_ai_settings.c.user_id, user_ai_settings.c.openai_api_key)).all()
    for row in rows:
        api_key = row.openai_api_key or ""
        if api_key and not api_key.startswith("enc:v1:"):
            connection.execute(
                user_ai_settings.update()
                .where(user_ai_settings.c.user_id == row.user_id)
                .values(openai_api_key=encrypt_secret(api_key)),
            )


def downgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(sa.select(user_ai_settings.c.user_id, user_ai_settings.c.openai_api_key)).all()
    for row in rows:
        api_key = row.openai_api_key or ""
        if api_key.startswith("enc:v1:"):
            connection.execute(
                user_ai_settings.update()
                .where(user_ai_settings.c.user_id == row.user_id)
                .values(openai_api_key=decrypt_secret(api_key)),
            )
