from decimal import Decimal

from pydantic import BaseModel


class SessionResponse(BaseModel):
    authenticated: bool
    user_id: str | None = None
    user_email: str | None = None
    user_display_name: str | None = None
    active_household_id: str | None = None
    active_household_name: str | None = None
    active_household_mode: str = "private"
    membership_role: str | None = None
    is_app_admin: bool = False
    is_demo: bool = False
    pending_approval: bool = False
    pending_email_verification: bool = False
    requires_legal_acceptance: bool = False
    legal_document_version: str = ""
    locale: str = "it"
    theme_preference: str = "system"
    dashboard_focus: str = "collector"
    daily_wine_budget_chf: Decimal | None = None
    can_use_label_recognition: bool = False
    can_manage_wine_photos: bool = False
    has_active_entitlement: bool = False
    entitlement_valid_until: str | None = None
    entitlement_days_remaining: int | None = None
