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
    background model held 12.5 GB after two cutouts. Without the arena the same runs peak
    at 6.6 GB, return to about 0.5 GB between cutouts, take the same time and produce
    identical masks.
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


# Catalog photos (docs/CATALOG_PHOTO_ENRICHMENT.md): a bottle framed from a shop or
# close-up photo is not centered in the capture guide. Only a bottle standing apart
# from the others, upright and whole, is cut out: telling a bottle from neighbours that
# touch it gave unreliable outlines, so those photos are refused instead.
CATALOG_SOURCE_MAX = (768, 1152)
CATALOG_MAX_TILT = 6.0
CATALOG_MIN_TILT = 0.8
CATALOG_EDGE_PIXELS = 2
# Smoothing of the cutout's outline: blur radius as a share of the frame's width, and
# the steepness of the alpha ramp across the blurred edge.
CATALOG_EDGE_SIGMA = 0.004
CATALOG_EDGE_RAMP = 2.5
# The frame is built on the bottle's height: one bottle's body spans up to this share
# of its width, and no row of it is much wider than the body.
CATALOG_MAX_BODY_SHARE = 0.6
CATALOG_MAX_WIDENING = 1.2


def _row_extents(numpy: Any, mask: Any) -> tuple[Any, Any, Any]:
    """Rows holding the bottle, with its leftmost and rightmost column in each."""
    rows = numpy.nonzero(mask.any(axis=1))[0]
    lefts = numpy.argmax(mask[rows], axis=1)
    rights = mask.shape[1] - 1 - numpy.argmax(mask[rows][:, ::-1], axis=1)
    return rows, lefts, rights


def bottle_tilt(numpy: Any, alpha: Any) -> float:
    """Degrees to rotate the image counterclockwise (PIL) to stand the bottle upright.

    Measured on the body's center line (between its upper and lower halves), which a
    lopsided neck or capsule hardly moves.
    """
    rows, lefts, rights = _row_extents(numpy, alpha > 0.5)
    if len(rows) < 20:
        return 0.0
    span = rows[-1] - rows[0]
    body = (rows >= rows[0] + span * 0.4) & (rows <= rows[0] + span * 0.92)
    body_rows, centers = rows[body], (lefts[body] + rights[body]) / 2
    half = len(body_rows) // 2
    if half < 5:
        return 0.0
    run = float(numpy.median(body_rows[half:]) - numpy.median(body_rows[:half]))
    drift = float(numpy.median(centers[half:]) - numpy.median(centers[:half]))
    return float(numpy.degrees(numpy.arctan2(-drift, run)))


def check_single_bottle(numpy: Any, mask: Any) -> None:
    """Refuse a mask that is not one whole bottle standing apart and upright.

    The background model outlines everything in front of the background: neighbours
    touching the bottle, or a dark bottle lost against a dark shelf, give a mask wider
    than a bottle, cut by the frame, without a neck or leaning.
    """
    height, width = mask.shape
    rows, lefts, rights = _row_extents(numpy, mask)
    if not len(rows):
        raise BottlePhotoNotDetected("The AI could not detect a bottle")
    edge = CATALOG_EDGE_PIXELS
    if (
        rows[0] < edge
        or rows[-1] >= height - edge
        or lefts.min() < edge
        or rights.max() >= width - edge
    ):
        raise BottlePhotoNotDetected("The bottle is cut or touches other bottles")
    span = rows[-1] - rows[0] + 1
    if span < height * 0.5:
        raise BottlePhotoNotDetected("The detected bottle outline is not reliable")
    widths = rights - lefts + 1
    body = float(numpy.median(widths[rows >= rows[0] + span * 0.5]))
    widest = float(numpy.percentile(widths, 98))
    if body > width * CATALOG_MAX_BODY_SHARE or widest > body * CATALOG_MAX_WIDENING:
        raise BottlePhotoNotDetected("The bottle does not stand apart from the others")
    # A neck is a fifth to a half of the body; a spike or a stump is not a bottle.
    top = rows <= rows[0] + span * 0.08
    neck = float(numpy.median(widths[top]))
    if not 0.15 * body <= neck <= 0.75 * body:
        raise BottlePhotoNotDetected("The detected bottle outline is not reliable")
    # A wine bottle is about three to four times as tall as it is wide.
    if not 2.2 <= span / body <= 7.0:
        raise BottlePhotoNotDetected("The detected bottle outline is not reliable")
    tilt = bottle_tilt(numpy, mask)
    if abs(tilt) > CATALOG_MAX_TILT:
        raise BottlePhotoNotDetected("The bottle is not upright")
    # One bottle has one neck, on its body's axis: two bottles outlined together show two
    # necks with a gap between them, or the taller one's neck off to one side.
    filled = numpy.array(
        [
            mask[row, left : right + 1].mean()
            for row, left, right in zip(rows[top], lefts[top], rights[top], strict=True)
        ]
    )
    lower = rows >= rows[0] + span * 0.5
    body_center = float(numpy.median((lefts[lower] + rights[lower]) / 2))
    body_row = float(numpy.median(rows[lower]))
    neck_row = float(numpy.median(rows[top]))
    expected = body_center - numpy.tan(numpy.radians(tilt)) * (neck_row - body_row)
    neck_center = float(numpy.median((lefts[top] + rights[top]) / 2))
    if float(numpy.median(filled)) < 0.85 or abs(neck_center - expected) > 0.2 * body:
        raise BottlePhotoNotDetected("The bottle does not stand apart from the others")


