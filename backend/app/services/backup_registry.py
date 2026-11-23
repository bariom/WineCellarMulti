"""What a complete Vinaris backup contains, in the order a restore must insert it.

Export, restore and the coverage test all read this registry: a new table that
holds a household's or a user's data must be listed here, either as backed up
or as excluded with a reason, or tests/test_full_backup.py fails.

Format (``vinaris.backup.v3``) is a ZIP archive:

- ``manifest.json``: schema, exported_at, alembic revision, household settings,
  row counts per table and the list of files.
- ``data.json``: ``{"tables": {table_name: [row, ...]}}``. Each row holds every
  column of the table; UUIDs, decimals and dates are strings.
- ``files/wine-photos/<wine_id>/{thumbnail,detail}.png``: bottle photos.
- ``files/purchase-documents/<purchase_import_id>``: the original purchase
  document (PDF or image).
- ``files/binary/<table>/<column>/<row id>``: binary columns (the memory photos
  of tastings). In data.json the column holds this member name, or null.

A restore inserts the tables in ``BACKUP_TABLES`` order with fresh IDs and maps
every reference through the IDs it has already inserted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

SCHEMA = "vinaris.backup.v3"

Scope = Literal["household", "user", "user_household", "parent"]


@dataclass(frozen=True)
class BackupTable:
    """One table in a complete backup.

    scope:
      household       rows with household_id = the exported household
      user            rows of the exporting user only (personal, not shared)
      user_household  rows of the exporting user in the exported household
      parent          rows reached through ``parent`` (a column -> table already
                      exported), for tables without household_id
    deferred: nullable references to a table inserted later; restored in a
      second pass once every table is in.
    """

    name: str
    scope: Scope
    parent: tuple[str, str] | None = None
    deferred: tuple[str, ...] = field(default_factory=tuple)
    note: str = ""


BACKUP_TABLES: tuple[BackupTable, ...] = (
    BackupTable("cellar_locations", "household"),
    BackupTable("cellar_bins", "parent", parent=("location_id", "cellar_locations")),
    BackupTable("merchants", "household"),
    BackupTable("wishlist_lists", "household"),
    BackupTable("wishlist_items", "household"),
    BackupTable("wines", "household", deferred=("open_bottle_lot_id",)),
    BackupTable("wine_value_history", "parent", parent=("wine_id", "wines")),
    BackupTable("wine_stock_lots", "household"),
    BackupTable("wine_sales", "household"),
    BackupTable("wine_stock_movements", "household"),
    BackupTable("wine_storage_allocations", "household"),
    BackupTable("wine_storage_movements", "household"),
    BackupTable("wine_strategy_allocations", "household"),
    BackupTable("wine_tasting_entries", "household"),
    BackupTable("external_wine_tastings", "household"),
    BackupTable(
        "wine_share_offers",
        "household",
        note="Offers to other people's cellars: restored only when the recipient still exists.",
    ),
    BackupTable("purchase_imports", "household"),
    BackupTable("purchase_document_wines", "household"),
    BackupTable("coownership_agreements", "household"),
    BackupTable(
        "coownership_participants",
        "parent",
        parent=("agreement_id", "coownership_agreements"),
        note="Invitation tokens are cleared: links sent before the backup stop working.",
    ),
    BackupTable(
        "coownership_payments", "parent", parent=("agreement_id", "coownership_agreements")
    ),
    BackupTable("household_regional_gap_settings", "household"),
    BackupTable("spreadsheet_import_maps", "household"),
    BackupTable("ai_audit_log", "household"),
    BackupTable("user_tags", "user"),
    BackupTable("user_wine_tags", "user", note="Only tags on wines of the exported household."),
    BackupTable("user_wine_ratings", "user_household"),
    BackupTable("user_taste_profiles", "user_household"),
    BackupTable("user_taste_profile_revisions", "user_household"),
    BackupTable("user_taste_declarations", "user"),
)

# Columns never written to a backup: secrets, or values a restore must not reuse.
SECRET_COLUMNS: dict[str, frozenset[str]] = {
    "coownership_participants": frozenset({"invite_token_hash", "invite_token_encrypted"}),
}

# Household settings saved in the manifest and applied to the target cellar.
HOUSEHOLD_SETTINGS = (
    "operating_mode",
    "restaurant_default_pour_size_ml",
    "restaurant_service_loss_ml",
    "restaurant_default_reorder_threshold",
    "cellar_intelligence_preferences",
)

# Tables deliberately left out, with the reason. Everything that references a
# household or a user and is not in BACKUP_TABLES must be listed here.
EXCLUDED_TABLES: dict[str, str] = {
    "households": "The cellar itself: its settings travel in the manifest.",
    "users": "Accounts are not part of a cellar backup.",
    "memberships": "Who can open the cellar belongs to the accounts, not to the data.",
    "household_invites": "Invitation links expire and cannot be reissued from a backup.",
    "user_sessions": "Login sessions.",
    "user_passkeys": "Security keys of the account.",
    "passkey_challenges": "Short-lived login challenges.",
    "user_ai_settings": "Holds the personal OpenAI key: never exported.",
    "user_entitlements": "Subscription state comes from Stripe.",
    "user_ai_credit_transactions": "AI credit is billing, managed by the app.",
    "stripe_checkout_sessions": "Payments.",
    "redeem_redemptions": "Promotional codes already used.",
    "user_notifications": "Messages from the app.",
    "user_notification_dismissals": "Messages from the app.",
    "user_monitor_device_tokens": "Device tokens for Vinaris Monitor.",
    "user_operational_action_snoozes": "Temporary reminders.",
    "user_activity_log": "Technical activity log.",
    "assistant_feedback": "Feedback on AI answers, used to improve the app.",
    "cellar_ai_commands": "Log of AI commands already carried out.",
    "wine_recognition_logs": "Log of label recognitions.",
    "sensory_agent_runs": "Log of AI sensory research runs.",
    "sensory_batch_runs": "Log of AI sensory research runs.",
    "sensory_refinement_runs": "Log of AI sensory research runs.",
    "email_campaign_deliveries": "Newsletter delivery log.",
    "admin_announcements": "App administration.",
    "demo_events": "App administration.",
    "email_assets": "App administration.",
    "email_campaigns": "App administration.",
    "redeem_codes": "App administration.",
    "sensory_profile_baselines": "Shared catalog, not a cellar's data.",
    "wine_sensory_profiles": "Shared catalog, not a cellar's data.",
    "wine_photo_library_entries": "Shared photo library, not a cellar's data.",
    "demo_wine_selections": "Demo configuration.",
}


def table(name: str) -> BackupTable:
    return next(item for item in BACKUP_TABLES if item.name == name)


def wine_photo_member(wine_id: str, size: str) -> str:
    return f"files/wine-photos/{wine_id}/{size}.png"


def purchase_document_member(purchase_import_id: str) -> str:
    return f"files/purchase-documents/{purchase_import_id}"


def binary_member(table_name: str, column: str, row_id: str) -> str:
    return f"files/binary/{table_name}/{column}/{row_id}"
