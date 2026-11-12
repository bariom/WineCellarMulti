import os
import subprocess
import sys

import pytest

from app.services import bottle_photo_ai


@pytest.fixture(autouse=True)
def worker_environment(monkeypatch):
    # Worker-loop tests execute in this process; restore child-only settings.
    monkeypatch.delenv("NUMBA_DISABLE_JIT", raising=False)
    monkeypatch.delenv("OMP_NUM_THREADS", raising=False)
    monkeypatch.setattr(bottle_photo_ai.settings, "wine_photo_ai_threads", 4)


@pytest.mark.parametrize(
    "cpus,affinity,expected",
    [(12, {0, 1, 2, 3, 4, 5}, "4"), (2, {0, 1}, "2"), (12, {3}, "1"), (None, {0}, "1")],
)
def test_worker_thread_cap_respects_available_cpus(monkeypatch, cpus, affinity, expected):
    monkeypatch.setattr(os, "cpu_count", lambda: cpus)
    monkeypatch.setattr(os, "sched_getaffinity", lambda pid: affinity, raising=False)
    bottle_photo_ai._configure_photo_worker()
    assert os.environ["OMP_NUM_THREADS"] == expected
    assert os.environ["NUMBA_DISABLE_JIT"] == "1"


def test_worker_keeps_explicit_thread_override(monkeypatch):
    monkeypatch.setenv("OMP_NUM_THREADS", "2")
    bottle_photo_ai._configure_photo_worker()
    assert os.environ["OMP_NUM_THREADS"] == "2"


def test_worker_can_use_onnx_automatic_threads(monkeypatch):
    monkeypatch.setattr(bottle_photo_ai.settings, "wine_photo_ai_threads", 0)
    bottle_photo_ai._configure_photo_worker()
    assert "OMP_NUM_THREADS" not in os.environ


def test_worker_uses_cpu_count_when_affinity_is_unavailable(monkeypatch):
    monkeypatch.setattr(os, "cpu_count", lambda: 2)

    def unavailable(pid):
        raise OSError("unavailable")

    monkeypatch.setattr(os, "sched_getaffinity", unavailable, raising=False)
    bottle_photo_ai._configure_photo_worker()
    assert os.environ["OMP_NUM_THREADS"] == "2"


class _FakeQueue:
    def __init__(self, items=None):
        self.items = list(items or [])

    def put(self, item):
        self.items.append(item)

    def get(self, timeout):
        del timeout
        return self.items.pop(0)

    def close(self):
        pass

    def join_thread(self):
        pass


def test_photo_ai_reuses_isolated_worker(monkeypatch):
    commands = _FakeQueue()
    results = _FakeQueue(
        [
            (
                "ok",
                b"processed",
                {
                    "prepare_ms": 1,
                    "inference_ms": 2,
                    "postprocess_ms": 3,
                    "total_ms": 6,
                    "model_load_ms": 0,
                },
            )
        ]
    )
    monkeypatch.setattr(
        bottle_photo_ai,
        "_ensure_photo_worker",
        lambda model, idle: (commands, results),
    )

    processed = bottle_photo_ai.process_bottle_photo(b"image", "test-model", 12, 75)

    assert processed == b"processed"
    assert commands.items == [("process", b"image")]


def test_photo_timings_are_visible_with_uvicorn_logging_and_warning_root():
    # Exercise the real server configuration in isolation, without changing
    # pytest's logging or invoking/downloading the segmentation model.
    script = """
import logging
import logging.config
from queue import Queue
from unittest.mock import patch
from uvicorn.config import LOGGING_CONFIG
from app.services import bottle_photo_ai

logging.getLogger().setLevel(logging.WARNING)
logging.config.dictConfig(LOGGING_CONFIG)
commands, results = Queue(), Queue()
results.put(("ok", b"processed", {
    "prepare_ms": 1, "inference_ms": 2, "postprocess_ms": 3,
    "total_ms": 6, "model_load_ms": 4, "threads": 4,
}))
with patch.object(bottle_photo_ai, "_ensure_photo_worker", return_value=(commands, results)):
    assert bottle_photo_ai.process_bottle_photo(b"private image", "test-model") == b"processed"
"""
    result = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, check=True, timeout=20
    )
    message = result.stderr
    assert "bottle_photo_ai model=test-model threads=4" in message
    assert "model_load_ms=4 prepare_ms=1 inference_ms=2 postprocess_ms=3" in message
    assert "processing_ms=6 request_ms=" in message
    assert "private image" not in message


