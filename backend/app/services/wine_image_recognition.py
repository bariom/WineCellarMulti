from __future__ import annotations

from collections.abc import Callable
from io import BytesIO
from typing import Any

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings
from app.core.wine_types import CANONICAL_WINE_TYPES, normalize_wine_type
from app.prompts import wine_image_recognition_prompt
from app.services.openai_client import OpenAIResponse, create_response, parse_json_response

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
ALLOWED_RECOGNITION_STATUSES = {
    "recognized",
    "ambiguous",
    "not_recognized",
    "invalid_image",
    "error",
}


def clean_text(value: object, limit: int = 240) -> str:
    return " ".join(str(value or "").strip().split())[:limit]


def normalize_vintage(value: object) -> str:
    vintage = clean_text(value, 4).upper()
    if vintage in {"NV", "MV"}:
        return vintage
    if len(vintage) == 4 and vintage.isdigit() and 1800 <= int(vintage) <= 2200:
        return vintage
    return ""


def load_upright_rgb_image(content: bytes) -> Image.Image:
    try:
        with Image.open(BytesIO(content)) as source:
            if (source.format or "").upper() not in ALLOWED_IMAGE_FORMATS:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail="Unsupported image format",
                )
            transposed = ImageOps.exif_transpose(source)
            return (transposed or source).convert("RGB")
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid image",
        ) from exc


SHELF_SECTION_OVERLAP = 0.12


def shelf_photo_sections(
    content: bytes,
) -> list[tuple[bytes, tuple[float, float, float, float], tuple[int, int]]]:
    """Split an upright shelf photo into overlapping sections read in parallel.

    Each section is returned as a JPEG with its pixel size and its box (x, y, width, height)
    normalized to the whole photo, so bottle positions can be mapped back. A
    section shows its labels larger than the whole photo would, and several
    small readings finish much sooner than one long one. Bottles cut by a
    border appear whole in the neighbouring section thanks to the overlap.
    """
    image = load_upright_rgb_image(content)
    maximum = max(settings.wine_shelf_max_dimension, 800)
    quality = min(max(settings.wine_recognition_jpeg_quality, 50), 95)
    image.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    width, height = image.size
    if max(width, height) < 1000:
        columns = rows = 1
    else:
        columns = 3 if width >= 1.8 * height else 2
        rows = 3 if height >= 1.8 * width else 2
    sections: list[tuple[bytes, tuple[float, float, float, float], tuple[int, int]]] = []
    for row in range(rows):
        for column in range(columns):
            left = max(column / columns - SHELF_SECTION_OVERLAP / columns, 0.0)
            top = max(row / rows - SHELF_SECTION_OVERLAP / rows, 0.0)
            right = min((column + 1) / columns + SHELF_SECTION_OVERLAP / columns, 1.0)
            bottom = min((row + 1) / rows + SHELF_SECTION_OVERLAP / rows, 1.0)
            crop = image.crop(
                (
                    round(left * width),
                    round(top * height),
                    round(right * width),
                    round(bottom * height),
                )
            )
            # Send each section at the size the vision model actually sees (high detail
            # fits the short side in 768 px and the long side in 2048 px), so the pixel
            # coordinates it returns refer to the size declared in the prompt.
            scale = min(1.0, 768 / min(crop.size), 2048 / max(crop.size))
            if scale < 1:
                crop = crop.resize(
                    (max(round(crop.width * scale), 1), max(round(crop.height * scale), 1)),
                    Image.Resampling.LANCZOS,
                )
            buffer = BytesIO()
            crop.save(buffer, "JPEG", quality=quality, optimize=True)
            sections.append((buffer.getvalue(), (left, top, right - left, bottom - top), crop.size))
    return sections


def _smoothed(values: list[float], radius: int) -> list[float]:
    radius = max(radius, 1)
    prefix = [0.0]
    for value in values:
        prefix.append(prefix[-1] + value)
    return [
        (prefix[min(index + radius + 1, len(values))] - prefix[max(index - radius, 0)])
        / (min(index + radius + 1, len(values)) - max(index - radius, 0))
        for index in range(len(values))
    ]


