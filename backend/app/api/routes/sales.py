import re
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context, require_write_context
from app.db.session import get_db
from app.models import Wine, WineSale, WineStockLot, WineStockMovement
from app.schemas.sale import (
    CurrencySalesSummary,
    SaleBreakdownItem,
    SaleRankingItem,
    SaleSeriesPoint,
    WineSaleCreate,
    WineSaleResponse,
    WineSalesHistoryResponse,
    WineSalesSummaryResponse,
    WineSaleUpdate,
    WineSaleVoid,
)
from app.services.restaurant_excel import build_restaurant_excel
from app.services.stock_ledger import ensure_opening_stock, remove_fifo_stock, restore_sale_stock

router = APIRouter(prefix="/sales")


def validate_sales_period(from_date: date, to_date: date) -> None:
    if from_date > to_date or (to_date - from_date).days > 730:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid sales period"
        )


def sale_response(sale: WineSale, wine: Wine) -> WineSaleResponse:
    revenue = sale.unit_sale_price * sale.quantity
    cost = sale.total_purchase_cost or sale.unit_purchase_cost * sale.quantity
    return WineSaleResponse(
        id=sale.id,
        wine_id=wine.id,
        wine_name=wine.name,
        wine_producer=wine.producer,
        wine_vintage=wine.vintage,
        wine_type=wine.type,
        sold_at=sale.sold_at,
        quantity=sale.quantity,
        sale_kind="glass" if sale.sale_kind == "glass" else "bottle",
        pour_size_ml=sale.pour_size_ml,
        bottle_yield_ml=sale.bottle_yield_ml,
        discarded_volume_ml=sale.discarded_volume_ml,
        stock_bottles_consumed=sale.stock_bottles_consumed,
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


def bottle_volume_ml(wine_format: str) -> int:
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l)\b", (wine_format or "").lower())
    if not match:
        return 750
    value = Decimal(match.group(1).replace(",", "."))
    multiplier = {"ml": 1, "cl": 10, "dl": 100, "l": 1000}[match.group(2)]
    return max(int(value * multiplier), 1)


def commercial_bottle_yield_ml(wine_format: str, service_loss_ml: int) -> int:
    volume_ml = bottle_volume_ml(wine_format)
    scaled_loss_ml = round(max(int(service_loss_ml), 0) * volume_ml / 750)
    return max(volume_ml - scaled_loss_ml, 1)


def next_fifo_bottle(db: Session, wine: Wine) -> WineStockLot:
    ensure_opening_stock(db, wine)
    lot = db.scalar(
        select(WineStockLot)
        .where(WineStockLot.wine_id == wine.id, WineStockLot.quantity_remaining > 0)
        .order_by(WineStockLot.acquired_on.asc(), WineStockLot.created_at.asc())
        .with_for_update()
    )
    if lot is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stock ledger does not match the current bottle quantity",
        )
    return lot


