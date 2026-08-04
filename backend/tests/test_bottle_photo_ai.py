import pytest

from app.services import bottle_photo_ai


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
