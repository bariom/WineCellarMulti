"""The printed QR code of an event, dressed in Vinaris' colours with the glass at its centre.

The code uses the highest error correction (about 30% of it may be covered), so
the logo can sit over the middle and the code still scans; the modules under the
logo are left out rather than hidden, which keeps the picture clean.
"""

from __future__ import annotations

from xml.sax.saxutils import escape

import qrcode
from qrcode.constants import ERROR_CORRECT_H

INK = "#10231d"  # Vinaris deep green, dark enough for any scanner
EYE = "#9f2440"  # the wine in the glass
GOLD = "#c7a23a"
CREAM = "#f7f1df"
QUIET = 4  # modules of white margin the scanners need
LOGO_SHARE = 0.24  # side of the logo badge against the side of the code
CAPTION_MAX = 40  # characters that fit under the code at the caption size


def _logo_span(size: int) -> tuple[int, int]:
    """First and last module covered by the logo badge, centred, same parity as the code."""
    side = max(5, round(size * LOGO_SHARE))
    if side % 2 != size % 2:
        side += 1
    start = (size - side) // 2
    return start, start + side - 1


def _in_finder(row: int, col: int, size: int) -> bool:
    return (row < 7 and col < 7) or (row < 7 and col >= size - 7) or (row >= size - 7 and col < 7)


def _finder(x: int, y: int) -> str:
    return (
        f'<rect x="{x + 0.5}" y="{y + 0.5}" width="6" height="6" rx="1.8" '
        f'fill="none" stroke="{INK}" stroke-width="1"/>'
        f'<rect x="{x + 2}" y="{y + 2}" width="3" height="3" rx="0.9" fill="{EYE}"/>'
    )


def _logo(start: int, end: int) -> str:
    side = end - start + 1
    scale = side / 512
    return (
        f'<g transform="translate({start} {start}) scale({scale:.5f})">'
        f'<rect width="512" height="512" rx="112" fill="{INK}"/>'
        '<circle cx="256" cy="256" r="182" fill="#16342a"/>'
        '<path d="M182 126h148c0 62-25 96-63 110v84c0 21 26 30 64 39 13 3 22 15 22 28H159'
        'c0-13 9-25 22-28 38-9 64-18 64-39v-84c-38-14-63-48-63-110z" '
        f'fill="{CREAM}"/>'
        f'<path d="M213 162h86c-5 31-20 48-43 57-23-9-38-26-43-57z" fill="{EYE}"/>'
        f'<path d="M184 386h144" stroke="{GOLD}" stroke-width="22" stroke-linecap="round"/>'
        "</g>"
    )


def event_qr_svg(url: str, caption: str = "") -> str:
    code = qrcode.QRCode(error_correction=ERROR_CORRECT_H, border=0)
    code.add_data(url)
    code.make(fit=True)
    matrix = code.get_matrix()
    size = len(matrix)
    first, last = _logo_span(size)
    # One module of air around the badge.
    clear_from, clear_to = first - 1, last + 1

    dots: list[str] = []
    for row, line in enumerate(matrix):
        for col, dark in enumerate(line):
            if not dark or _in_finder(row, col, size):
                continue
            if clear_from <= row <= clear_to and clear_from <= col <= clear_to:
                continue
            dots.append(f'<circle cx="{col + 0.5}" cy="{row + 0.5}" r="0.46"/>')

    width = size + 2 * QUIET
    caption_band = 5 if caption else 0
    height = width + caption_band
    caption_svg = ""
    if caption:
        if len(caption) > CAPTION_MAX:
            caption = caption[: CAPTION_MAX - 1].rstrip() + "…"
        caption_svg = (
            f'<line x1="{QUIET + size * 0.3:.2f}" y1="{width + 0.2:.2f}" '
            f'x2="{QUIET + size * 0.7:.2f}" y2="{width + 0.2:.2f}" stroke="{GOLD}" '
            'stroke-width="0.35" stroke-linecap="round"/>'
            f'<text x="{width / 2}" y="{width + 2.9:.2f}" text-anchor="middle" '
            'font-family="Georgia, \'Times New Roman\', serif" font-size="2.1" '
            f'letter-spacing="0.08" fill="{INK}">{escape(caption)}</text>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width * 12}" height="{height * 12}" role="img" aria-label="Vinaris QR">'
        f'<rect width="{width}" height="{height}" rx="2.4" fill="#ffffff"/>'
        f'<rect x="0.6" y="0.6" width="{width - 1.2}" height="{height - 1.2}" rx="2" '
        f'fill="none" stroke="{GOLD}" stroke-width="0.3"/>'
        f'<g transform="translate({QUIET} {QUIET})">'
        f'<g fill="{INK}">{"".join(dots)}</g>'
        f"{_finder(0, 0)}{_finder(size - 7, 0)}{_finder(0, size - 7)}"
        f"{_logo(first, last)}"
        "</g>"
        f"{caption_svg}"
        "</svg>"
    )
