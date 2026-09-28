import os

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
