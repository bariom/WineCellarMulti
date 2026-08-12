from io import BytesIO
from secrets import token_urlsafe

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_admin_context
from app.db.session import get_db
from app.models import Household, Wine
from app.schemas.household import (
    PublicWineListResponse,
    PublicWineListWineResponse,
    RestaurantPublicWineListResponse,
)

router = APIRouter(prefix="/restaurant-public-wine-list")


def public_paths(token: str) -> RestaurantPublicWineListResponse:
    return RestaurantPublicWineListResponse(
        path=f"/wine-list/{token}",
        qr_path=f"/api/v1/restaurant-public-wine-list/{token}/qr.svg",
    )


def ensure_public_token(household: Household, db: Session) -> str:
    if not household.public_wine_list_token:
        household.public_wine_list_token = token_urlsafe(24)
        db.commit()
    return household.public_wine_list_token


@router.get("/settings", response_model=RestaurantPublicWineListResponse)
def get_public_wine_list_settings(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> RestaurantPublicWineListResponse:
    if context.household.operating_mode != "restaurant":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant wine list not available")
    return public_paths(ensure_public_token(context.household, db))


@router.post("/settings/rotate", response_model=RestaurantPublicWineListResponse)
def rotate_public_wine_list_token(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> RestaurantPublicWineListResponse:
    if context.household.operating_mode != "restaurant":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant wine list not available")
    context.household.public_wine_list_token = token_urlsafe(24)
    db.commit()
    return public_paths(context.household.public_wine_list_token)


@router.get("/{token}", response_model=PublicWineListResponse)
def get_public_wine_list(token: str, db: Session = Depends(get_db)) -> PublicWineListResponse:
    household = db.scalar(
        select(Household).where(
            Household.public_wine_list_token == token,
            Household.operating_mode == "restaurant",
        )
    )
    if household is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine list not found")
    wines = db.scalars(
        select(Wine)
        .where(
            Wine.household_id == household.id,
            Wine.commercial_status == "active",
            Wine.quantity > 0,
        )
        .order_by(Wine.type, Wine.region, Wine.producer, Wine.name, Wine.vintage)
    ).all()
    return PublicWineListResponse(
        restaurant_name=household.name,
        wines=[
            PublicWineListWineResponse(
                name=wine.name,
                producer=wine.producer or "",
                vintage=wine.vintage or "",
                type=wine.type or "",
                region=wine.region or "",
                appellation=wine.appellation or "",
                format=wine.format or "",
                currency=wine.currency or "CHF",
                sale_price=float(wine.sale_price) if wine.sale_price is not None else None,
                glass_price=float(wine.glass_price) if wine.glass_price is not None else None,
                pour_size_ml=wine.pour_size_ml if wine.glass_price is not None else None,
            )
            for wine in wines
        ],
    )


@router.get("/{token}/qr.svg", response_class=Response)
def public_wine_list_qr(
    token: str, request: Request, db: Session = Depends(get_db)
) -> Response:
    household = db.scalar(
        select(Household.id).where(
            Household.public_wine_list_token == token,
            Household.operating_mode == "restaurant",
        )
    )
    if household is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine list not found")
    public_url = f"{str(request.base_url).rstrip('/')}/wine-list/{token}"
    image = qrcode.make(public_url, image_factory=qrcode.image.svg.SvgPathImage)
    output = BytesIO()
    image.save(output)
    return Response(content=output.getvalue(), media_type="image/svg+xml")
