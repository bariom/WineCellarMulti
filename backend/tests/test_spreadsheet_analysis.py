"""Column, kind and layout recognition of the generic spreadsheet import."""

from __future__ import annotations

import io
from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from spreadsheet_fixtures import ALL_SHAPES, build_xls, build_xlsx
from test_auth_and_wines import register
from test_auth_and_wines import setup_function as setup_function  # noqa: F401
from test_auth_and_wines import teardown_function as teardown_function  # noqa: F401

from app.main import app
from app.schemas.spreadsheet_import import SpreadsheetAnalysis, SpreadsheetTableAnalysis
from app.services.spreadsheet_import.analysis import analyze_workbook
from app.services.spreadsheet_import.reader import read_workbook
from app.services.spreadsheet_import.tables import extract_tables
from app.services.spreadsheet_import.values import (
    parse_drink_window,
    parse_verbal_rating,
    parse_yes_no,
)


def analyze(shape: str) -> SpreadsheetAnalysis:
    return analyze_workbook(read_workbook(build_xlsx(ALL_SHAPES[shape]()), "file.xlsx"))


def fields(table: SpreadsheetTableAnalysis) -> dict[str, str]:
    return {column.header: column.field for column in table.columns}


# Per shape: (sheets, kind) of each table, and the fields expected on its columns.
EXPECTED: dict[str, list[tuple[list[str], str, dict[str, str]]]] = {
    "personal_cellar": [
        (
            ["I miei vini"],
            "inventory",
            {
                "Vino": "name",
                "Annata": "vintage",
                "Quante bottiglie": "quantity",
                "Prezzo pagato (CHF)": "price",
                "Dove comprato": "merchant",
                "Quando comprato": "order_date",
                "Dove si trova": "location",
            },
        )
    ],
    "collector_register": [
        (
            ["Collezione"],
            "inventory",
            {
                "Vino / produttore": "name",
                "Denominazione": "appellation",
                "Formato (ml)": "format",
                "Bottiglie attuali": "quantity",
                "Bottiglie bevute": "consumed_count",
                "Valore stimato / bott.": "current_value",
                "Valuta": "currency",
                "Bere dal": "drink_from",
                "Bere entro": "drink_to",
                "Posizione cantina": "location",
                # Ripeness, not the Vinaris status: a dropdown with no field is a tag.
                "Stato": "tags",
            },
        )
    ],
    "house_list": [
        (
            ["Vini in casa"],
            "inventory",
            {"Vino / etichetta": "name", "Anno": "vintage", "Per quando": "tags"},
        ),
        (
            ["Da comprare"],
            "wishlist",
            {"Vorrei comprare": "name", "Budget CHF": "target_price", "Motivo": "notes"},
        ),
    ],
    "shelves": [
        (
            ["Scaffale A - rossi", "Scaffale B - bianchi", "Frigo bollicine"],
            "inventory",
            {
                "Produttore e vino": "name",
                "Comprato il": "order_date",
                "€ / bott.": "price",
                "Posto": "bin",
                "Foglio": "location",
            },
        )
    ],
    "movement_register": [
        (
            ["Movimenti"],
            "movements",
            {
                "Data": "event_date",
                "Cosa ho fatto": "movement_kind",
                "+ Bottiglie": "quantity_in",
                "- Bottiglie": "quantity_out",
            },
        ),
        (["Quante ne restano"], "inventory", {"Vino": "name", "Rimaste": "quantity"}),
    ],
    "occasions_and_drunk": [
        (
            ["Da aprire"],
            "inventory",
            {"Vino (e annata)": "name", "Quando lo apro": "tags", "Ultima volta": "ignore"},
        ),
        (
            ["Gia bevuti"],
            "tasting",
            {
                "Data": "event_date",
                "Etichetta": "name",
                "Com'era": "rating_words",
                "Lo ricompro?": "buy_again",
            },
        ),
    ],
    "cupboard": [
        (
            ["My wine list"],
            "inventory",
            {
                "Red / white": "type",
                "Bottles left": "quantity",
                "Paid £ each": "price",
                "From": "merchant",
                "Bought": "order_date",
                "When to open": "tags",
            },
        ),
        (
            ["Shopping ideas"],
            "wishlist",
            {"Wine I'd like": "name", "Target price £": "target_price"},
        ),
    ],
    "basement": [
        (
            ["Inventory"],
            "inventory",
            {
                "Producer": "producer",
                "Wine / Cuvée": "name",
                "Bottle ml": "format",
                "In cellar": "quantity",
                "Cost each": "price",
                "Bin / Slot": "location",
                "Drink by": "drink_to",
            },
        ),
        (["Wish list"], "wishlist", {"Budget $": "target_price", "Priority": "priority"}),
    ],
    "tasting_diary": [
        (
            ["Tasting diary"],
            "tasting",
            {
                "Tasted on": "event_date",
                "Score /10": "score",
                "Food": "pairing",
                "What I thought": "notes",
                "Buy again?": "buy_again",
            },
        ),
        (["Still have"], "inventory", {"Qty": "quantity", "Where": "location"}),
    ],
    "shared_stash": [
        (
            ["Our bottles"],
            "inventory",
            {
                "Whose": "owners",
                "Wine / brand": "name",
                "Origin": "country",
                "Style": "type",
                "Cases": "cases",
                "Case size": "case_size",
                "Loose": "loose",
                "Total bottles": "quantity",
            },
        ),
        (["Taken out"], "movements", {"Date": "event_date", "How many": "quantity"}),
    ],
}


