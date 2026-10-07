"""Extract untrusted PDF text in a bounded child process, without executing PDF actions."""

import json
import logging
import subprocess
import sys
from io import BytesIO
from pathlib import Path
from threading import Event, Thread

import psutil

MAX_BYTES = 10_000_000
MAX_TEXT = 500_000
MAX_PAGES = 100


def _extract(content: bytes) -> dict:
    from pypdf import PdfReader, filters

    logging.disable(logging.CRITICAL)
    filters.ZLIB_MAX_OUTPUT_LENGTH = 8_000_000
    filters.LZW_MAX_OUTPUT_LENGTH = 8_000_000
    if not content.startswith(b"%PDF-") or len(content) > MAX_BYTES:
        return {"status": "invalid_document", "text": ""}
    reader = PdfReader(BytesIO(content))
    if reader.is_encrypted:
        return {"status": "encrypted", "text": ""}
    if len(reader.pages) > MAX_PAGES:
        return {"status": "too_large", "text": ""}
    parts = []
    size = 0
    for page in reader.pages:
        contents = page.get_contents()
        if contents is None:
            continue
        if contents and len(contents.get_data()) > 2_000_000:
            return {"status": "too_large", "text": ""}
        # Layout mode keeps multi-column tasting catalogues in reading order.
        text = page.extract_text(extraction_mode="layout") or ""
        size += len(text)
        if size > MAX_TEXT:
            return {"status": "too_large", "text": ""}
        parts.append(text)
    value = "\n".join(parts)
    return {"status": "readable" if value.strip() else "empty", "text": value}


def extract_pdf_document(content: bytes):
    from app.services.score_sources import DocumentText

    if len(content) > MAX_BYTES:
        return DocumentText(status="too_large")
    stopped = Event()
    try:
        with subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve())],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        ) as child:

            def bound_memory():
                try:
                    process = psutil.Process(child.pid)
                    while not stopped.wait(0.05):
                        if process.memory_info().rss > 384_000_000:
                            child.kill()
                            return
                except psutil.Error:
                    return

            monitor = Thread(target=bound_memory, daemon=True)
            monitor.start()
            try:
                output, _ = child.communicate(input=content, timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.communicate()
                return DocumentText(status="timeout")
            finally:
                stopped.set()
                monitor.join(timeout=1)
            if child.returncode or len(output) > MAX_TEXT * 8:
                return DocumentText(status="invalid_document")
            payload = json.loads(output)
            text = payload.get("text", "")
            if not isinstance(text, str) or len(text) > MAX_TEXT:
                return DocumentText(status="invalid_document")
            return DocumentText(text=text, status=payload.get("status", "invalid_document"))
    except (OSError, ValueError):
        return DocumentText(status="invalid_document")


if __name__ == "__main__":
    try:
        result = _extract(sys.stdin.buffer.read(MAX_BYTES + 1))
    except Exception:
        result = {"status": "invalid_document", "text": ""}
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
