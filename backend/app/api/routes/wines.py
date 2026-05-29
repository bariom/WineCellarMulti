from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context
from app.db.session import get_db
from app.models import Wine
from app.schemas.wine import WineCreate, WineResponse, WineUpdate


router = APIRouter()


def get_household_wine(db: Session, context: CurrentContext, wine_id: UUID) -> Wine:
    wine = db.scalar(
        select(Wine).where(
            Wine.id == wine_id,
            Wine.household_id == context.household.id,
        ),
    )
    if wine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    return wine


@router.get("", response_model=list[WineResponse])
def list_wines(
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> list[Wine]:
    return list(
        db.scalars(
            select(Wine)
            .where(Wine.household_id == context.household.id)
            .order_by(Wine.name.asc(), Wine.vintage.desc()),
        ),
    )


@router.post("", response_model=WineResponse, status_code=status.HTTP_201_CREATED)
def create_wine(
    payload: WineCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> Wine:
    wine = Wine(
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        **payload.model_dump(),
    )
    db.add(wine)
    db.commit()
    db.refresh(wine)
    return wine


@router.get("/{wine_id}", response_model=WineResponse)
def get_wine(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> Wine:
    return get_household_wine(db, context, wine_id)


@router.patch("/{wine_id}", response_model=WineResponse)
def update_wine(
    wine_id: UUID,
    payload: WineUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> Wine:
    wine = get_household_wine(db, context, wine_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(wine, field, value)
    db.commit()
    db.refresh(wine)
    return wine


@router.delete("/{wine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wine(
    wine_id: UUID,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> Response:
    wine = get_household_wine(db, context, wine_id)
    db.delete(wine)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
