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
    results = _FakeQueue([("ok", b"processed")])
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
        lambda content, active_session: (content, active_session is session),
    )

    bottle_photo_ai._photo_worker_loop("test-model", 75, commands, results)

    assert sessions == ["test-model"]
    assert results.items == [
        ("ok", (b"first", True)),
        ("ok", (b"second", True)),
    ]
