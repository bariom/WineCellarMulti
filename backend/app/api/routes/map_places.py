from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
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

PLACE_CACHE_TTL = timedelta(days=14)
MAX_LATITUDE_SPAN = 0.5
MAX_LONGITUDE_SPAN = 0.7


class MapPlaceResponse(BaseModel):
    name: str
    latitude: float
    longitude: float
    kind: str


def cache_key(south: float, west: float, north: float, east: float) -> str:
    return "v2:" + ":".join(f"{value:.2f}" for value in (south, west, north, east))


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
out center 60;"""
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
    with urlopen(request, timeout=16) as response:  # noqa: S310 - configured HTTPS endpoint
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
    return places[:60]


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
    key = cache_key(south, west, north, east)
    now = datetime.now(UTC)
    cached = db.get(MapPlaceCache, key)
    if cached is not None and cached.expires_at.replace(tzinfo=UTC) > now:
        return [MapPlaceResponse.model_validate(item) for item in json.loads(cached.payload)]
    try:
        places = fetch_places(south, west, north, east)
    except Exception:  # Keep map navigation usable when the community service is unavailable.
        logger.info("OpenStreetMap wine places lookup unavailable", exc_info=True)
        return []
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
