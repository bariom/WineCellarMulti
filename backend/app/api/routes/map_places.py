from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from math import ceil, floor
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import CurrentContext, get_current_context
from app.core.config import settings
from app.db.session import get_db
from app.models import MapPlaceCache

router = APIRouter(prefix="/map")
logger = logging.getLogger(__name__)

PLACE_CACHE_TTL = timedelta(days=30)
MAX_LATITUDE_SPAN = 0.5
MAX_LONGITUDE_SPAN = 0.7
CACHE_GRID_SCALE = 100
NOMINATIM_COMPLEMENT_THRESHOLD = 12


class MapPlaceResponse(BaseModel):
    name: str
    latitude: float
    longitude: float
    kind: str


def cache_key(south: float, west: float, north: float, east: float) -> str:
    return "v7:" + ":".join(f"{value:.2f}" for value in (south, west, north, east))


def cache_bounds(south: float, west: float, north: float, east: float) -> tuple[float, float, float, float]:
    """Snap a viewport outward to stable 0.01° cells for reusable cache entries."""

    return (
        floor(south * CACHE_GRID_SCALE) / CACHE_GRID_SCALE,
        floor(west * CACHE_GRID_SCALE) / CACHE_GRID_SCALE,
        ceil(north * CACHE_GRID_SCALE) / CACHE_GRID_SCALE,
        ceil(east * CACHE_GRID_SCALE) / CACHE_GRID_SCALE,
    )


def place_kind(tags: dict[str, object]) -> str:
    if tags.get("craft") == "winery" or tags.get("man_made") == "winery":
        return "winery"
    if tags.get("landuse") == "vineyard" or tags.get("crop") == "grape":
        return "vineyard"
    if any(tags.get(key) == "wine" for key in ("produce", "product", "drink")):
        return "producer"
    if tags.get("tourism") == "wine_tasting":
        return "tasting"
    return "wine_shop"


