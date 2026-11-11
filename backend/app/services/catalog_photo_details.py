"""Second step of the catalog enrichment from photos (docs/CATALOG_PHOTO_ENRICHMENT.md).

After the labels are read and looked up in the catalog, an app administrator can:
- have the base facts of a few wines researched on the web, a few wines per AI call;
- keep a good bottle photo for the shared photo library, checked here without AI;
- save the reviewed wine: a new approved entry or the completion of an existing one,
  the per-vintage facts in the shared facts the cellars reuse, the photo in the library.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from decimal import Decimal
from difflib import SequenceMatcher
from io import BytesIO
from types import SimpleNamespace
from typing import Any, cast

from fastapi import HTTPException, status
from PIL import Image, ImageFilter, ImageStat
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.wine_types import normalize_wine_type
from app.db.session import SessionLocal
from app.models import WineCatalogEntry
from app.prompts.catalog_photo import catalog_photo_details_prompt
from app.schemas.catalog_photo import (
    CatalogPhotoBottle,
    CatalogPhotoCheck,
    CatalogPhotoDetails,
    CatalogPhotoIssue,
    CatalogPhotoSave,
    CatalogPhotoSaveResult,
    CatalogPhotoSource,
)
from app.services.catalog_photo_scan import (
    COMPLETABLE_FIELDS,
    CatalogPhotoJob,
    _worker_context,
    submit,
)
from app.services.grape_names import clean_grape_name
from app.services.shared_wine_data import (
    get_shared_fact,
    normalize_identity_part,
    publish_shared_fact,
)

logger = logging.getLogger(__name__)

WINES_PER_CALL = 5
MAX_PARALLEL_CALLS = 2
DETAILS_TIMEOUT_SECONDS = 180
# Bottle photo thresholds, in pixels of the upright original photo.
# Lenient: these sizes come from the AI's estimate of the label and bottle, which varies
# between readings; the cutout checks the real outline again.
MIN_BOTTLE_PIXELS = 320
MIN_LABEL_PIXELS = 56
EDGE_PIXELS = 3
# Variance of the Laplacian of the label scaled to SHARPNESS_WIDTH pixels.
SHARPNESS_WIDTH = 256
MIN_SHARPNESS = 40.0
DARK_MEAN = 45.0
BLOWN_SHARE = 0.6
# Room around the bottle in its 2:3 frame: the bottle's top and base are estimated by the
# AI reading the label, and the base is often lower than it says.
FRAME_TOP_MARGIN = 0.08
FRAME_BOTTOM_MARGIN = 0.12
MAX_FRAME_HEIGHT = 1800


DETAILS_SCHEMA = {
    "name": "catalog_photo_details",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "wines": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "index": {"type": "integer"},
                        "found": {"type": "boolean"},
                        "producer": {"type": "string"},
                        "name": {"type": "string"},
                        "appellation": {"type": "string"},
                        "region": {"type": "string"},
                        "country": {"type": "string"},
                        "wine_type": {"type": "string"},
                        "grapes": {"type": "array", "items": {"type": "string"}},
                        "description": {"type": "string"},
                        "drink_from": {"type": ["integer", "null"]},
                        "drink_peak_from": {"type": ["integer", "null"]},
                        "drink_peak_to": {"type": ["integer", "null"]},
                        "drink_to": {"type": ["integer", "null"]},
                        "drink_notes": {"type": "string"},
                        "source_urls": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": [
                        "index",
                        "found",
                        "producer",
                        "name",
                        "appellation",
                        "region",
                        "country",
                        "wine_type",
                        "grapes",
                        "description",
                        "drink_from",
                        "drink_peak_from",
                        "drink_peak_to",
                        "drink_to",
                        "drink_notes",
                        "source_urls",
                    ],
                },
            }
        },
        "required": ["wines"],
    },
}


def _text(value: object, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _same_wine_part(read: str, found: str) -> bool:
    """A researched producer or name must be the one on the label (when both are known)."""
    left, right = normalize_identity_part(read), normalize_identity_part(found)
    if not left or not right:
        return True
    return left in right or right in left or SequenceMatcher(None, left, right).ratio() >= 0.6


def _year(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def drink_window(vintage: str, values: Iterable[object]) -> list[int] | None:
    """Four ordered years within a plausible life of that vintage, else None."""
    if not (vintage.isdigit() and len(vintage) == 4):
        return None
    years = [_year(value) for value in values]
    if any(year is None for year in years) or len(years) != 4:
        return None
    start = int(vintage)
    checked = cast(list[int], years)
    if not start <= checked[0] <= checked[1] <= checked[2] <= checked[3] <= start + 80:
        return None
    return checked


def research_wines(bottle: CatalogPhotoBottle) -> dict[str, str]:
    """What the research starts from: the label, completed by the catalog entry."""
    entry = bottle.entry
    return {
        "producer": bottle.producer or (entry.producer if entry else ""),
        "name": bottle.name,
        "vintage": bottle.vintage,
        "appellation": bottle.appellation or (entry.appellation if entry else ""),
        "region": bottle.region or (entry.region if entry else ""),
        "country": bottle.country or (entry.country if entry else ""),
        "wine_type": bottle.wine_type or (entry.type if entry else ""),
    }


def details_from_answer(
    parsed: dict[str, Any],
    bottles: list[CatalogPhotoBottle],
    web_sources: Iterable[dict[str, str]],
) -> dict[int, CatalogPhotoDetails]:
    """Keep only what the label and the pages actually returned by the search support.

    A wine whose answer cites no page of the search, or describes another producer
    or wine than the label, is reported as not found.
    """
    from app.api.routes.operations import canonical_source_url

    verified: dict[str, dict[str, str]] = {}
    for source in web_sources:
        key = canonical_source_url(source.get("url"))
        if key and key not in verified:
            verified[key] = source
    details: dict[int, CatalogPhotoDetails] = {}
    raw = parsed.get("wines")
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        index = item.get("index")
        if isinstance(index, bool) or not isinstance(index, int) or not 1 <= index <= len(bottles):
            continue
        position = index - 1
        if position in details:
            continue
        bottle = bottles[position]
        sources: list[CatalogPhotoSource] = []
        seen: set[str] = set()
        urls = item.get("source_urls")
        for url in urls if isinstance(urls, list) else []:
            key = canonical_source_url(url)
            if key in verified and key not in seen:
                seen.add(key)
                source = verified[key]
                sources.append(
                    CatalogPhotoSource(
                        url=str(source.get("url") or "")[:500],
                        title=_text(source.get("title"), 200),
                    )
                )
        producer = _text(item.get("producer"), 180)
        name = _text(item.get("name"), 180)
        wine = research_wines(bottle)
        coherent = _same_wine_part(wine["producer"], producer) and _same_wine_part(
            bottle.name, name
        )
        if item.get("found") is not True or not sources or not coherent:
            details[position] = CatalogPhotoDetails(found=False)
            continue
        grapes: list[str] = []
        raw_grapes = item.get("grapes")
        for grape in raw_grapes if isinstance(raw_grapes, list) else []:
            text = _text(grape, 60)
            if text and text.casefold() not in {value.casefold() for value in grapes}:
                grapes.append(text)
        window = drink_window(
            bottle.vintage,
            (
                item.get(key)
                for key in ("drink_from", "drink_peak_from", "drink_peak_to", "drink_to")
            ),
        )
        details[position] = CatalogPhotoDetails(
            found=True,
            name=name or bottle.name,
            producer=producer or wine["producer"],
            appellation=_text(item.get("appellation"), 120),
            region=_text(item.get("region"), 120),
            country=_text(item.get("country"), 120),
            wine_type=normalize_wine_type(_text(item.get("wine_type"), 40)),
            grapes=grapes[:8],
            description=_text(item.get("description"), 1200),
            drink_from=window[0] if window else None,
            drink_peak_from=window[1] if window else None,
            drink_peak_to=window[2] if window else None,
            drink_to=window[3] if window else None,
            drink_notes=_text(item.get("drink_notes"), 400) if window else "",
            sources=sources[:6],
        )
    return details


def research_group(
    job: CatalogPhotoJob, bottles: list[CatalogPhotoBottle], *, locale: str
) -> tuple[dict[int, CatalogPhotoDetails], Decimal]:
    """Research up to WINES_PER_CALL wines in one call, on the application's key."""
    from app.api.routes.ai import (
        create_ai_response,
        effective_response_model,
        get_or_create_user_ai_settings,
        record_ai_audit,
        web_search_source_entries,
        web_search_tool_cost_usd,
    )
    from app.services.openai_client import parse_json_response

    wines = [{"index": index, **research_wines(bottle)} for index, bottle in enumerate(bottles, 1)]
    prompt = catalog_photo_details_prompt(locale=locale, wines=wines)
    with SessionLocal() as db:
        context = _worker_context(db, job)
        user_settings = get_or_create_user_ai_settings(db, context)
        model = settings.openai_economy_model
        response, provider_source = create_ai_response(
            db,
            context,
            user_settings,
            model=model,
            task_type="research",
            complexity="low",
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            json_schema=DETAILS_SCHEMA,
            web_search=True,
            web_search_use_default_location=False,
            web_search_context_size="low",
            reasoning_effort="low",
            max_output_tokens=6000,
            max_tool_calls=min(len(bottles), 4),
            timeout_seconds=DETAILS_TIMEOUT_SECONDS,
            app_granted=True,
        )
        try:
            parsed = parse_json_response(response.text)
        except HTTPException:
            parsed = {}
        details = details_from_answer(parsed, bottles, response.web_sources)
        search_cost = web_search_tool_cost_usd(response.web_search_calls)
        found = sum(1 for item in details.values() if item.found)
        record_ai_audit(
            db,
            context,
            entity_type="catalog",
            entity_id=context.household.id,
            feature="catalog_photo_details",
            model=effective_response_model(response, model),
            reasoning_effort=response.reasoning_effort or "",
            summary=f"Catalog photo research: {found} of {len(bottles)} wines found.",
            sources=web_search_source_entries(response.web_sources),
            usage=response.usage,
            provider_source=provider_source,
            extra_cost_usd=search_cost,
        )
        db.commit()
        return details, response.charged_cost_usd + search_cost


