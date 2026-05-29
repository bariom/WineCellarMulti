from fastapi import APIRouter, Depends

from app.api.deps import CurrentContext, get_current_context
from app.schemas.session import SessionResponse


router = APIRouter()


@router.get("/session", response_model=SessionResponse)
def get_session(context: CurrentContext = Depends(get_current_context)) -> SessionResponse:
    return SessionResponse(
        authenticated=True,
        user_id=str(context.user.id),
        user_email=context.user.email,
        user_display_name=context.user.display_name,
        active_household_id=str(context.household.id),
        active_household_name=context.household.name,
        membership_role=context.membership.role,
    )