def consume_glass_volume(
    db: Session,
    wine: Wine,
    sale: WineSale,
    *,
    glasses: int,
    user_id: UUID,
    service_loss_ml: int,
    storage_allocation_id: UUID | None = None,
) -> Decimal:
    pour_size_ml = max(int(wine.pour_size_ml or 100), 1)
    volume_ml = commercial_bottle_yield_ml(wine.format, service_loss_ml)
    sealed_bottles = max(wine.quantity - (1 if wine.open_bottle_ml else 0), 0)
    available_glasses = wine.open_bottle_ml // pour_size_ml + sealed_bottles * (
        volume_ml // pour_size_ml
    )
    if glasses > available_glasses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Not enough wine available for these glasses",
        )

    remaining_glasses = glasses
    allocated_cost = Decimal("0")
    consumed_bottles = 0
    discarded_volume_ml = 0

    def close_open_bottle() -> None:
        nonlocal allocated_cost, consumed_bottles, discarded_volume_ml
        discarded_volume_ml += max(wine.open_bottle_ml, 0)
        original_cost = Decimal(wine.open_bottle_original_cost)
        allocated_cost += Decimal(wine.open_bottle_cost_remaining)
        _, _, fifo_total_cost = remove_fifo_stock(
            db,
            wine,
            movement_type="sale",
            quantity=1,
            occurred_on=sale.sold_at,
            note=sale.note,
            user_id=user_id,
            sale=sale,
            preferred_lot_id=wine.open_bottle_lot_id,
            storage_allocation_id=storage_allocation_id,
        )
        allocated_cost += fifo_total_cost - original_cost
        consumed_bottles += 1
        wine.open_bottle_ml = 0
        wine.open_bottle_cost_remaining = Decimal("0")
        wine.open_bottle_original_cost = Decimal("0")
        wine.open_bottle_lot_id = None

    while remaining_glasses > 0:
        if 0 < wine.open_bottle_ml < pour_size_ml:
            close_open_bottle()
        if wine.open_bottle_ml <= 0:
            open_lot = next_fifo_bottle(db, wine)
            wine.open_bottle_ml = volume_ml
            wine.open_bottle_lot_id = open_lot.id
            wine.open_bottle_original_cost = open_lot.unit_cost
            wine.open_bottle_cost_remaining = wine.open_bottle_original_cost
        available_before = wine.open_bottle_ml
        served = pour_size_ml
        portion_cost = (
            Decimal(wine.open_bottle_cost_remaining) * Decimal(served) / Decimal(available_before)
        )
        allocated_cost += portion_cost
        wine.open_bottle_ml -= served
        wine.open_bottle_cost_remaining = max(
            Decimal(wine.open_bottle_cost_remaining) - portion_cost, Decimal("0")
        )
        remaining_glasses -= 1
        if wine.open_bottle_ml < pour_size_ml:
            close_open_bottle()

    sale.pour_size_ml = pour_size_ml
    sale.bottle_yield_ml = volume_ml
    sale.discarded_volume_ml = discarded_volume_ml
    sale.stock_bottles_consumed = consumed_bottles
    return max(allocated_cost, Decimal("0")).quantize(Decimal("0.01"))


