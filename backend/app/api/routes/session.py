from fastapi import APIRouter

from app.schemas.session import SessionResponse


router = APIRouter()


@router.get("/session", response_model=SessionResponse)
def get_session() -> SessionResponse:
    return SessionResponse(
        authenticated=False,
        user_id=None,
        active_household_id=None,
        membership_role=None,
    )
