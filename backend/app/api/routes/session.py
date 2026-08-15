from fastapi import APIRouter, Depends, Response

from app.api.deps import (
    CurrentContext,
    build_session_response,
    get_authenticated_context,
    get_optional_context,
)
from app.core.config import settings
from app.schemas.session import PublicAppConfigResponse, SessionResponse

router = APIRouter()


@router.get("/public-config", response_model=PublicAppConfigResponse)
def get_public_app_config(response: Response) -> PublicAppConfigResponse:
    response.headers["Cache-Control"] = "public, max-age=300"
    return PublicAppConfigResponse(free_tier_label_limit=settings.free_tier_label_limit)


@router.get("/session", response_model=SessionResponse)
def get_session(context: CurrentContext | None = Depends(get_optional_context)) -> SessionResponse:
    return SessionResponse.model_validate(build_session_response(context))


@router.get("/map-config")
def get_map_config(
    response: Response,
    _: CurrentContext = Depends(get_authenticated_context),
) -> dict[str, object]:
    response.headers["Cache-Control"] = "private, no-store"
    api_key = settings.arcgis_api_key.strip()
    return {
        "satellite_enabled": bool(api_key),
        "arcgis_api_key": api_key,
    }
