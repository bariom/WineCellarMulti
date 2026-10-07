"""Bounded reuse of public documents already selected by the research agent."""

import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from app.services.score_sources import DocumentText


def prefetch_source_documents(payload: dict, sources: dict, cache: dict, reader) -> None:
    from app.services.sensory_agent import public_source_url

    selected: dict[str, list[str]] = {}
    pending: set[str] = set()

    def collect(value):
        if isinstance(value, dict):
            url = public_source_url(str(value.get("source_url", "")))
            if (
                url in sources
                and url not in cache
                and url not in pending
                and len(cache) + len(pending) < 12
            ):
                pending.add(url)
                selected.setdefault(urlsplit(url).netloc, []).append(url)
            for item in value.values():
                collect(item)
        elif isinstance(value, list):
            for item in value:
                collect(item)

    collect(payload)
    blocked_hosts = {
        urlsplit(url).netloc
        for url, doc in cache.items()
        if doc.status in {"cloudflare_challenge", "host_blocked"} or doc.http_status == 429
    }

    def read_host(urls):
        documents = {}
        blocked = urlsplit(urls[0]).netloc in blocked_hosts
        for url in urls:
            if blocked:
                documents[url] = DocumentText(status="host_blocked")
                continue
            try:
                document = reader(url, allow_pdf=True)
            except Exception:
                # A single unavailable document must not discard paid research.
                document = DocumentText(status="unavailable")
            documents[url] = document
            blocked = document.status == "cloudflare_challenge" or document.http_status == 429
        return documents

    # Serialize reads to a host; overlap independent hosts only.
    with ThreadPoolExecutor(max_workers=3, thread_name_prefix="sensory-source") as executor:
        for documents in executor.map(read_host, selected.values()):
            cache.update(documents)


def readable_source_passages(cache: dict, wine_name: str) -> list[dict[str, str]]:
    """Give the completion actual retrieved text, with hard per-source/total limits."""
    documents = []
    for url, document in cache.items():
        if document.status != "readable" or not document.text.strip():
            continue
        text = document.text
        if len(text) > 6000:
            # Keep headings and passages near the requested wine and tasting sections.
            terms = [re.escape(wine_name)] if wine_name.strip() else []
            terms += [r"tasting", r"degust", r"sensor", r"palate", r"palato", r"tannin", r"acidit"]
            spans = [(0, 1000)]
            for match in re.finditer("|".join(terms), text, re.IGNORECASE):
                spans.append((max(0, match.start() - 300), min(len(text), match.start() + 1400)))
                if len(spans) >= 7:
                    break
            merged = []
            for start, end in sorted(spans):
                if merged and start <= merged[-1][1]:
                    merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
                else:
                    merged.append((start, end))
            text = "\n[separate source passage]\n".join(text[start:end] for start, end in merged)
        documents.append({"url": url, "text": text[:6000]})
        if len(documents) == 3:
            break
    return documents
