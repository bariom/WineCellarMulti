from app.services import bottle_photo_ai


class _FakeQueue:
    def __init__(self):
        self.items = []

    def put(self, item):
        self.items.append(item)

    def get(self, timeout):
        del timeout
        return self.items.pop(0)

    def close(self):
        pass

    def join_thread(self):
        pass


class _FakeProcess:
    def __init__(self, target, args, name):
        self.target = target
        self.args = args
        self.name = name

    def start(self):
        self.target(*self.args)

    def is_alive(self):
        return False

    def join(self, timeout=None):
        del timeout

    def terminate(self):
        raise AssertionError("a successful worker must not be terminated")


class _FakeContext:
    def Queue(self, maxsize):
        assert maxsize == 1
        return _FakeQueue()

    def Process(self, *, target, args, name):
        return _FakeProcess(target, args, name)


def test_photo_ai_uses_disposable_worker(monkeypatch):
    monkeypatch.setattr(bottle_photo_ai, "get_context", lambda method: _FakeContext())
    monkeypatch.setattr(
        bottle_photo_ai,
        "_process_bottle_photo_in_worker",
        lambda content, model: b"processed:" + content + model.encode(),
    )

    processed = bottle_photo_ai.process_bottle_photo(b"image", "test-model", 12)
    assert processed == b"processed:imagetest-model"
