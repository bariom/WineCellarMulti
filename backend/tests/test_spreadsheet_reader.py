from datetime import date, datetime
from decimal import Decimal

import pytest

from app.services.spreadsheet_import.reader import SpreadsheetError, read_workbook
from app.services.spreadsheet_import.tables import extract_table, group_tables
from app.services.spreadsheet_import.values import (
    column_currency,
    currency_in,
    date_order,
    parse_bottle_format,
    parse_date,
    parse_number,
    parse_quantity,
    parse_vintage,
    parse_wine_type,
    position_separator,
    split_position,
    split_trailing_vintage,
)
from tests.spreadsheet_fixtures import ALL_SHAPES, SheetSpec, build_ods, build_xls, build_xlsx


def groups_for(content: bytes, filename: str = "cellar.xlsx"):
    workbook = read_workbook(content, filename)
    tables = [table for table in (extract_table(sheet) for sheet in workbook.sheets) if table]
    return group_tables(tables)


# Sheet groups, the 1-based header row of each sheet, and the data rows found.
EXPECTED_TABLES = {
    "personal_cellar": [(["I miei vini"], [4], 5)],
    "collector_register": [(["Collezione"], [4], 4)],
    "house_list": [(["Vini in casa"], [1], 5), (["Da comprare"], [1], 2)],
    "shelves": [(["Scaffale A - rossi", "Scaffale B - bianchi", "Frigo bollicine"], [4, 4, 4], 4)],
    "movement_register": [(["Movimenti"], [4], 3), (["Quante ne restano"], [4], 1)],
    "occasions_and_drunk": [(["Da aprire"], [1], 3), (["Gia bevuti"], [4], 2)],
    "cupboard": [(["My wine list"], [1], 3), (["Shopping ideas"], [1], 1)],
    "basement": [(["Inventory"], [4], 3), (["Wish list"], [1], 1)],
    "tasting_diary": [(["Tasting diary"], [4], 2), (["Still have"], [1], 1)],
    "shared_stash": [(["Our bottles"], [4], 2), (["Taken out"], [1], 1)],
}


@pytest.mark.parametrize("shape", sorted(ALL_SHAPES))
def test_every_collector_shape_finds_its_tables(shape):
    groups = groups_for(build_xlsx(ALL_SHAPES[shape]()))
    found = [
        (group.sheets, [table.header_row + 1 for table in group.tables], group.row_count)
        for group in groups
    ]
    assert found == EXPECTED_TABLES[shape]


def test_title_rows_and_totals_are_not_data():
    group = groups_for(build_xlsx(ALL_SHAPES["personal_cellar"]()))[0]
    table = group.tables[0]
    assert table.headers[:4] == ["Vino", "Annata", "Tipo", "Quante bottiglie"]
    assert table.row_numbers == [5, 6, 7, 8, 9]
    # The "Bottiglie totali" formula sits above the header and right of it: never a column.
    assert "Bottiglie totali" not in table.headers


def test_summary_sheet_of_formulas_is_not_a_table():
    groups = groups_for(build_xlsx(ALL_SHAPES["collector_register"]()))
    assert [group.sheets for group in groups] == [["Collezione"]]


def test_formula_cells_are_flagged_and_keep_only_saved_values():
    workbook = read_workbook(build_xlsx(ALL_SHAPES["movement_register"]()), "register.xlsx")
    balance = extract_table(workbook.sheets[1])
    assert balance is not None
    remaining = balance.rows[0][balance.headers.index("Rimaste")]
    # Built by a program and never opened in Excel: a formula with no saved value.
    assert remaining.formula is True
    assert remaining.value is None


def test_dropdowns_number_formats_and_excel_tables_are_read():
    workbook = read_workbook(build_xlsx(ALL_SHAPES["basement"]()), "basement.xlsx")
    inventory, wishlist = workbook.sheets
    assert inventory.tables == [(3, 0, 6, 11)]
    assert inventory.frozen_rows == 4
    table = extract_table(inventory)
    assert table is not None
    cost = table.headers.index("Cost each")
    assert table.rows[0][cost].number_format == '"$"#,##0.00'
    assert extract_table(wishlist).dropdowns == {4: ["High", "Medium", "Low"]}  # type: ignore[union-attr]