def household_sale(db: Session, context: CurrentContext, sale_id: UUID) -> tuple[WineSale, Wine]:
    row = db.execute(
        select(WineSale, Wine)
        .join(Wine, Wine.id == WineSale.wine_id)
        .where(WineSale.id == sale_id, WineSale.household_id == context.household.id)
        .with_for_update()
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sale not found")
    return row[0], row[1]


@router.post("", response_model=WineSaleResponse, status_code=status.HTTP_201_CREATED)
def create_sale(
    payload: WineSaleCreate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineSaleResponse:
    wine = db.scalar(
        select(Wine)
        .where(
            Wine.id == payload.wine_id,
            Wine.household_id == context.household.id,
        )
        .with_for_update()
    )
    if wine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    if payload.sale_kind == "glass" and context.household.operating_mode != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Glass service is available only in restaurant mode",
        )
    sealed_bottles = wine.quantity - (1 if wine.open_bottle_ml else 0)
    if payload.sale_kind == "bottle" and payload.quantity > sealed_bottles:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Not enough sealed bottles in stock",
        )
    unit_sale_price = (
        payload.unit_sale_price
        if payload.unit_sale_price is not None
        else wine.glass_price
        if payload.sale_kind == "glass"
        else wine.sale_price
    )
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
        sale_kind=payload.sale_kind,
        pour_size_ml=wine.pour_size_ml if payload.sale_kind == "glass" else 0,
        bottle_yield_ml=0,
        discarded_volume_ml=0,
        stock_bottles_consumed=0,
        unit_sale_price=unit_sale_price,
        unit_purchase_cost=wine.price or Decimal("0"),
        total_purchase_cost=None,
        currency=(wine.currency or "CHF").upper(),
        previous_wine_status=wine.status,
        note=payload.note.strip(),
        created_at=datetime.now(UTC),
    )
    db.add(sale)
    db.flush()
    if payload.sale_kind == "glass":
        glass_cost = consume_glass_volume(
            db,
            wine,
            sale,
            glasses=payload.quantity,
            user_id=context.user.id,
            service_loss_ml=context.household.restaurant_service_loss_ml,
            storage_allocation_id=payload.storage_allocation_id,
        )
        sale.total_purchase_cost = glass_cost
        sale.unit_purchase_cost = (glass_cost / payload.quantity).quantize(Decimal("0.01"))
    else:
        _, fifo_unit_cost, fifo_total_cost = remove_fifo_stock(
            db,
            wine,
            movement_type="sale",
            quantity=payload.quantity,
            occurred_on=sale.sold_at,
            note=payload.note,
            user_id=context.user.id,
            sale=sale,
            reserved_lot_id=wine.open_bottle_lot_id,
            storage_allocation_id=payload.storage_allocation_id,
        )
        sale.unit_purchase_cost = fifo_unit_cost
        sale.total_purchase_cost = fifo_total_cost
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
    if sale.sale_kind == "glass":
        later_glass_sale = db.scalar(
            select(WineSale.id).where(
                WineSale.wine_id == wine.id,
                WineSale.sale_kind == "glass",
                WineSale.voided_at.is_(None),
                WineSale.created_at > sale.created_at,
            )
        )
        if later_glass_sale is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Void later glass sales for this wine first",
            )
        source_movements = list(
            db.scalars(
                select(WineStockMovement).where(
                    WineStockMovement.sale_id == sale.id,
                    WineStockMovement.movement_type == "sale",
                )
            )
        )
        restored_bottle_cost = sum(
            (abs(movement.quantity_delta) * movement.unit_cost for movement in source_movements),
            Decimal("0"),
        )
        if source_movements:
            restore_sale_stock(
                db,
                wine,
                sale,
                note=payload.reason,
                user_id=context.user.id,
            )
            wine.open_bottle_lot_id = source_movements[0].lot_id
        volume_ml = sale.bottle_yield_ml or bottle_volume_ml(wine.format)
        wine.open_bottle_ml += (
            sale.quantity * sale.pour_size_ml
            + sale.discarded_volume_ml
            - sale.stock_bottles_consumed * volume_ml
        )
        wine.open_bottle_cost_remaining = max(
            Decimal(wine.open_bottle_cost_remaining)
            + Decimal(sale.total_purchase_cost or sale.unit_purchase_cost * sale.quantity)
            - restored_bottle_cost,
            Decimal("0"),
        )
        while wine.open_bottle_ml >= volume_ml:
            volume_before = wine.open_bottle_ml
            wine.open_bottle_ml -= volume_ml
            wine.open_bottle_cost_remaining *= Decimal(wine.open_bottle_ml) / Decimal(volume_before)
        wine.open_bottle_original_cost = (
            Decimal(wine.open_bottle_cost_remaining) * Decimal(volume_ml) / Decimal(wine.open_bottle_ml)
            if wine.open_bottle_ml
            else Decimal("0")
        )
        if not wine.open_bottle_ml:
            wine.open_bottle_lot_id = None
    else:
        restore_sale_stock(
            db,
            wine,
            sale,
            note=payload.reason,
            user_id=context.user.id,
        )
    if wine.status.lower() == "sold":
        wine.status = sale.previous_wine_status
    db.commit()
    db.refresh(sale)
    return sale_response(sale, wine)