@pytest.mark.parametrize("shape", sorted(EXPECTED))
def test_every_collector_shape_gets_kinds_and_fields(shape):
    analysis = analyze(shape)
    assert [(table.sheets, table.kind) for table in analysis.tables] == [
        (sheets, kind) for sheets, kind, _ in EXPECTED[shape]
    ]
    for table, (_, _, expected_fields) in zip(analysis.tables, EXPECTED[shape], strict=True):
        found = fields(table)
        assert {header: found[header] for header in expected_fields} == expected_fields
        assert all(column.field in table.allowed_fields for column in table.columns)


def test_single_fields_are_never_proposed_twice():
    for shape in ALL_SHAPES:
        for table in analyze(shape).tables:
            proposed = [
                column.field
                for column in table.columns
                if column.field not in {"notes", "tags", "ignore"}
            ]
            assert len(proposed) == len(set(proposed)), (shape, table.sheets, proposed)


def test_false_friend_headers_are_overruled_by_their_values():
    house = analyze("house_list").tables[0]
    per_quando = next(column for column in house.columns if column.header == "Per quando")
    assert per_quando.field == "tags"
    assert per_quando.rejected_field == "event_date"
    assert "header_rejected" in house.warnings


def test_name_order_currency_and_location_questions():
    collector = analyze("collector_register").tables[0]
    name = next(column for column in collector.columns if column.field == "name")
    assert name.name_order == "wine_first"
    assert collector.currency == "CHF"
    location = next(column for column in collector.columns if column.field == "location")
    assert location.position_separator == " - "
    assert [question.code for question in collector.questions] == ["position_split"]

    shelves = analyze("shelves").tables[0]
    assert next(column for column in shelves.columns if column.field == "name").name_order == (
        "producer_first"
    )
    assert shelves.currency == "EUR"
    assert "type_from_sheet_name" in shelves.warnings

    basement = analyze("basement")
    codes = [(question.code, question.default) for question in basement.tables[0].questions]
    assert ("currency", "USD") in codes
    assert basement.tables[0].currency == "USD"


def test_tasting_scores_and_verbal_ratings():
    diary = analyze("tasting_diary").tables[0]
    score = next(column for column in diary.columns if column.field == "score")
    assert score.score_scale == 10
    drunk = analyze("occasions_and_drunk").tables[1]
    question = next(question for question in drunk.questions if question.code == "rating_words")
    assert question.default == "standard"
    assert question.examples == ["molto buono", "discreto"]


def test_formulas_without_saved_values_are_flagged():
    stash = analyze("shared_stash").tables[0]
    total = next(column for column in stash.columns if column.header == "Total bottles")
    assert total.formulas_without_values == 2
    assert "formulas_without_values" in stash.warnings


