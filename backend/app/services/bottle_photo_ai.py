from __future__ import annotations

import logging
import os
from importlib import import_module
from inspect import signature
from io import BytesIO
from multiprocessing import get_context
from queue import Empty
from threading import Lock, Thread
from time import perf_counter
from typing import Any, NoReturn

from app.core.config import settings

DETAIL_SIZE = (480, 720)
_photo_processing_lock = Lock()
DEFAULT_PROCESS_TIMEOUT_SECONDS = 90
DEFAULT_WORKER_IDLE_SECONDS = 75
_worker_process: Any | None = None
_worker_commands: Any | None = None
_worker_results: Any | None = None
_worker_model: str | None = None
# Uvicorn configures its own logger hierarchy, leaving the root at WARNING.
# Route photo timings through its existing INFO handler in systemd/Docker.
logger = logging.getLogger("uvicorn.error.bottle_photo_ai")


class BottlePhotoAiError(RuntimeError):
    pass


class BottlePhotoAiUnavailable(BottlePhotoAiError):
    pass


class BottlePhotoNotDetected(BottlePhotoAiError):
    pass


class InvalidBottlePhoto(BottlePhotoAiError):
    pass


def _vision_modules() -> tuple[Any, Any, Any, Any, Any]:
    try:
        numpy = import_module("numpy")
        image_module = import_module("PIL.Image")
        image_ops = import_module("PIL.ImageOps")
        rembg = import_module("rembg")
        scipy_ndimage = import_module("scipy.ndimage")
    except ImportError as error:
        raise BottlePhotoAiUnavailable("AI bottle photo processing is not installed") from error
    return numpy, image_module, image_ops, rembg, scipy_ndimage


def _session_options(rembg: Any) -> dict[str, Any]:
    """ONNX Runtime options for the segmentation sessions.

    By default ONNX Runtime keeps every buffer of an inference in a CPU arena that never
    shrinks and grows again on the next run: measured on a 1016x1525 bottle frame, the
    background model held 12.5 GB and SAM 7.2 GB after two cutouts. Without the arena the
    same runs peak at 6.6 GB and 3.7 GB, return to about 0.5 GB between cutouts, take the
    same time and produce identical masks.
    """
    if settings.wine_photo_ai_cpu_mem_arena:
        return {}
    if "sess_opts" not in signature(rembg.new_session).parameters:
        logger.warning("This rembg cannot take session options: the ONNX memory arena stays on")
        return {}
    options = import_module("onnxruntime").SessionOptions()
    options.enable_cpu_mem_arena = False
    return {"sess_opts": options}


def _model_session(model_name: str) -> Any:
    _, _, _, rembg, _ = _vision_modules()
    try:
        return rembg.new_session(model_name, **_session_options(rembg))
    except Exception as error:
        raise BottlePhotoAiUnavailable("AI bottle segmentation model is unavailable") from error


def _guide_half_width(width: int, height: int, y: int) -> float:
    guide_y = (y / height - 0.05) / 0.9
    if not 0 <= guide_y <= 1:
        return 0
    if guide_y < 0.18:
        return width * 0.072
    if guide_y < 0.34:
        return width * (0.072 + ((guide_y - 0.18) / 0.16) * 0.108)
    return width * 0.18


def _guide_mask(numpy: Any, width: int, height: int) -> Any:
    guide = numpy.zeros((height, width), dtype=numpy.float32)
    horizontal = numpy.arange(width, dtype=numpy.float32)
    center = (width - 1) / 2
    for y in range(height):
        radius = _guide_half_width(width, height, y)
        if radius:
            guide[y] = numpy.clip((radius - numpy.abs(horizontal - center) + 2) / 4, 0, 1)
    return guide


def _central_component(numpy: Any, scipy_ndimage: Any, binary: Any) -> Any:
    height, width = binary.shape
    labels, component_count = scipy_ndimage.label(binary)
    if not component_count:
        return numpy.zeros((height, width), dtype=numpy.bool_)

    component_sizes = numpy.bincount(labels.ravel(), minlength=component_count + 1)
    center = width / 2
    central_columns = numpy.abs(numpy.arange(width) - center) < width * 0.06
    central_sizes = numpy.bincount(
        labels[:, central_columns].ravel(),
        minlength=component_count + 1,
    )
    scores = component_sizes + central_sizes * 5
    scores[0] = 0
    return labels == int(numpy.argmax(scores))