@router.put("/{sale_id}", response_model=WineSaleResponse)
def update_sale(
    sale_id: UUID,
    payload: WineSaleUpdate,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_write_context),
) -> WineSaleResponse:
    sale, wine = household_sale(db, context, sale_id)
    if sale.voided_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sale already voided")

    if sale.sale_kind == "glass":
        if payload.quantity != sale.quantity:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Change glass quantity by voiding the sale and recording it again",
            )
        sale.sold_at = payload.sold_at
        sale.unit_sale_price = payload.unit_sale_price
        sale.note = payload.note.strip()
        for movement in db.scalars(
            select(WineStockMovement).where(WineStockMovement.sale_id == sale.id)
        ):
            movement.occurred_on = payload.sold_at
            movement.note = sale.note
        db.commit()
        db.refresh(sale)
        return sale_response(sale, wine)

    source_movements = list(
        db.scalars(
            select(WineStockMovement)
            .where(
                WineStockMovement.sale_id == sale.id,
                WineStockMovement.movement_type == "sale",
            )
            .order_by(WineStockMovement.created_at.asc())
            .with_for_update()
        )
    )


    tracked_quantity = sum(abs(movement.quantity_delta) for movement in source_movements)
    if source_movements and tracked_quantity != sale.quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stock ledger does not match this sale",
        )

    quantity_change = payload.quantity - sale.quantity
    if quantity_change > 0:
        remove_fifo_stock(
            db,
            wine,
            movement_type="sale",
            quantity=quantity_change,
            occurred_on=payload.sold_at,
            note=payload.note,
            user_id=context.user.id,
            sale=sale,
            reserved_lot_id=wine.open_bottle_lot_id,
        )
    elif quantity_change < 0:
        if not source_movements:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This historical sale cannot be reduced because its stock movements are unavailable",
            )
        quantity_to_restore = abs(quantity_change)
        for movement in reversed(source_movements):
            if not quantity_to_restore:
                break
            restored_quantity = min(abs(movement.quantity_delta), quantity_to_restore)
            lot = db.get(WineStockLot, movement.lot_id) if movement.lot_id else None
            if lot is not None:
                lot.quantity_remaining += restored_quantity
            if restored_quantity == abs(movement.quantity_delta):
                db.delete(movement)
            else:
                movement.quantity_delta += restored_quantity
            quantity_to_restore -= restored_quantity
        wine.quantity += abs(quantity_change)
        if wine.quantity > 0 and wine.status.lower() == "sold":
            wine.status = sale.previous_wine_status

    sale.sold_at = payload.sold_at
    sale.quantity = payload.quantity
    sale.unit_sale_price = payload.unit_sale_price
    sale.note = payload.note.strip()

    active_movements = list(
        db.scalars(
            select(WineStockMovement)
            .where(
                WineStockMovement.sale_id == sale.id,
                WineStockMovement.movement_type == "sale",
            )
            .with_for_update()
        )
    )
    for movement in active_movements:
        movement.occurred_on = payload.sold_at
        movement.note = sale.note
    if active_movements:
        total_purchase_cost = sum(
            (abs(movement.quantity_delta) * movement.unit_cost for movement in active_movements),
            Decimal("0"),
        )
        sale.total_purchase_cost = total_purchase_cost
        sale.unit_purchase_cost = (total_purchase_cost / payload.quantity).quantize(Decimal("0.01"))
    else:
        sale.total_purchase_cost = sale.unit_purchase_cost * payload.quantity

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
    validate_sales_period(from_date, to_date)
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
    voided_rows = db.execute(
        select(WineSale, Wine)
        .join(Wine, Wine.id == WineSale.wine_id)
        .where(
            WineSale.household_id == context.household.id,
            WineSale.voided_at.is_not(None),
            func.date(WineSale.voided_at) >= from_date,
            func.date(WineSale.voided_at) <= to_date,
        )
        .order_by(WineSale.voided_at.desc())
    ).all()
    currency_totals: dict[str, dict[str, Decimal | int]] = defaultdict(
        lambda: {"revenue": Decimal("0"), "cost": Decimal("0"), "bottles": 0, "glasses": 0, "bottle_revenue": Decimal("0"), "glass_revenue": Decimal("0")}
    )
    daily: dict[tuple[date, str], dict[str, Decimal | int]] = defaultdict(
        lambda: {"revenue": Decimal("0"), "cost": Decimal("0"), "bottles": 0, "glasses": 0}
    )
    wine_totals: dict[tuple[UUID, str], dict[str, Decimal | int | str]] = {}
    type_totals: dict[tuple[str, str], dict[str, Decimal | int]] = {}
    region_totals: dict[tuple[str, str], dict[str, Decimal | int]] = {}
    producer_totals: dict[tuple[str, str], dict[str, Decimal | int]] = {}
    for sale, wine in rows:
        revenue = sale.unit_sale_price * sale.quantity
        cost = sale.total_purchase_cost or sale.unit_purchase_cost * sale.quantity
        currency = sale.currency.upper()
        currency_totals[currency]["revenue"] += revenue
        currency_totals[currency]["cost"] += cost
        sale_count_key = "glasses" if sale.sale_kind == "glass" else "bottles"
        currency_totals[currency][sale_count_key] += sale.quantity
        if sale.sale_kind == "glass":
            currency_totals[currency]["glass_revenue"] += revenue
        else:
            currency_totals[currency]["bottle_revenue"] += revenue
        daily[(sale.sold_at, currency)]["revenue"] += revenue
        daily[(sale.sold_at, currency)]["cost"] += cost
        daily[(sale.sold_at, currency)][sale_count_key] += sale.quantity
        item = wine_totals.setdefault(
            (wine.id, currency),
            {
                "label": " ".join(part for part in [wine.name, wine.vintage] if part),
                "revenue": Decimal("0"),
                "cost": Decimal("0"),
                "bottles": 0,
                "glasses": 0,
                "current_stock": wine.quantity,
            },
        )
        item["revenue"] += revenue
        item["cost"] += cost
        item[sale_count_key] += sale.quantity
        for totals_map, label in (
            (type_totals, wine.type.strip() or "Other"),
            (region_totals, wine.region.strip() or "Not specified"),
            (producer_totals, wine.producer.strip() or "Not specified"),
        ):
            breakdown = totals_map.setdefault(
                (label, currency),
                {"revenue": Decimal("0"), "cost": Decimal("0"), "bottles": 0, "glasses": 0},
            )
            breakdown["revenue"] += revenue
            breakdown["cost"] += cost
            breakdown[sale_count_key] += sale.quantity
    currencies = []
    for currency, totals in sorted(currency_totals.items()):
        revenue = Decimal(totals["revenue"])
        cost = Decimal(totals["cost"])
        bottles = int(totals["bottles"])
        glasses = int(totals["glasses"])
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
                glasses=glasses,
                average_sale_price=(Decimal(totals["bottle_revenue"]) / bottles).quantize(Decimal("0.01"))
                if bottles
                else Decimal("0"),
                average_glass_price=(Decimal(totals["glass_revenue"]) / glasses).quantize(Decimal("0.01"))
                if glasses
                else Decimal("0"),
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
            glasses=int(values["glasses"]),
        )
        for key, values in sorted(daily.items())
    ]
    ranked = sorted(
        wine_totals.items(),
        key=lambda row: (int(row[1]["bottles"]) + int(row[1]["glasses"]), Decimal(row[1]["revenue"])),
        reverse=True,
    )[:8]
    household_wines = list(
        db.scalars(
            select(Wine)
            .where(Wine.household_id == context.household.id)
            .order_by(Wine.name.asc(), Wine.vintage.desc())
        )
    )
    least_sold = sorted(
        household_wines,
        key=lambda wine: (
            int(wine_totals.get((wine.id, (wine.currency or "CHF").upper()), {}).get("bottles", 0))
            + int(wine_totals.get((wine.id, (wine.currency or "CHF").upper()), {}).get("glasses", 0)),
            -wine.quantity,
            wine.name.lower(),
        ),
    )[:10]

    def breakdown_items(
        values: dict[tuple[str, str], dict[str, Decimal | int]],
    ) -> list[SaleBreakdownItem]:
        ordered = sorted(
            values.items(),
            key=lambda row: (int(row[1]["bottles"]) + int(row[1]["glasses"]), Decimal(row[1]["revenue"])),
            reverse=True,
        )
        return [
            SaleBreakdownItem(
                label=key[0],
                currency=key[1],
                bottles=int(totals["bottles"]),
                glasses=int(totals["glasses"]),
                revenue=Decimal(totals["revenue"]),
                cost=Decimal(totals["cost"]),
                gross_margin=Decimal(totals["revenue"]) - Decimal(totals["cost"]),
            )
            for key, totals in ordered
        ]

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
                glasses=int(values["glasses"]),
                revenue=Decimal(values["revenue"]),
                gross_margin=Decimal(values["revenue"]) - Decimal(values["cost"]),
                currency=wine_key[1],
                current_stock=int(values["current_stock"]),
            )
            for wine_key, values in ranked
        ],
        least_sold_wines=[
            SaleRankingItem(
                wine_id=wine.id,
                label=" ".join(part for part in [wine.name, wine.vintage] if part),
                bottles=int(
                    wine_totals.get((wine.id, (wine.currency or "CHF").upper()), {}).get(
                        "bottles", 0
                    )
                ),
                glasses=int(
                    wine_totals.get((wine.id, (wine.currency or "CHF").upper()), {}).get(
                        "glasses", 0
                    )
                ),
                revenue=Decimal(
                    wine_totals.get((wine.id, (wine.currency or "CHF").upper()), {}).get(
                        "revenue", 0
                    )
                ),
                gross_margin=Decimal(
                    wine_totals.get((wine.id, (wine.currency or "CHF").upper()), {}).get(
                        "revenue", 0
                    )
                )
                - Decimal(
                    wine_totals.get((wine.id, (wine.currency or "CHF").upper()), {}).get("cost", 0)
                ),
                currency=(wine.currency or "CHF").upper(),
                current_stock=wine.quantity,
            )
            for wine in least_sold
        ],
        sales_by_type=breakdown_items(type_totals),
        sales_by_region=breakdown_items(region_totals),
        sales_by_producer=breakdown_items(producer_totals),
        recent_sales=[sale_response(sale, wine) for sale, wine in rows[:20]],
        voided_sales=[sale_response(sale, wine) for sale, wine in voided_rows[:20]],
    )