def start_details(job: CatalogPhotoJob, positions: list[int], *, locale: str) -> None:
    if job.status == "running" or job.result is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The photo analysis is still running")
    count = len(job.result.bottles)
    if len(set(positions)) != len(positions) or any(not 0 <= item < count for item in positions):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown bottle")
    job.status = "running"
    job.stage = "researching"
    job.error = ""
    job.sections_total = math.ceil(len(positions) / WINES_PER_CALL)
    job.sections_done = 0
    job.phase_started_at = datetime.now(UTC)
    submit(run_details, job, positions, locale)


def run_details(job: CatalogPhotoJob, positions: list[int], locale: str) -> None:
    result = job.result
    assert result is not None
    groups = [
        positions[start : start + WINES_PER_CALL]
        for start in range(0, len(positions), WINES_PER_CALL)
    ]
    failures = 0
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_CALLS) as executor:
        futures = {
            executor.submit(
                research_group, job, [result.bottles[item] for item in group], locale=locale
            ): group
            for group in groups
        }
        for future in as_completed(futures):
            group = futures[future]
            try:
                details, cost = future.result()
            except HTTPException as exc:
                failures += 1
                job.error = str(exc.detail)
            except Exception:
                failures += 1
                logger.exception("Catalog photo research failed")
            else:
                result.details_cost_usd += cost
                for offset, item in enumerate(group):
                    result.bottles[item] = result.bottles[item].model_copy(
                        update={"details": details.get(offset, CatalogPhotoDetails(found=False))}
                    )
            job.sections_done += 1
    if failures and not job.error:
        job.error = "The research did not answer for some wines. Try again."
    job.stage = "done"
    job.status = "done"