def test_photo_ai_reaper_waits_for_worker_exit():
    joins = []

    class Worker:
        def join(self):
            joins.append(True)

    bottle_photo_ai._reap_photo_worker(Worker())

    assert joins == [True]


def test_photo_ai_worker_loads_model_once_for_capture_session(monkeypatch):
    monkeypatch.delenv("NUMBA_DISABLE_JIT", raising=False)
    commands = _FakeQueue(
        [
            ("warm", None),
            ("process", b"first"),
            ("process", b"second"),
            ("stop", None),
        ]
    )
    results = _FakeQueue()
    session = object()
    sessions = []

    def load_session(model):
        assert os.environ["NUMBA_DISABLE_JIT"] == "1"
        assert int(os.environ["OMP_NUM_THREADS"]) <= 4
        sessions.append(model)
        return session

    monkeypatch.setattr(bottle_photo_ai, "_model_session", load_session)
    monkeypatch.setattr(
        bottle_photo_ai,
        "_process_bottle_photo_with_session",
        lambda content, active_session: (
            content,
            {
                "prepare_ms": 1,
                "inference_ms": 2,
                "postprocess_ms": 3,
                "total_ms": 6,
                "session_matches": active_session is session,
            },
        ),
    )

    bottle_photo_ai._photo_worker_loop("test-model", 75, commands, results)

    assert sessions == ["test-model"]
    assert [result[:2] for result in results.items] == [
        ("ok", b"first"),
        ("ok", b"second"),
    ]
    assert all(result[2]["session_matches"] for result in results.items)
    assert results.items[0][2]["model_load_ms"] >= 0
    assert results.items[1][2]["model_load_ms"] == 0


def test_photo_worker_respects_explicit_jit_setting(monkeypatch):
    monkeypatch.setenv("NUMBA_DISABLE_JIT", "0")
    monkeypatch.setattr(bottle_photo_ai, "_model_session", lambda model: object())
    bottle_photo_ai._photo_worker_loop("test", 75, _FakeQueue([("stop", None)]), _FakeQueue())
    assert os.environ["NUMBA_DISABLE_JIT"] == "0"


def test_central_component_keeps_the_same_four_connected_scoring():
    numpy = pytest.importorskip("numpy")
    scipy_ndimage = pytest.importorskip("scipy.ndimage")
    binary = numpy.zeros((8, 10), dtype=numpy.bool_)
    binary[1:4, 0:3] = True
    binary[2:6, 5:7] = True

    selected = bottle_photo_ai._central_component(numpy, scipy_ndimage, binary)

    assert selected.sum() == 8
    assert selected[3, 5]
    assert not selected[2, 1]


def _tilted_bottle_frame(tilt: float, *, top: int = 80, bottom: int = 1000) -> object:
    """A dark bottle on a light wall, rotated by tilt degrees (PIL, counterclockwise)."""
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (720, 1080), (235, 230, 220))
    draw = ImageDraw.Draw(image)
    draw.rectangle((320, top, 400, top + 200), fill=(150, 20, 20))
    draw.rectangle((270, top + 200, 450, bottom), fill=(25, 30, 25))
    draw.rectangle((280, top + 450, 440, top + 700), fill=(20, 20, 20))
    return image.rotate(tilt, resample=Image.Resampling.BICUBIC, fillcolor=(235, 230, 220))