def test_summary_sheets_are_skipped_and_layouts_fingerprinted():
    collector = analyze("collector_register")
    assert [sheet.name for sheet in collector.skipped_sheets] == ["Riepilogo"]
    assert collector.fingerprint == analyze("collector_register").fingerprint
    assert collector.fingerprint != analyze("house_list").fingerprint


def test_xls_files_are_analysed_like_xlsx():
    content = build_xls(ALL_SHAPES["cupboard"]())
    analysis = analyze_workbook(read_workbook(content, "cupboard.xls"))
    assert analysis.file_format == "xls"
    assert [table.kind for table in analysis.tables] == ["inventory", "wishlist"]
    assert fields(analysis.tables[0])["Bought"] == "order_date"


def test_text_dates_in_an_unknown_order_ask_the_user():
    csv_text = "Data;Vino;Voto\n05/06/2026;Barolo;8\n07/08/2026;Soave;7\n"
    analysis = analyze_workbook(read_workbook(csv_text.encode(), "diario.csv"))
    table = analysis.tables[0]
    assert table.kind == "tasting"
    question = next(question for question in table.questions if question.code == "date_order")
    assert question.default == "dmy"
    assert question.examples == ["05/06/2026", "07/08/2026"]


# --- layouts beyond one table per sheet ---------------------------------------


def workbook_bytes(build: Any) -> bytes:
    from openpyxl import Workbook

    book = Workbook()
    sheet = book.active
    assert sheet is not None
    build(sheet)
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()


def test_two_row_headers_join_the_group_label():
    def build(sheet):
        sheet.append(["Vino", "Annata", "Prezzo", None, "Bottiglie"])
        sheet.append([None, None, "Acquisto", "Attuale", None])
        sheet.merge_cells("A1:A2")
        sheet.merge_cells("B1:B2")
        sheet.merge_cells("C1:D1")
        sheet.merge_cells("E1:E2")
        sheet.append(["Barolo Bussia", 2018, 78, 90, 6])
        sheet.append(["Soave Classico", 2023, 14.5, 15, 4])

    workbook = read_workbook(workbook_bytes(build), "two-rows.xlsx")
    table = extract_tables(workbook.sheets[0])[0]
    assert table.headers == ["Vino", "Annata", "Prezzo Acquisto", "Prezzo Attuale", "Bottiglie"]
    assert table.row_numbers == [3, 4]
    found = fields(analyze_workbook(workbook).tables[0])
    assert found["Prezzo Acquisto"] == "price"
    assert found["Prezzo Attuale"] == "current_value"


def test_stacked_tables_in_one_sheet_are_split():
    def build(sheet):
        sheet.append(["Vino", "Annata", "Bottiglie", "Posizione"])
        sheet.append(["Barolo Bussia", 2018, 6, "A1"])
        sheet.append(["Soave Classico", 2023, 4, "B2"])
        sheet.append([])
        sheet.append(["Da comprare"])
        sheet.append(["Vino", "Budget CHF", "Quante"])
        sheet.append(["Amarone", 45, 2])

    workbook = read_workbook(workbook_bytes(build), "stacked.xlsx")
    tables = extract_tables(workbook.sheets[0])
    assert [table.headers for table in tables] == [
        ["Vino", "Annata", "Bottiglie", "Posizione"],
        ["Vino", "Budget CHF", "Quante"],
    ]
    assert [table.row_numbers for table in tables] == [[2, 3], [7]]
    assert tables[1].title == "Da comprare"
    assert [table.kind for table in analyze_workbook(workbook).tables] == ["inventory", "wishlist"]


def test_side_by_side_tables_are_split_on_empty_columns():
    def build(sheet):
        sheet.append(["Vino", "Annata", "Bottiglie", None, "Vorrei", "Budget"])
        sheet.append(["Barolo Bussia", 2018, 6, None, "Amarone", 45])
        sheet.append(["Soave Classico", 2023, 4])

    workbook = read_workbook(workbook_bytes(build), "side.xlsx")
    tables = extract_tables(workbook.sheets[0])
    assert [table.headers for table in tables] == [
        ["Vino", "Annata", "Bottiglie"],
        ["Vorrei", "Budget"],
    ]
    assert tables[1].columns == [4, 5]
    assert [len(table.rows) for table in tables] == [2, 1]