def _filled_component_alpha(numpy: Any, component: Any, model_alpha: Any) -> Any:
    """Keep model feathering at the outline, but never cut holes inside it."""
    height, _ = component.shape
    alpha = numpy.zeros_like(model_alpha)
    for y in range(height):
        visible_x = numpy.flatnonzero(component[y])
        if not len(visible_x):
            continue
        left, right = int(visible_x.min()), int(visible_x.max())
        alpha[y, left : right + 1] = 1
        for inset in range(min(3, right - left + 1)):
            left_x = left + inset
            right_x = right - inset
            alpha[y, left_x] = model_alpha[y, left_x]
            alpha[y, right_x] = model_alpha[y, right_x]
    return alpha


def _center_crop(image: Any) -> Any:
    target_ratio = DETAIL_SIZE[0] / DETAIL_SIZE[1]
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        crop_width = round(image.height * target_ratio)
        left = (image.width - crop_width) // 2
        box = (left, 0, left + crop_width, image.height)
    else:
        crop_height = round(image.width / target_ratio)
        top = (image.height - crop_height) // 2
        box = (0, top, image.width, top + crop_height)
    return image.crop(box)


def _process_bottle_photo_with_session(
    content: bytes, session: Any
) -> tuple[bytes, dict[str, int]]:
    started_at = perf_counter()
    numpy, image_module, image_ops, rembg, scipy_ndimage = _vision_modules()
    try:
        source = image_module.open(BytesIO(content))
        source.load()
        source = image_ops.exif_transpose(source).convert("RGB")
    except Exception as error:
        raise InvalidBottlePhoto("Unsupported or invalid bottle photo") from error
    if source.width < 240 or source.height < 360 or source.width * source.height > 40_000_000:
        raise InvalidBottlePhoto("Bottle photo dimensions are not supported")

    source = _center_crop(source).resize(DETAIL_SIZE, image_module.Resampling.LANCZOS)
    prepared_at = perf_counter()
    try:
        mask_result = rembg.remove(
            source,
            session=session,
            only_mask=True,
            post_process_mask=True,
        )
    except BottlePhotoAiError:
        raise
    except Exception as error:
        raise BottlePhotoAiUnavailable("AI bottle segmentation failed") from error
    inferred_at = perf_counter()
    if isinstance(mask_result, bytes):
        mask_result = image_module.open(BytesIO(mask_result))
    mask = mask_result.convert("L").resize(DETAIL_SIZE, image_module.Resampling.LANCZOS)
    model_alpha = numpy.asarray(mask, dtype=numpy.float32) / 255
    guided_alpha = model_alpha * _guide_mask(numpy, *DETAIL_SIZE)
    selected = _central_component(numpy, scipy_ndimage, guided_alpha > 0.12)
    alpha = _filled_component_alpha(numpy, selected, guided_alpha)
    visible_y, visible_x = numpy.nonzero(alpha > 0.08)
    if not len(visible_x):
        raise BottlePhotoNotDetected("The AI could not detect a bottle inside the guide")

    min_x, max_x = int(visible_x.min()), int(visible_x.max())
    min_y, max_y = int(visible_y.min()), int(visible_y.max())
    subject_width = max_x - min_x + 1
    subject_height = max_y - min_y + 1
    subject_center = (min_x + max_x) / 2
    if (
        subject_height < DETAIL_SIZE[1] * 0.48
        or subject_width < DETAIL_SIZE[0] * 0.07
        or subject_width > DETAIL_SIZE[0] * 0.38
        or abs(subject_center - DETAIL_SIZE[0] / 2) > DETAIL_SIZE[0] * 0.1
    ):
        raise BottlePhotoNotDetected("The detected bottle outline is not reliable")

    rgba = source.convert("RGBA")
    rgba.putalpha(image_module.fromarray(numpy.uint8(numpy.clip(alpha, 0, 1) * 255), mode="L"))
    padding = 3
    subject = rgba.crop(
        (
            max(0, min_x - padding),
            max(0, min_y - padding),
            min(DETAIL_SIZE[0], max_x + padding + 1),
            min(DETAIL_SIZE[1], max_y + padding + 1),
        )
    )
    scale = min(
        DETAIL_SIZE[0] * 0.82 / subject.width,
        DETAIL_SIZE[1] * 0.9 / subject.height,
    )
    output_size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(output_size, image_module.Resampling.LANCZOS)
    output = image_module.new("RGBA", DETAIL_SIZE, (0, 0, 0, 0))
    output.alpha_composite(
        subject,
        ((DETAIL_SIZE[0] - subject.width) // 2, round(DETAIL_SIZE[1] * 0.055)),
    )
    buffer = BytesIO()
    output.save(buffer, format="PNG", optimize=True)
    completed_at = perf_counter()
    return buffer.getvalue(), {
        "prepare_ms": round((prepared_at - started_at) * 1000),
        "inference_ms": round((inferred_at - prepared_at) * 1000),
        "postprocess_ms": round((completed_at - inferred_at) * 1000),
        "total_ms": round((completed_at - started_at) * 1000),
    }


# Catalog photos (docs/CATALOG_PHOTO_ENRICHMENT.md): a bottle cut from a shop photo is
# neither centered nor upright like one taken in the capture guide.
CATALOG_SOURCE_MAX = (768, 1152)
CATALOG_MAX_TILT = 20.0
CATALOG_MIN_TILT = 0.8
CATALOG_EDGE_PIXELS = 2
# Smoothing of the cutout's outline: blur radius as a share of the frame's width, and
# the steepness of the alpha ramp across the blurred edge.
CATALOG_EDGE_SIGMA = 0.004
CATALOG_EDGE_RAMP = 2.5
CATALOG_TIMEOUT_SECONDS = 240


CATALOG_BODY_TOLERANCE = 1.08
# Going up, the outline narrows (shoulder, neck); only the capsule's lip widens a little.
CATALOG_NECK_TOLERANCE = 1.12


def _run_around(row: Any, x: int, reach: int) -> tuple[int, int] | None:
    """The contiguous run of mask pixels at (or nearest to) column x in one row."""
    width = len(row)
    start = next(
        (
            column
            for offset in range(reach + 1)
            for column in (x - offset, x + offset)
            if 0 <= column < width and row[column]
        ),
        None,
    )
    if start is None:
        return None
    left = right = start
    while left > 0 and row[left - 1]:
        left -= 1
    while right < width - 1 and row[right + 1]:
        right += 1
    return left, right


def _follow_silhouette(binary: Any, keep: Any, start: int, axis: float, body: float) -> None:
    """Mark the bottle's rows in keep, following its axis down to the base and up to the
    capsule from the start row (see bottle_silhouette)."""
    height, width = binary.shape

    def follow(rows: range, *, upward: bool) -> None:
        center = axis
        narrowest = body
        previous: tuple[int, int] | None = None
        for row in rows:
            run = _run_around(binary[row], round(center), 2)
            # The bottle ends where the next row no longer overlaps it: whatever lies
            # beyond (a neighbour's base, a shelf) is not followed.
            if run is None or (
                previous is not None
                and min(run[1], previous[1]) - max(run[0], previous[0]) + 1
                < 0.5 * min(previous[1] - previous[0] + 1, run[1] - run[0] + 1)
            ):
                return
            run_width = run[1] - run[0] + 1
            allowed = (
                narrowest * CATALOG_NECK_TOLERANCE + 2 if upward else body * CATALOG_BODY_TOLERANCE
            )
            if run_width <= allowed:
                # A plausible row: keep it whole and let the axis follow a tilted bottle.
                left, right = run
                center = (0.5 if upward else 0.8) * center + (0.5 if upward else 0.2) * (
                    (left + right) / 2
                )
            else:
                # Something touches the bottle. The bottle is symmetric about its axis:
                # keep the side that sticks out less, within the expected width.
                half = min(center - run[0], run[1] - center, allowed / 2)
                if half < 1:
                    return
                left, right = round(center - half), round(center + half)
            if upward:
                narrowest = min(narrowest, right - left + 1)
            previous = (left, right)
            keep[row, max(0, left) : min(width, right + 1)] = True

    follow(range(start, height), upward=False)
    follow(range(start - 1, -1, -1), upward=True)


def bottle_silhouette(
    numpy: Any,
    binary: Any,
    label_share: float = 0.0,
    measured: tuple[float, float] | None = None,
) -> Any:
    """Keep the bottle standing at the frame's center and drop what touches it.

    Row by row, only the run on the bottle's axis is kept, following the axis up and
    down from the label. Below the label no row may be wider than the body; above it
    the outline narrows towards the neck and may only widen a little again (the
    capsule's lip). Neighbouring bottles, shelves or machines that touch the bottle are
    trimmed away instead of joining the cutout. measured, the body's axis and width found
    by SAM, is the surest measure; without it, label_share (the label's width as a share
    of the frame's) tells a row of the bottle alone from one merged with a neighbour.
    """
    height, width = binary.shape
    keep = numpy.zeros_like(binary, dtype=bool)
    reach = max(2, round(width * 0.04))
    middle = height // 2
    look_at = round(measured[0]) if measured else width // 2
    start = next(
        (
            row
            for offset in range(height // 4)
            for row in (middle + offset, middle - offset)
            if 0 <= row < height and _run_around(binary[row], look_at, reach)
        ),
        None,
    )
    if start is None:
        return keep
    first = _run_around(binary[start], look_at, reach)
    assert first is not None
    if measured is not None:
        axis, body = measured
        _follow_silhouette(binary, keep, start, axis, body)
        return keep
    # The body's width and axis, from the rows between shoulder and base. The frame is
    # built on the bottle's height, so its body spans 0.22 to 0.6 of the frame's width;
    # the label read by the AI narrows that range only when it agrees with it, since the
    # reading's label size is an estimate that varies between readings.
    lower, upper = width * 0.22, width * 0.6
    label = label_share * width
    label_agrees = bool(label) and lower <= label * 1.5 and label * 0.85 <= upper
    if label_agrees:
        lower, upper = max(lower, label * 0.85), min(upper, label * 1.5)
    runs = [
        run
        for run in (
            _run_around(binary[row], width // 2, reach)
            for row in range(round(height * 0.35), round(height * 0.85))
        )
        if run is not None
    ]
    body_runs = [run for run in runs if lower <= run[1] - run[0] + 1 <= upper]
    if body_runs:
        body = float(numpy.percentile([right - left + 1 for left, right in body_runs], 30))
    elif label_agrees:
        # Every body row is merged with a neighbour: the label is the only measure left.
        body = label * 1.15
        body_runs = runs or [first]
    else:
        body_runs = [run for run in runs if width * 0.22 <= run[1] - run[0] + 1 <= width * 0.6] or [
            first
        ]
        body = float(numpy.percentile([right - left + 1 for left, right in body_runs], 30))
        body = min(max(body, width * 0.22), width * 0.6)
    axis = float(
        numpy.median(
            [
                (left + right) / 2
                for left, right in body_runs
                if right - left + 1 <= body * CATALOG_BODY_TOLERANCE
            ]
            or [width / 2]
        )
    )

    _follow_silhouette(binary, keep, start, axis, body)
    return keep


def sam_bottle_mask(numpy: Any, scipy_ndimage: Any, sam_mask: Any, label_y: float) -> Any | None:
    """The bottle SAM was pointed at (label and base), whole and without holes.

    SAM tells this bottle from its neighbours and keeps its neck even where the
    background model loses it among identical capsules; it may split the bottle or miss
    parts of a label. Its pieces on the bottle's center line are kept, rows left empty
    between them take the body's width, and gaps and holes are closed.
    """
    height, width = sam_mask.shape
    center = width // 2
    labels, _ = scipy_ndimage.label(sam_mask)
    # SAM's mask holds only the bottle pointed at: every piece of it crossing the central
    # column belongs to that bottle, even when SAM split it at the label.
    rows = [min(height - 1, max(0, round(y))) for y in (label_y, height * 0.82)]
    picked = {int(labels[row, center]) for row in rows} - {0}
    if not picked:
        return None
    # Nothing of the bottle lies below its base (a price tag on the shelf edge does).
    base = int(numpy.nonzero(numpy.isin(labels, list(picked)).any(axis=1))[0].max())
    column = labels[:, max(0, center - 2) : center + 3]
    for value in set(numpy.unique(column).tolist()) - {0} - picked:
        if numpy.nonzero((labels == value).any(axis=1))[0].min() < base:
            picked.add(int(value))
    keep = numpy.isin(labels, list(picked))
    filled_rows = numpy.nonzero(keep.any(axis=1))[0]
    if filled_rows.max() - filled_rows.min() + 1 < height * 0.5:
        return None
    lefts = numpy.argmax(keep, axis=1)
    rights = width - 1 - numpy.argmax(keep[:, ::-1], axis=1)
    lower = [row for row in filled_rows if row > height * 0.5] or list(filled_rows)
    body = (int(numpy.median(lefts[lower])), int(numpy.median(rights[lower])))
    keep = keep.copy()
    for row in range(int(filled_rows.min()), int(filled_rows.max()) + 1):
        if not keep[row].any():
            keep[row, body[0] : body[1] + 1] = True
    radius = max(3, round(width * 0.02))
    closed = scipy_ndimage.binary_closing(keep, structure=numpy.ones((radius * 3, radius)))
    return scipy_ndimage.binary_fill_holes(closed | keep)


def sam_body(numpy: Any, mask: Any) -> tuple[float, float] | None:
    """The body's axis and width, measured on the lower half of SAM's bottle."""
    height, width = mask.shape
    body_rows = [row for row in range(round(height * 0.55), round(height * 0.9)) if mask[row].any()]
    if len(body_rows) < height * 0.1:
        return None
    lefts = numpy.argmax(mask[body_rows], axis=1)
    rights = width - 1 - numpy.argmax(mask[body_rows][:, ::-1], axis=1)
    body = float(numpy.median(rights - lefts + 1))
    if not width * 0.15 <= body <= width * 0.65:
        return None
    return float(numpy.median((lefts + rights) / 2)), body


def catalog_bottle_alpha(
    numpy: Any,
    scipy_ndimage: Any,
    model_alpha: Any,
    label_share: float = 0.0,
    sam_mask: Any | None = None,
) -> Any:
    """The bottle's alpha in a catalog frame, without the capture guide.

    With SAM's bottle, the outline is SAM's, refined by the background model's edges
    next to it; otherwise the background model's mask around the frame's center (where
    the label is). Either way the outline rules then trim what sticks out of a bottle's
    shape, around the axis SAM measured when available.
    A bottle touching the frame's edge is cut: its photo is not kept.
    """
    height, width = model_alpha.shape
    binary = model_alpha > 0.12
    measured = None
    if sam_mask is not None:
        near = scipy_ndimage.binary_dilation(sam_mask, iterations=max(2, round(width * 0.01)))
        binary = sam_mask | (binary & near)
        measured = sam_body(numpy, sam_mask)
    selected = bottle_silhouette(numpy, binary, label_share, measured)
    rows, columns = numpy.nonzero(selected)
    if not len(rows):
        raise BottlePhotoNotDetected("The AI could not detect a bottle")
    edge = CATALOG_EDGE_PIXELS
    if (
        rows.min() < edge
        or rows.max() >= height - edge
        or columns.min() < edge
        or columns.max() >= width - edge
    ):
        raise BottlePhotoNotDetected("The bottle is cut by the edge of the photo")
    if rows.max() - rows.min() + 1 < height * 0.5:
        raise BottlePhotoNotDetected("The detected bottle outline is not reliable")
    # Fill holes (reflections, a dark label) without the row spans of the capture guide,
    # which would add background wedges beside a tilted bottle's neck.
    filled = scipy_ndimage.binary_fill_holes(selected)
    # The silhouette is cut pixel by pixel and row by row: blurring it and keeping a short
    # ramp around its outline rounds those steps into a smooth, feathered edge.
    soft = scipy_ndimage.gaussian_filter(
        filled.astype(numpy.float32), sigma=max(1.5, width * CATALOG_EDGE_SIGMA)
    )
    return numpy.clip((soft - 0.5) * CATALOG_EDGE_RAMP + 0.5, 0.0, 1.0).astype(numpy.float32)


def bottle_tilt(numpy: Any, alpha: Any) -> float:
    """Degrees to rotate the image counterclockwise (PIL) to stand the bottle upright."""
    rows, columns = numpy.nonzero(alpha > 0.5)
    if len(rows) < 10:
        return 0.0
    coordinates = numpy.stack([columns, rows]).astype(numpy.float64)
    coordinates -= coordinates.mean(axis=1, keepdims=True)
    eigenvalues, eigenvectors = numpy.linalg.eigh(numpy.cov(coordinates))
    axis_x, axis_y = eigenvectors[:, int(numpy.argmax(eigenvalues))]
    if axis_y < 0:
        axis_x, axis_y = -axis_x, -axis_y
    return float(numpy.degrees(numpy.arctan2(-axis_x, axis_y)))


def _compose_detail(image_module: Any, subject: Any) -> Any:
    """Center the cut-out bottle on the transparent 480x720 detail canvas."""
    scale = min(
        DETAIL_SIZE[0] * 0.82 / subject.width,
        DETAIL_SIZE[1] * 0.9 / subject.height,
    )
    output_size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(output_size, image_module.Resampling.LANCZOS)
    output = image_module.new("RGBA", DETAIL_SIZE, (0, 0, 0, 0))
    output.alpha_composite(
        subject,
        ((DETAIL_SIZE[0] - subject.width) // 2, round(DETAIL_SIZE[1] * 0.055)),
    )
    return output


_catalog_sam_session: Any | None = None
_catalog_sam_unavailable = False


def _sam_session() -> Any | None:
    """SAM, loaded once in the photo worker; None when disabled or not installable."""
    global _catalog_sam_session, _catalog_sam_unavailable
    model = settings.wine_photo_catalog_sam_model.strip()
    if not model or _catalog_sam_unavailable:
        return None
    if _catalog_sam_session is None:
        try:
            _catalog_sam_session = _model_session(model)
        except BottlePhotoAiError:
            logger.warning("Catalog bottle photos fall back to the outline rules: no %s", model)
            _catalog_sam_unavailable = True
            return None
    return _catalog_sam_session


def _sam_bottle(
    numpy: Any, image_module: Any, rembg: Any, scipy_ndimage: Any, source: Any, label_y: float
) -> Any | None:
    sam = _sam_session()
    if sam is None:
        return None
    width, height = source.size
    center = width // 2
    label_row = min(height - 1, max(0, round(label_y * height)))
    prompt = [
        {"type": "point", "data": [center, label_row], "label": 1},
        {"type": "point", "data": [center, round(height * 0.82)], "label": 1},
        {
            "type": "rectangle",
            "data": [
                round(center - width * 0.2),
                round(height * 0.05),
                round(center + width * 0.2),
                round(height * 0.93),
            ],
        },
    ]
    try:
        result = rembg.remove(source, session=sam, only_mask=True, sam_prompt=prompt)
    except Exception:
        logger.warning("SAM could not segment a catalog bottle", exc_info=True)
        return None
    if isinstance(result, bytes):
        result = image_module.open(BytesIO(result))
    mask = numpy.asarray(result.convert("L").resize(source.size)) > 127
    return sam_bottle_mask(numpy, scipy_ndimage, mask, label_row)


def _process_catalog_bottle_photo_with_session(
    content: bytes, session: Any, label_share: float = 0.0, label_y: float = 0.5
) -> tuple[bytes, dict[str, int]]:
    """Cut out a bottle framed from a catalog photo, straightened, without the capture guide."""
    started_at = perf_counter()
    numpy, image_module, image_ops, rembg, scipy_ndimage = _vision_modules()
    try:
        source = image_module.open(BytesIO(content))
        source.load()
        source = image_ops.exif_transpose(source).convert("RGB")
    except Exception as error:
        raise InvalidBottlePhoto("Unsupported or invalid bottle photo") from error
    if source.width < 160 or source.height < 360 or source.width * source.height > 40_000_000:
        raise InvalidBottlePhoto("Bottle photo dimensions are not supported")
    # Small frames are enlarged too: the outline is then found at the size it is shown at,
    # instead of being found small and enlarged into visible steps.
    source = image_ops.contain(source, CATALOG_SOURCE_MAX, image_module.Resampling.LANCZOS)
    prepared_at = perf_counter()
    try:
        mask_result = rembg.remove(source, session=session, only_mask=True, post_process_mask=True)
    except Exception as error:
        raise BottlePhotoAiUnavailable("AI bottle segmentation failed") from error
    inferred_at = perf_counter()
    if isinstance(mask_result, bytes):
        mask_result = image_module.open(BytesIO(mask_result))
    mask = mask_result.convert("L").resize(source.size, image_module.Resampling.LANCZOS)
    model_alpha = numpy.asarray(mask, dtype=numpy.float32) / 255
    # SAM outlines the bottle pointed at (its neighbours touch it on a shelf); without it
    # the outline rules work on the background model's mask alone.
    sam_started_at = perf_counter()
    bottle = _sam_bottle(numpy, image_module, rembg, scipy_ndimage, source, label_y)
    sam_ms = round((perf_counter() - sam_started_at) * 1000)
    alpha = catalog_bottle_alpha(numpy, scipy_ndimage, model_alpha, label_share, bottle)

    rgba = source.convert("RGBA")
    rgba.putalpha(image_module.fromarray(numpy.uint8(numpy.clip(alpha, 0, 1) * 255), mode="L"))
    tilt = bottle_tilt(numpy, alpha)
    if abs(tilt) > CATALOG_MAX_TILT:
        raise BottlePhotoNotDetected("The bottle is too tilted")
    if abs(tilt) >= CATALOG_MIN_TILT:
        rgba = rgba.rotate(tilt, resample=image_module.Resampling.BICUBIC, expand=True)
    box = rgba.getchannel("A").point(lambda value: 255 if value > 20 else 0).getbbox()
    if box is None:
        raise BottlePhotoNotDetected("The AI could not detect a bottle")
    padding = 3
    subject = rgba.crop(
        (
            max(0, box[0] - padding),
            max(0, box[1] - padding),
            min(rgba.width, box[2] + padding),
            min(rgba.height, box[3] + padding),
        )
    )
    # A wine bottle is about three to four times as tall as it is wide.
    if not 2.0 <= subject.height / max(subject.width, 1) <= 7.0:
        raise BottlePhotoNotDetected("The detected bottle outline is not reliable")
    buffer = BytesIO()
    _compose_detail(image_module, subject).save(buffer, format="PNG", optimize=True)
    completed_at = perf_counter()
    return buffer.getvalue(), {
        "prepare_ms": round((prepared_at - started_at) * 1000),
        "inference_ms": round((inferred_at - prepared_at) * 1000),
        "sam_ms": sam_ms,
        "postprocess_ms": round((completed_at - inferred_at) * 1000) - sam_ms,
        "total_ms": round((completed_at - started_at) * 1000),
    }


def _configure_photo_worker() -> None:
    """Configure only the disposable child, before importing native libraries."""
    # only_mask skips PyMatting, so compiling its eager Numba functions is wasted.
    # ONNX inference and mask postprocessing do not use Numba.
    os.environ.setdefault("NUMBA_DISABLE_JIT", "1")
    requested_threads = settings.wine_photo_ai_threads
    if requested_threads and "OMP_NUM_THREADS" not in os.environ:
        available = os.cpu_count() or 1
        affinity = getattr(os, "sched_getaffinity", None)
        if affinity is not None:
            try:
                available = min(available, len(affinity(0)))
            except OSError:
                pass
        os.environ["OMP_NUM_THREADS"] = str(max(1, min(requested_threads, available)))


def _photo_worker_loop(
    model_name: str,
    idle_seconds: int,
    command_queue: Any,
    result_queue: Any,
) -> None:
    """Keep ONNX outside the API process and release it after a short idle period."""
    _configure_photo_worker()
    model_started_at = perf_counter()
    try:
        session = _model_session(model_name)
    except BottlePhotoAiError as error:
        result_queue.put(("error", type(error).__name__, str(error)))
        return
    except Exception:
        result_queue.put(
            ("error", BottlePhotoAiUnavailable.__name__, "AI bottle model initialization failed")
        )
        return
    model_load_ms = round((perf_counter() - model_started_at) * 1000)
    first_processing = True

    while True:
        try:
            command, content = command_queue.get(timeout=idle_seconds)
        except Empty:
            return
        if command == "stop":
            return
        if command == "warm":
            continue
        try:
            if command == "process_catalog":
                image, label_share, label_y = content
                processed, timings = _process_catalog_bottle_photo_with_session(
                    image, session, label_share, label_y
                )
            else:
                processed, timings = _process_bottle_photo_with_session(content, session)
            timings["model_load_ms"] = model_load_ms if first_processing else 0
            timings["threads"] = int(os.environ.get("OMP_NUM_THREADS", "0"))
            first_processing = False
            result_queue.put(("ok", processed, timings))
        except BottlePhotoAiError as error:
            result_queue.put(("error", type(error).__name__, str(error)))
        except Exception:
            result_queue.put(
                ("error", BottlePhotoAiUnavailable.__name__, "AI bottle segmentation failed")
            )


def _close_photo_worker() -> None:
    global _worker_commands, _worker_model, _worker_process, _worker_results
    if _worker_process is not None:
        if _worker_process.is_alive():
            _worker_process.terminate()
        _worker_process.join()
    for worker_queue in (_worker_commands, _worker_results):
        if worker_queue is not None:
            worker_queue.close()
            worker_queue.join_thread()
    _worker_process = None
    _worker_commands = None
    _worker_results = None
    _worker_model = None


def _reap_photo_worker(worker: Any) -> None:
    """Wait for the idle worker in the background so Linux never leaves a zombie."""
    worker.join()


def _ensure_photo_worker(model_name: str, idle_seconds: int) -> tuple[Any, Any]:
    global _worker_commands, _worker_model, _worker_process, _worker_results
    if _worker_process is not None and _worker_process.is_alive() and _worker_model == model_name:
        return _worker_commands, _worker_results

    _close_photo_worker()
    context = get_context("spawn")
    _worker_commands = context.Queue(maxsize=4)
    _worker_results = context.Queue(maxsize=1)
    _worker_process = context.Process(
        target=_photo_worker_loop,
        args=(model_name, idle_seconds, _worker_commands, _worker_results),
        name="vinaris-photo-ai",
    )
    _worker_process.daemon = True
    _worker_process.start()
    Thread(
        target=_reap_photo_worker,
        args=(_worker_process,),
        name="vinaris-photo-ai-reaper",
        daemon=True,
    ).start()
    _worker_model = model_name
    return _worker_commands, _worker_results


def warm_bottle_photo_worker(
    model_name: str, idle_seconds: int = DEFAULT_WORKER_IDLE_SECONDS
) -> None:
    """Start or keep alive the isolated model while the camera dialog is open."""
    with _photo_processing_lock:
        command_queue, _ = _ensure_photo_worker(model_name, idle_seconds)
        command_queue.put(("warm", None))


def _raise_worker_error(error_type: str, message: str) -> NoReturn:
    error_classes: dict[str, type[BottlePhotoAiError]] = {
        BottlePhotoAiUnavailable.__name__: BottlePhotoAiUnavailable,
        BottlePhotoNotDetected.__name__: BottlePhotoNotDetected,
        InvalidBottlePhoto.__name__: InvalidBottlePhoto,
    }
    raise error_classes.get(error_type, BottlePhotoAiUnavailable)(message)


def process_bottle_photo(
    content: bytes,
    model_name: str,
    timeout_seconds: int = DEFAULT_PROCESS_TIMEOUT_SECONDS,
    idle_seconds: int = DEFAULT_WORKER_IDLE_SECONDS,
    *,
    catalog_label_share: float | None = None,
    catalog_label_y: float = 0.5,
) -> bytes:
    """Process a photo in a short-lived reusable worker.

    BiRefNet/ONNX Runtime may retain a multi-gigabyte CPU arena for the lifetime
    of an inference session. The worker confines that memory outside the API,
    reuses the expensive session during photo capture, and exits after idle.
    catalog_label_share (the label's width over the frame's) selects the catalog cutout;
    catalog_label_y is the label's center as a share of the frame's height.
    """
    request_started_at = perf_counter()
    with _photo_processing_lock:
        command_queue, result_queue = _ensure_photo_worker(model_name, idle_seconds)
        if catalog_label_share is None:
            command_queue.put(("process", content))
        else:
            command_queue.put(("process_catalog", (content, catalog_label_share, catalog_label_y)))
            # SAM and the background model run one after the other on the CPU.
            timeout_seconds = max(timeout_seconds, CATALOG_TIMEOUT_SECONDS)
        try:
            result = result_queue.get(timeout=timeout_seconds)
        except Empty as error:
            _close_photo_worker()
            raise BottlePhotoAiUnavailable("AI bottle segmentation timed out") from error

    if result[0] == "ok":
        timings = result[2]
        logger.info(
            "bottle_photo_ai model=%s threads=%s model_load_ms=%s prepare_ms=%s inference_ms=%s "
            "postprocess_ms=%s processing_ms=%s request_ms=%s",
            model_name,
            timings.get("threads", 0),
            timings["model_load_ms"],
            timings["prepare_ms"],
            timings["inference_ms"],
            timings["postprocess_ms"],
            timings["total_ms"],
            round((perf_counter() - request_started_at) * 1000),
        )
        return result[1]
    _raise_worker_error(result[1], result[2])
