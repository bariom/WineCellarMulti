"""add composite indexes for recurring application queries

Revision ID: 0048_query_performance_indexes
Revises: 0047_wine_share_revocation
"""

from alembic import op

revision = "0048_query_performance_indexes"
down_revision = "0047_wine_share_revocation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_wines_household_name_vintage", "wines", ["household_id", "name", "vintage"])
    op.create_index(
        "ix_wine_value_history_wine_recorded_at",
        "wine_value_history",
        ["wine_id", "recorded_at"],
    )
    op.create_index(
        "ix_wishlist_lists_household_name_id",
        "wishlist_lists",
        ["household_id", "name", "id"],
    )
    op.create_index(
        "ix_wishlist_items_household_list_priority_name",
        "wishlist_items",
        ["household_id", "wishlist_list_id", "priority", "name"],
    )
    op.create_index(
        "ix_ai_audit_household_entity_feature_created",
        "ai_audit_log",
        ["household_id", "entity_type", "entity_id", "feature", "created_at"],
    )
    op.create_index(
        "ix_user_notifications_user_read_created",
        "user_notifications",
        ["user_id", "read_at", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_notifications_user_read_created", table_name="user_notifications")
    op.drop_index("ix_ai_audit_household_entity_feature_created", table_name="ai_audit_log")
    op.drop_index("ix_wishlist_items_household_list_priority_name", table_name="wishlist_items")
    op.drop_index("ix_wishlist_lists_household_name_id", table_name="wishlist_lists")
    op.drop_index("ix_wine_value_history_wine_recorded_at", table_name="wine_value_history")
    op.drop_index("ix_wines_household_name_vintage", table_name="wines")
