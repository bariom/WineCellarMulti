from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_write_context
from app.db.session import get_db
from app.models import Wine, WineSale
from app.schemas.sale import (
    CurrencySalesSummary,
    SaleRankingItem,
    SaleSeriesPoint,
    WineSaleCreate,
    WineSaleResponse,
    WineSalesSummaryResponse,
    WineSaleVoid,
)

router = APIRouter(prefix="/sales")


def sale_response(sale: WineSale, wine: Wine) -> WineSaleResponse:
    revenue = sale.unit_sale_price * sale.quantity
    cost = sale.unit_purchase_cost * sale.quantity
    return WineSaleResponse(
        id=sale.id,
        wine_id=wine.id,
        wine_name=wine.name,
        wine_producer=wine.producer,
        wine_vintage=wine.vintage,
        wine_type=wine.type,
        sold_at=sale.sold_at,
        quantity=sale.quantity,
        unit_sale_price=sale.unit_sale_price,
        unit_purchase_cost=sale.unit_purchase_cost,
        revenue=revenue,
        cost=cost,
        gross_margin=revenue - cost,
        currency=sale.currency,
        note=sale.note,
        voided_at=sale.voided_at,
        void_reason=sale.void_reason,
        created_at=sale.created_at,
    )


def household_sale(db: Session, context: CurrentContext, sale_id: UUID) -> tuple[WineSale, Wine]:
    row = db.execute(
        select(WineSale, Wine)
        .join(Wine, Wine.id == WineSale.wine_id)
        .where(WineSale.id == sale_id, WineSale.household_id == context.household.id)
        .with_for_update()
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sale not found")
    return row


@router.post("", response_model=WineSaleResponse, status_code=status.HTTP_201_CREATED)
def create_sale(
    payload: WineSaleCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineSaleResponse:
    wine = db.scalar(
        select(Wine).where(
            Wine.id == payload.wine_id,
            Wine.household_id == context.household.id,
        ).with_for_update()
    )
    if wine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    if payload.quantity > wine.quantity:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not enough bottles in stock")
    unit_sale_price = payload.unit_sale_price if payload.unit_sale_price is not None else wine.sale_price
    if unit_sale_price is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A sale price is required",
        )
    sale = WineSale(
        wine_id=wine.id,
        household_id=context.household.id,
        created_by_user_id=context.user.id,
        sold_at=payload.sold_at or datetime.now(UTC).date(),
        quantity=payload.quantity,
        unit_sale_price=unit_sale_price,
        unit_purchase_cost=wine.price or Decimal("0"),
        currency=(wine.currency or "CHF").upper(),
        previous_wine_status=wine.status,
        note=payload.note.strip(),
        created_at=datetime.now(UTC),
    )
    wine.quantity -= payload.quantity
    if wine.quantity == 0:
        wine.status = "Sold"
    db.add(sale)
    db.commit()
    db.refresh(sale)
    return sale_response(sale, wine)


@router.post("/{sale_id}/void", response_model=WineSaleResponse)
def void_sale(
    sale_id: UUID,
    payload: WineSaleVoid,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineSaleResponse:
    sale, wine = household_sale(db, context, sale_id)
    if sale.voided_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sale already voided")
    sale.voided_at = datetime.now(UTC)
    sale.void_reason = payload.reason.strip()
    wine.quantity += sale.quantity
    if wine.status.lower() == "sold":
        wine.status = sale.previous_wine_status
    db.commit()
    db.refresh(sale)
    return sale_response(sale, wine)


@router.get("/summary", response_model=WineSalesSummaryResponse)
def sales_summary(
    from_date: date = Query(default_factory=lambda: datetime.now(UTC).date() - timedelta(days=29)),
    to_date: date = Query(default_factory=lambda: datetime.now(UTC).date()),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> WineSalesSummaryResponse:
    if from_date > to_date or (to_date - from_date).days > 730:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid sales period")
    rows = db.execute(
        select(WineSale, Wine)
        .join(Wine, Wine.id == WineSale.wine_id)
        .where(
            WineSale.household_id == context.household.id,
            WineSale.sold_at >= from_date,
            WineSale.sold_at <= to_date,
            WineSale.voided_at.is_(None),
        )
        .order_by(WineSale.sold_at.desc(), WineSale.created_at.desc())
    ).all()
    currency_totals: dict[str, dict[str, Decimal | int]] = defaultdict(
        lambda: {"revenue": Decimal("0"), "cost": Decimal("0"), "bottles": 0}
    )
    daily: dict[tuple[date, str], dict[str, Decimal | int]] = defaultdict(
        lambda: {"revenue": Decimal("0"), "cost": Decimal("0"), "bottles": 0}
    )
    wine_totals: dict[tuple[UUID, str], dict[str, Decimal | int | str]] = {}
    for sale, wine in rows:
        revenue = sale.unit_sale_price * sale.quantity
        cost = sale.unit_purchase_cost * sale.quantity
        currency = sale.currency.upper()
        currency_totals[currency]["revenue"] += revenue
        currency_totals[currency]["cost"] += cost
        currency_totals[currency]["bottles"] += sale.quantity
        daily[(sale.sold_at, currency)]["revenue"] += revenue
        daily[(sale.sold_at, currency)]["cost"] += cost
        daily[(sale.sold_at, currency)]["bottles"] += sale.quantity
        item = wine_totals.setdefault(
            (wine.id, currency),
            {
                "label": " ".join(part for part in [wine.name, wine.vintage] if part),
                "revenue": Decimal("0"),
                "cost": Decimal("0"),
                "bottles": 0,
            },
        )
        item["revenue"] += revenue
        item["cost"] += cost
        item["bottles"] += sale.quantity
    currencies = []
    for currency, totals in sorted(currency_totals.items()):
        revenue = Decimal(totals["revenue"])
        cost = Decimal(totals["cost"])
        bottles = int(totals["bottles"])
        margin = revenue - cost
        currencies.append(
            CurrencySalesSummary(
                currency=currency,
                revenue=revenue,
                cost=cost,
                gross_margin=margin,
                gross_margin_pct=(margin / revenue * 100).quantize(Decimal("0.01"))
                if revenue
                else Decimal("0"),
                bottles=bottles,
                average_sale_price=(revenue / bottles).quantize(Decimal("0.01")) if bottles else Decimal("0"),
            )
        )
    series = [
        SaleSeriesPoint(
            date=key[0],
            currency=key[1],
            revenue=Decimal(values["revenue"]),
            cost=Decimal(values["cost"]),
            gross_margin=Decimal(values["revenue"]) - Decimal(values["cost"]),
            bottles=int(values["bottles"]),
        )
        for key, values in sorted(daily.items())
    ]
    ranked = sorted(
        wine_totals.items(),
        key=lambda row: (Decimal(row[1]["revenue"]) - Decimal(row[1]["cost"]), int(row[1]["bottles"])),
        reverse=True,
    )[:8]
    return WineSalesSummaryResponse(
        from_date=from_date,
        to_date=to_date,
        currencies=currencies,
        series=series,
        top_wines=[
            SaleRankingItem(
                wine_id=wine_key[0],
                label=str(values["label"]),
                bottles=int(values["bottles"]),
                revenue=Decimal(values["revenue"]),
                gross_margin=Decimal(values["revenue"]) - Decimal(values["cost"]),
                currency=wine_key[1],
            )
            for wine_key, values in ranked
        ],
        recent_sales=[sale_response(sale, wine) for sale, wine in rows[:20]],
    )