@router.get("/wine/{wine_id}/history", response_model=WineSalesHistoryResponse)
def wine_sales_history(
    wine_id: UUID,
    days: int = Query(default=365, ge=30, le=730),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> WineSalesHistoryResponse:
    if context.household.operating_mode != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wine sales history is available only for restaurant cellars",
        )
    wine = db.scalar(
        select(Wine).where(Wine.id == wine_id, Wine.household_id == context.household.id)
    )
    if wine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wine not found")
    to_date = datetime.now(UTC).date()
    from_date = to_date - timedelta(days=days - 1)
    rows = list(
        db.scalars(
            select(WineSale)
            .where(
                WineSale.wine_id == wine.id,
                WineSale.household_id == context.household.id,
                WineSale.sold_at >= from_date,
                WineSale.sold_at <= to_date,
                WineSale.voided_at.is_(None),
            )
            .order_by(WineSale.sold_at.asc(), WineSale.created_at.asc())
        )
    )
    daily: dict[date, dict[str, Decimal | int]] = defaultdict(
        lambda: {"revenue": Decimal("0"), "cost": Decimal("0"), "bottles": 0, "glasses": 0}
    )
    for sale in rows:
        totals = daily[sale.sold_at]
        totals["revenue"] += sale.unit_sale_price * sale.quantity
        totals["cost"] += sale.total_purchase_cost or sale.unit_purchase_cost * sale.quantity
        totals["glasses" if sale.sale_kind == "glass" else "bottles"] += sale.quantity
    series = [
        SaleSeriesPoint(
            date=sold_at,
            currency=wine.currency.upper(),
            revenue=Decimal(totals["revenue"]),
            cost=Decimal(totals["cost"]),
            gross_margin=Decimal(totals["revenue"]) - Decimal(totals["cost"]),
            bottles=int(totals["bottles"]),
            glasses=int(totals["glasses"]),
        )
        for sold_at, totals in sorted(daily.items())
    ]
    revenue = sum((Decimal(point.revenue) for point in series), Decimal("0"))
    gross_margin = sum((Decimal(point.gross_margin) for point in series), Decimal("0"))
    return WineSalesHistoryResponse(
        wine_id=wine.id,
        from_date=from_date,
        to_date=to_date,
        currency=wine.currency.upper(),
        revenue=revenue,
        gross_margin=gross_margin,
        bottles=sum(point.bottles for point in series),
        glasses=sum(point.glasses for point in series),
        series=series,
    )


