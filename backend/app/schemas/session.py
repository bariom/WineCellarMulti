from pydantic import BaseModel


class SessionResponse(BaseModel):
    authenticated: bool
    user_id: str | None = None
    active_household_id: str | None = None
    membership_role: str | None = None