def catalog_bottle_alpha(numpy: Any, scipy_ndimage: Any, model_alpha: Any) -> Any:
    """The alpha of the one bottle standing in a catalog frame, without the capture guide."""
    width = model_alpha.shape[1]
    selected = _central_component(numpy, scipy_ndimage, model_alpha > 0.12)
    # Fill holes (reflections, a dark label) without the row spans of the capture guide,
    # which would add background wedges beside a leaning bottle's neck.
    filled = scipy_ndimage.binary_fill_holes(selected)
    check_single_bottle(numpy, filled)
    # Blurring the silhouette and keeping a short ramp around its outline gives a
    # smooth, feathered edge.
    soft = scipy_ndimage.gaussian_filter(
        filled.astype(numpy.float32), sigma=max(1.5, width * CATALOG_EDGE_SIGMA)
    )
    return numpy.clip((soft - 0.5) * CATALOG_EDGE_RAMP + 0.5, 0.0, 1.0).astype(numpy.float32)


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


def _process_catalog_bottle_photo_with_session(
    content: bytes, session: Any
) -> tuple[bytes, dict[str, int]]:
    """Cut out the bottle framed from a catalog photo, if it stands apart and upright."""
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
    alpha = catalog_bottle_alpha(numpy, scipy_ndimage, model_alpha)

    rgba = source.convert("RGBA")
    rgba.putalpha(image_module.fromarray(numpy.uint8(numpy.clip(alpha, 0, 1) * 255), mode="L"))
    tilt = bottle_tilt(numpy, alpha)
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
    buffer = BytesIO()
    _compose_detail(image_module, subject).save(buffer, format="PNG", optimize=True)
    completed_at = perf_counter()
    return buffer.getvalue(), {
        "prepare_ms": round((prepared_at - started_at) * 1000),
        "inference_ms": round((inferred_at - prepared_at) * 1000),
        "postprocess_ms": round((completed_at - inferred_at) * 1000),
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
            process = (
                _process_catalog_bottle_photo_with_session
                if command == "process_catalog"
                else _process_bottle_photo_with_session
            )
            processed, timings = process(content, session)
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
    catalog: bool = False,
) -> bytes:
    """Process a photo in a short-lived reusable worker.

    BiRefNet/ONNX Runtime may retain a multi-gigabyte CPU arena for the lifetime
    of an inference session. The worker confines that memory outside the API,
    reuses the expensive session during photo capture, and exits after idle.
    catalog selects the cutout of a bottle framed from a catalog photo.
    """
    request_started_at = perf_counter()
    with _photo_processing_lock:
        command_queue, result_queue = _ensure_photo_worker(model_name, idle_seconds)
        command_queue.put(("process_catalog" if catalog else "process", content))
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
