"""Render the 1200x630 social-card images for the static public pages.

Every static page under frontend/public that points its og:image at /og/<name>.jpg
gets that image drawn from its own og:title. Run it after
`npm run generate:seo-guides` or scripts/generate_pricing_pages.py whenever a
title changes:

    backend/.venv/Scripts/python scripts/generate_og_images.py

Needs Pillow (installed with the backend's photo-ai extra) and the Georgia font
(Windows: C:/Windows/Fonts; elsewhere pass --font-dir).
"""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
BACKGROUND = PUBLIC / "images" / "home-bottle-cellar-v1.jpg"
SIZE = (1200, 630)
GOLD = (215, 189, 109)
CREAM = (255, 250, 241)

OG_IMAGE = re.compile(r'<meta property="og:image" content="https://vinaris\.app/og/([a-z0-9-]+\.jpg)">')
OG_TITLE = re.compile(r'<meta property="og:title" content="([^"]+)">')
HTML_LANG = re.compile(r'<html lang="([a-z]{2})"')


def eyebrow_for(name: str, lang: str) -> str:
    if name.startswith("guide-"):
        return "Guida per la cantina" if lang == "it" else "Cellar guide"
    if name.startswith("guides-"):
        return "Guide Vinaris" if lang == "it" else "Vinaris guides"
    if name.startswith("pricing-"):
        return "Prezzi" if lang == "it" else "Pricing"
    if name.startswith("about-"):
        return "Chi siamo" if lang == "it" else "About"
    return "Vinaris"


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def background() -> Image.Image:
    image = Image.open(BACKGROUND).convert("RGB")
    ratio = max(SIZE[0] / image.width, SIZE[1] / image.height)
    image = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
    left = (image.width - SIZE[0]) // 2
    top = (image.height - SIZE[1]) // 2
    image = image.crop((left, top, left + SIZE[0], top + SIZE[1])).filter(ImageFilter.GaussianBlur(2))
    shade = Image.new("RGB", SIZE, (16, 35, 29))
    gradient = Image.linear_gradient("L").rotate(90).resize(SIZE)
    mask = gradient.point(lambda value: int(150 + value * 0.35))
    return Image.composite(shade, image, mask)


def render(title: str, eyebrow: str, target: Path, fonts: Path, base: Image.Image) -> None:
    image = base.copy()
    draw = ImageDraw.Draw(image)
    serif = str(fonts / "georgia.ttf")
    serif_bold = str(fonts / "georgiab.ttf")
    draw.text((72, 64), "VINARIS", font=ImageFont.truetype(serif_bold, 30), fill=GOLD)
    draw.line((72, 112, 192, 112), fill=GOLD, width=2)
    draw.text((72, 168), eyebrow.upper(), font=ImageFont.truetype(serif, 26), fill=GOLD)
    size = 64
    while True:
        font = ImageFont.truetype(serif, size)
        lines = wrap(draw, title, font, SIZE[0] - 144)
        if len(lines) <= 4 or size <= 40:
            break
        size -= 4
    y = 220
    for line in lines:
        draw.text((72, y), line, font=font, fill=CREAM)
        y += int(size * 1.18)
    draw.text((72, SIZE[1] - 72), "vinaris.app", font=ImageFont.truetype(serif, 24), fill=GOLD)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "JPEG", quality=82, optimize=True, progressive=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font-dir", type=Path, default=Path("C:/Windows/Fonts"))
    args = parser.parse_args()
    base = background()
    written = 0
    for page in sorted(PUBLIC.rglob("index.html")):
        text = page.read_text(encoding="utf-8")
        image_match = OG_IMAGE.search(text)
        title_match = OG_TITLE.search(text)
        lang_match = HTML_LANG.search(text)
        if not (image_match and title_match and lang_match):
            continue
        name = image_match.group(1)
        render(html.unescape(title_match.group(1)), eyebrow_for(name, lang_match.group(1)), PUBLIC / "og" / name, args.font_dir, base)
        written += 1
        print(f"wrote og/{name}")
    print(f"{written} images")


if __name__ == "__main__":
    main()