def label_snapper(content: bytes) -> Callable[[float, float, float, float], tuple[float, float]]:
    """Move a label point the vision model gave onto the label it belongs to.

    Vision models place points about half a bottle off. On a shelf, labels are
    the bright areas between dark glass, so across the label band the brightness
    peaks at the middle of each label: the point moves to the nearest peak, then
    to the middle of that label's bright stretch vertically. Values are ratios of
    the image size: (x, y, label width, label height) in, (x, y) out.
    """
    try:
        image = Image.open(BytesIO(content)).convert("L")
    except (UnidentifiedImageError, OSError, ValueError):
        return lambda x, y, _width, _height: (x, y)
    width, height = image.size

    def snap(x: float, y: float, label_width: float, label_height: float) -> tuple[float, float]:
        if width < 8 or height < 8:
            return x, y
        center_x, center_y = x * width, y * height
        label_px = max(label_width * width, width * 0.04)
        band_px = max(label_height * height, height * 0.08)
        top = max(int(center_y - band_px / 2), 0)
        bottom = min(int(center_y + band_px / 2) + 1, height)
        if bottom - top < 2:
            return x, y
        columns = list(
            image.crop((0, top, width, bottom)).resize((width, 1), Image.Resampling.BOX).tobytes()
        )
        profile = _smoothed([float(value) for value in columns], round(label_px / 6))
        reach = label_px * 0.9
        start, end = max(int(center_x - reach), 1), min(int(center_x + reach) + 1, width - 1)
        window = profile[start:end]
        if not window:
            return x, y
        floor = sum(window) / len(window)
        peaks = [
            index
            for index in range(start, end)
            if profile[index] > floor
            and profile[index] >= profile[index - 1]
            and profile[index] > profile[index + 1]
        ]
        if peaks:
            peak = min(peaks, key=lambda index: abs(index - center_x))
            # The middle of the label's bright stretch, not its brightest column
            # (a reflection on one side would pull the point off centre).
            threshold = (profile[peak] + min(window)) / 2

            def stretch(limit: int) -> tuple[int, int]:
                first = last = peak
                while first > max(peak - limit, 0) and profile[first - 1] > threshold:
                    first -= 1
                while last < min(peak + limit, width - 1) and profile[last + 1] > threshold:
                    last += 1
                return first, last

            first, last = stretch(width)
            if last - first > label_px * 1.5:
                # Touching labels merged into one stretch: keep to about one label.
                first, last = stretch(round(label_px * 0.6))
            center_x = (first + last) / 2
        # Vertically, the middle of the bright stretch of that label.
        strip_half = max(label_px / 4, 2)
        left = max(int(center_x - strip_half), 0)
        right = min(int(center_x + strip_half) + 1, width)
        upper = max(int(center_y - band_px), 0)
        lower = min(int(center_y + band_px) + 1, height)
        rows = list(
            image.crop((left, upper, right, lower))
            .resize((1, lower - upper), Image.Resampling.BOX)
            .tobytes()
        )
        if rows:
            threshold = (max(rows) + min(rows)) / 2
            nearest = min(
                range(len(rows)),
                key=lambda index: (rows[index] <= threshold, abs(upper + index - center_y)),
            )
            if rows[nearest] > threshold:
                first = last = nearest
                while first > 0 and rows[first - 1] > threshold:
                    first -= 1
                while last < len(rows) - 1 and rows[last + 1] > threshold:
                    last += 1
                center_y = upper + (first + last) / 2
        return center_x / width, center_y / height

    return snap


def optimized_wine_images(content: bytes) -> tuple[bytes, bytes | None]:
    image = load_upright_rgb_image(content)
    maximum = max(settings.wine_recognition_max_dimension, 320)
    quality = min(max(settings.wine_recognition_jpeg_quality, 50), 95)
    image.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)

    full_buffer = BytesIO()
    image.save(full_buffer, "JPEG", quality=quality, optimize=True)

    width, height = image.size
    crop: bytes | None = None
    if width >= 240 and height >= 320:
        label = image.crop(
            (
                round(width * 0.08),
                round(height * 0.28),
                round(width * 0.92),
                round(height * 0.94),
            )
        )
        label.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
        crop_buffer = BytesIO()
        label.save(crop_buffer, "JPEG", quality=quality, optimize=True)
        crop = crop_buffer.getvalue()
    return full_buffer.getvalue(), crop