@router.get("/export.xlsx")
def export_restaurant_excel(
    from_date: date = Query(default_factory=lambda: datetime.now(UTC).date() - timedelta(days=29)),
    to_date: date = Query(default_factory=lambda: datetime.now(UTC).date()),
    locale: str = Query(default="it", pattern="^(it|en)$"),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(get_current_context),
) -> StreamingResponse:
    validate_sales_period(from_date, to_date)
    if context.household.operating_mode != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Excel operations export is available only for restaurant cellars",
        )
    sales_rows = [
        (sale, wine)
        for sale, wine in db.execute(
            select(WineSale, Wine)
            .join(Wine, Wine.id == WineSale.wine_id)
            .where(
                WineSale.household_id == context.household.id,
                WineSale.sold_at >= from_date,
                WineSale.sold_at <= to_date,
                WineSale.voided_at.is_(None),
            )
            .order_by(WineSale.sold_at.asc(), WineSale.created_at.asc())
        ).all()
    ]
    inventory = list(
        db.scalars(
            select(Wine)
            .where(Wine.household_id == context.household.id)
            .order_by(Wine.name.asc(), Wine.vintage.desc())
        )
    )
    workbook = build_restaurant_excel(
        context.household,
        sales_rows,
        inventory,
        from_date,
        to_date,
        locale,
    )
    filename = f"vinaris-restaurant-{from_date.isoformat()}-{to_date.isoformat()}.xlsx"
    return StreamingResponse(
        workbook,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
