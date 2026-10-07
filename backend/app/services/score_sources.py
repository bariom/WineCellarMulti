"""Bounded public-page reads for critic score evidence. Never send user credentials."""

import http.client
import ipaddress
import socket
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any, cast
from urllib.parse import urljoin, urlsplit


class PageText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


@dataclass(frozen=True)
class DocumentText:
    text: str = ""
    status: str = "unavailable"
    content_type: str = ""
    http_status: int | None = None


def read_public_document(url: str, *, allow_pdf: bool = False) -> DocumentText:
    """Pin each connection to a checked public IP, including every redirect."""
    try:
        for _ in range(3):
            parsed = urlsplit(url)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
            ):
                return DocumentText(status="blocked")
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            if port not in {80, 443}:
                return DocumentText(status="blocked")
            addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
            ips = [str(address[4][0]) for address in addresses]
            if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
                return DocumentText(status="blocked")
            connection_type = (
                http.client.HTTPSConnection
                if parsed.scheme == "https"
                else http.client.HTTPConnection
            )
            connection = connection_type(parsed.hostname, port, timeout=5)

            # Keep the original hostname for Host/TLS verification while avoiding DNS rebinding.
            def connect_public(address, timeout, source_address, ip=ips[0], target_port=port):
                return socket.create_connection((ip, target_port), timeout, source_address)

            cast(Any, connection)._create_connection = connect_public
            try:
                connection.request(
                    "GET",
                    (parsed.path or "/") + (f"?{parsed.query}" if parsed.query else ""),
                    headers={
                        "User-Agent": "Vinaris-ScoreVerification/1.0",
                        "Accept": "text/html,text/plain,application/pdf"
                        if allow_pdf
                        else "text/html,text/plain",
                    },
                )
                response = connection.getresponse()
                if response.status in {301, 302, 303, 307, 308}:
                    location = response.getheader("Location")
                    if not location:
                        return DocumentText(http_status=response.status)
                    url = urljoin(url, location)
                    continue
                content_type = response.getheader("Content-Type", "").lower()
                if response.getheader("cf-mitigated", "").lower() == "challenge":
                    return DocumentText(
                        status="cloudflare_challenge",
                        content_type=content_type,
                        http_status=response.status,
                    )
                if response.status != 200:
                    return DocumentText(content_type=content_type, http_status=response.status)
                pdf = "application/pdf" in content_type or (
                    allow_pdf and content_type.split(";", 1)[0] == "application/octet-stream"
                )
                if not (
                    any(kind in content_type for kind in ("text/html", "text/plain"))
                    or allow_pdf
                    and pdf
                ):
                    return DocumentText(
                        status="unsupported", content_type=content_type, http_status=200
                    )
                limit = (10_000_000 if pdf else 2_000_000) if allow_pdf else 750_000
                content = response.read(limit + 1)
                if len(content) > limit:
                    return DocumentText(
                        status="too_large", content_type=content_type, http_status=200
                    )
                if pdf:
                    from app.services.pdf_sources import extract_pdf_document

                    extracted = extract_pdf_document(content)
                    return DocumentText(
                        text=extracted.text,
                        status=extracted.status,
                        content_type=content_type,
                        http_status=200,
                    )
                parser = PageText()
                charset = "utf-8"
                if "charset=" in content_type:
                    charset = content_type.split("charset=", 1)[1].split(";", 1)[0].strip(' "')
                try:
                    decoded = content.decode(charset, errors="replace")
                except LookupError:
                    decoded = content.decode("utf-8", errors="replace")
                lowered = decoded.lower()
                if "/cdn-cgi/challenge-platform" in lowered and any(
                    marker in lowered
                    for marker in (
                        "<title>just a moment",
                        "performing security verification",
                        "verify you are human",
                    )
                ):
                    return DocumentText(
                        status="cloudflare_challenge",
                        content_type=content_type,
                        http_status=200,
                    )
                parser.feed(decoded)
                value = " ".join(" ".join(parser.parts).split())
                return DocumentText(
                    text=value,
                    status="readable" if value else "empty",
                    content_type=content_type,
                    http_status=200,
                )
            finally:
                connection.close()
    except (OSError, ValueError, http.client.HTTPException):
        return DocumentText()
    return DocumentText()


def public_page_text(url: str) -> str:
    """Keep the critic-score reader's HTML-only contract and size limit."""
    return read_public_document(url).text