def fetch_places(south: float, west: float, north: float, east: float) -> list[dict[str, object]]:
    bbox = f"{south:.5f},{west:.5f},{north:.5f},{east:.5f}"
    query = f"""[out:json][timeout:12];
(
  nwr[\"craft\"=\"winery\"]({bbox});
  nwr[\"man_made\"=\"winery\"]({bbox});
  nwr[\"tourism\"=\"wine_tasting\"]({bbox});
  nwr[\"shop\"=\"wine\"]({bbox});
  nwr[\"landuse\"=\"vineyard\"][\"name\"]({bbox});
  nwr[\"crop\"=\"grape\"][\"name\"]({bbox});
  nwr[\"produce\"=\"wine\"][\"name\"]({bbox});
  nwr[\"product\"=\"wine\"][\"name\"]({bbox});
  nwr[\"drink\"=\"wine\"][\"name\"]({bbox});
);
out center 120;"""
    contact = settings.legal_contact_email.strip() or "support@vinaris.app"
    request = Request(
        settings.map_places_overpass_url,
        data=urlencode({"data": query}).encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": f"{settings.app_name}/1.0 (+mailto:{contact})",
        },
        method="POST",
    )
    with urlopen(request, timeout=8) as response:  # noqa: S310 - configured HTTPS endpoint
        payload = json.loads(response.read().decode("utf-8"))

    places: list[dict[str, object]] = []
    seen: set[tuple[str, float, float]] = set()
    for element in payload.get("elements", []):
        if not isinstance(element, dict):
            continue
        tags = element.get("tags") if isinstance(element.get("tags"), dict) else {}
        name = str(tags.get("name") or "").strip()
        centre = element.get("center") if isinstance(element.get("center"), dict) else element
        try:
            latitude = float(centre["lat"])
            longitude = float(centre["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if not name or not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            continue
        key = (name.casefold(), round(latitude, 5), round(longitude, 5))
        if key in seen:
            continue
        seen.add(key)
        places.append({"name": name, "latitude": latitude, "longitude": longitude, "kind": place_kind(tags)})
    return places[:80]


def fetch_nominatim_wine_places(south: float, west: float, north: float, east: float) -> list[dict[str, object]]:
    """Complement sparse Overpass results with OSM's search index."""

    query = urlencode(
        {
            "format": "jsonv2",
            "limit": 20,
            "bounded": 1,
            # Nominatim indexes many estates as craft=winery rather than as
            # shops. Overpass already covers wine shops in the same viewport.
            "q": "winery",
            "viewbox": f"{west:.5f},{north:.5f},{east:.5f},{south:.5f}",
        }
    )
    contact = settings.legal_contact_email.strip() or "support@vinaris.app"
    request = Request(
        f"{settings.map_places_nominatim_url}?{query}",
        headers={"User-Agent": f"{settings.app_name}/1.0 (+mailto:{contact})"},
    )
    with urlopen(request, timeout=5) as response:  # noqa: S310 - configured HTTPS endpoint
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        return []

    places: list[dict[str, object]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        category = str(item.get("category") or "")
        item_type = str(item.get("type") or "")
        if not ((category == "shop" and item_type == "wine") or (category == "craft" and item_type == "winery")):
            continue
        name = str(item.get("name") or "").strip()
        try:
            latitude = float(item.get("lat"))
            longitude = float(item.get("lon"))
        except (TypeError, ValueError):
            continue
        if name and -90 <= latitude <= 90 and -180 <= longitude <= 180:
            places.append({
                "name": name,
                "latitude": latitude,
                "longitude": longitude,
                "kind": "winery" if category == "craft" and item_type == "winery" else "wine_shop",
            })
    return places


def merge_places(*place_sets: list[dict[str, object]]) -> list[dict[str, object]]:
    """Keep the richer Overpass point when both sources identify the same place."""

    places: list[dict[str, object]] = []
    seen_names: set[str] = set()
    for place_set in place_sets:
        for place in place_set:
            name = str(place.get("name") or "").strip()
            if not name:
                continue
            normalized_name = name.casefold()
            if normalized_name in seen_names:
                continue
            seen_names.add(normalized_name)
            places.append(place)
            if len(places) >= 80:
                return places
    return places


@router.get("/places", response_model=list[MapPlaceResponse])
def nearby_wine_places(
    south: float = Query(ge=-85, le=85),
    west: float = Query(ge=-180, le=180),
    north: float = Query(ge=-85, le=85),
    east: float = Query(ge=-180, le=180),
    _: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> list[MapPlaceResponse]:
    if north <= south or east <= west or north - south > MAX_LATITUDE_SPAN or east - west > MAX_LONGITUDE_SPAN:
        return []
    cached_south, cached_west, cached_north, cached_east = cache_bounds(south, west, north, east)
    key = cache_key(cached_south, cached_west, cached_north, cached_east)
    now = datetime.now(UTC)
    cached = db.get(MapPlaceCache, key)
    if cached is not None and cached.expires_at.replace(tzinfo=UTC) > now:
        return [MapPlaceResponse.model_validate(item) for item in json.loads(cached.payload)]
    try:
        overpass_places = fetch_places(cached_south, cached_west, cached_north, cached_east)
    except Exception:  # Keep map navigation usable when the community service is unavailable.
        logger.info("OpenStreetMap wine places lookup unavailable", exc_info=True)
        overpass_places = []

    nominatim_places: list[dict[str, object]] = []
    # Overpass is the authoritative spatial query. The search index catches
    # producers whose OSM tags are incomplete, without querying it in dense areas.
    if len(overpass_places) < NOMINATIM_COMPLEMENT_THRESHOLD:
        try:
            nominatim_places = fetch_nominatim_wine_places(cached_south, cached_west, cached_north, cached_east)
        except Exception:
            logger.info("OpenStreetMap wine places complement unavailable", exc_info=True)
    places = merge_places(overpass_places, nominatim_places)
    encoded_places = json.dumps(places, separators=(",", ":"), ensure_ascii=False)
    if cached is None:
        cached = MapPlaceCache(query_key=key, payload=encoded_places, created_at=now, expires_at=now + PLACE_CACHE_TTL)
        db.add(cached)
    else:
        cached.payload = encoded_places
        cached.created_at = now
        cached.expires_at = now + PLACE_CACHE_TTL
    db.commit()
    return [MapPlaceResponse.model_validate(place) for place in places]
