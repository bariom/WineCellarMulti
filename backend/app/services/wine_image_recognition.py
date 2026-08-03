from __future__ import annotations

from collections.abc import Callable
from io import BytesIO
from typing import Any

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings
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


def optimized_wine_images(content: bytes) -> tuple[bytes, bytes | None]:
    try:
        with Image.open(BytesIO(content)) as source:
            if (source.format or "").upper() not in ALLOWED_IMAGE_FORMATS:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail="Unsupported image format",
                )
            transposed = ImageOps.exif_transpose(source)
            image = (transposed or source).convert("RGB")
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid image",
        ) from exc

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
                "label_text",
                "alternative_candidates",
                "needs_user_confirmation",
                "recognition_notes",
            ],
        },
    }


def normalize_candidate(value: object) -> dict[str, str]:
    item = value if isinstance(value, dict) else {}
    return {
        "producer": clean_text(item.get("producer")),
        "estate": clean_text(item.get("estate")),
        "wine_name": clean_text(item.get("wine_name")),
        "cuvee": clean_text(item.get("cuvee")),
        "vintage": normalize_vintage(item.get("vintage")),
        "appellation": clean_text(item.get("appellation")),
        "region": clean_text(item.get("region")),
        "country": clean_text(item.get("country")),
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
    usable = bool(main["producer"] and (main["wine_name"] or main["appellation"]))
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
