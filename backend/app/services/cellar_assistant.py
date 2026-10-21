"""Read-only tools the cellar assistant can call to answer questions about the cellar.

Every tool reads only the active household, applies the caller's wine visibility,
returns compact rows without database IDs and caps its output, so the model can
look things up but never change data or see another cellar.
"""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext
from app.models import (
    CellarBin,
    CellarLocation,
    ExternalWineTasting,
    Wine,
    WineStockLot,
    WineStorageAllocation,
    WineTastingEntry,
    WishlistItem,
    WishlistList,
)
from app.services.grape_names import clean_grape_name
from app.services.notifications import (
    is_future_delivery_wine,
    is_missed_delivery_wine,
    is_to_collect_wine,
)
from app.services.taste_profiles import compact_taste_context

MAX_ROWS = 25
WINE_TYPES = ["Red", "White", "Rose", "Sparkling", "Sweet", "Fortified"]
IN_CELLAR_STATUSES = {"delivered", "consegnato", "in_cellar", "in cellar", "in cantina"}


def _nullable(kind: str, **extra: Any) -> dict[str, Any]:
    return {"type": [kind, "null"], **extra}


def _object(properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


def _tool(name: str, description: str, properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "function",
        "name": name,
        "description": description,
        "strict": True,
        "parameters": _object(properties),
    }


def assistant_tools() -> list[dict[str, Any]]:
    date_field = _nullable("string", description="ISO date YYYY-MM-DD")
    return [
        _tool(
            "search_wines",
            "Find wines in the cellar. Text matches name, producer, appellation, region, grapes, "
            "tags and notes. Returns bottles, status, location, drinking window and phase, "
            "value, purchase price, personal rating and notes.",
            {
                "text": _nullable("string"),
                "wine_type": _nullable("string", enum=[*WINE_TYPES, None]),
                "region": _nullable("string"),
                "producer": _nullable("string"),
                "grape": _nullable("string"),
                "vintage_from": _nullable("integer"),
                "vintage_to": _nullable("integer"),
                "status": {
                    "type": "string",
                    "enum": ["in_cellar", "ordered", "shipped", "to_collect", "any"],
                },
                "drink_phase": _nullable("string", enum=["young", "ready", "peak", "past", None]),
                "location": _nullable("string"),
                "max_value": _nullable("number", description="Highest value per bottle"),
                "include_finished": {
                    "type": "boolean",
                    "description": "Also wines with no bottles left",
                },
            },
        ),
        _tool(
            "cellar_summary",
            "Bottle counts and value of the cellar, grouped by one dimension.",
            {
                "group_by": {
                    "type": "string",
                    "enum": [
                        "type",
                        "region",
                        "country",
                        "producer",
                        "vintage",
                        "status",
                        "location",
                    ],
                },
                "in_cellar_only": {"type": "boolean"},
            },
        ),
        _tool(
            "drinking_plan",
            "Wines to drink by urgency: at their peak now, ready now, window ending this year, "
            "past their window, or opening within two years.",
            {
                "horizon": {
                    "type": "string",
                    "enum": [
                        "peak_now",
                        "ready_now",
                        "ending_this_year",
                        "past_window",
                        "opening_soon",
                    ],
                }
            },
        ),
        _tool(
            "deliveries",
            "Orders on their way, past due without arriving, or waiting to be collected.",
            {"kind": {"type": "string", "enum": ["upcoming", "missed", "to_collect", "all"]}},
        ),
        _tool(
            "tasting_history",
            "Bottles the user drank: date, wine, rating, occasion, pairing, companions and note. "
            "Text matches wine, producer, occasion, pairing, companions and note.",
            {
                "date_from": date_field,
                "date_to": date_field,
                "text": _nullable("string"),
                "min_rating": _nullable("number", description="Stars from 1 to 6"),
                "max_rating": _nullable("number", description="Stars from 1 to 6"),
                "include_outside": {
                    "type": "boolean",
                    "description": "Also wines drunk outside the cellar",
                },
            },
        ),
        _tool(
            "taste_profile",
            "The user's taste: sensory preferences, favourite and avoided grapes, "
            "producers and origins.",
            {},
        ),
        _tool(
            "wishlist",
            "Items in the household wishlists with target and offer price.",
            {"list_name": _nullable("string"), "text": _nullable("string")},
        ),
        _tool(
            "purchases",
            "Bottles bought over a period from the recorded purchase lots: "
            "quantity, cost, supplier.",
            {
                "date_from": date_field,
                "date_to": date_field,
                "text": _nullable("string", description="Matches wine, producer or supplier"),
                "group_by": {
                    "type": "string",
                    "enum": ["none", "supplier", "type", "region", "month"],
                },
            },
        ),
    ]


def _money(value: Decimal | float | int | None) -> float | None:
    return None if value is None else round(float(value), 2)


def _matches(text: str | None, *fields: object) -> bool:
    if not text:
        return True
    needle = text.casefold().strip()
    return any(needle in str(field or "").casefold() for field in fields)


def _in_cellar(wine: Wine) -> bool:
    return (wine.status or "").strip().lower() in IN_CELLAR_STATUSES


def _status_key(wine: Wine) -> str:
    status = (wine.status or "").strip().lower()
    if status in IN_CELLAR_STATUSES:
        return "in_cellar"
    if is_to_collect_wine(wine):
        return "to_collect"
    if "ship" in status or "spedit" in status:
        return "shipped"
    if "order" in status or "ordinat" in status:
        return "ordered"
    return status or "unknown"


def drink_phase(wine: Wine, year: int) -> str:
    start, end = wine.drink_from, wine.drink_to
    # Without peak years a drinkable wine is only "ready", never assumed at its peak.
    peak_from, peak_to = wine.drink_peak_from, wine.drink_peak_to
    if not start or not end:
        return "unknown"
    if year < start:
        return "young"
    if year > end:
        return "past"
    if peak_from and peak_to and peak_from <= year <= peak_to:
        return "peak"
    return "ready"


class CellarAssistantTools:
    """Tool executors bound to one household, user and visibility rule."""

    def __init__(
        self,
        db: Session,
        context: CurrentContext,
        *,
        can_see: Callable[[Wine], bool],
        today: date,
    ) -> None:
        self.db = db
        self.context = context
        self.can_see = can_see
        self.today = today
        self._wines: list[Wine] | None = None
        self._locations: dict[Any, str] | None = None

    # -- shared data -------------------------------------------------------
    def wines(self) -> list[Wine]:
        if self._wines is None:
            self._wines = [
                wine
                for wine in self.db.scalars(
                    select(Wine).where(Wine.household_id == self.context.household.id)
                )
                if self.can_see(wine)
            ]
        return self._wines

    def locations(self) -> dict[Any, str]:
        """Readable "location / bin" text per wine id."""
        if self._locations is None:
            names = {
                location.id: location.name
                for location in self.db.scalars(
                    select(CellarLocation).where(
                        CellarLocation.household_id == self.context.household.id
                    )
                )
            }
            bins = {
                item.id: item.name
                for item in self.db.scalars(
                    select(CellarBin).where(CellarBin.location_id.in_(list(names) or [None]))
                )
            }
            by_wine: dict[Any, list[str]] = defaultdict(list)
            for allocation in self.db.scalars(
                select(WineStorageAllocation).where(
                    WineStorageAllocation.household_id == self.context.household.id
                )
            ):
                location_name = (
                    names.get(allocation.location_id, "") if allocation.location_id else ""
                )
                bin_name = bins.get(allocation.bin_id, "") if allocation.bin_id else ""
                place = " / ".join(part for part in [location_name, bin_name] if part)
                if place:
                    by_wine[allocation.wine_id].append(f"{place} ({allocation.quantity})")
            self._locations = {wine_id: ", ".join(places) for wine_id, places in by_wine.items()}
        return self._locations

    def wine_row(self, wine: Wine) -> dict[str, Any]:
        value = wine.current_value if wine.current_value is not None else None
        row: dict[str, Any] = {
            "name": wine.name,
            "producer": wine.producer,
            "vintage": wine.vintage,
            "type": wine.type,
            "region": wine.region,
            "appellation": wine.appellation,
            "grapes": [
                clean_grape_name(item.get("name", ""))
                for item in (wine.grapes or [])
                if isinstance(item, dict) and clean_grape_name(item.get("name", ""))
            ],
            "bottles": wine.quantity,
            "status": _status_key(wine),
            "location": self.locations().get(wine.id, ""),
            "drinking_window": f"{wine.drink_from or '?'}-{wine.drink_to or '?'}",
            "peak": f"{wine.drink_peak_from or '?'}-{wine.drink_peak_to or '?'}",
            "phase": drink_phase(wine, self.today.year),
            "market_value_per_bottle": _money(value),
            "purchase_price_per_bottle": _money(wine.price) if wine.price else None,
            "currency": wine.currency,
            "personal_rating": wine.rating or None,
            "merchant": wine.merchant,
            "notes": (wine.notes or "")[:300],
        }
        if wine.owner_share_pct is not None and Decimal(wine.owner_share_pct) < 100:
            row["your_share_pct"] = float(wine.owner_share_pct)
        return {key: value for key, value in row.items() if value not in ("", None, [], "?-?")}

    # -- tools -------------------------------------------------------------
    def search_wines(self, args: dict[str, Any]) -> dict[str, Any]:
        status = args.get("status") or "in_cellar"
        rows = []
        for wine in self.wines():
            if not args.get("include_finished") and wine.quantity <= 0:
                continue
            if status != "any" and _status_key(wine) != status:
                continue
            if (
                args.get("wine_type")
                and (wine.type or "").lower() != str(args["wine_type"]).lower()
            ):
                continue
            grapes = " ".join(
                str(item.get("name", "")) for item in (wine.grapes or []) if isinstance(item, dict)
            )
            if not _matches(
                args.get("text"),
                wine.name,
                wine.producer,
                wine.appellation,
                wine.region,
                grapes,
                " ".join(wine.tags or []),
                wine.notes,
            ):
                continue
            if not _matches(
                args.get("region"), wine.region, wine.appellation, wine.vineyard_country
            ):
                continue
            if not _matches(args.get("producer"), wine.producer):
                continue
            if not _matches(args.get("grape"), grapes):
                continue
            vintage = int(wine.vintage) if (wine.vintage or "").isdigit() else None
            if args.get("vintage_from") and (vintage is None or vintage < args["vintage_from"]):
                continue
            if args.get("vintage_to") and (vintage is None or vintage > args["vintage_to"]):
                continue
            if (
                args.get("drink_phase")
                and drink_phase(wine, self.today.year) != args["drink_phase"]
            ):
                continue
            if args.get("location") and not _matches(
                args["location"], self.locations().get(wine.id, "")
            ):
                continue
            unit = wine.current_value if wine.current_value is not None else wine.price
            if args.get("max_value") is not None and (
                unit is None or float(unit) > float(args["max_value"])
            ):
                continue
            rows.append(wine)
        rows.sort(key=lambda wine: (wine.name.casefold(), wine.vintage))
        return {
            "matches": len(rows),
            "wines": [self.wine_row(wine) for wine in rows[:MAX_ROWS]],
            "truncated": len(rows) > MAX_ROWS,
        }

    def cellar_summary(self, args: dict[str, Any]) -> dict[str, Any]:
        group_by = args.get("group_by") or "type"
        groups: dict[str, dict[str, float]] = defaultdict(
            lambda: {"bottles": 0, "wines": 0, "value": 0.0}
        )
        for wine in self.wines():
            if wine.quantity <= 0 or (args.get("in_cellar_only") and not _in_cellar(wine)):
                continue
            key = {
                "type": wine.type,
                "region": wine.region,
                "country": wine.vineyard_country,
                "producer": wine.producer,
                "vintage": wine.vintage,
                "status": _status_key(wine),
                "location": self.locations().get(wine.id, ""),
            }.get(group_by) or "—"
            unit = wine.current_value if wine.current_value is not None else wine.price
            groups[key]["bottles"] += wine.quantity
            groups[key]["wines"] += 1
            groups[key]["value"] += float(unit or 0) * wine.quantity
        ordered = sorted(groups.items(), key=lambda item: item[1]["bottles"], reverse=True)
        return {
            "group_by": group_by,
            "total_bottles": sum(group["bottles"] for group in groups.values()),
            "total_value": round(sum(group["value"] for group in groups.values()), 2),
            "groups": [
                {
                    "group": key,
                    "bottles": int(group["bottles"]),
                    "wines": int(group["wines"]),
                    "value": round(group["value"], 2),
                }
                for key, group in ordered[:MAX_ROWS]
            ],
        }

    def drinking_plan(self, args: dict[str, Any]) -> dict[str, Any]:
        horizon = args.get("horizon") or "ready_now"
        year = self.today.year
        candidates = [wine for wine in self.wines() if wine.quantity > 0 and _in_cellar(wine)]
        selected = {
            "peak_now": [wine for wine in candidates if drink_phase(wine, year) == "peak"],
            "ready_now": [
                wine for wine in candidates if drink_phase(wine, year) in {"ready", "peak"}
            ],
            "ending_this_year": [wine for wine in candidates if wine.drink_to == year],
            "past_window": [wine for wine in candidates if drink_phase(wine, year) == "past"],
            "opening_soon": [
                wine
                for wine in candidates
                if wine.drink_from and year < wine.drink_from <= year + 2
            ],
        }.get(horizon, [])
        selected.sort(key=lambda wine: (wine.drink_to or 9999, wine.name.casefold()))
        return {
            "horizon": horizon,
            "matches": len(selected),
            "wines": [self.wine_row(wine) for wine in selected[:MAX_ROWS]],
        }

    def deliveries(self, args: dict[str, Any]) -> dict[str, Any]:
        kind = args.get("kind") or "all"
        result: dict[str, Any] = {}
        wines = [wine for wine in self.wines() if wine.quantity > 0]
        if kind in {"upcoming", "all"}:
            result["upcoming"] = [
                {
                    **self.wine_row(wine),
                    "expected_delivery": wine.expected_delivery.isoformat()
                    if wine.expected_delivery
                    else None,
                }
                for wine in sorted(
                    (wine for wine in wines if is_future_delivery_wine(wine, self.today)),
                    key=lambda wine: wine.expected_delivery or date.max,
                )[:MAX_ROWS]
            ]
        if kind in {"missed", "all"}:
            result["missed"] = [
                {
                    **self.wine_row(wine),
                    "expected_delivery": wine.expected_delivery.isoformat()
                    if wine.expected_delivery
                    else None,
                }
                for wine in wines
                if is_missed_delivery_wine(wine, self.today)
            ][:MAX_ROWS]
        if kind in {"to_collect", "all"}:
            result["to_collect"] = [
                self.wine_row(wine) for wine in wines if is_to_collect_wine(wine)
            ][:MAX_ROWS]
        return result

    def tasting_history(self, args: dict[str, Any]) -> dict[str, Any]:
        date_from = _parse_date(args.get("date_from"))
        date_to = _parse_date(args.get("date_to"))
        visible = {wine.id: wine for wine in self.wines()}
        rows: list[dict[str, Any]] = []
        for tasting in self.db.scalars(
            select(WineTastingEntry).where(
                WineTastingEntry.household_id == self.context.household.id
            )
        ):
            wine = visible.get(tasting.wine_id)
            if wine is None:
                continue
            rows.append(
                {
                    "date": tasting.consumed_at,
                    "where": "cellar",
                    "wine": wine.name,
                    "producer": wine.producer,
                    "vintage": wine.vintage,
                    "rating": tasting.rating or None,
                    "score": f"{tasting.score_value}/{tasting.score_scale}"
                    if tasting.score_value is not None and tasting.score_scale
                    else None,
                    "enjoyment": tasting.enjoyment or None,
                    "occasion": tasting.occasion,
                    "pairing": tasting.pairing,
                    "companions": tasting.companions,
                    "note": (tasting.note or "")[:300],
                }
            )
        if args.get("include_outside", True):
            for tasting in self.db.scalars(
                select(ExternalWineTasting).where(
                    ExternalWineTasting.household_id == self.context.household.id,
                    ExternalWineTasting.created_by_user_id == self.context.user.id,
                )
            ):
                rows.append(
                    {
                        "date": tasting.consumed_at,
                        "where": "outside",
                        "wine": tasting.name,
                        "producer": tasting.producer,
                        "vintage": tasting.vintage,
                        "rating": tasting.rating or None,
                        "enjoyment": tasting.enjoyment or None,
                        "occasion": tasting.occasion,
                        "pairing": tasting.pairing,
                        "companions": tasting.companions,
                        "note": (tasting.note or "")[:300],
                    }
                )
        selected = [
            row
            for row in rows
            if (date_from is None or row["date"] >= date_from)
            and (date_to is None or row["date"] <= date_to)
            and (
                args.get("min_rating") is None or (row["rating"] or 0) >= float(args["min_rating"])
            )
            and (
                args.get("max_rating") is None
                or (row["rating"] is not None and row["rating"] <= float(args["max_rating"]))
            )
            and _matches(
                args.get("text"),
                row["wine"],
                row["producer"],
                row["occasion"],
                row["pairing"],
                row["companions"],
                row["note"],
            )
        ]
        selected.sort(key=lambda row: row["date"], reverse=True)
        return {
            "matches": len(selected),
            "tastings": [
                {
                    key: (value.isoformat() if isinstance(value, date) else value)
                    for key, value in row.items()
                    if value not in ("", None)
                }
                for row in selected[:MAX_ROWS]
            ],
        }

    def taste_profile(self, args: dict[str, Any]) -> dict[str, Any]:
        return compact_taste_context(
            self.db, household_id=self.context.household.id, user_id=self.context.user.id
        ) or {"status": "not enough ratings yet"}

    def wishlist(self, args: dict[str, Any]) -> dict[str, Any]:
        lists = {
            item.id: item.name
            for item in self.db.scalars(
                select(WishlistList).where(WishlistList.household_id == self.context.household.id)
            )
        }
        items = [
            item
            for item in self.db.scalars(
                select(WishlistItem).where(WishlistItem.household_id == self.context.household.id)
            )
            if _matches(args.get("list_name"), lists.get(item.wishlist_list_id, ""))
            and _matches(args.get("text"), item.name, item.producer, item.region, item.appellation)
        ]
        return {
            "lists": sorted(set(lists.values())),
            "matches": len(items),
            "items": [
                {
                    key: value
                    for key, value in {
                        "list": lists.get(item.wishlist_list_id, ""),
                        "name": item.name,
                        "producer": item.producer,
                        "vintage": item.vintage,
                        "region": item.region,
                        "target_price": _money(item.target_price) if item.target_price else None,
                        "offer_price": _money(item.offer_price),
                    }.items()
                    if value not in ("", None)
                }
                for item in items[:MAX_ROWS]
            ],
        }

    def purchases(self, args: dict[str, Any]) -> dict[str, Any]:
        date_from = _parse_date(args.get("date_from"))
        date_to = _parse_date(args.get("date_to"))
        visible = {wine.id: wine for wine in self.wines()}
        rows = []
        for lot in self.db.scalars(
            select(WineStockLot).where(WineStockLot.household_id == self.context.household.id)
        ):
            wine = visible.get(lot.wine_id)
            if wine is None or lot.quantity_received <= 0:
                continue
            if (date_from and lot.acquired_on < date_from) or (
                date_to and lot.acquired_on > date_to
            ):
                continue
            if not _matches(args.get("text"), wine.name, wine.producer, lot.supplier):
                continue
            rows.append((lot, wine))
        group_by = args.get("group_by") or "none"
        totals: dict[str, dict[str, float]] = defaultdict(lambda: {"bottles": 0, "cost": 0.0})
        for lot, wine in rows:
            key = {
                "none": "total",
                "supplier": lot.supplier or "—",
                "type": wine.type or "—",
                "region": wine.region or "—",
                "month": lot.acquired_on.strftime("%Y-%m"),
            }[group_by]
            totals[key]["bottles"] += lot.quantity_received
            totals[key]["cost"] += float(lot.unit_cost or 0) * lot.quantity_received
        rows.sort(key=lambda item: item[0].acquired_on, reverse=True)
        return {
            "currency_note": "Costs are in each lot's currency, usually CHF.",
            "totals": [
                {"group": key, "bottles": int(value["bottles"]), "cost": round(value["cost"], 2)}
                for key, value in sorted(
                    totals.items(), key=lambda item: item[1]["cost"], reverse=True
                )[:MAX_ROWS]
            ],
            "purchases": [
                {
                    "date": lot.acquired_on.isoformat(),
                    "wine": wine.name,
                    "producer": wine.producer,
                    "vintage": wine.vintage,
                    "bottles": lot.quantity_received,
                    "unit_cost": _money(lot.unit_cost),
                    "currency": lot.currency,
                    "supplier": lot.supplier,
                }
                for lot, wine in rows[:MAX_ROWS]
            ],
        }

    def invoke(self, name: str, raw_arguments: str) -> dict[str, Any]:
        handlers: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
            "search_wines": self.search_wines,
            "cellar_summary": self.cellar_summary,
            "drinking_plan": self.drinking_plan,
            "deliveries": self.deliveries,
            "tasting_history": self.tasting_history,
            "taste_profile": self.taste_profile,
            "wishlist": self.wishlist,
            "purchases": self.purchases,
        }
        handler = handlers.get(name)
        if handler is None:
            return {"error": f"Unknown tool {name}"}
        try:
            arguments = json.loads(raw_arguments or "{}")
        except json.JSONDecodeError:
            return {"error": "Arguments were not valid JSON"}
        if not isinstance(arguments, dict):
            return {"error": "Arguments must be an object"}
        return handler(arguments)


def _parse_date(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value)) if value else None
    except ValueError:
        return None