class _FakeRembg:
    """Stands in for rembg: the mask is every pixel darker than the wall."""

    @staticmethod
    def remove(source, **kwargs):
        assert kwargs["only_mask"] is True
        return source.convert("L").point(lambda value: 255 if value < 200 else 0)


def _catalog_cutout(monkeypatch, image) -> object:
    from io import BytesIO

    import numpy
    from PIL import Image, ImageOps
    from scipy import ndimage

    monkeypatch.setattr(
        bottle_photo_ai, "_vision_modules", lambda: (numpy, Image, ImageOps, _FakeRembg, ndimage)
    )
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=95)
    content, _ = bottle_photo_ai._process_catalog_bottle_photo_with_session(buffer.getvalue(), None)
    return Image.open(BytesIO(content))


@pytest.mark.parametrize("tilt", [0.0, 4.0, -5.0])
def test_catalog_cutout_stands_a_slightly_leaning_bottle_upright(monkeypatch, tilt):
    pytest.importorskip("numpy")
    pytest.importorskip("scipy.ndimage")
    import numpy

    output = _catalog_cutout(monkeypatch, _tilted_bottle_frame(tilt))
    assert output.size == bottle_photo_ai.DETAIL_SIZE and output.mode == "RGBA"
    alpha = numpy.asarray(output.getchannel("A"), dtype=numpy.float32) / 255
    assert abs(bottle_photo_ai.bottle_tilt(numpy, alpha)) < 1.5
    rows, columns = numpy.nonzero(alpha > 0.5)
    # The whole bottle is kept: as tall as the canvas allows and about a third as wide.
    assert rows.max() - rows.min() > 600
    assert 4 < (rows.max() - rows.min()) / (columns.max() - columns.min()) < 6  # drawn 920x180


def test_catalog_cutout_measures_the_tilt_it_must_undo():
    pytest.importorskip("numpy")
    import numpy

    for tilt in (12.0, -7.0):
        mask = (
            _tilted_bottle_frame(tilt).convert("L").point(lambda value: 255 if value < 200 else 0)
        )
        alpha = numpy.asarray(mask, dtype=numpy.float32) / 255
        assert abs(bottle_photo_ai.bottle_tilt(numpy, alpha) + tilt) < 1.5


def test_catalog_cutout_refuses_a_bottle_cut_by_the_frame(monkeypatch):
    pytest.importorskip("numpy")
    pytest.importorskip("scipy.ndimage")
    with pytest.raises(bottle_photo_ai.BottlePhotoNotDetected):
        _catalog_cutout(monkeypatch, _tilted_bottle_frame(0.0, bottom=1080))


def _bottles(*lefts: int) -> object:
    """Dark bottles (body 180 px, neck 50 px) on a light wall, at the given left edges."""
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (720, 1080), (235, 230, 220))
    draw = ImageDraw.Draw(image)
    for left in lefts:
        draw.rectangle((left + 65, 80, left + 115, 300), fill=(150, 20, 20))
        draw.rectangle((left, 300, left + 180, 1000), fill=(25, 30, 25))
    return image


def test_catalog_cutout_refuses_bottles_that_touch(monkeypatch):
    pytest.importorskip("numpy")
    pytest.importorskip("scipy.ndimage")
    # Side by side on a shelf, the model outlines both as one object: no photo is kept
    # rather than a bottle with a piece of its neighbour.
    with pytest.raises(bottle_photo_ai.BottlePhotoNotDetected, match="stand apart"):
        _catalog_cutout(monkeypatch, _bottles(270, 448))
    # A shorter neighbour pressed against it leaves the neck off the pair's axis.
    from PIL import ImageDraw

    pair = _bottles(270)
    ImageDraw.Draw(pair).rectangle((448, 500, 628, 1000), fill=(30, 25, 25))
    with pytest.raises(bottle_photo_ai.BottlePhotoNotDetected):
        _catalog_cutout(monkeypatch, pair)