# Bottle photo -------------------------------------------------------------------------


def _frame(bottle: CatalogPhotoBottle, size: tuple[int, int]) -> tuple[float, float, float, float]:
    """The 2:3 frame (left, top, width, height in pixels) that centers the bottle."""
    width, height = size
    bottle_top, bottle_bottom = bottle.bottle_top * height, bottle.bottle_bottom * height
    frame_height = (bottle_bottom - bottle_top) / (1 - FRAME_TOP_MARGIN - FRAME_BOTTOM_MARGIN)
    frame_width = frame_height * 2 / 3
    center_x = (bottle.x + bottle.width / 2) * width
    return (
        center_x - frame_width / 2,
        bottle_top - frame_height * FRAME_TOP_MARGIN,
        frame_width,
        frame_height,
    )


def _sharpness(label: Image.Image) -> float:
    scaled = label.convert("L").resize(
        (SHARPNESS_WIDTH, max(1, round(label.height * SHARPNESS_WIDTH / label.width))),
        Image.Resampling.BILINEAR,
    )
    laplacian = scaled.filter(
        ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1, offset=128)
    )
    return float(ImageStat.Stat(laplacian).var[0])


def check_bottle_photo(image: Image.Image, bottle: CatalogPhotoBottle) -> CatalogPhotoCheck:
    """Whether this bottle, cut from the upright photo, is good enough for the library."""
    issue: CatalogPhotoIssue = ""
    width, height = image.size
    label_box = (
        round(bottle.x * width),
        round(bottle.y * height),
        round((bottle.x + bottle.width) * width),
        round((bottle.y + bottle.height) * height),
    )
    # The admin confirms the wine before saving: only a doubtful reading blocks the photo.
    if bottle.confidence == "low":
        issue = "uncertain"
    elif (
        # The reading's own "whole bottle" verdict is not used: on a shelf the AI calls
        # every bottle hidden (neighbours, the shelf's lip over the base). A bottle with
        # no outline or reaching the photo's edge is cut; the cutout checks the rest.
        bottle.bottle_bottom <= bottle.bottle_top
        or bottle.bottle_top * height < EDGE_PIXELS
        or bottle.bottle_bottom * height > height - EDGE_PIXELS
        or label_box[0] < EDGE_PIXELS
        or label_box[2] > width - EDGE_PIXELS
    ):
        issue = "cut"
    elif (bottle.bottle_bottom - bottle.bottle_top) * height < MIN_BOTTLE_PIXELS or (
        label_box[2] - label_box[0] < MIN_LABEL_PIXELS
        or label_box[3] - label_box[1] < MIN_LABEL_PIXELS
    ):
        issue = "small"
    else:
        label = image.crop(label_box).convert("L")
        stats = ImageStat.Stat(label)
        histogram = label.histogram()
        pixels = max(1, sum(histogram))
        if stats.mean[0] < DARK_MEAN:
            issue = "dark"
        elif sum(histogram[250:]) / pixels > BLOWN_SHARE:
            issue = "bright"
        elif _sharpness(label) < MIN_SHARPNESS:
            issue = "blurry"
    return CatalogPhotoCheck(ok=not issue, issue=issue)


