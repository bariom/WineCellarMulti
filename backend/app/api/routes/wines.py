import uuid

from fastapi import APIRouter

from app.schemas.wine import WineCreate, WineResponse


router = APIRouter()

_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000001"
_WINES: list[WineResponse] = []


@router.get("", response_model=list[WineResponse])
def list_wines() -> list[WineResponse]:
    return _WINES


@router.post("", response_model=WineResponse)
def create_wine(payload: WineCreate) -> WineResponse:
    wine = WineResponse(
        id=str(uuid.uuid4()),
        household_id=_HOUSEHOLD_ID,
        name=payload.name,
        producer=payload.producer,
        vintage=payload.vintage,
        quantity=payload.quantity,
        currency=payload.currency,
        price=payload.price,
        status=payload.status,
        expected_delivery=payload.expected_delivery,
        notes=payload.notes,
    )
    _WINES.append(wine)
    return wine
