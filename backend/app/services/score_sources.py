"""Bounded public-page reads for critic score evidence. Never send user credentials."""

import http.client
import ipaddress
import socket
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


def public_page_text(url: str) -> str:
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
                return ""
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            if port not in {80, 443}:
                return ""
            addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
            ips = [str(address[4][0]) for address in addresses]
            if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
                return ""
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
                        "Accept": "text/html,text/plain",
                    },
                )
                response = connection.getresponse()
                if response.status in {301, 302, 303, 307, 308}:
                    location = response.getheader("Location")
                    if not location:
                        return ""
                    url = urljoin(url, location)
                    continue
                if response.status != 200 or not any(
                    kind in response.getheader("Content-Type", "")
                    for kind in ("text/html", "text/plain")
                ):
                    return ""
                content = response.read(750_001)
                if len(content) > 750_000:
                    return ""
                parser = PageText()
                parser.feed(content.decode("utf-8", errors="replace"))
                return " ".join(" ".join(parser.parts).split())
            finally:
                connection.close()
    except (OSError, ValueError, http.client.HTTPException):
        return ""
    return ""