def check_bottle_photos(
    db: Session, originals: list[bytes], bottles: list[CatalogPhotoBottle]
) -> list[CatalogPhotoBottle]:
    """Add the photo check to each bottle; free, run after the catalog lookup."""
    from app.services.wine_image_recognition import load_upright_rgb_image
    from app.services.wine_photo_library import matching_reference_photos

    images: dict[int, Image.Image | None] = {}
    checked: list[CatalogPhotoBottle] = []
    for bottle in bottles:
        if bottle.image_index not in images:
            try:
                images[bottle.image_index] = load_upright_rgb_image(originals[bottle.image_index])
            except Exception:
                logger.warning("Catalog photo could not be opened for the bottle checks")
                images[bottle.image_index] = None
        image = images[bottle.image_index]
        # The photo check is a bonus: it must never cost the admin the labels read.
        try:
            check = check_bottle_photo(image, bottle) if image is not None else CatalogPhotoCheck()
            if check.ok:
                name = bottle.entry.name if bottle.entry else bottle.name
                producer = bottle.entry.producer if bottle.entry else bottle.producer
                check.has_library_photo = bool(matching_reference_photos(db, name, producer))
        except Exception:
            logger.exception("Catalog photo bottle check failed")
            check = CatalogPhotoCheck()
        checked.append(bottle.model_copy(update={"photo": check}))
    return checked