def recognition_json_schema() -> dict[str, Any]:
    candidate = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "producer": {"type": "string"},
            "estate": {"type": "string"},
            "wine_name": {"type": "string"},
            "cuvee": {"type": "string"},
            "vintage": {"type": "string"},
            "appellation": {"type": "string"},
            "region": {"type": "string"},
            "country": {"type": "string"},
            "wine_type": {
                "type": "string",
                "enum": ["Red", "White", "Rose", "Sparkling", "Sweet", "Fortified", "Other", ""],
            },
        },
        "required": [
            "producer",
            "estate",
            "wine_name",
            "cuvee",
            "vintage",
            "appellation",
            "region",
            "country",
            "wine_type",
        ],
    }
    return {
        "name": "wine_image_recognition",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["recognized", "ambiguous", "not_recognized", "invalid_image"],
                },
                **candidate["properties"],
                "label_text": {"type": "array", "items": {"type": "string"}},
                "alternative_candidates": {
                    "type": "array",
                    "maxItems": 3,
                    "items": candidate,
                },
                "needs_user_confirmation": {"type": "boolean"},
                "recognition_notes": {"type": "array", "items": {"type": "string"}},
            },
            "required": [
                "status",
                "producer",
                "estate",
                "wine_name",
                "cuvee",
                "vintage",
                "appellation",
                "region",
                "country",
                "wine_type",
                "label_text",
                "alternative_candidates",
                "needs_user_confirmation",
                "recognition_notes",
            ],
        },
    }


def normalize_candidate(value: object) -> dict[str, str]:
    item = value if isinstance(value, dict) else {}
    wine_type = normalize_wine_type(clean_text(item.get("wine_type"), 80))
    return {
        "producer": clean_text(item.get("producer")),
        "estate": clean_text(item.get("estate")),
        "wine_name": clean_text(item.get("wine_name")),
        "cuvee": clean_text(item.get("cuvee")),
        "vintage": normalize_vintage(item.get("vintage")),
        "appellation": clean_text(item.get("appellation")),
        "region": clean_text(item.get("region")),
        "country": clean_text(item.get("country")),
        "wine_type": wine_type if wine_type in CANONICAL_WINE_TYPES else "",
    }


def normalize_luna_result(result: dict[str, Any]) -> dict[str, Any]:
    main = normalize_candidate(result)
    alternatives = [
        candidate
        for candidate in (
            normalize_candidate(value)
            for value in list(result.get("alternative_candidates") or [])[:3]
        )
        if candidate["wine_name"] or candidate["appellation"]
    ]
    requested_status = clean_text(result.get("status"), 32)
    usable = bool(
        (main["producer"] and (main["wine_name"] or main["appellation"]))
        or (main["wine_name"] and main["appellation"])
    )
    recognition_status = (
        requested_status if requested_status in ALLOWED_RECOGNITION_STATUSES else "not_recognized"
    )
    if recognition_status == "recognized" and not usable:
        recognition_status = "not_recognized"
    if alternatives and recognition_status == "recognized":
        recognition_status = "ambiguous"
    return {
        "status": recognition_status,
        **main,
        "label_text": [
            clean_text(value) for value in list(result.get("label_text") or []) if clean_text(value)
        ][:20],
        "alternative_candidates": alternatives,
        "needs_user_confirmation": True,
        "recognition_notes": [
            clean_text(value, 400)
            for value in list(result.get("recognition_notes") or [])
            if clean_text(value)
        ][:8],
    }


def recognize_wine_from_image(
    content: bytes,
    *,
    locale: str,
    known_text: str = "",
    known_context: str = "",
    response_factory: Callable[..., OpenAIResponse] | None = None,
) -> tuple[dict[str, Any], str]:
    full_image, label_crop = optimized_wine_images(content)
    prompt = wine_image_recognition_prompt(
        locale=locale,
        known_text=known_text,
        known_context=known_context,
    )
    images = [("image/jpeg", full_image)]
    if label_crop:
        images.append(("image/jpeg", label_crop))
    response = (
        response_factory(
            system_prompt=prompt.system,
            user_prompt=prompt.user,
            json_schema=recognition_json_schema(),
            input_images=images,
            max_output_tokens=1800,
            timeout_seconds=settings.wine_recognition_timeout_seconds,
        )
        if response_factory
        else create_response(
            settings.openai_economy_model,
            prompt.system,
            prompt.user,
            api_key=settings.openai_api_key,
            json_schema=recognition_json_schema(),
            max_output_tokens=1800,
            task_type="structured_extraction",
            input_images=images,
            timeout_seconds=settings.wine_recognition_timeout_seconds,
        )
    )
    return normalize_luna_result(parse_json_response(response.text)), response.request_id
