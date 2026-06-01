from pydantic import BaseModel


class SessionResponse(BaseModel):
    authenticated: bool
    user_id: str | None = None
    user_email: str | None = None
    user_display_name: str | None = None
    active_household_id: str | None = None
    active_household_name: str | None = None
    membership_role: str | None = None
    is_app_admin: bool = False
    pending_approval: bool = False
    locale: str = "it"
    theme_preference: str = "system"
