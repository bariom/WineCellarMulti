"""Generic Excel / spreadsheet import (docs/SPREADSHEET_IMPORT.md).

The client keeps the file and sends it again at each step with the mapping the
user confirmed; the file is never stored. Every lookup (duplicates, locations,
wines a tasting belongs to, saved mappings) is scoped to the active household.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, require_admin_context
from app.api.routes.imports import (
    LegacyImportResult,
    cellartracker_free_tier_capacity,
    existing_wine_keys,
    existing_wishlist_keys,
    normalize_key_part,
    persist_imported_wines,
    wine_duplicate_key,
    wishlist_duplicate_key,
)
from app.core.config import settings
from app.db.session import get_db
from app.models import (
    ExternalWineTasting,
    Household,
    SpreadsheetImportMap,
    Wine,
    WineTastingEntry,
    WishlistItem,
    WishlistList,
)
from app.prompts.spreadsheet_import import NAME_SPLIT_SCHEMA, spreadsheet_name_split_prompt
from app.schemas.spreadsheet_import import (
    SpreadsheetAnalysis,
    SpreadsheetImportResult,
    SpreadsheetMapping,
    SpreadsheetNameSplitRequest,
    SpreadsheetNameSplitResult,
    SpreadsheetNameSuggestion,
    SpreadsheetPreview,
)
from app.services.free_tier import is_free_tier
from app.services.openai_client import parse_json_response
from app.services.spreadsheet_import.analysis import analyze_workbook
from app.services.spreadsheet_import.movements import StockPlan
from app.services.spreadsheet_import.names import known_producers, squeeze, verified_ai_split
from app.services.spreadsheet_import.plan import ImportPlan, PlannedTasting, build_plan
from app.services.spreadsheet_import.reader import (
    MAX_FILE_BYTES,
    SpreadsheetError,
    read_workbook,
)
from app.services.stock_ledger import add_inbound_stock, remove_fifo_stock
from app.services.wine_consumption import normalize_tasting_history

router = APIRouter(prefix="/imports/spreadsheet")

DEFAULT_WISHLIST_NAME = "Wishlist"
# Names per household the application splits by AI for free, once and not per import.
AI_FREE_NAMES = 15
IMPORT_NOTE = "Excel"
ADJUSTMENT_NOTE = "Excel: aligned with the cellar sheet"


async def read_upload(file: UploadFile) -> tuple[bytes, str]:
    content = await file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "file_too_large", "message": "The file is larger than 5 MB."},
        )
    return content, file.filename or ""


def spreadsheet_error(error: SpreadsheetError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"code": error.code, "message": str(error)},
    )


def parse_mapping(raw: str) -> SpreadsheetMapping:
    try:
        return SpreadsheetMapping.model_validate_json(raw)
    except ValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_mapping", "message": "The mapping is not valid."},
        ) from error


def household_currency(db: Session, context: CurrentContext) -> str:
    """The currency most of the cellar uses, CHF for an empty cellar."""
    row = db.execute(
        select(Wine.currency, func.count())
        .where(Wine.household_id == context.household.id, Wine.currency != "")
        .group_by(Wine.currency)
        .order_by(func.count().desc())
        .limit(1)
    ).first()
    return str(row[0]) if row else "CHF"


def saved_mapping(
    db: Session, context: CurrentContext, fingerprint: str
) -> SpreadsheetImportMap | None:
    return db.scalar(
        select(SpreadsheetImportMap).where(
            SpreadsheetImportMap.household_id == context.household.id,
            SpreadsheetImportMap.fingerprint == fingerprint,
        )
    )


def remember_mapping(db: Session, context: CurrentContext, mapping: SpreadsheetMapping) -> None:
    # Row-level name corrections belong to one file, not to the layout.
    stored = mapping.model_dump(mode="json")
    for table in stored["tables"]:
        table["name_overrides"] = {}
    now = datetime.now(UTC)
    existing = saved_mapping(db, context, mapping.fingerprint)
    if existing is None:
        db.add(
            SpreadsheetImportMap(
                household_id=context.household.id,
                fingerprint=mapping.fingerprint,
                mapping=stored,
                created_at=now,
                last_used_at=now,
            )
        )
    else:
        existing.mapping = stored
        existing.last_used_at = now


def default_wishlist_list(
    db: Session, context: CurrentContext, *, create: bool
) -> uuid.UUID | None:
    wishlist_list = db.scalar(
        select(WishlistList)
        .where(WishlistList.household_id == context.household.id)
        .order_by(WishlistList.name.asc(), WishlistList.id.asc())
    )
    if wishlist_list is None and create:
        wishlist_list = WishlistList(
            household_id=context.household.id,
            created_by_user_id=context.user.id,
            name=DEFAULT_WISHLIST_NAME,
            description="",
        )
        db.add(wishlist_list)
        db.flush()
    return wishlist_list.id if wishlist_list else None


# --- matching tastings to wines -------------------------------------------------


def identity_keys(name: str, producer: str, vintage: str) -> list[tuple[str, ...]]:
    """Keys from the most to the least specific, to find the wine a tasting is about."""
    name_key, producer_key, vintage_key = (
        normalize_key_part(part) for part in (name, producer, vintage)
    )
    keys: list[tuple[str, ...]] = [(name_key, producer_key, vintage_key)]
    if producer_key:
        keys.append((f"{producer_key} {name_key}", vintage_key))
    keys.append((name_key, vintage_key))
    return keys


class WineIndex:
    """Wines by identity; a key two different wines share is left out as ambiguous."""

    def __init__(self, entries: list[tuple[str, str, str, Any]]) -> None:
        found: dict[tuple[str, ...], Any] = {}
        ambiguous: set[tuple[str, ...]] = set()
        for name, producer, vintage, value in entries:
            for key in identity_keys(name, producer, vintage):
                if key in found and found[key] is not value:
                    ambiguous.add(key)
                found.setdefault(key, value)
        self.found = {key: value for key, value in found.items() if key not in ambiguous}

    def get(self, name: str, producer: str, vintage: str) -> Any:
        # "Trimbach Riesling" in the file finds producer "Trimbach" + name "Riesling"
        # through the (producer name, vintage) key every wine with a producer has.
        for key in identity_keys(name, producer, vintage):
            if key in self.found:
                return self.found[key]
        return None


def household_wine_index(db: Session, context: CurrentContext) -> WineIndex:
    wines = db.scalars(select(Wine).where(Wine.household_id == context.household.id))
    return WineIndex([(wine.name, wine.producer, wine.vintage, wine) for wine in wines])


# --- plan -------------------------------------------------------------------------


def plan_from_upload(
    content: bytes,
    filename: str,
    mapping: SpreadsheetMapping,
    db: Session,
    context: CurrentContext,
) -> ImportPlan:
    workbook = read_workbook(content, filename)
    return build_plan(
        workbook,
        mapping,
        producers=known_producers(db, context.household.id),
        default_currency=household_currency(db, context),
        context_ids={
            "household_id": context.household.id,
            "created_by_user_id": context.user.id,
        },
    )


def wishlist_from_tastings(
    plan: ImportPlan, index: WineIndex, context: CurrentContext, currency: str
) -> list[dict[str, Any]]:
    """Tasted wines marked "buy again" that the cellar does not hold."""
    items = []
    seen: set[tuple[str, str, str]] = set()
    for tasting in plan.tastings:
        key = (
            normalize_key_part(tasting.name),
            normalize_key_part(tasting.producer),
            normalize_key_part(tasting.vintage),
        )
        if (
            not tasting.buy_again
            or key in seen
            or index.get(tasting.name, tasting.producer, tasting.vintage)
        ):
            continue
        seen.add(key)
        items.append(
            {
                "household_id": context.household.id,
                "created_by_user_id": context.user.id,
                "name": tasting.name[:200],
                "producer": tasting.producer[:200],
                "vintage": tasting.vintage[:16],
                "format": "Bottle (750ml)",
                "type": tasting.wine_type,
                "currency": currency,
                "notes": tasting.data["note"],
            }
        )
    return items


def planned_wine_index(db: Session, context: CurrentContext, plan: ImportPlan) -> WineIndex:
    entries: list[tuple[str, str, str, Any]] = [
        (wine.name, wine.producer, wine.vintage, wine)
        for wine in db.scalars(select(Wine).where(Wine.household_id == context.household.id))
    ]
    entries.extend(
        (data["name"], data["producer"], data["vintage"], data["id"]) for data, _ in plan.wines
    )
    return WineIndex(entries)


# --- routes -----------------------------------------------------------------------


@router.post("/analyze", response_model=SpreadsheetAnalysis)
async def analyze_spreadsheet(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> SpreadsheetAnalysis:
    """Propose the kind of each table and the field of each column; writes nothing."""
    content, filename = await read_upload(file)
    try:
        analysis = await run_in_threadpool(
            lambda: analyze_workbook(read_workbook(content, filename))
        )
    except SpreadsheetError as error:
        raise spreadsheet_error(error) from error
    stored = saved_mapping(db, context, analysis.fingerprint)
    if stored is not None:
        try:
            analysis.saved_mapping = SpreadsheetMapping.model_validate(stored.mapping)
        except ValidationError:
            analysis.saved_mapping = None
    analysis.default_currency = household_currency(db, context)
    return analysis


@router.post("/preview", response_model=SpreadsheetPreview)
async def preview_spreadsheet(
    file: UploadFile = File(...),
    mapping: str = Form(...),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> SpreadsheetPreview:
    """What the import would do with this mapping; writes nothing."""
    content, filename = await read_upload(file)
    confirmed = parse_mapping(mapping)
    try:
        plan = plan_from_upload(content, filename, confirmed, db, context)
    except SpreadsheetError as error:
        raise spreadsheet_error(error) from error
    for data, _ in plan.wines:
        data["id"] = uuid.uuid4()
    wine_keys = existing_wine_keys(db, context)
    duplicates = [data["name"] for data, _ in plan.wines if wine_duplicate_key(data) in wine_keys]
    index = planned_wine_index(db, context, plan)
    wishlist = [
        *plan.wishlist,
        *wishlist_from_tastings(plan, index, context, household_currency(db, context)),
    ]
    list_id = default_wishlist_list(db, context, create=False)
    wishlist_keys = existing_wishlist_keys(db, context) if list_id else {}
    wishlist_duplicates = sum(
        1
        for item in wishlist
        if wishlist_duplicate_key({**item, "wishlist_list_id": list_id}) in wishlist_keys
    )
    wines = [data for data, _ in plan.wines]
    return SpreadsheetPreview(
        tables=plan.tables,
        names=plan.names,
        unresolved_names=sum(1 for name in plan.names if name.rule == "unresolved"),
        wines_total=len(wines),
        wine_new=len(wines) - len(duplicates),
        wine_duplicates=len(duplicates),
        sample_wine_duplicates=duplicates[:5],
        bottles_total=sum(int(data["quantity"]) for data in wines),
        wishlist_total=len(wishlist),
        wishlist_new=len(wishlist) - wishlist_duplicates,
        wishlist_duplicates=wishlist_duplicates,
        tastings_total=len(plan.tastings),
        tastings_linked=sum(
            1
            for tasting in plan.tastings
            if index.get(tasting.name, tasting.producer, tasting.vintage)
        ),
        warnings=plan.warnings[:200],
        ai_free_names_left=ai_free_names_left(context.household),
        movements_total=plan.movements_total,
        movements_linked=sum(len(wine_stock.steps) for wine_stock in plan.stock),
        movements_drunk=len(plan.movement_tastings),
        movements_unmatched=plan.movements_unmatched,
        balance_questions=sorted(plan.balance_questions),
        balance_example=plan.balance_example,
        **cellartracker_free_tier_capacity(db, context, wines),
    )


def free_tier_selection(
    db: Session, context: CurrentContext, plan: ImportPlan
) -> tuple[list[tuple[dict[str, Any], dict[tuple[str, str], int]]], int]:
    """On the free tier, the wines that fit the label limit, in file order."""
    if not is_free_tier(context):
        return plan.wines, 0
    capacity = cellartracker_free_tier_capacity(db, context, [data for data, _ in plan.wines])
    allowed = capacity["free_tier_importable_wines"]
    if allowed is None or allowed >= len(plan.wines):
        return plan.wines, 0
    active = {
        (
            normalize_key_part(wine.producer),
            normalize_key_part(wine.name),
            normalize_key_part(wine.vintage),
        )
        for wine in db.scalars(
            select(Wine).where(Wine.household_id == context.household.id, Wine.quantity > 0)
        )
    }
    free_labels = max(
        int(capacity["free_tier_label_limit"] or 0) - int(capacity["free_tier_active_labels"] or 0),
        0,
    )
    selected = []
    new_labels: set[tuple[str, str, str]] = set()
    for wine in plan.wines:
        data = wine[0]
        key = (
            normalize_key_part(data["producer"]),
            normalize_key_part(data["name"]),
            normalize_key_part(data["vintage"]),
        )
        if data["quantity"] <= 0 or key in active or key in new_labels:
            selected.append(wine)
        elif len(new_labels) < free_labels:
            new_labels.add(key)
            selected.append(wine)
    return selected, len(plan.wines) - len(selected)


def add_tasting(
    db: Session, context: CurrentContext, tasting: PlannedTasting, wine: Wine | None
) -> bool:
    """Write one tasting unless the same one was imported before."""
    data = tasting.data
    if wine is not None:
        exists = db.scalar(
            select(WineTastingEntry.id).where(
                WineTastingEntry.household_id == context.household.id,
                WineTastingEntry.wine_id == wine.id,
                WineTastingEntry.consumed_at == tasting.consumed_at,
                WineTastingEntry.source == "spreadsheet",
                WineTastingEntry.note == data["note"],
            )
        )
        if exists:
            return False
        tasting_id = uuid.uuid4()
        created_at = datetime.now(UTC)
        db.add(
            WineTastingEntry(
                id=tasting_id,
                wine_id=wine.id,
                household_id=context.household.id,
                created_by_user_id=context.user.id,
                consumed_at=tasting.consumed_at,
                created_at=created_at,
                **data,
            )
        )
        history_entry = {
            "id": str(tasting_id),
            "consumed_at": tasting.consumed_at.isoformat(),
            "created_at": created_at.isoformat(),
            **{
                key: (float(value) if key == "score_value" and value is not None else value)
                for key, value in data.items()
            },
        }
        wine.tasting_history = normalize_tasting_history(
            [*(wine.tasting_history or []), history_entry]
        )
        return True
    exists = db.scalar(
        select(ExternalWineTasting.id).where(
            ExternalWineTasting.household_id == context.household.id,
            ExternalWineTasting.name == tasting.name[:200],
            ExternalWineTasting.producer == tasting.producer[:200],
            ExternalWineTasting.vintage == tasting.vintage[:16],
            ExternalWineTasting.consumed_at == tasting.consumed_at,
        )
    )
    if exists:
        return False
    note = data["note"]
    if data["score_value"] is not None:
        # External tastings have no score columns: the original score stays in the note.
        note = "\n".join(
            part for part in (f"{data['score_value']}/{data['score_scale']}", note) if part
        )
    db.add(
        ExternalWineTasting(
            household_id=context.household.id,
            created_by_user_id=context.user.id,
            name=tasting.name[:200],
            producer=tasting.producer[:200],
            vintage=tasting.vintage[:16],
            type=tasting.wine_type,
            consumed_at=tasting.consumed_at,
            note=note,
            rating=data["rating"],
            occasion=data["occasion"],
            pairing=data["pairing"],
            companions=data["companions"],
        )
    )
    return True


@router.post("", response_model=SpreadsheetImportResult)
async def import_spreadsheet(
    file: UploadFile = File(...),
    mapping: str = Form(...),
    mode: str = Query(
        default="skip_duplicates", pattern="^(add_all|skip_duplicates|update_existing)$"
    ),
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> SpreadsheetImportResult:
    """Import the confirmed tables: cellar wines, wishlist items and tastings."""
    content, filename = await read_upload(file)
    confirmed = parse_mapping(mapping)
    try:
        plan = plan_from_upload(content, filename, confirmed, db, context)
    except SpreadsheetError as error:
        raise spreadsheet_error(error) from error
    for data, _ in plan.wines:
        data["id"] = uuid.uuid4()
    wines, over_limit = free_tier_selection(db, context, plan)
    legacy = LegacyImportResult(wines_imported=0, wishlist_imported=0)
    persist_imported_wines(db, context, wines, mode, legacy)
    db.flush()
    result = SpreadsheetImportResult(
        wines_imported=legacy.wines_imported,
        wines_updated=legacy.wines_updated,
        wines_skipped=legacy.wines_skipped,
        wines_over_free_tier=over_limit,
    )
    index = household_wine_index(db, context)
    currency = household_currency(db, context)
    wishlist = [*plan.wishlist, *wishlist_from_tastings(plan, index, context, currency)]
    if wishlist:
        list_id = default_wishlist_list(db, context, create=True)
        wishlist_keys = existing_wishlist_keys(db, context)
        for item in wishlist:
            item["wishlist_list_id"] = list_id
            key = wishlist_duplicate_key(item)
            if key in wishlist_keys and mode != "add_all":
                result.wishlist_skipped += 1
                continue
            created = WishlistItem(**item)
            db.add(created)
            wishlist_keys[key] = created
            result.wishlist_imported += 1
    for tasting in plan.tastings:
        wine = index.get(tasting.name, tasting.producer, tasting.vintage)
        if add_tasting(db, context, tasting, wine if isinstance(wine, Wine) else None):
            result.tastings_imported += 1
    # Registers only write the history of wines this import created (see movements.py).
    created = {
        data["id"]: wine
        for data, _ in wines
        if (wine := db.get(Wine, data["id"])) is not None
        and wine.household_id == context.household.id
    }
    for wine_stock in plan.stock:
        wine = created.get(wine_stock.wine["id"])
        if wine is not None:
            result.movements_imported += write_stock_history(db, context, wine, wine_stock)
    for wine_stock, tasting in plan.movement_tastings:
        wine = created.get(wine_stock.wine["id"])
        if wine is not None and add_tasting(db, context, tasting, wine):
            result.tastings_imported += 1
    remember_mapping(db, context, confirmed)
    db.commit()
    return result


def write_stock_history(
    db: Session, context: CurrentContext, wine: Wine, wine_stock: StockPlan
) -> int:
    """Replay a register into the ledger of a wine the import just created.

    persist_imported_wines already set the final count and the locations; the
    replay starts from the opening stock, so lots and movements end on that same
    count without touching the locations again.
    """
    final_quantity, final_status = wine.quantity, wine.status
    steps = wine_stock.steps
    first = steps[0].occurred_on if steps and steps[0].occurred_on else None
    opened_on = (
        min(day for day in (wine.order_date, first) if day)
        if (wine.order_date or first)
        else datetime.now(UTC).date()
    )
    wine.quantity = 0
    common = {"user_id": context.user.id, "update_storage": False}
    if wine_stock.opening > 0:
        add_inbound_stock(
            db,
            wine,
            movement_type="initial_purchase",
            quantity=wine_stock.opening,
            occurred_on=opened_on,
            unit_cost=None,
            supplier=wine.merchant or "",
            reference="",
            note=IMPORT_NOTE,
            **common,
        )
    for step in steps:
        day = step.occurred_on or opened_on
        if step.direction == "in":
            add_inbound_stock(
                db,
                wine,
                movement_type=step.movement_type,
                quantity=step.quantity,
                occurred_on=day,
                unit_cost=None,
                supplier="",
                reference="",
                note=step.note or IMPORT_NOTE,
                **common,
            )
        else:
            # remove_fifo_stock adds an opening lot to a wine whose ledger it finds
            # empty: the lots written above must be visible to it.
            db.flush()
            remove_fifo_stock(
                db,
                wine,
                movement_type=step.movement_type,
                quantity=step.quantity,
                occurred_on=day,
                note=step.note or IMPORT_NOTE,
                **common,
            )
    last = steps[-1].occurred_on if steps and steps[-1].occurred_on else opened_on
    if wine_stock.adjustment > 0:
        add_inbound_stock(
            db,
            wine,
            movement_type="adjustment_in",
            quantity=wine_stock.adjustment,
            occurred_on=last,
            unit_cost=None,
            supplier="",
            reference="",
            note=ADJUSTMENT_NOTE,
            **common,
        )
    elif wine_stock.adjustment < 0:
        db.flush()
        remove_fifo_stock(
            db,
            wine,
            movement_type="adjustment_out",
            quantity=-wine_stock.adjustment,
            occurred_on=last,
            note=ADJUSTMENT_NOTE,
            **common,
        )
    wine.quantity, wine.status = final_quantity, final_status
    return len(steps)


def ai_free_names_left(household: Household) -> int:
    return max(0, AI_FREE_NAMES - int(household.spreadsheet_ai_names_used or 0))


def lock_household(db: Session, context: CurrentContext) -> Household:
    household = db.scalar(
        select(Household).where(Household.id == context.household.id).with_for_update()
    )
    if household is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")
    return household


def ask_ai_to_split(
    db: Session, context: CurrentContext, labels: list[str], *, granted: bool
) -> tuple[list[SpreadsheetNameSuggestion], Decimal]:
    """One provider call; returns the proposals that pass verification and the charge."""
    from app.api.routes.ai import (
        create_ai_response,
        get_or_create_user_ai_settings,
        record_ai_audit,
    )

    prompt = spreadsheet_name_split_prompt(names=labels)
    response, provider = create_ai_response(
        db,
        context,
        get_or_create_user_ai_settings(db, context),
        model=settings.openai_economy_model,
        system_prompt=prompt.system,
        user_prompt=prompt.user,
        json_schema=NAME_SPLIT_SCHEMA,
        task_type="structured_extraction",
        app_funded=True,
        app_granted=granted,
        max_output_tokens=6000,
        timeout_seconds=60,
    )
    record_ai_audit(
        db,
        context,
        entity_type="spreadsheet_import",
        entity_id=uuid.uuid4(),
        feature=f"{prompt.id}@{prompt.version}",
        model=response.model or settings.openai_economy_model,
        summary=f"Spreadsheet import: {len(labels)} wine labels split for review",
        usage=response.usage,
        provider_source=provider,
    )
    db.commit()
    charged = response.charged_cost_usd if provider == "credits" else Decimal("0")
    try:
        if response.incomplete:
            raise ValueError("Incomplete answer")
        payload = parse_json_response(response.text)
    except (ValueError, HTTPException):
        return [], charged
    suggestions: dict[int, SpreadsheetNameSuggestion] = {}
    for item in payload.get("names") or []:
        if not isinstance(item, dict):
            continue
        index = item.get("index")
        if not isinstance(index, int) or not 0 <= index < len(labels) or index in suggestions:
            continue
        confidence = str(item.get("confidence") or "")
        if confidence not in {"high", "medium"}:
            continue
        split = verified_ai_split(
            labels[index],
            str(item.get("producer") or ""),
            str(item.get("name") or ""),
            str(item.get("vintage") or ""),
        )
        if split:
            suggestions[index] = SpreadsheetNameSuggestion(
                raw=labels[index],
                producer=split.producer,
                name=split.name,
                vintage=split.vintage,
                confidence=confidence,
            )
    return list(suggestions.values()), charged


def split_names_with_ai(
    db: Session, context: CurrentContext, labels: list[str]
) -> SpreadsheetNameSplitResult:
    # Reserve the free names before calling, so two tabs cannot both spend them.
    household = lock_household(db, context)
    free = min(len(labels), ai_free_names_left(household))
    household.spreadsheet_ai_names_used = int(household.spreadsheet_ai_names_used or 0) + free
    db.commit()
    suggestions: list[SpreadsheetNameSuggestion] = []
    charged = Decimal("0")
    if free:
        try:
            suggestions, _ = ask_ai_to_split(db, context, labels[:free], granted=True)
        except Exception:
            db.rollback()
            household = lock_household(db, context)
            household.spreadsheet_ai_names_used = max(
                0, int(household.spreadsheet_ai_names_used or 0) - free
            )
            db.commit()
            raise
    needs_credits = 0
    paid = labels[free:]
    if paid:
        try:
            more, charged = ask_ai_to_split(db, context, paid, granted=False)
            suggestions += more
        except HTTPException as error:
            # Without credits or a personal key the free names still count.
            if error.status_code != status.HTTP_402_PAYMENT_REQUIRED or not free:
                raise
            needs_credits = len(paid)
    db.refresh(context.household)
    return SpreadsheetNameSplitResult(
        suggestions=suggestions,
        unsplit=len(labels) - needs_credits - len(suggestions),
        free_names_used=free,
        ai_free_names_left=ai_free_names_left(context.household),
        needs_credits=needs_credits,
        charged_cost_usd=charged,
    )


@router.post("/names", response_model=SpreadsheetNameSplitResult)
async def split_spreadsheet_names(
    payload: SpreadsheetNameSplitRequest,
    db: Session = Depends(get_db),
    context: CurrentContext = Depends(require_admin_context),
) -> SpreadsheetNameSplitResult:
    """Ask AI to split the names the rules left unresolved; the user reviews the result."""
    labels = list(dict.fromkeys(squeeze(name)[:200] for name in payload.names if squeeze(name)))
    if not labels:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No names to split")
    return await run_in_threadpool(split_names_with_ai, db, context, labels)
