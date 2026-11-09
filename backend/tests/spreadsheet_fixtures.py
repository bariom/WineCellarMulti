"""Spreadsheets shaped like the ones collectors keep, built in memory for tests.

Each builder reproduces the layout of a real-world file (title rows, merged
titles, frozen header, Excel table, formulas, number formats, dropdowns, one
sheet per shelf...) with made-up cellar data. See docs/SPREADSHEET_IMPORT.md for
the ten shapes and what each one taught the import.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class SheetSpec:
    title: str
    header: list[str]
    rows: list[list[Any]]
    # Lines above the header (a title, a subtitle, a blank line...).
    preamble: list[list[Any]] = field(default_factory=list)
    merge_preamble: bool = False
    freeze: bool = False
    excel_table: str = ""
    # Column letter -> number format for the data rows.
    formats: dict[str, str] = field(default_factory=dict)
    # Column letter -> dropdown options.
    dropdowns: dict[str, list[str]] = field(default_factory=dict)


def build_xlsx(sheets: list[SheetSpec]) -> bytes:
    from openpyxl import Workbook
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation
    from openpyxl.worksheet.table import Table

    book = Workbook()
    default_sheet = book.active
    if default_sheet is not None:
        book.remove(default_sheet)  # type: ignore[arg-type]
    for spec in sheets:
        sheet = book.create_sheet(spec.title)
        for line in spec.preamble:
            sheet.append(line)
        header_row = len(spec.preamble) + 1
        sheet.append(spec.header)
        for row in spec.rows:
            sheet.append(row)
        last_column = get_column_letter(len(spec.header))
        last_row = header_row + len(spec.rows)
        if spec.merge_preamble:
            for index, line in enumerate(spec.preamble, start=1):
                if line and line[0] is not None:
                    sheet.merge_cells(f"A{index}:{last_column}{index}")
        if spec.freeze:
            sheet.freeze_panes = f"A{header_row + 1}"
        if spec.excel_table:
            sheet.add_table(
                Table(displayName=spec.excel_table, ref=f"A{header_row}:{last_column}{last_row}")
            )
        for letter, number_format in spec.formats.items():
            for row_index in range(header_row + 1, last_row + 1):
                sheet[f"{letter}{row_index}"].number_format = number_format
        for letter, options in spec.dropdowns.items():
            validation = DataValidation(type="list", formula1='"' + ",".join(options) + '"')
            validation.add(f"{letter}{header_row + 1}:{letter}{header_row + 100}")
            sheet.add_data_validation(validation)
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()


def build_xls(sheets: list[SheetSpec]) -> bytes:
    import xlwt

    book = xlwt.Workbook()
    date_style = xlwt.easyxf(num_format_str="DD/MM/YYYY")
    for spec in sheets:
        sheet = book.add_sheet(spec.title)
        lines = [*spec.preamble, spec.header, *spec.rows]
        for row_index, line in enumerate(lines):
            for column_index, value in enumerate(line):
                if value is None:
                    continue
                if isinstance(value, datetime):
                    sheet.write(row_index, column_index, value, date_style)
                else:
                    sheet.write(row_index, column_index, value)
        if spec.freeze:
            sheet.set_panes_frozen(True)
            sheet.set_horz_split_pos(len(spec.preamble) + 1)
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()


def build_ods(sheets: list[SheetSpec], currency: str = "") -> bytes:
    from odf.opendocument import OpenDocumentSpreadsheet
    from odf.table import Table, TableCell, TableRow
    from odf.text import P

    document: Any = OpenDocumentSpreadsheet()
    for spec in sheets:
        table = Table(name=spec.title)
        for line in [*spec.preamble, spec.header, *spec.rows]:
            row = TableRow()
            for value in line:
                if value is None:
                    cell = TableCell()
                elif isinstance(value, datetime):
                    cell = TableCell(valuetype="date", datevalue=value.date().isoformat())
                    cell.addElement(P(text=value.strftime("%d.%m.%Y")))
                elif isinstance(value, int | float) and currency and isinstance(value, float):
                    cell = TableCell(valuetype="currency", currency=currency, value=value)
                    cell.addElement(P(text=f"{value:.2f} {currency}"))
                elif isinstance(value, int | float):
                    cell = TableCell(valuetype="float", value=value)
                    cell.addElement(P(text=str(value)))
                else:
                    cell = TableCell(valuetype="string")
                    cell.addElement(P(text=str(value)))
                row.addElement(cell)
            table.addElement(row)
        document.spreadsheet.addElement(table)
    output = io.BytesIO()
    document.write(output)
    return output.getvalue()


TITLE = ["CANTINA DI TEST"]
SUBTITLE = ["Dati inventati per i test"]


# 1. Personal cellar: title rows, wine and producer in one cell, CHF in the header.
def personal_cellar() -> list[SheetSpec]:
    return [
        SheetSpec(
            title="I miei vini",
            preamble=[
                TITLE,
                [
                    *SUBTITLE,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    "Bottiglie totali",
                ],
                [None] * 10 + ["=SUM(D5:D9)"],
            ],
            merge_preamble=True,
            freeze=True,
            header=[
                "Vino",
                "Annata",
                "Tipo",
                "Quante bottiglie",
                "Prezzo pagato (CHF)",
                "Dove comprato",
                "Quando comprato",
                "Dove si trova",
                "Note",
            ],
            rows=[
                [
                    "Tignanello Antinori",
                    2020,
                    "Rosso",
                    3,
                    119,
                    "Enoteca",
                    "2024-11-12",
                    "Scaffale basso",
                    "Da tenere",
                ],
                [
                    "Chianti Classico Riserva - Castello di Ama",
                    2020,
                    "Rosso",
                    4,
                    32,
                    "Coop",
                    "2025-02-14",
                    "Scaffale 1",
                    "Piaciuto",
                ],
                [
                    "Bollinger Special Cuvée",
                    None,
                    "Bollicine",
                    2,
                    65,
                    "Manor",
                    "2025-12-05",
                    "Frigo cantina",
                    "Per feste",
                ],
                [
                    "Cervaro della Sala",
                    2022,
                    "Bianco",
                    2,
                    62,
                    "Enoteca",
                    "2025-04-20",
                    "Scaffale 5",
                    "Con pesce",
                ],
                [
                    "Château d'Armailhac",
                    2019,
                    "Rosso",
                    1,
                    72,
                    "Enoteca",
                    "2025-01-10",
                    "Scaffale alto",
                    "Da aspettare",
                ],
            ],
        )
    ]


# 2. Collector: 18 columns, "Stato" is ripeness, a summary sheet of formulas.
def collector_register() -> list[SheetSpec]:
    return [
        SheetSpec(
            title="Collezione",
            preamble=[TITLE, SUBTITLE, []],
            merge_preamble=True,
            freeze=True,
            header=[
                "Vino / produttore",
                "Denominazione",
                "Regione",
                "Paese",
                "Annata",
                "Tipologia",
                "Formato (ml)",
                "Bottiglie attuali",
                "Bottiglie bevute",
                "Prezzo acquisto / bott.",
                "Valore stimato / bott.",
                "Valuta",
                "Data acquisto",
                "Bere dal",
                "Bere entro",
                "Posizione cantina",
                "Note personali",
                "Stato",
            ],
            rows=[
                [
                    "Château Pontet-Canet",
                    "Pauillac",
                    "Bordeaux",
                    "Francia",
                    2015,
                    "Rosso",
                    750,
                    3,
                    0,
                    125,
                    145,
                    "CHF",
                    "2023-03-21",
                    2025,
                    2040,
                    "A1 - ripiano 1",
                    "Cena speciale",
                    "Pronto",
                ],
                [
                    "Tignanello - Antinori",
                    "Toscana IGT",
                    "Toscana",
                    "Italia",
                    2020,
                    "Rosso",
                    750,
                    6,
                    1,
                    125,
                    145,
                    "CHF",
                    "2024-02-09",
                    2026,
                    2040,
                    "B1 - ripiano 1",
                    "Ottima",
                    "Pronto",
                ],
                [
                    "Barolo Bussia - Prunotto",
                    "Barolo DOCG",
                    "Piemonte",
                    "Italia",
                    2018,
                    "Rosso",
                    750,
                    6,
                    0,
                    78,
                    90,
                    "CHF",
                    "2023-10-01",
                    2026,
                    2038,
                    "C1 - ripiano 1",
                    "Cassa",
                    "Da attendere",
                ],
                [
                    "Bollinger La Grande Année",
                    "Champagne AOC",
                    "Champagne",
                    "Francia",
                    2015,
                    "Champagne",
                    750,
                    4,
                    1,
                    165,
                    185,
                    "CHF",
                    "2024-07-03",
                    2025,
                    2035,
                    "D2 - ripiano 2",
                    "Natale",
                    "Da bere",
                ],
            ],
            dropdowns={"R": ["Pronto", "Da attendere", "Da bere"]},
        ),
        SheetSpec(
            title="Riepilogo",
            preamble=[["La mia collezione"], []],
            merge_preamble=True,
            header=["Etichette", "=COUNTA(Collezione!A5:A8)"],
            rows=[
                ["Bottiglie disponibili", "=SUM(Collezione!H5:H8)"],
                ["Valore indicativo (CHF)", "=SUMPRODUCT(Collezione!H5:H8,Collezione!K5:K8)"],
            ],
        ),
    ]


# 3. House list: header on row 1, producer first, "Per quando" is an occasion, a wishlist.
def house_list() -> list[SheetSpec]:
    return [
        SheetSpec(
            title="Vini in casa",
            header=[
                "Vino / etichetta",
                "Anno",
                "Tipo",
                "Quante ne ho",
                "Prezzo a bott.",
                "Dove l'ho preso",
                "Per quando",
                "Nota mia",
            ],
            rows=[
                ["Ripasso Valpolicella - Tommasi", 2020, "rosso", 2, 19.5, "Denner", "inverno"],
                ["Planeta La Segreta Rosso", 2022, "rosso", 3, 12.5, "Coop"],
                ["Masi Campofiorin", 2020, "rosso", 2, 15.95, "Denner", None, "riprenderlo"],
                [
                    "Prosecco Valdobbiadene Extra Dry - Mionetto",
                    None,
                    "bollicine",
                    4,
                    12.95,
                    "Migros",
                    "aperitivo",
                ],
                ["Château d'Esclans Whispering Angel", 2023, "rosé", 1, 25, "online", "vacanze"],
            ],
        ),
        SheetSpec(
            title="Da comprare",
            header=["Vorrei comprare", "Budget CHF", "Quante", "Motivo"],
            rows=[
                ["Amarone della Valpolicella - Tommasi", 45, 2, "per Natale"],
                ["Riesling - Trimbach", 24, 3, "raclette"],
            ],
        ),
    ]


# 4. One sheet per shelf: same header, location and type in the sheet name, euros in the format.
def shelves() -> list[SheetSpec]:
    header = [
        "Produttore e vino",
        "Annata",
        "Zona",
        "Bottiglie",
        "Comprato il",
        "€ / bott.",
        "Posto",
        "Annotazioni",
    ]
    euro = {"F": '#,##0.00 "€"', "E": "dd/mm/yyyy"}

    def shelf(title: str, rows: list[list[Any]]) -> SheetSpec:
        return SheetSpec(
            title=title,
            preamble=[[title], ["Appunti della cantina"], []],
            merge_preamble=True,
            freeze=True,
            header=header,
            rows=rows,
            formats=euro,
        )

    return [
        shelf(
            "Scaffale A - rossi",
            [
                [
                    "Tignanello - Marchesi Antinori",
                    2020,
                    "Toscana",
                    2,
                    datetime(2023, 11, 22),
                    139,
                    "A1",
                    "tenere",
                ],
                [
                    "Nino Negri Sfursat 5 Stelle",
                    2019,
                    "Lombardia",
                    1,
                    datetime(2023, 10, 8),
                    65,
                    "A6",
                ],
            ],
        ),
        shelf(
            "Scaffale B - bianchi",
            [["Pieropan Soave Classico", 2023, "Veneto", 4, datetime(2025, 1, 19), 14.5, "B2"]],
        ),
        shelf(
            "Frigo bollicine",
            [
                [
                    "Ca' del Bosco Cuvée Prestige",
                    None,
                    "Franciacorta",
                    3,
                    datetime(2025, 4, 9),
                    36,
                    "F1",
                ]
            ],
        ),
    ]


# 5. Purchase register: movements, and a balance sheet of formulas with no saved values.
def movement_register() -> list[SheetSpec]:
    return [
        SheetSpec(
            title="Movimenti",
            preamble=[["Registro"], ["Una riga per acquisto o bottiglia aperta"], []],
            merge_preamble=True,
            freeze=True,
            excel_table="Movimenti",
            header=[
                "Data",
                "Vino",
                "Cosa ho fatto",
                "+ Bottiglie",
                "- Bottiglie",
                "Motivo / occasione",
            ],
            rows=[
                [datetime(2025, 6, 2), "Pieropan Soave Classico", "acquisto", 6, 0, "estate"],
                [datetime(2025, 8, 15), "Pieropan Soave Classico", "bevuto", 0, 2, "pranzo"],
                [datetime(2026, 5, 12), "Masi Campofiorin", "regalo", 0, 1, "cena"],
            ],
            formats={"A": "dd/mm/yyyy"},
        ),
        SheetSpec(
            title="Quante ne restano",
            preamble=[["Saldo"], ["Calcolato dal foglio Movimenti"], []],
            merge_preamble=True,
            freeze=True,
            header=["Vino", "Annata", "Rimaste", "Posizione", "Note"],
            rows=[
                [
                    "Pieropan Soave Classico",
                    2023,
                    "=SUMIF(Movimenti!B5:B7,A5,Movimenti!D5:D7)-SUMIF(Movimenti!B5:B7,A5,Movimenti!E5:E7)",
                    "B2",
                    "pronto",
                ]
            ],
        ),
    ]


# 6. Occasions and drunk: vintage inside the name, a diary that must not touch stock.
def occasions_and_drunk() -> list[SheetSpec]:
    return [
        SheetSpec(
            title="Da aprire",
            freeze=True,
            header=[
                "Vino (e annata)",
                "Quando lo apro",
                "Quante bott.",
                "Dove si trova",
                "Ultima volta",
                "Promemoria",
            ],
            rows=[
                [
                    "Moët & Chandon Brut Impérial",
                    "aperitivo / festa",
                    2,
                    "frigo",
                    None,
                    "capodanno",
                ],
                ["Vietti Barolo Castiglione 2019", "occasione speciale", 1, "scaffale alto"],
                [
                    "Lugana - Ca' dei Frati I Frati 2023",
                    "pesce",
                    3,
                    "scaffale basso",
                    None,
                    "presto",
                ],
            ],
        ),
        SheetSpec(
            title="Gia bevuti",
            preamble=[["Bottiglie aperte"], [], []],
            merge_preamble=True,
            freeze=True,
            header=["Data", "Etichetta", "Quante", "Con chi / con cosa", "Com'era", "Lo ricompro?"],
            rows=[
                [
                    datetime(2026, 3, 30),
                    "Lugana - Ca' dei Frati I Frati 2023",
                    1,
                    "pesce",
                    "molto buono",
                    "ricomprare",
                ],
                [datetime(2026, 6, 7), "Allegrini Valpolicella 2022", 2, "pizza", "discreto"],
            ],
        ),
    ]


# 7. English cupboard: English headers, pounds in the format, "When to open" is an occasion.
def cupboard() -> list[SheetSpec]:
    return [
        SheetSpec(
            title="My wine list",
            freeze=True,
            header=[
                "Wine name",
                "Year",
                "Red / white",
                "Bottles left",
                "Paid £ each",
                "From",
                "Bought",
                "When to open",
                "Quick notes",
            ],
            rows=[
                [
                    "Oyster Bay Sauvignon Blanc",
                    2023,
                    "White",
                    3,
                    9.5,
                    "Tesco",
                    datetime(2026, 5, 11),
                    "with fish",
                    "easy",
                ],
                [
                    "19 Crimes Shiraz",
                    2022,
                    "Red",
                    2,
                    8.75,
                    "Asda",
                    datetime(2026, 9, 6),
                    "barbecue",
                ],
                [
                    "Freixenet Cordon Negro Brut",
                    None,
                    "Sparkling",
                    3,
                    9,
                    "Waitrose",
                    datetime(2026, 8, 2),
                    "friends",
                    "keep chilled",
                ],
            ],
            formats={"E": '"£"#,##0.00', "G": "dd mmm yyyy"},
            dropdowns={"C": ["Red", "White", "Rosé", "Sparkling"]},
        ),
        SheetSpec(
            title="Shopping ideas",
            freeze=True,
            header=["Wine I'd like", "Target price £", "Qty", "Why"],
            rows=[["Cloudy Bay Sauvignon Blanc", 25, 2, "summer"]],
            formats={"B": '"£"#,##0.00'},
        ),
    ]


# 8. Basement cellar: separate producer column, Excel table, dollars only in the format.
def basement() -> list[SheetSpec]:
    return [
        SheetSpec(
            title="Inventory",
            preamble=[["Basement cellar inventory"], ["One line per label and vintage"], []],
            merge_preamble=True,
            freeze=True,
            excel_table="CellarInventory",
            header=[
                "Country",
                "Region",
                "Producer",
                "Wine / Cuvée",
                "Vintage",
                "Bottle ml",
                "In cellar",
                "Cost each",
                "Bin / Slot",
                "Drink from",
                "Drink by",
                "Personal notes",
            ],
            rows=[
                [
                    "France",
                    "Bordeaux",
                    "Château Lanessan",
                    "Haut-Médoc",
                    2018,
                    750,
                    6,
                    27,
                    "Rack A / 01",
                    2025,
                    2032,
                    "case",
                ],
                [
                    "Italy",
                    "Piedmont",
                    "Vietti",
                    "Barolo Castiglione",
                    2019,
                    750,
                    3,
                    65,
                    "Rack A / 08",
                    2027,
                    2040,
                ],
                [
                    "France",
                    "Champagne",
                    "Bollinger",
                    "Special Cuvée",
                    None,
                    750,
                    2,
                    79,
                    "Cooler / 04",
                    2024,
                    2029,
                    "NV",
                ],
            ],
            formats={"H": '"$"#,##0.00'},
        ),
        SheetSpec(
            title="Wish list",
            freeze=True,
            header=["Wine", "Vintage", "Budget $", "Looking for", "Priority"],
            rows=[["Ruinart Blanc de Blancs", None, 110, "1 bottle", "Low"]],
            dropdowns={"E": ["High", "Medium", "Low"]},
        ),
    ]


# 9. Tasting diary first, inventory second; scores out of 10.
def tasting_diary() -> list[SheetSpec]:
    return [
        SheetSpec(
            title="Tasting diary",
            preamble=[["Wines I've tried"], ["My own scores out of 10"], []],
            merge_preamble=True,
            freeze=True,
            header=[
                "Tasted on",
                "Wine",
                "Vintage",
                "Colour",
                "Score /10",
                "Occasion",
                "Food",
                "What I thought",
                "Buy again?",
            ],
            rows=[
                [
                    datetime(2026, 1, 25),
                    "Trimbach Riesling",
                    2022,
                    "White",
                    8,
                    "friends",
                    "raclette",
                    "dry, crisp",
                    "Yes",
                ],
                [
                    datetime(2026, 8, 2),
                    "Gérard Bertrand Côte des Roses Rosé",
                    2023,
                    "Rosé",
                    6,
                    "garden",
                    "picnic",
                    "fine",
                    "No",
                ],
            ],
            formats={"A": "dd mmm yyyy"},
            dropdowns={"I": ["Yes", "Maybe", "No"]},
        ),
        SheetSpec(
            title="Still have",
            freeze=True,
            header=["Wine", "Year", "Qty", "Where", "Reminder"],
            rows=[["Trimbach Riesling", 2022, 1, "wine fridge", "get more"]],
        ),
    ]


# 10. Shared stash: owners, cases x size + loose as a formula, outgoing bottles with US dates.
def shared_stash() -> list[SheetSpec]:
    return [
        SheetSpec(
            title="Our bottles",
            preamble=[["Our shared wine stash"], ["Cases and loose bottles"], []],
            merge_preamble=True,
            freeze=True,
            header=[
                "Whose",
                "Wine / brand",
                "Year",
                "Origin",
                "Style",
                "Cases",
                "Case size",
                "Loose",
                "Total bottles",
                "Where",
                "Notes",
            ],
            rows=[
                [
                    "Sam",
                    "Masi Campofiorin",
                    2020,
                    "Italy",
                    "Red",
                    1,
                    6,
                    0,
                    "=F5*G5+H5",
                    "Garage A1",
                    "dinner",
                ],
                [
                    "Alex",
                    "Cloudy Bay Sauvignon Blanc",
                    2023,
                    "NZ",
                    "White",
                    0,
                    6,
                    2,
                    "=F6*G6+H6",
                    "Fridge",
                ],
            ],
        ),
        SheetSpec(
            title="Taken out",
            freeze=True,
            header=["Date", "Who", "Wine", "How many", "For what"],
            rows=[[datetime(2026, 5, 11), "Sam", "Masi Campofiorin", 2, "dinner"]],
            formats={"A": "mm/dd/yyyy"},
            dropdowns={"B": ["Sam", "Alex", "Jamie"]},
        ),
    ]


ALL_SHAPES = {
    "personal_cellar": personal_cellar,
    "collector_register": collector_register,
    "house_list": house_list,
    "shelves": shelves,
    "movement_register": movement_register,
    "occasions_and_drunk": occasions_and_drunk,
    "cupboard": cupboard,
    "basement": basement,
    "tasting_diary": tasting_diary,
    "shared_stash": shared_stash,
}
