from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context
from app.db.session import get_db
from app.models import Merchant
from app.schemas.merchant import MerchantResponse

router = APIRouter(prefix="/merchants")


@router.get("", response_model=list[MerchantResponse])
def list_merchants(
    db: Session = Depends(get_db), context: CurrentContext = Depends(get_current_context)
) -> list[MerchantResponse]:
    merchants = list(
        db.scalars(
            select(Merchant)
            .where(Merchant.household_id == context.household.id)
            .order_by(Merchant.name.asc(), Merchant.id.asc())
        )
    )
    return [MerchantResponse.model_validate(merchant) for merchant in merchants]
