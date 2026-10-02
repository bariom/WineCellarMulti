"""Small, metadata-free tasting memories, stored atomically with the tasting."""

import base64
import binascii
import warnings
from io import BytesIO
from uuid import UUID

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_PHOTO_BYTES = 200_000
MAX_INPUT_BYTES = 2_000_000
MAX_INPUT_PIXELS = 24_000_000


def memory_photo_url(source: str, tasting_id: UUID, version: str) -> str:
    return f"/api/v1/wines/tasting-photos/{source}/{tasting_id}?v={version}" if version else ""


def process_memory_photo(value: str | None) -> bytes | None:
    if not value:
        return None
    try:
        header, encoded = value.split(",", 1)
        if header not in {
            "data:image/jpeg;base64",
            "data:image/png;base64",
            "data:image/webp;base64",
        }:
            raise ValueError("Unsupported image")
        content = base64.b64decode(encoded, validate=True)
        if len(content) > MAX_INPUT_BYTES:
            raise ValueError("Image too large")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                if source.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValueError("Unsupported image")
                if source.width * source.height > MAX_INPUT_PIXELS:
                    raise ValueError("Image too large")
                image = ImageOps.exif_transpose(source)
                image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
                rgba = image.convert("RGBA")
                clean = Image.new("RGB", rgba.size, "white")
                clean.paste(rgba, mask=rgba.getchannel("A"))
        for quality in (82, 72, 60, 45):
            output = BytesIO()
            clean.save(output, format="JPEG", quality=quality, optimize=True)
            if output.tell() <= MAX_PHOTO_BYTES:
                return output.getvalue()
        clean.thumbnail((960, 960), Image.Resampling.LANCZOS)
        output = BytesIO()
        clean.save(output, format="JPEG", quality=40, optimize=True)
        if output.tell() > MAX_PHOTO_BYTES:
            raise ValueError("Image too large")
        return output.getvalue()
    except (
        ValueError,
        binascii.Error,
        OSError,
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as error:
        raise HTTPException(
            400, "Invalid memory photo. Choose a JPEG, PNG or WebP image."
        ) from error