def bottle_photo_source(original: bytes, bottle: CatalogPhotoBottle) -> tuple[bytes, float, float]:
    """The bottle in a 2:3 frame with room around it, the label's share of its width and
    the label's center as a share of its height."""
    from app.services.wine_image_recognition import load_upright_rgb_image

    image = load_upright_rgb_image(original)
    left, top, frame_width, frame_height = _frame(bottle, image.size)
    box = (round(left), round(top), round(left + frame_width), round(top + frame_height))
    inside = image.crop(
        (max(0, box[0]), max(0, box[1]), min(image.width, box[2]), min(image.height, box[3]))
    )
    fill = tuple(round(value) for value in ImageStat.Stat(inside).mean[:3])
    frame = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), cast(Any, fill))
    frame.paste(inside, (max(0, -box[0]), max(0, -box[1])))
    if frame.height > MAX_FRAME_HEIGHT:
        frame = frame.resize(
            (round(frame.width * MAX_FRAME_HEIGHT / frame.height), MAX_FRAME_HEIGHT),
            Image.Resampling.LANCZOS,
        )
    output = BytesIO()
    frame.save(output, format="JPEG", quality=92)
    label_y = ((bottle.y + bottle.height / 2) * image.height - top) / max(frame_height, 1)
    return (
        output.getvalue(),
        min(1.0, bottle.width * image.width / max(frame_width, 1)),
        min(0.95, max(0.05, label_y)),
    )


def bottle_photo_files(detail: bytes) -> dict[str, bytes]:
    """The library's two PNG sizes from the processed 480x720 cutout."""
    from app.api.routes.wines import PHOTO_SIZES, validate_processed_photo

    thumbnail_size = PHOTO_SIZES["thumbnail"][:2]
    with Image.open(BytesIO(detail)) as source:
        thumbnail = source.convert("RGBA").resize(thumbnail_size, Image.Resampling.LANCZOS)
    output = BytesIO()
    thumbnail.save(output, format="PNG", optimize=True)
    files = {"thumbnail": output.getvalue(), "detail": detail}
    for size, content in files.items():
        validate_processed_photo(content, size)
    return files