def test_xls_files_are_read_with_dates_and_frozen_header():
    groups = groups_for(build_xls(ALL_SHAPES["shelves"]()), "shelves.xls")
    assert [group.sheets for group in groups] == [
        ["Scaffale A - rossi", "Scaffale B - bianchi", "Frigo bollicine"]
    ]
    table = groups[0].tables[0]
    assert table.header_row == 3
    assert table.rows[0][table.headers.index("Comprato il")].value == datetime(2023, 11, 22)
    assert table.rows[0][table.headers.index("Annata")].value == 2020


def test_ods_files_are_read_with_currency_codes():
    groups = groups_for(build_ods(ALL_SHAPES["house_list"](), currency="CHF"), "house.ods")
    assert [group.sheets for group in groups] == [["Vini in casa"], ["Da comprare"]]
    table = groups[0].tables[0]
    price = table.rows[0][table.headers.index("Prezzo a bott.")]
    assert price.value == 19.5
    assert price.number_format == "CHF"


def test_csv_files_detect_semicolons_and_windows_encoding():
    lines = [
        "Vino;Annata;Bottiglie;Prezzo",
        "Gewürztraminer - Tramin;2023;2;17,90",
        "Masi Campofiorin;2020;3;15,95",
    ]
    content = ("\n".join(lines) + "\n").encode("cp1252")
    groups = groups_for(content, "cantina.csv")
    table = groups[0].tables[0]
    assert table.headers == ["Vino", "Annata", "Bottiglie", "Prezzo"]
    assert table.rows[0][0].value == "Gewürztraminer - Tramin"
    assert parse_number(table.rows[0][3].value) == Decimal("17.90")


def test_unreadable_and_oversized_files_answer_with_a_code():
    with pytest.raises(SpreadsheetError) as empty:
        read_workbook(b"", "empty.xlsx")
    assert empty.value.code == "empty_file"
    with pytest.raises(SpreadsheetError) as broken:
        read_workbook(b"PK\x03\x04 not really a zip", "broken.xlsx")
    assert broken.value.code == "unreadable_file"
    with pytest.raises(SpreadsheetError) as large:
        read_workbook(b"a" * (5 * 1024 * 1024 + 1), "large.csv")
    assert large.value.code == "file_too_large"
    with pytest.raises(SpreadsheetError) as numbers:
        read_workbook(b"\x00\x01binary", "cellar.numbers")
    assert numbers.value.code == "unsupported_format"


def test_hidden_sheets_are_skipped():
    content = build_xlsx(
        [
            SheetSpec(title="Visible", header=["Wine", "Qty"], rows=[["Masi", 2]]),
            SheetSpec(title="Hidden", header=["Wine", "Qty"], rows=[["Secret", 1]]),
        ]
    )
    from io import BytesIO

    from openpyxl import load_workbook

    book = load_workbook(BytesIO(content))
    book["Hidden"].sheet_state = "hidden"
    output = BytesIO()
    book.save(output)
    assert [sheet.name for sheet in read_workbook(output.getvalue(), "x.xlsx").sheets] == [
        "Visible"
    ]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (24.9, Decimal("24.9")),
        ("1'250.–", Decimal("1250")),
        ("1.250,00", Decimal("1250.00")),
        ("1,250.00", Decimal("1250.00")),
        ("17,90", Decimal("17.90")),
        ("CHF 45.-", Decimal("45")),
        ("£12.50", Decimal("12.50")),
        ("45 €", Decimal("45")),
        ("1,250", Decimal("1250")),
        ("circa 20", None),
        ("", None),
    ],
)
def test_numbers_in_local_formats(raw, expected):
    assert parse_number(raw) == expected


def test_currencies_from_headers_formats_and_values():
    assert currency_in("Prezzo pagato (CHF)") == ("CHF", False)
    assert currency_in("€ / bott.") == ("EUR", False)
    assert currency_in('"£"#,##0.00') == ("GBP", False)
    assert currency_in('"$"#,##0.00') == ("USD", True)
    assert currency_in("Paid each") is None
    assert column_currency("Cost each", [27, 65], ['"$"#,##0.00', '"$"#,##0.00']) == ("USD", True)
    assert column_currency("Prezzo", ["CHF 45.-", "CHF 20.-"], ["General"]) == ("CHF", False)