def test_catalog_cutout_takes_the_bottle_standing_apart_at_the_center(monkeypatch):
    numpy = pytest.importorskip("numpy")
    pytest.importorskip("scipy.ndimage")
    output = _catalog_cutout(monkeypatch, _bottles(270, 20))
    alpha = numpy.asarray(output.getchannel("A"), dtype=numpy.float32) / 255
    rows, columns = numpy.nonzero(alpha > 0.5)
    # One bottle, capsule to base, centered: the one standing apart beside it is left out.
    assert 4.5 < (rows.max() - rows.min()) / (columns.max() - columns.min()) < 5.6
    assert abs((columns.min() + columns.max()) / 2 - 240) < 3


def test_catalog_cutout_refuses_a_leaning_bottle_or_one_without_a_neck(monkeypatch):
    pytest.importorskip("numpy")
    pytest.importorskip("scipy.ndimage")
    with pytest.raises(bottle_photo_ai.BottlePhotoNotDetected, match="upright"):
        _catalog_cutout(monkeypatch, _tilted_bottle_frame(12.0))
    from PIL import Image, ImageDraw

    stump = Image.new("RGB", (720, 1080), (235, 230, 220))
    ImageDraw.Draw(stump).rectangle((270, 300, 450, 1000), fill=(25, 30, 25))
    with pytest.raises(bottle_photo_ai.BottlePhotoNotDetected, match="not reliable"):
        _catalog_cutout(monkeypatch, stump)


def test_segmentation_sessions_run_without_the_onnx_cpu_memory_arena(monkeypatch):
    pytest.importorskip("onnxruntime")
    created = []

    class Rembg:
        @staticmethod
        def new_session(model_name, *args, sess_opts=None, **kwargs):
            created.append((model_name, sess_opts))
            return "session"

    monkeypatch.setattr(bottle_photo_ai, "_vision_modules", lambda: (None, None, None, Rembg, None))
    assert bottle_photo_ai._model_session("birefnet-general-lite") == "session"
    assert created[0][0] == "birefnet-general-lite"
    # The arena never returns memory and grows on the next run: 12.5 GB instead of 6.6.
    assert created[0][1].enable_cpu_mem_arena is False

    monkeypatch.setattr(bottle_photo_ai.settings, "wine_photo_ai_cpu_mem_arena", True)
    bottle_photo_ai._model_session("sam")
    assert created[1] == ("sam", None)


def test_an_older_rembg_without_session_options_still_loads_the_model(monkeypatch):
    created = []

    class OldRembg:
        @staticmethod
        def new_session(model_name, providers=None):
            created.append(model_name)
            return "session"

    monkeypatch.setattr(
        bottle_photo_ai, "_vision_modules", lambda: (None, None, None, OldRembg, None)
    )
    assert bottle_photo_ai._model_session("birefnet-general-lite") == "session"
    assert created == ["birefnet-general-lite"]


def test_catalog_cutout_of_a_small_frame_has_smooth_feathered_edges(monkeypatch):
    numpy = pytest.importorskip("numpy")
    pytest.importorskip("scipy.ndimage")
    # A bottle 300 px tall in the photo: its frame is enlarged before the outline is
    # found, so the edge is not a small mask blown up into steps.
    small = _tilted_bottle_frame(0.0).resize((240, 360))
    output = _catalog_cutout(monkeypatch, small)
    alpha = numpy.asarray(output.getchannel("A"), dtype=numpy.float32) / 255
    body = alpha[420:600]
    # Every row of the body fades in over a few pixels instead of jumping from 0 to 1...
    partial = ((body > 0.05) & (body < 0.95)).sum(axis=1)
    assert partial.min() >= 2 and partial.max() <= 16
    # ...and the straight side of the bottle stays straight, without steps.
    left_edges = numpy.argmax(body > 0.5, axis=1)
    assert left_edges.max() - left_edges.min() <= 1