def bottle_cutout(job: CatalogPhotoJob, position: int) -> bytes:
    """The bottle cut out of the photo as a 480x720 PNG, computed once per job.

    Shown to the admin before saving; the same bytes are then stored in the library.
    """
    from app.services.bottle_photo_ai import (
        BottlePhotoAiError,
        BottlePhotoAiUnavailable,
        process_bottle_photo,
    )

    if job.status == "running" or job.result is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The photo analysis is still running")
    if not 0 <= position < len(job.result.bottles):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bottle not found")
    cached = job.cutouts.get(position)
    if cached is not None:
        return cached
    bottle = job.result.bottles[position]
    if not bottle.photo.ok:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The photo is not good enough")
    if not settings.wine_photo_ai_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "AI bottle photo processing is disabled"
        )
    try:
        source, label_share, label_y = bottle_photo_source(
            job.originals[bottle.image_index], bottle
        )
        detail = process_bottle_photo(
            source,
            settings.wine_photo_ai_model,
            settings.wine_photo_ai_timeout_seconds,
            settings.wine_photo_ai_worker_idle_seconds,
            catalog_label_share=label_share,
            catalog_label_y=label_y,
        )
    except BottlePhotoAiUnavailable as exc:
        logger.exception("Catalog photo cutout unavailable")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except (BottlePhotoAiError, OSError, ValueError) as exc:
        logger.warning("Catalog photo cutout failed: %s", type(exc).__name__)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The bottle could not be cut out"
        ) from exc
    job.cutouts[position] = detail
    return detail


def save_bottle_photo(
    db: Session, entry: WineCatalogEntry, job: CatalogPhotoJob, position: int
) -> bool:
    from app.services.wine_photo_library import store_library_photo

    try:
        detail = bottle_cutout(job, position)
        store_library_photo(db, entry.name, entry.producer, bottle_photo_files(detail))
    except (HTTPException, OSError, ValueError) as exc:
        logger.warning("Catalog photo not stored: %s", type(exc).__name__)
        return False
    return True


# Saving -------------------------------------------------------------------------------


def _vintage_wine(entry: WineCatalogEntry, vintage: str) -> Any:
    """The identity of one vintage of a catalog wine, as the shared facts key it."""
    return SimpleNamespace(
        name=entry.name,
        producer=entry.producer,
        vintage=vintage,
        format="",
        currency="",
        shared_identity_id=None,
    )


def publish_vintage_facts(
    db: Session,
    entry: WineCatalogEntry,
    vintage: str,
    payload: CatalogPhotoSave,
    details: CatalogPhotoDetails | None,
    *,
    locale: str,
    model: str,
) -> list[str]:
    """Fill the shared facts of that vintage the cellars do not have yet."""
    if not (vintage.isdigit() and entry.producer):
        return []
    wine = _vintage_wine(entry, vintage)
    sources = [
        {"kind": "web_search_source", "url": source.url, "title": source.title}
        for source in (details.sources if details else [])
    ]
    published: list[str] = []
    window = drink_window(
        vintage,
        (payload.drink_from, payload.drink_peak_from, payload.drink_peak_to, payload.drink_to),
    )
    facts: list[tuple[str, dict[str, Any], str]] = []
    if window:
        facts.append(
            (
                "drink_window",
                {
                    "drink_from": window[0],
                    "drink_peak_from": window[1],
                    "drink_peak_to": window[2],
                    "drink_to": window[3],
                    "notes": details.drink_notes if details else "",
                },
                locale,
            )
        )
    if payload.description.strip():
        facts.append(("notes", {"ai_notes": payload.description.strip()}, locale))
    grapes = [
        name for name in (clean_grape_name(part) for part in payload.grapes_text.split(",")) if name
    ]
    if grapes and details and details.sources:
        facts.append(
            (
                "grapes",
                {
                    # The cellars' grape format; the share of each grape is unknown here.
                    "grapes": [
                        {"name": grape, "percentage_from": None, "percentage_to": None}
                        for grape in grapes[:8]
                    ],
                    "source_url": details.sources[0].url,
                    "source_title": details.sources[0].title,
                },
                "",
            )
        )
    for feature, fact_payload, fact_locale in facts:
        if get_shared_fact(db, wine, feature, locale=fact_locale or locale) is not None:
            continue
        publish_shared_fact(
            db,
            wine,
            feature,
            fact_payload,
            locale=fact_locale or locale,
            sources=sources,
            model=model,
            prompt_version="catalog_photo.details:1",
        )
        published.append(feature)
    return published