def test_dates_in_every_written_form():
    assert parse_date(datetime(2023, 11, 22)) == date(2023, 11, 22)
    assert parse_date("2024-11-12") == date(2024, 11, 12)
    assert parse_date("22.11.2023") == date(2023, 11, 22)
    assert parse_date("22/11/23") == date(2023, 11, 22)
    assert parse_date("05/11/2026", order="mdy") == date(2026, 5, 11)
    assert parse_date("12 Nov 2024") == date(2024, 11, 12)
    assert parse_date("3 marzo 2025") == date(2025, 3, 3)
    assert parse_date("inverno") is None
    assert date_order(["05/11/2026", "05/18/2026"]) == "mdy"
    assert date_order(["22/11/2023", "05/11/2026"]) == "dmy"
    assert date_order(["05/11/2026", "06/10/2026"]) is None


def test_vintages_and_vintage_inside_the_name():
    assert parse_vintage(2019) == "2019"
    assert parse_vintage("NV") == "NV"
    assert parse_vintage("s.a.") == "NV"
    assert parse_vintage(None) is None
    assert parse_vintage(2045) is None
    assert split_trailing_vintage("Vietti Barolo Castiglione 2019") == (
        "Vietti Barolo Castiglione",
        "2019",
    )
    assert split_trailing_vintage("Lugana - Ca' dei Frati I Frati 2023") == (
        "Lugana - Ca' dei Frati I Frati",
        "2023",
    )
    assert split_trailing_vintage("Barolo (2018)") == ("Barolo", "2018")
    assert split_trailing_vintage("Moët & Chandon Brut Impérial") == (
        "Moët & Chandon Brut Impérial",
        None,
    )
    assert split_trailing_vintage("Sassicaia 1985") == ("Sassicaia", "1985")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Rosso", "Red"),
        ("rossi", "Red"),
        ("Red", "Red"),
        ("rouge", "Red"),
        ("bianco", "White"),
        ("White", "White"),
        ("Weisswein", "White"),
        ("rosé", "Rose"),
        ("Rosé", "Rose"),
        ("rosato", "Rose"),
        ("Bollicine", "Sparkling"),
        ("Champagne", "Sparkling"),
        ("Sparkling", "Sparkling"),
        ("Blanc de Blancs Brut sparkling", "Sparkling"),
        ("Scaffale A - rossi", "Red"),
        ("Frigo bollicine", "Sparkling"),
        ("Passito", "Sweet"),
        ("Porto", "Fortified"),
        ("", ""),
        ("Garage", ""),
    ],
)
def test_wine_types(raw, expected):
    assert parse_wine_type(raw) == expected


def test_bottle_formats_and_quantities():
    assert parse_bottle_format(750) == "Bottle (750ml)"
    assert parse_bottle_format("0,75") == "Bottle (750ml)"
    assert parse_bottle_format("75cl") == "Bottle (750ml)"
    assert parse_bottle_format("1.5 l") == "Magnum (1.5L)"
    assert parse_bottle_format("Magnum") == "Magnum (1.5L)"
    assert parse_bottle_format(1500, unit_hint="Bottle ml") == "Magnum (1.5L)"
    assert parse_bottle_format(500) == ""
    assert parse_quantity("3 bottles") == 3
    assert parse_quantity("1 bottle") == 1
    assert parse_quantity(6) == 6
    assert parse_quantity("una") == 1
    assert parse_quantity(2.5) is None
    assert parse_quantity("-1") is None


def test_storage_positions_split_only_on_a_consistent_separator():
    collector = ["A1 - ripiano 2", "B1 - ripiano 1", "C2 - ripiano 1"]
    assert position_separator(collector) == " - "
    assert split_position("A1 - ripiano 2", " - ") == ("A1", "ripiano 2")
    basement = ["Rack A / 01", "Cooler / 04", "Rack B / 07"]
    assert position_separator(basement) == " / "
    assert split_position("Cooler / 04", " / ") == ("Cooler", "04")
    personal = ["Scaffale basso", "Scaffale 1", "Frigo cantina"]
    assert position_separator(personal) is None
    assert split_position("Frigo cantina", None) == ("Frigo cantina", "")
