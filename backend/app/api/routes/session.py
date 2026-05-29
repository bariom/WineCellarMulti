from fastapi import APIRouter, Depends

from app.api.deps import CurrentContext, build_session_response, get_optional_context
from app.schemas.session import SessionResponse


router = APIRouter()


@router.get("/session", response_model=SessionResponse)
def get_session(context: CurrentContext | None = Depends(get_optional_context)) -> SessionResponse:
    return SessionResponse(**build_session_response(context))