def test_an_empty_spacer_column_does_not_split_a_table():
    def build(sheet):
        sheet.append(["Vino", "Annata", None, "Bottiglie", "Posizione"])
        sheet.append(["Barolo Bussia", 2018, None, 6, "A1"])
        sheet.append(["Soave Classico", 2023, None, 4, "B2"])

    tables = extract_tables(read_workbook(workbook_bytes(build), "spacer.xlsx").sheets[0])
    assert len(tables) == 1
    assert tables[0].headers == ["Vino", "Annata", "Bottiglie", "Posizione"]
    assert tables[0].columns == [0, 1, 3, 4]


def test_merged_section_rows_label_the_rows_below():
    def build(sheet):
        sheet.append(["Vino", "Annata", "Bottiglie"])
        sheet.append(["Rossi"])
        sheet.merge_cells("A2:C2")
        sheet.append(["Barolo Bussia", 2018, 6])
        sheet.append(["Bianchi"])
        sheet.merge_cells("A4:C4")
        sheet.append(["Soave Classico", 2023, 4])

    workbook = read_workbook(workbook_bytes(build), "sections.xlsx")
    table = extract_tables(workbook.sheets[0])[0]
    assert table.sections == ["Rossi", "Bianchi"]
    section = next(
        column for column in analyze_workbook(workbook).tables[0].columns if column.key == "section"
    )
    assert section.samples == ["Rossi", "Bianchi"]


# --- values -----------------------------------------------------------------


def test_verbal_ratings_yes_no_and_drinking_windows():
    assert parse_verbal_rating("Molto buono") == 5.0
    assert parse_verbal_rating("ottimo") == 5.5
    assert parse_verbal_rating("Outstanding") == 6.0
    assert parse_verbal_rating("strano") is None
    assert parse_yes_no("Sì") is True
    assert parse_yes_no("No") is False
    assert parse_yes_no("Maybe") is None
    assert parse_drink_window("2025-2030") == (2025, 2030)
    assert parse_drink_window("2030 / 2025") == (2025, 2030)
    assert parse_drink_window("entro 2030") == (None, 2030)
    assert parse_drink_window("dal 2027") == (2027, None)
    assert parse_drink_window(2028) == (2028, None)
    assert parse_drink_window("pronto") == (None, None)


# --- route --------------------------------------------------------------------


def test_analyze_route_reads_an_upload_and_writes_nothing():
    client = TestClient(app)
    assert register(client).status_code == 201
    content = build_xlsx(ALL_SHAPES["house_list"]())
    response = client.post(
        "/api/v1/imports/spreadsheet/analyze",
        files={"file": ("vini.xlsx", content, "application/octet-stream")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["file_format"] == "xlsx"
    assert [table["kind"] for table in body["tables"]] == ["inventory", "wishlist"]
    assert client.get("/api/v1/wines").json() == []


def test_analyze_route_answers_unreadable_files_with_a_code():
    client = TestClient(app)
    assert register(client).status_code == 201
    response = client.post(
        "/api/v1/imports/spreadsheet/analyze",
        files={"file": ("broken.xlsx", b"PK\x03\x04broken", "application/octet-stream")},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unreadable_file"


def test_analyze_route_needs_a_session():
    response = TestClient(app).post(
        "/api/v1/imports/spreadsheet/analyze",
        files={"file": ("vini.csv", b"Vino;Annata\nBarolo;2018\n", "text/csv")},
    )
    assert response.status_code == 401


def test_dates_written_by_excel_need_no_question():
    def build(sheet):
        sheet.append(["Data", "Vino", "Punteggio"])
        sheet.append([datetime(2026, 5, 4), "Barolo", 92])

    table = analyze_workbook(read_workbook(workbook_bytes(build), "d.xlsx")).tables[0]
    assert [question.code for question in table.questions] == []
    assert next(column for column in table.columns if column.field == "score").score_scale == 100