def save_bottle(
    db: Session,
    job: CatalogPhotoJob,
    position: int,
    payload: CatalogPhotoSave,
    *,
    user_id: Any,
    locale: str,
) -> CatalogPhotoSaveResult:
    from app.api.routes.catalog import (
        add_catalog_alias_if_missing,
        build_search_text,
        catalog_response,
        validate_available_sensory_profiles_for_catalog_entry,
    )
    from app.services.catalog_sync import matching_catalog_entries
    from app.services.wine_photo_library import matching_reference_photos

    if job.status == "running" or job.result is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The photo analysis is still running")
    if not 0 <= position < len(job.result.bottles):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bottle not found")
    bottle = job.result.bottles[position]
    name, producer = _text(payload.name, 200), _text(payload.producer, 200)
    if payload.entry_id is not None:
        entry = db.get(WineCatalogEntry, payload.entry_id)
        if entry is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Catalog entry not found")
    else:
        matches = matching_catalog_entries(db, name, producer, approved_only=False)
        if len(matches) > 1:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Several catalog entries match this wine: choose one"
            )
        entry = matches[0] if matches else None
    now = datetime.now(UTC)
    if entry is None:
        entry = WineCatalogEntry(
            name=name,
            producer=producer,
            source="photo",
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(entry)
        db.flush()
    values = {
        "name": name,
        "producer": producer,
        "appellation": _text(payload.appellation, 120),
        "region": _text(payload.region, 120),
        "country": _text(payload.country, 120),
        "type": normalize_wine_type(_text(payload.type, 80)),
        "grapes_text": _text(payload.grapes_text, 400),
    }
    # The admin reviewed every field: a value they kept or wrote replaces the old one,
    # an empty field never erases what the catalog already knows.
    for field, value in values.items():
        if value and value != getattr(entry, field):
            setattr(entry, field, value)
    for alias in {entry.name, f"{entry.producer} {entry.name}".strip()}:
        add_catalog_alias_if_missing(db, entry, alias, source="photo")
    if payload.description.strip():
        entry.description = payload.description.strip()
    details = bottle.details if bottle.details and bottle.details.found else None
    if details is not None:
        entry.sources = [
            {"kind": "web_search_source", "url": source.url, "title": source.title}
            for source in details.sources
        ]
        entry.enriched_at = now
    if not entry.is_active:
        entry.is_active = True
        validate_available_sensory_profiles_for_catalog_entry(
            db, entry, modified_by_user_id=user_id
        )
    entry.search_text = build_search_text(
        entry.name,
        entry.producer,
        entry.region,
        entry.appellation,
        entry.type,
        entry.country,
        entry.grapes_text,
        entry.wine_zone,
        entry.locality,
    )
    entry.updated_at = now
    db.flush()
    publish_vintage_facts(
        db,
        entry,
        bottle.vintage,
        payload,
        details,
        locale=locale,
        model=job.result.model,
    )
    photo: str = "skipped"
    if payload.save_photo and bottle.photo.ok and entry.producer:
        if matching_reference_photos(db, entry.name, entry.producer) and not payload.replace_photo:
            photo = "exists"
        elif save_bottle_photo(db, entry, job, position):
            photo = "saved"
        else:
            photo = "failed"
    db.commit()
    db.refresh(entry)
    saved = bottle.model_copy(
        update={
            "status": "known",
            "entry": catalog_response(entry),
            "candidates": [],
            "missing_fields": [
                field
                for field in COMPLETABLE_FIELDS
                if not str(getattr(entry, field) or "").strip()
            ],
            "saved": True,
            "photo_saved": bottle.photo_saved or photo == "saved",
            "photo": bottle.photo.model_copy(
                update={
                    "has_library_photo": bottle.photo.has_library_photo
                    or photo in {"saved", "exists"}
                }
            ),
        }
    )
    job.result.bottles[position] = saved
    return CatalogPhotoSaveResult(bottle=saved, photo=cast(Any, photo))
