from io import BytesIO

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.services.pdf_sources import extract_pdf_document
from app.services.score_sources import public_page_text, read_public_document


def pdf_bytes(text="Wine 2023. Full-bodied with firm tannins."):
    writer = PdfWriter()
    page = writer.add_blank_page(width=600, height=800)
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
        }
    )
    stream = DecodedStreamObject()
    stream.set_data(f"BT /F1 12 Tf 20 700 Td ({text}) Tj ET".encode("ascii"))
    page[NameObject("/Contents")] = stream
    value = BytesIO()
    writer.write(value)
    return value.getvalue()


def mock_document(monkeypatch, content, content_type="application/pdf", status=200, location=None):
    monkeypatch.setattr(
        "socket.getaddrinfo", lambda *a, **kw: [(2, 1, 6, "", ("93.184.216.34", 443))]
    )

    class Response:
        def __init__(self):
            self.status = status

        def getheader(self, name, default=None):
            return location if name == "Location" else content_type

        def read(self, limit):
            return content[:limit]

    class Connection:
        def __init__(self, *args, **kwargs):
            pass

        def request(self, *args, **kwargs):
            pass

        def getresponse(self):
            return Response()

        def close(self):
            pass

    monkeypatch.setattr("http.client.HTTPSConnection", Connection)


def test_actual_pdf_text_can_be_verified_without_changing_score_reader(monkeypatch):
    mock_document(monkeypatch, pdf_bytes())
    result = read_public_document("https://producer.example/sheet.pdf", allow_pdf=True)
    assert result.status == "readable" and "Full-bodied with firm tannins" in result.text
    assert result.content_type == "application/pdf" and result.http_status == 200
    assert public_page_text("https://producer.example/sheet.pdf") == ""


@pytest.mark.parametrize("content", [b"not a PDF", b"%PDF-1.7\ninvalid"])
def test_malformed_pdf_does_not_produce_evidence(content):
    result = extract_pdf_document(content)
    assert result.status == "invalid_document" and not result.text


def test_image_or_blank_pdf_is_not_verified():
    writer = PdfWriter()
    writer.add_blank_page(width=600, height=800)
    stream = BytesIO()
    writer.write(stream)
    assert extract_pdf_document(stream.getvalue()).status == "empty"


def test_encrypted_pdf_is_not_verified():
    writer = PdfWriter()
    writer.add_blank_page(width=600, height=800)
    writer.encrypt("password")
    stream = BytesIO()
    writer.write(stream)
    assert extract_pdf_document(stream.getvalue()).status == "encrypted"


def test_pdf_served_as_binary_can_be_read(monkeypatch):
    mock_document(monkeypatch, pdf_bytes(), "application/octet-stream")
    assert (
        read_public_document("https://producer.example/getFile?id=29", allow_pdf=True).status
        == "readable"
    )


def test_large_pdf_is_rejected_without_parsing():
    assert extract_pdf_document(b"x" * 10_000_001).status == "too_large"
    writer = PdfWriter()
    for _ in range(101):
        writer.add_blank_page(width=600, height=800)
    stream = BytesIO()
    writer.write(stream)
    assert extract_pdf_document(stream.getvalue()).status == "too_large"


def test_forbidden_source_is_distinct_from_malformed_document(monkeypatch):
    mock_document(monkeypatch, b"Forbidden", "text/html", status=403)
    result = read_public_document("https://critic.example/review", allow_pdf=True)
    assert result.status == "unavailable" and result.http_status == 403 and not result.text


def test_redirect_to_private_address_remains_blocked(monkeypatch):
    mock_document(monkeypatch, b"", status=302, location="https://internal.example/sheet.pdf")
    monkeypatch.setattr(
        "socket.getaddrinfo",
        lambda host, *a, **kw: [
            (2, 1, 6, "", ("127.0.0.1" if host == "internal.example" else "93.184.216.34", 443))
        ],
    )
    assert (
        read_public_document("https://producer.example/sheet", allow_pdf=True).status == "blocked"
    )


def test_mixed_public_private_dns_is_blocked(monkeypatch):
    monkeypatch.setattr(
        "socket.getaddrinfo",
        lambda *a, **kw: [(2, 1, 6, "", (ip, 443)) for ip in ("93.184.216.34", "127.0.0.1")],
    )
    assert (
        read_public_document("https://producer.example/sheet", allow_pdf=True).status == "blocked"
    )


def test_html_encoding_and_size_limits(monkeypatch):
    mock_document(
        monkeypatch,
        "<p>Frisk syra, fyllig och torr.</p>".encode("latin-1"),
        "text/html; charset=iso-8859-1",
    )
    assert (
        "Frisk syra" in read_public_document("https://critic.example/review", allow_pdf=True).text
    )
    mock_document(monkeypatch, b"a" * 2_000_001, "text/html")
    assert (
        read_public_document("https://critic.example/review", allow_pdf=True).status == "too_large"
    )
