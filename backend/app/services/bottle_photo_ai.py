from __future__ import annotations

from collections import deque
from importlib import import_module
from io import BytesIO
from multiprocessing import get_context
from queue import Empty
from threading import Lock
from typing import Any, NoReturn

DETAIL_SIZE = (480, 720)
_photo_processing_lock = Lock()
DEFAULT_PROCESS_TIMEOUT_SECONDS = 90
DEFAULT_WORKER_IDLE_SECONDS = 75
_worker_process: Any | None = None
_worker_commands: Any | None = None
_worker_results: Any | None = None
_worker_model: str | None = None


class BottlePhotoAiError(RuntimeError):
    pass


class BottlePhotoAiUnavailable(BottlePhotoAiError):
    pass


class BottlePhotoNotDetected(BottlePhotoAiError):
    pass


class InvalidBottlePhoto(BottlePhotoAiError):
    pass


def _vision_modules() -> tuple[Any, Any, Any, Any]:
    try:
        numpy = import_module("numpy")
        image_module = import_module("PIL.Image")
        image_ops = import_module("PIL.ImageOps")
        rembg = import_module("rembg")
    except ImportError as error:
        raise BottlePhotoAiUnavailable("AI bottle photo processing is not installed") from error
    return numpy, image_module, image_ops, rembg


def _model_session(model_name: str) -> Any:
    _, _, _, rembg = _vision_modules()
    try:
        return rembg.new_session(model_name)
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


def _central_component(numpy: Any, binary: Any) -> Any:
    height, width = binary.shape
    visited = numpy.zeros((height, width), dtype=numpy.bool_)
    best_component: list[tuple[int, int]] = []
    best_score = 0
    center = width / 2
    for flat_index in numpy.flatnonzero(binary):
        y, x = divmod(int(flat_index), width)
        if visited[y, x]:
            continue
        queue: deque[tuple[int, int]] = deque([(y, x)])
        visited[y, x] = True
        component: list[tuple[int, int]] = []
        central_pixels = 0
        while queue:
            current_y, current_x = queue.popleft()
            component.append((current_y, current_x))
            if abs(current_x - center) < width * 0.06:
                central_pixels += 1
            for next_y, next_x in (
                (current_y - 1, current_x),
                (current_y + 1, current_x),
                (current_y, current_x - 1),
                (current_y, current_x + 1),
            ):
                if (
                    0 <= next_y < height
                    and 0 <= next_x < width
                    and binary[next_y, next_x]
                    and not visited[next_y, next_x]
                ):
                    visited[next_y, next_x] = True
                    queue.append((next_y, next_x))
        score = len(component) + central_pixels * 5
        if score > best_score:
            best_score = score
            best_component = component
    selected = numpy.zeros((height, width), dtype=numpy.bool_)
    for y, x in best_component:
        selected[y, x] = True
    return selected


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


def _process_bottle_photo_with_session(content: bytes, session: Any) -> bytes:
    numpy, image_module, image_ops, rembg = _vision_modules()
    try:
        source = image_module.open(BytesIO(content))
        source.load()
        source = image_ops.exif_transpose(source).convert("RGB")
    except Exception as error:
        raise InvalidBottlePhoto("Unsupported or invalid bottle photo") from error
    if source.width < 240 or source.height < 360 or source.width * source.height > 40_000_000:
        raise InvalidBottlePhoto("Bottle photo dimensions are not supported")

    source = _center_crop(source).resize(DETAIL_SIZE, image_module.Resampling.LANCZOS)
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
    if isinstance(mask_result, bytes):
        mask_result = image_module.open(BytesIO(mask_result))
    mask = mask_result.convert("L").resize(DETAIL_SIZE, image_module.Resampling.LANCZOS)
    model_alpha = numpy.asarray(mask, dtype=numpy.float32) / 255
    guided_alpha = model_alpha * _guide_mask(numpy, *DETAIL_SIZE)
    selected = _central_component(numpy, guided_alpha > 0.12)
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
    return buffer.getvalue()


def _photo_worker_loop(
    model_name: str,
    idle_seconds: int,
    command_queue: Any,
    result_queue: Any,
) -> None:
    """Keep ONNX outside the API process and release it after a short idle period."""
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
            result_queue.put(("ok", _process_bottle_photo_with_session(content, session)))
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


def _ensure_photo_worker(model_name: str, idle_seconds: int) -> tuple[Any, Any]:
    global _worker_commands, _worker_model, _worker_process, _worker_results
    if (
        _worker_process is not None
        and _worker_process.is_alive()
        and _worker_model == model_name
    ):
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
) -> bytes:
    """Process a photo in a short-lived reusable worker.

    BiRefNet/ONNX Runtime may retain a multi-gigabyte CPU arena for the lifetime
    of an inference session. The worker confines that memory outside the API,
    reuses the expensive session during photo capture, and exits after idle.
    """
    with _photo_processing_lock:
        command_queue, result_queue = _ensure_photo_worker(model_name, idle_seconds)
        command_queue.put(("process", content))
        try:
            result = result_queue.get(timeout=timeout_seconds)
        except Empty as error:
            _close_photo_worker()
            raise BottlePhotoAiUnavailable("AI bottle segmentation timed out") from error

    if result[0] == "ok":
        return result[1]
    _raise_worker_error(result[1], result[2])
