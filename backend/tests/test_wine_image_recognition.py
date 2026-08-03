from io import BytesIO

import pytest
from fastapi import HTTPException
from PIL import Image

from app.prompts import wine_image_recognition_prompt
from app.services.openai_client import response_body
from app.services.wine_image_recognition import (
    normalize_luna_result,
    normalize_vintage,
    optimized_wine_images,
)


def luna_result(**updates):
    result = {
        "status": "recognized",
        "producer": "Fontanafredda",
        "estate": "",
        "wine_name": "Barolo",
        "cuvee": "",
        "vintage": "2019",
        "appellation": "Barolo DOCG",
        "region": "Piemonte",
        "country": "Italia",
        "label_text": ["Fontanafredda", "Barolo", "2019"],
        "alternative_candidates": [],
        "needs_user_confirmation": True,
        "recognition_notes": [],
    }
    result.update(updates)
    return result


def test_normalize_successful_luna_recognition():
    result = normalize_luna_result(luna_result())
    assert result["status"] == "recognized"
    assert result["producer"] == "Fontanafredda"
    assert result["vintage"] == "2019"
    assert result["needs_user_confirmation"] is True


def test_normalize_ambiguous_luna_recognition_with_candidates():
    result = normalize_luna_result(
        luna_result(
            status="ambiguous",
            alternative_candidates=[
                luna_result(producer="Other", wine_name="Barolo", vintage="2020")
            ],
        )
    )
    assert result["status"] == "ambiguous"
    assert len(result["alternative_candidates"]) == 1


def test_incomplete_luna_result_is_not_recognized():
    result = normalize_luna_result(luna_result(producer="", vintage="lot 2024"))
    assert result["status"] == "not_recognized"
    assert result["vintage"] == ""


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("2018", "2018"), (2019, "2019"), ("NV", "NV"), ("123", ""), ("9999", "")],
)
def test_vintage_normalization(raw, expected):
    assert normalize_vintage(raw) == expected


def test_image_optimization_outputs_jpeg_and_label_crop():
    source = BytesIO()
    Image.new("RGB", (1200, 1800), "white").save(source, "JPEG")
    full, crop = optimized_wine_images(source.getvalue())
    assert full.startswith(b"\xff\xd8")
    assert crop is not None and crop.startswith(b"\xff\xd8")
    with Image.open(BytesIO(crop)) as crop_image:
        assert crop_image.height > crop_image.width


def test_invalid_image_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        optimized_wine_images(b"not an image")
    assert exc_info.value.status_code == 422


def test_openai_response_body_supports_images_without_changing_text_calls():
    text_body = response_body("gpt-5.5", "system", "user")
    image_body = response_body(
        "gpt-5.5",
        "system",
        "user",
        input_images=[("image/jpeg", b"jpeg")],
    )
    assert text_body["input"][1]["content"] == "user"
    assert image_body["input"][1]["content"][1]["type"] == "input_image"
    assert image_body["input"][1]["content"][1]["image_url"].startswith("data:image/jpeg;base64,")


def test_wine_image_prompt_is_versioned_localized_and_conservative():
    prompt = wine_image_recognition_prompt(
        locale="it",
        known_text="Testamatta",
        known_context="producer unknown",
    )
    assert prompt.id == "wine.image_recognition"
    assert prompt.version == "1"
    assert "Italian" in prompt.system
    assert "Do not invent" in prompt.system
    assert "Testamatta" in prompt.user
