from threading import Barrier

from app.services.score_sources import DocumentText
from app.services.sensory_documents import prefetch_source_documents, readable_source_passages


def test_reader_failure_preserves_other_documents():
    urls = ["https://producer.example/a", "https://critic.example/b"]

    def reader(url, **kwargs):
        if url == urls[0]:
            raise RuntimeError("unavailable")
        return DocumentText(text="Full-bodied", status="readable")

    cache = {}
    prefetch_source_documents(
        {"evidence": [{"source_url": url} for url in urls]}, dict.fromkeys(urls), cache, reader
    )
    assert cache[urls[0]].status == "unavailable"
    assert cache[urls[1]].text == "Full-bodied"


def test_documents_from_different_hosts_overlap_and_are_cached():
    urls = ["https://producer.example/a", "https://critic.example/b"]
    barrier = Barrier(2)
    calls = []

    def reader(url, **kwargs):
        calls.append(url)
        barrier.wait(timeout=3)
        return DocumentText(text="Tasting notes", status="readable")

    cache = {}
    payload = {"evidence": [{"source_url": url} for url in urls]}
    prefetch_source_documents(payload, dict.fromkeys(urls), cache, reader)
    prefetch_source_documents(payload, dict.fromkeys(urls), cache, reader)
    assert set(calls) == set(urls) and len(calls) == 2 and len(cache) == 2


def test_host_challenge_stops_duplicate_attempts_and_uncited_urls_are_not_fetched():
    urls = ["https://blocked.example/a", "https://blocked.example/b"]
    calls = []

    def reader(url, **kwargs):
        calls.append(url)
        return DocumentText(status="cloudflare_challenge", http_status=403)

    payload = [
        {"source_url": url} for url in [*urls, "https://uncited.example/a", "http://127.0.0.1/a"]
    ]
    cache = {}
    prefetch_source_documents({"evidence": payload}, dict.fromkeys(urls), cache, reader)
    assert calls == urls[:1]
    assert cache[urls[1]].status == "host_blocked"


def test_document_count_and_feedback_text_are_bounded():
    urls = [f"https://producer.example/{i}" for i in range(20)]
    cache = {}
    prefetch_source_documents(
        {"evidence": [{"source_url": url} for url in urls]},
        dict.fromkeys(urls),
        cache,
        lambda *args, **kwargs: DocumentText(
            text="Header " + "x" * 10000 + " Tasting notes for Target wine: full body.",
            status="readable",
        ),
    )
    assert len(cache) == 12
    passages = readable_source_passages(cache, "Target wine")
    assert len(passages) == 3 and sum(len(item["text"]) for item in passages) <= 18000
    assert all("Target wine" in item["text"] for item in passages)
    assert readable_source_passages({"url": DocumentText(status="unavailable")}, "Wine") == []
