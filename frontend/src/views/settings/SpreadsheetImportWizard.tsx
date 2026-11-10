import { useEffect, useMemo, useState } from "react";
import { appActionSvgIcon } from "../../components/actionIcons";
import { AppIcon } from "../../components/AppIcon";
import { ButtonBusyContent, LoadingState } from "../../components/AppUi";
import type {
  Locale,
  SpreadsheetAnalysis,
  SpreadsheetImportResult,
  SpreadsheetMapping,
  SpreadsheetNameRow,
  SpreadsheetNameSplitResult,
  SpreadsheetPreview,
  SpreadsheetSheetKind,
  SpreadsheetTableAnalysis,
  SpreadsheetTableMapping,
} from "../../types";

type Step = "tables" | "columns" | "preview" | "done";
type ImportMode = "skip_duplicates" | "update_existing" | "add_all";

type Props = {
  locale: Locale;
  file: File;
  isFreeTier: boolean;
  onClose: () => void;
  onImported: () => Promise<unknown> | void;
};

const IMPORTED_KINDS: SpreadsheetSheetKind[] = ["inventory", "wishlist", "tasting", "movements"];
const KIND_OPTIONS: SpreadsheetSheetKind[] = ["inventory", "wishlist", "tasting", "movements", "ignore"];
const MULTI_FIELDS = new Set(["notes", "tags", "ignore"]);
const CURRENCIES = ["CHF", "EUR", "USD", "GBP", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "JPY"];
const NAME_ROWS_SHOWN = 40;
// Mirrors backend AI_FREE_NAMES and the request cap of the /names endpoint.
const AI_FREE_NAMES = 15;
const AI_NAMES_PER_REQUEST = 100;

const FIELD_LABELS: Record<string, [string, string]> = {
  name: ["Vino", "Wine"],
  producer: ["Produttore", "Producer"],
  vintage: ["Annata", "Vintage"],
  quantity: ["Bottiglie", "Bottles"],
  cases: ["Casse", "Cases"],
  case_size: ["Bottiglie per cassa", "Bottles per case"],
  loose: ["Bottiglie sciolte", "Loose bottles"],
  consumed_count: ["Bottiglie bevute (nelle note)", "Bottles drunk (to notes)"],
  price: ["Prezzo d'acquisto", "Purchase price"],
  current_value: ["Valore attuale", "Current value"],
  target_price: ["Prezzo obiettivo", "Target price"],
  currency: ["Valuta", "Currency"],
  type: ["Tipo di vino", "Wine type"],
  format: ["Formato", "Bottle size"],
  region: ["Regione", "Region"],
  country: ["Paese", "Country"],
  appellation: ["Denominazione", "Appellation"],
  grapes: ["Vitigni", "Grapes"],
  merchant: ["Dove comprato", "Bought from"],
  order_date: ["Data d'acquisto", "Purchase date"],
  event_date: ["Data", "Date"],
  drink_from: ["Da bere dal", "Drink from"],
  drink_to: ["Da bere entro", "Drink by"],
  drink_window: ["Finestra di beva", "Drinking window"],
  location: ["Ubicazione", "Location"],
  bin: ["Posizione (bin)", "Bin"],
  owners: ["Proprietari", "Owners"],
  priority: ["Priorità", "Priority"],
  occasion: ["Occasione", "Occasion"],
  pairing: ["Abbinamento", "Pairing"],
  companions: ["Con chi", "Companions"],
  score: ["Punteggio", "Score"],
  rating_words: ["Giudizio a parole", "Verbal rating"],
  buy_again: ["Da ricomprare", "Buy again"],
  movement_kind: ["Tipo di movimento", "Movement type"],
  quantity_in: ["Bottiglie in entrata", "Bottles in"],
  quantity_out: ["Bottiglie in uscita", "Bottles out"],
  notes: ["Note", "Notes"],
  tags: ["Tag", "Tags"],
  ignore: ["Non importare", "Don't import"],
};

const KIND_LABELS: Record<SpreadsheetSheetKind, [string, string]> = {
  inventory: ["Cantina", "Cellar"],
  wishlist: ["Wishlist", "Wishlist"],
  tasting: ["Degustazioni", "Tastings"],
  movements: ["Registro movimenti", "Movement register"],
  summary: ["Riepilogo (non importato)", "Summary (not imported)"],
  ignore: ["Ignora", "Ignore"],
};

const RULE_LABELS: Record<string, [string, string]> = {
  producer_column: ["Colonna produttore", "Producer column"],
  separator: ["Diviso sul trattino", "Split on the dash"],
  known_producer: ["Produttore riconosciuto", "Known producer"],
  estate: ["Nome della tenuta", "Estate name"],
  unresolved: ["Da controllare", "Please check"],
  override: ["Corretto da te", "Corrected by you"],
  ai: ["Proposto dall'AI, controlla", "Suggested by AI, please check"],
};

const WARNING_LABELS: Record<string, [string, string]> = {
  quantity_assumed: ["Righe senza quantità: contata 1 bottiglia ciascuna", "Rows without a quantity: counted as 1 bottle each"],
  formula_without_value: [
    "Quantità calcolate da formule senza valore salvato: importate a 0. Apri e salva il file in Excel, poi riprova.",
    "Quantities from formulas with no saved value: imported as 0. Open and save the file in Excel, then try again.",
  ],
  tasting_without_date: ["Degustazioni senza data: non importate", "Tastings without a date: not imported"],
  movement_without_wine: [
    "Movimenti di vini che il file non elenca in cantina e senza acquisti: non importati",
    "Movements of wines the file does not list in the cellar and never bought: not imported",
  ],
  movement_ambiguous_wine: [
    "Movimenti che corrispondono a più vini (annate diverse): non importati. Aggiungi l'annata nel registro.",
    "Movements matching several wines (different vintages): not imported. Add the vintage in the register.",
  ],
  movement_more_than_stock: [
    "Uscite di più bottiglie di quelle presenti: ridotte a quelle disponibili",
    "Bottles taken out beyond those in stock: reduced to the ones available",
  ],
  movement_without_date: ["Movimenti senza data: messi dopo il movimento precedente", "Movements without a date: placed after the previous one"],
  stock_adjusted: [
    "Il registro non spiega tutte le bottiglie del foglio cantina: aggiunta una rettifica per tenere il numero del foglio",
    "The register does not explain every bottle of the cellar sheet: an adjustment keeps the sheet's count",
  ],
  unknown_format: ["Formato bottiglia non riconosciuto: lasciato vuoto", "Bottle size not recognised: left empty"],
  unreadable_value: ["Valori non leggibili: importati a 0", "Unreadable values: imported as 0"],
};

const ERROR_LABELS: Record<string, [string, string]> = {
  empty_file: ["Il file è vuoto.", "The file is empty."],
  file_too_large: ["Il file supera 5 MB.", "The file is larger than 5 MB."],
  unsupported_format: [
    "Questo formato non è supportato. Salva il file come .xlsx, .xls, .ods o .csv.",
    "This format is not supported. Save the file as .xlsx, .xls, .ods or .csv.",
  ],
  unreadable_file: [
    "Il file non si apre. Se è protetto da password, salvalo senza password e riprova.",
    "The file cannot be opened. If it is password protected, save it without a password and try again.",
  ],
  no_data: ["Nel file non ci sono dati.", "The file has no data."],
  too_many_sheets: ["Il file ha più di 20 fogli.", "The file has more than 20 sheets."],
  too_many_rows: ["Un foglio ha più di 5000 righe.", "A sheet has more than 5000 rows."],
  layout_changed: ["Il file è cambiato dall'analisi: ricaricalo.", "The file changed since the analysis: upload it again."],
  invalid_mapping: ["Alcune scelte delle colonne non sono valide.", "Some column choices are not valid."],
};

class SpreadsheetApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

async function postSpreadsheet<T>(path: string, file: File, mapping?: SpreadsheetMapping): Promise<T> {
  const body = new FormData();
  body.append("file", file, file.name);
  if (mapping) body.append("mapping", JSON.stringify(mapping));
  const response = await fetch(path, { method: "POST", body, credentials: "include" });
  if (response.ok) return (await response.json()) as T;
  let code = "";
  let message = `Request failed: ${response.status}`;
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (payload.detail && typeof payload.detail === "object" && "code" in payload.detail) {
      const detail = payload.detail as { code?: string; message?: string };
      code = detail.code ?? "";
      message = detail.message ?? message;
    } else if (typeof payload.detail === "string") {
      message = payload.detail;
    }
  } catch {
    // Not JSON: keep the status message.
  }
  throw new SpreadsheetApiError(code, message);
}

/** The proposals of the analysis, or the choices saved for this layout last time. */
function initialMapping(analysis: SpreadsheetAnalysis): { mapping: SpreadsheetMapping; fromSaved: boolean } {
  const saved = analysis.saved_mapping;
  if (saved && saved.tables.length === analysis.tables.length && saved.tables.every((table, index) => table.id === analysis.tables[index]?.id)) {
    return { mapping: { ...saved, tables: saved.tables.map((table) => ({ ...table, name_overrides: {} })) }, fromSaved: true };
  }
  return { fromSaved: false, mapping: {
    fingerprint: analysis.fingerprint,
    tables: analysis.tables.map((table) => ({
      id: table.id,
      kind: table.kind === "summary" ? "ignore" : table.kind,
      columns: Object.fromEntries(table.columns.map((column) => [column.key, column.field])),
      currency: table.currency || analysis.default_currency,
      date_orders: Object.fromEntries(
        table.questions.filter((question) => question.code === "date_order").map((question) => [question.column, question.default as "dmy" | "mdy"]),
      ),
      split_positions: Object.fromEntries(
        table.questions.filter((question) => question.code === "position_split").map((question) => [question.column, question.default === "split"]),
      ),
      rating_words: "standard",
      buy_again_to_wishlist: true,
      name_overrides: {},
      movement_direction: table.movement_direction,
      stock_includes_movements: null,
    })),
  } };
}

/** The table kinds a mapping imports; the API refuses fields a kind does not accept. */
function mappingForApi(mapping: SpreadsheetMapping): SpreadsheetMapping {
  return { ...mapping, tables: mapping.tables.filter((table) => table.kind !== "ignore") };
}

/** Settings → Data → Excel: read the user's own spreadsheet, confirm, preview and import. */
export default function SpreadsheetImportWizard({ locale, file, isFreeTier, onClose, onImported }: Props) {
  const it = locale === "it";
  const pick = (pair: [string, string] | undefined, fallback = "") => (pair ? pair[it ? 0 : 1] : fallback);
  const fieldLabel = (field: string) => pick(FIELD_LABELS[field], field);
  const [analysis, setAnalysis] = useState<SpreadsheetAnalysis | null>(null);
  const [mapping, setMapping] = useState<SpreadsheetMapping | null>(null);
  const [usedSavedMapping, setUsedSavedMapping] = useState(false);
  const [step, setStep] = useState<Step>("tables");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<SpreadsheetPreview | null>(null);
  const [result, setResult] = useState<SpreadsheetImportResult | null>(null);
  const [mode, setMode] = useState<ImportMode>("skip_duplicates");
  const [showAllNames, setShowAllNames] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ text: string; warning: boolean }[]>([]);
  // Rows whose current values are the AI's proposal, until the user edits them.
  const [aiRefs, setAiRefs] = useState<ReadonlySet<string>>(new Set());
  const [aiFreeLeft, setAiFreeLeft] = useState<number | null>(null);

  const describeError = (caught: unknown) => {
    if (caught instanceof SpreadsheetApiError && ERROR_LABELS[caught.code]) return pick(ERROR_LABELS[caught.code]);
    return caught instanceof Error ? caught.message : String(caught);
  };

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    postSpreadsheet<SpreadsheetAnalysis>("/api/v1/imports/spreadsheet/analyze", file)
      .then((next) => {
        if (cancelled) return;
        const initial = initialMapping(next);
        setAnalysis(next);
        setMapping(initial.mapping);
        setUsedSavedMapping(initial.fromSaved);
        setStep("tables");
      })
      .catch((caught) => !cancelled && setError(describeError(caught)))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
    // The file is the only input of the analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const tablesById = useMemo(
    () => new Map((analysis?.tables ?? []).map((table) => [table.id, table] as const)),
    [analysis],
  );
  const importedTables = (mapping?.tables ?? []).filter((table) => IMPORTED_KINDS.includes(table.kind));

  /** Column choices invalidate the preview; name corrections only refine it. */
  const updateTable = (id: string, change: (table: SpreadsheetTableMapping) => SpreadsheetTableMapping, keepPreview = false) => {
    setMapping((current) => current && { ...current, tables: current.tables.map((table) => (table.id === id ? change(table) : table)) });
    if (!keepPreview) setPreview(null);
  };

  const changeKind = (id: string, kind: SpreadsheetSheetKind) =>
    updateTable(id, (table) => {
      const allowed = analysis?.fields_by_kind[kind] ?? [];
      const fallback = allowed.includes("notes") ? "notes" : "ignore";
      const used = new Set<string>();
      const columns = Object.fromEntries(
        Object.entries(table.columns).map(([key, field]) => {
          const next = allowed.includes(field) && (MULTI_FIELDS.has(field) || !used.has(field)) ? field : fallback;
          used.add(next);
          return [key, next];
        }),
      );
      return { ...table, kind, columns };
    });

  const changeField = (id: string, key: string, field: string) =>
    updateTable(id, (table) => {
      const columns = { ...table.columns };
      // A single field moves: the column that held it falls back to the notes.
      if (!MULTI_FIELDS.has(field)) {
        for (const [otherKey, otherField] of Object.entries(columns)) {
          if (otherKey !== key && otherField === field) columns[otherKey] = (analysis?.fields_by_kind[table.kind] ?? []).includes("notes") ? "notes" : "ignore";
        }
      }
      columns[key] = field;
      return { ...table, columns };
    });

  async function runPreview(nextMapping = mapping) {
    if (!nextMapping) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await postSpreadsheet<SpreadsheetPreview>("/api/v1/imports/spreadsheet/preview", file, mappingForApi(nextMapping)));
      setStep("preview");
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!mapping) return;
    setBusy(true);
    setError("");
    try {
      const next = await postSpreadsheet<SpreadsheetImportResult>(`/api/v1/imports/spreadsheet?mode=${mode}`, file, mappingForApi(mapping));
      setResult(next);
      setStep("done");
      await onImported();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  const overrideName = (row: SpreadsheetNameRow, part: "producer" | "name" | "vintage", value: string) => {
    updateTable(row.table_id, (table) => {
      const current = table.name_overrides[row.ref] ?? { producer: row.producer, name: row.name, vintage: row.vintage };
      return { ...table, name_overrides: { ...table.name_overrides, [row.ref]: { ...current, [part]: value } } };
    }, true);
    if (aiRefs.has(row.ref)) setAiRefs((current) => new Set([...current].filter((ref) => ref !== row.ref)));
  };

  // "Do the cellar counts already include the register?" Asked in the preview with an
  // example from the file; the import waits for the answer.
  const balanceExample = preview?.balance_example ?? null;
  const balanceTable = mapping?.tables.find((table) => table.id === balanceExample?.table_id);
  const needsBalanceAnswer = Boolean(preview?.balance_questions?.length);
  const formatDay = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(it ? "it-CH" : "en-GB") : "");
  const balanceSteps = (balanceExample?.steps ?? [])
    .map((step) => `${formatDay(step.date)} ${step.delta > 0 ? "+" : "−"}${Math.abs(step.delta)}`.trim())
    .join(", ");
  const answerBalance = (answer: "yes" | "no") => {
    if (!mapping) return;
    const next = {
      ...mapping,
      tables: mapping.tables.map((table) => (table.kind === "movements" ? { ...table, stock_includes_movements: answer } : table)),
    };
    setMapping(next);
    void runPreview(next);
  };

  /** Names the rules could not split and the user has not corrected yet. */
  const openNames = (preview?.names ?? []).filter(
    (row) => row.rule === "unresolved" && !mapping?.tables.find((table) => table.id === row.table_id)?.name_overrides[row.ref],
  );
  const aiFreeNamesLeft = aiFreeLeft ?? preview?.ai_free_names_left ?? 0;

  /** Only the unresolved label strings go to the AI; its proposals land as corrections to review. */
  async function splitNamesWithAi() {
    const rows = openNames;
    const names = [...new Set(rows.map((row) => row.raw))].slice(0, AI_NAMES_PER_REQUEST);
    if (!names.length) return;
    setAiBusy(true);
    setAiMessages([]);
    try {
      const response = await fetch("/api/v1/imports/spreadsheet/names", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (response.status === 402) {
        setAiMessages([{ warning: true, text: it
          ? "I nomi gratuiti sono finiti: per dividerne altri con l'AI servono crediti AI o una tua chiave OpenAI (Impostazioni › AI)."
          : "The free names are used up: splitting more with AI needs AI credits or your own OpenAI key (Settings › AI)." }]);
        setAiFreeLeft(0);
        return;
      }
      if (!response.ok) throw new Error(it ? "L'AI non ha risposto. Riprova tra poco." : "The AI did not answer. Please try again shortly.");
      const answer = (await response.json()) as SpreadsheetNameSplitResult;
      const byRaw = new Map(answer.suggestions.map((suggestion) => [suggestion.raw, suggestion] as const));
      const suggested = rows.filter((row) => byRaw.has(row.raw.split(/\s+/).join(" ")));
      setMapping((current) => current && {
        ...current,
        tables: current.tables.map((table) => {
          const overrides = { ...table.name_overrides };
          for (const row of suggested) {
            if (row.table_id !== table.id) continue;
            const suggestion = byRaw.get(row.raw.split(/\s+/).join(" "))!;
            overrides[row.ref] = { producer: suggestion.producer, name: suggestion.name, vintage: suggestion.vintage || row.vintage };
          }
          return { ...table, name_overrides: overrides };
        }),
      });
      setAiRefs((current) => new Set([...current, ...suggested.map((row) => row.ref)]));
      setAiFreeLeft(answer.ai_free_names_left);
      const one = suggested.length === 1;
      const messages = [{ warning: false, text: it
        ? `L'AI ha proposto produttore e vino per ${suggested.length} ${one ? "riga: controllala" : "righe: controllale"} qui sotto.`
        : `AI suggested producer and wine for ${suggested.length} ${one ? "row: check it" : "rows: check them"} below.` }];
      if (answer.unsplit) messages.push({ warning: true, text: it
        ? `${answer.unsplit} ${answer.unsplit === 1 ? "nome resta" : "nomi restano"} da controllare: l'AI non era sicura.`
        : `${answer.unsplit} ${answer.unsplit === 1 ? "name still needs" : "names still need"} checking: the AI was not sure.` });
      if (answer.needs_credits) messages.push({ warning: true, text: it
        ? `Per ${answer.needs_credits === 1 ? "un altro nome" : `altri ${answer.needs_credits} nomi`} servono crediti AI o una tua chiave OpenAI (Impostazioni › AI).`
        : `${answer.needs_credits} more ${answer.needs_credits === 1 ? "name needs" : "names need"} AI credits or your own OpenAI key (Settings › AI).` });
      setAiMessages(messages);
    } catch (caught) {
      setAiMessages([{ warning: true, text: caught instanceof Error ? caught.message : String(caught) }]);
    } finally {
      setAiBusy(false);
    }
  }

  const stepLabels: [Step, string][] = [
    ["tables", it ? "Fogli" : "Sheets"],
    ["columns", it ? "Colonne" : "Columns"],
    ["preview", it ? "Anteprima" : "Preview"],
    ["done", it ? "Fatto" : "Done"],
  ];

  return (
    <section className="spreadsheet-wizard" aria-labelledby="spreadsheet-wizard-title">
      <header className="spreadsheet-wizard-header">
        <div>
          <span className="data-import-source-tag">{file.name}</span>
          <h4 id="spreadsheet-wizard-title">{it ? "Importa dal tuo Excel" : "Import from your spreadsheet"}</h4>
        </div>
        <button type="button" className="secondary compact" onClick={onClose} disabled={busy && step === "done"}>
          {it ? "Chiudi" : "Close"}
        </button>
      </header>
      <ol className="spreadsheet-wizard-steps" aria-label={it ? "Passi dell'importazione" : "Import steps"}>
        {stepLabels.map(([key, label]) => (
          <li key={key} aria-current={step === key ? "step" : undefined} className={step === key ? "is-current" : ""}>
            {label}
          </li>
        ))}
      </ol>
      {error ? (
        <p className="spreadsheet-wizard-error" role="alert">
          {error}
        </p>
      ) : null}
      {busy && !analysis ? <LoadingState label={it ? "Leggo il file…" : "Reading the file…"} compact /> : null}

      {analysis && mapping && step === "tables" ? (
        <div className="spreadsheet-wizard-body">
          {usedSavedMapping ? (
            <p className="spreadsheet-wizard-note">
              {it ? "Abbiamo riconosciuto questo file: ripropongo le scelte dell'ultima importazione." : "We recognised this file: your choices from the last import are proposed again."}
            </p>
          ) : (
            <p className="spreadsheet-wizard-note">
              {it ? "Per ogni tabella trovata nel file scegli che cosa contiene. I fogli con le stesse colonne sono già uniti." : "Choose what each table found in the file holds. Sheets with the same columns are already merged."}
            </p>
          )}
          <ul className="spreadsheet-table-list">
            {mapping.tables.map((table) => {
              const found = tablesById.get(table.id);
              if (!found) return null;
              return (
                <li key={table.id} className="spreadsheet-table-card">
                  <div>
                    <strong>{found.sheets.join(" · ")}</strong>
                    <small>
                      {found.title ? `${found.title} · ` : ""}
                      {it ? `${found.row_count} righe, intestazione alla riga ${found.header_row}` : `${found.row_count} rows, header on row ${found.header_row}`}
                      {found.sheets.length > 1 ? (it ? ` · ${found.sheets.length} fogli uniti` : ` · ${found.sheets.length} sheets merged`) : ""}
                    </small>
                  </div>
                  <label>
                    <span>{it ? "Contiene" : "Holds"}</span>
                    <select value={table.kind} onChange={(event) => changeKind(table.id, event.target.value as SpreadsheetSheetKind)}>
                      {KIND_OPTIONS.map((kind) => (
                        <option key={kind} value={kind}>
                          {pick(KIND_LABELS[kind])}
                        </option>
                      ))}
                    </select>
                  </label>
                  {table.kind === "movements" ? (
                    <small className="spreadsheet-wizard-hint">
                      {it
                        ? "Acquisti e bottiglie uscite diventano la storia di magazzino dei vini importati; le bevute finiscono anche nel diario."
                        : "Purchases and bottles taken out become the stock history of the imported wines; bottles drunk also go to the diary."}
                    </small>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {analysis.skipped_sheets.length ? (
            <small className="spreadsheet-wizard-hint">
              {it ? "Fogli senza una tabella di vini: " : "Sheets without a table of wines: "}
              {analysis.skipped_sheets.map((sheet) => sheet.name).join(", ")}
            </small>
          ) : null}
          <div className="spreadsheet-wizard-actions">
            <button type="button" disabled={!importedTables.length} onClick={() => setStep("columns")}>
              {it ? "Avanti" : "Next"}
            </button>
          </div>
        </div>
      ) : null}

      {analysis && mapping && step === "columns" ? (
        <div className="spreadsheet-wizard-body">
          <p className="spreadsheet-wizard-note">
            {it ? "Controlla il campo proposto per ogni colonna. Quelle evidenziate sono incerte: se non servono, lasciale nelle note." : "Check the field proposed for each column. Highlighted ones are uncertain: if you don't need them, leave them in the notes."}
          </p>
          {importedTables.map((table) => {
            const found = tablesById.get(table.id) as SpreadsheetTableAnalysis;
            const allowed = analysis.fields_by_kind[table.kind] ?? [];
            const fields = Object.values(table.columns);
            const hasMoney = fields.some((field) => ["price", "current_value", "target_price"].includes(field));
            const ratingQuestion = found.questions.find((question) => question.code === "rating_words");
            return (
              <section key={table.id} className="spreadsheet-columns" aria-label={found.sheets.join(" · ")}>
                <h5>
                  {found.sheets.join(" · ")} <span>{pick(KIND_LABELS[table.kind])}</span>
                </h5>
                <ul className="spreadsheet-column-list">
                  {found.columns.map((column) => {
                    const field = table.columns[column.key] ?? "ignore";
                    const uncertain = column.confidence === "low" && field !== "ignore";
                    return (
                      <li key={column.key} className={`spreadsheet-column${uncertain ? " is-uncertain" : ""}`}>
                        <div className="spreadsheet-column-head">
                          <strong>{column.header}</strong>
                          {column.samples.length ? <small>{column.samples.join(" · ")}</small> : <small>{it ? "Colonna vuota" : "Empty column"}</small>}
                          {column.rejected_field ? (
                            <small className="spreadsheet-wizard-hint">
                              {it
                                ? `Il nome fa pensare a «${fieldLabel(column.rejected_field)}», ma i valori non lo sono.`
                                : `The header suggests “${fieldLabel(column.rejected_field)}”, but the values don't fit.`}
                            </small>
                          ) : null}
                          {column.formulas_without_values ? (
                            <small className="spreadsheet-wizard-hint">
                              {it ? "Formule senza valore salvato: apri e salva il file in Excel per leggerle." : "Formulas with no saved value: open and save the file in Excel to read them."}
                            </small>
                          ) : null}
                        </div>
                        <label>
                          <span className="sr-only">{it ? `Campo per ${column.header}` : `Field for ${column.header}`}</span>
                          <select value={field} onChange={(event) => changeField(table.id, column.key, event.target.value)}>
                            {(allowed.includes(field) ? allowed : [field, ...allowed]).map((option) => (
                              <option key={option} value={option}>
                                {fieldLabel(option)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {field === "location" && column.position_separator ? (
                          <label className="spreadsheet-inline-check">
                            <input
                              type="checkbox"
                              checked={table.split_positions[column.key] ?? false}
                              onChange={(event) => updateTable(table.id, (current) => ({ ...current, split_positions: { ...current.split_positions, [column.key]: event.target.checked } }))}
                            />
                            <span>
                              {it ? `Dividi in ubicazione e bin su «${column.position_separator.trim()}»` : `Split into location and bin on “${column.position_separator.trim()}”`}
                            </span>
                          </label>
                        ) : null}
                        {table.date_orders[column.key] && ["order_date", "event_date"].includes(field) ? (
                          <label>
                            <span>{it ? `Ordine delle date (${column.samples[0] ?? ""})` : `Date order (${column.samples[0] ?? ""})`}</span>
                            <select
                              value={table.date_orders[column.key]}
                              onChange={(event) => updateTable(table.id, (current) => ({ ...current, date_orders: { ...current.date_orders, [column.key]: event.target.value as "dmy" | "mdy" } }))}
                            >
                              <option value="dmy">{it ? "Giorno/mese/anno" : "Day/month/year"}</option>
                              <option value="mdy">{it ? "Mese/giorno/anno" : "Month/day/year"}</option>
                            </select>
                          </label>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {hasMoney ? (
                  <label className="spreadsheet-table-option">
                    <span>{it ? "Valuta dei prezzi" : "Currency of the prices"}</span>
                    <select value={table.currency} onChange={(event) => updateTable(table.id, (current) => ({ ...current, currency: event.target.value }))}>
                      {(CURRENCIES.includes(table.currency) ? CURRENCIES : [table.currency, ...CURRENCIES]).map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                    {found.columns.some((column) => column.currency_ambiguous) ? (
                      <small>{it ? "Il file usa «$»: conferma di quale dollaro si tratta." : "The file uses “$”: confirm which dollar it is."}</small>
                    ) : null}
                  </label>
                ) : null}
                {ratingQuestion && fields.includes("rating_words") ? (
                  <label className="spreadsheet-table-option">
                    <span>{it ? "Giudizi a parole" : "Verbal ratings"}</span>
                    <select value={table.rating_words} onChange={(event) => updateTable(table.id, (current) => ({ ...current, rating_words: event.target.value as "standard" | "notes_only" }))}>
                      <option value="standard">{it ? "Converti in voto (discreto 3, buono 4, molto buono 5, ottimo 5.5, eccellente 6)" : "Convert to a rating (fair 3, good 4, very good 5, excellent 5.5, outstanding 6)"}</option>
                      <option value="notes_only">{it ? "Solo nella nota, senza voto" : "Only in the note, no rating"}</option>
                    </select>
                  </label>
                ) : null}
                {table.kind === "movements" && !fields.some((field) => ["quantity_in", "quantity_out", "movement_kind"].includes(field)) ? (
                  <label className="spreadsheet-table-option">
                    <span>{it ? "Le righe di questo foglio sono" : "The rows of this sheet are"}</span>
                    <select value={table.movement_direction} onChange={(event) => updateTable(table.id, (current) => ({ ...current, movement_direction: event.target.value as "in" | "out" }))}>
                      <option value="out">{it ? "Bottiglie uscite (bevute, regalate…)" : "Bottles taken out (drunk, given…)"}</option>
                      <option value="in">{it ? "Bottiglie entrate (acquisti)" : "Bottles in (purchases)"}</option>
                    </select>
                  </label>
                ) : null}
                {table.kind === "tasting" && fields.includes("buy_again") ? (
                  <label className="spreadsheet-inline-check">
                    <input type="checkbox" checked={table.buy_again_to_wishlist} onChange={(event) => updateTable(table.id, (current) => ({ ...current, buy_again_to_wishlist: event.target.checked }))} />
                    <span>{it ? "Aggiungi alla wishlist i vini da ricomprare che non sono in cantina" : "Add wines to buy again that are not in the cellar to the wishlist"}</span>
                  </label>
                ) : null}
              </section>
            );
          })}
          <div className="spreadsheet-wizard-actions">
            <button type="button" className="secondary" onClick={() => setStep("tables")} disabled={busy}>
              {it ? "Indietro" : "Back"}
            </button>
            <button type="button" onClick={() => void runPreview()} disabled={busy}>
              <ButtonBusyContent busy={busy} idleLabel={it ? "Prepara l'anteprima" : "Prepare preview"} busyLabel={it ? "Preparo…" : "Preparing…"} />
            </button>
          </div>
        </div>
      ) : null}

      {mapping && preview && step === "preview" ? (
        <div className="spreadsheet-wizard-body">
          <dl className="spreadsheet-summary">
            <div>
              <dt>{it ? "Vini in cantina" : "Cellar wines"}</dt>
              <dd>
                {preview.wine_new} {it ? "nuovi" : "new"}
                {preview.wine_duplicates ? `, ${preview.wine_duplicates} ${it ? "già presenti" : "already there"}` : ""}
              </dd>
            </div>
            <div>
              <dt>{it ? "Bottiglie" : "Bottles"}</dt>
              <dd>{preview.bottles_total}</dd>
            </div>
            <div>
              <dt>Wishlist</dt>
              <dd>
                {preview.wishlist_new} {it ? "nuovi" : "new"}
                {preview.wishlist_duplicates ? `, ${preview.wishlist_duplicates} ${it ? "già presenti" : "already there"}` : ""}
              </dd>
            </div>
            {preview.movements_total ? (
              <div>
                <dt>{it ? "Movimenti" : "Movements"}</dt>
                <dd>
                  {preview.movements_linked}
                  {preview.movements_drunk ? ` (${preview.movements_drunk} ${it ? (preview.movements_drunk === 1 ? "bevuta" : "bevute") : "drunk"})` : ""}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>{it ? "Degustazioni" : "Tastings"}</dt>
              <dd>
                {preview.tastings_total}
                {preview.tastings_total ? ` (${preview.tastings_linked} ${it ? "collegate a vini in cantina" : "linked to cellar wines"})` : ""}
              </dd>
            </div>
          </dl>
          {preview.sample_wine_duplicates.length ? <small className="spreadsheet-wizard-hint">{preview.sample_wine_duplicates.join(", ")}</small> : null}
          {isFreeTier && typeof preview.free_tier_label_limit === "number" && (preview.free_tier_importable_wines ?? preview.wines_total) < preview.wines_total ? (
            <p className="spreadsheet-wizard-note is-warning">
              {it
                ? `Piano gratuito: verranno importati ${preview.free_tier_importable_wines ?? 0} vini su ${preview.wines_total}, fino al limite di ${preview.free_tier_label_limit} etichette.`
                : `Free plan: ${preview.free_tier_importable_wines ?? 0} of ${preview.wines_total} wines will be imported, up to the ${preview.free_tier_label_limit}-label limit.`}
            </p>
          ) : null}
          {Object.entries(
            preview.warnings.reduce<Record<string, number>>((counts, warning) => ({ ...counts, [warning.code]: (counts[warning.code] ?? 0) + 1 }), {}),
          ).map(([code, count]) => (
            <p key={code} className="spreadsheet-wizard-note is-warning">
              {pick(WARNING_LABELS[code], code)}
              {count > 1 ? ` (${count})` : ""}
            </p>
          ))}
          {balanceExample && balanceTable ? (
            <section className={`spreadsheet-balance${needsBalanceAnswer ? " is-uncertain" : ""}`} aria-label={it ? "Uscite e quantità" : "Outflows and counts"}>
              <h5>{it ? "Le quantità della cantina tengono già conto delle uscite?" : "Do the cellar counts already include the outflows?"}</h5>
              <p className="spreadsheet-wizard-note">
                {it
                  ? `Per esempio ${balanceExample.wine}: nel foglio «${balanceExample.stock_sheet}» ne risultano ${balanceExample.stock}; nel foglio «${balanceExample.movements_sheet}» ${balanceSteps}.`
                  : `For example ${balanceExample.wine}: the “${balanceExample.stock_sheet}” sheet says ${balanceExample.stock}; the “${balanceExample.movements_sheet}” sheet has ${balanceSteps}.`}
              </p>
              <div className="spreadsheet-balance-options" role="radiogroup" aria-label={it ? "Risposta" : "Answer"}>
                <label className="spreadsheet-inline-check">
                  <input type="radio" name="stock-includes-movements" checked={balanceTable.stock_includes_movements === "yes"} onChange={() => answerBalance("yes")} disabled={busy} />
                  <span>
                    {it
                      ? `Sì, le quantità sono già aggiornate: restano ${balanceExample.if_included}`
                      : `Yes, the counts are up to date: ${balanceExample.if_included} left`}
                  </span>
                </label>
                <label className="spreadsheet-inline-check">
                  <input type="radio" name="stock-includes-movements" checked={balanceTable.stock_includes_movements === "no"} onChange={() => answerBalance("no")} disabled={busy} />
                  <span>
                    {it
                      ? `No, le uscite vanno ancora tolte: restano ${balanceExample.if_applied}`
                      : `No, the outflows still need taking off: ${balanceExample.if_applied} left`}
                  </span>
                </label>
              </div>
            </section>
          ) : null}
          {preview.names.length ? (
            <section className="spreadsheet-names" aria-label={it ? "Produttore, vino e annata" : "Producer, wine and vintage"}>
              <h5>{it ? "Produttore, vino e annata" : "Producer, wine and vintage"}</h5>
              <p className="spreadsheet-wizard-note">
                {openNames.length === 1
                  ? it
                    ? "1 nome non è stato diviso con certezza: è in cima, correggilo se serve."
                    : "1 name could not be split with certainty: it is at the top, correct it if needed."
                  : openNames.length
                    ? it
                      ? `${openNames.length} nomi non sono stati divisi con certezza: sono in cima, correggili se serve.`
                      : `${openNames.length} names could not be split with certainty: they are at the top, correct them if needed.`
                    : it
                      ? "Tutti i nomi sono stati divisi. Puoi comunque correggerli."
                      : "Every name was split. You can still correct them."}
              </p>
              {openNames.length ? (
                <div className="spreadsheet-ai-split">
                  <button type="button" className="secondary compact" onClick={splitNamesWithAi} disabled={aiBusy || busy}>
                    <ButtonBusyContent
                      busy={aiBusy}
                      idleLabel={it ? `Dividi con l'AI (${openNames.length})` : `Split with AI (${openNames.length})`}
                      busyLabel={it ? "L'AI sta leggendo i nomi…" : "AI is reading the names…"}
                      icon={<AppIcon name="glass-sparkle" variant="ai" tone="accent" size="0.9rem" />}
                      ai
                    />
                  </button>
                  <small>
                    {aiFreeNamesLeft > 0
                      ? it
                        ? `Riceve solo questi nomi, nient'altro del file. I primi ${AI_FREE_NAMES} nomi sono gratuiti: te ne restano ${aiFreeNamesLeft}${openNames.length > aiFreeNamesLeft ? ", gli altri usano i crediti AI" : ""}.`
                        : `Only these names are sent, nothing else from the file. The first ${AI_FREE_NAMES} names are free: ${aiFreeNamesLeft} left${openNames.length > aiFreeNamesLeft ? ", the rest use AI credits" : ""}.`
                      : it
                        ? "Riceve solo questi nomi, nient'altro del file. I nomi gratuiti sono finiti: usa i crediti AI."
                        : "Only these names are sent, nothing else from the file. The free names are used up: this uses AI credits."}
                  </small>
                </div>
              ) : null}
              {aiMessages.map((message) => (
                <p key={message.text} className={`spreadsheet-wizard-note${message.warning ? " is-warning" : ""}`} role="status">
                  {message.text}
                </p>
              ))}
              <ul className="spreadsheet-name-list">
                {[...preview.names]
                  .sort((left, right) => Number(right.rule === "unresolved") - Number(left.rule === "unresolved"))
                  .slice(0, showAllNames ? preview.names.length : NAME_ROWS_SHOWN)
                  .map((row) => {
                    const table = mapping.tables.find((item) => item.id === row.table_id);
                    const override = table?.name_overrides[row.ref];
                    const value = override ?? { producer: row.producer, name: row.name, vintage: row.vintage };
                    return (
                      <li key={row.ref} className={`spreadsheet-name${row.rule === "unresolved" && !override ? " is-uncertain" : ""}`}>
                        <small>
                          {row.raw} · {override ? pick(aiRefs.has(row.ref) ? RULE_LABELS.ai : RULE_LABELS.override) : pick(RULE_LABELS[row.rule], row.rule)}
                        </small>
                        <div className="spreadsheet-name-fields">
                          <label>
                            <span>{it ? "Produttore" : "Producer"}</span>
                            <input value={value.producer} onChange={(event) => overrideName(row, "producer", event.target.value)} />
                          </label>
                          <label>
                            <span>{it ? "Vino" : "Wine"}</span>
                            <input value={value.name} onChange={(event) => overrideName(row, "name", event.target.value)} />
                          </label>
                          <label className="spreadsheet-name-vintage">
                            <span>{it ? "Annata" : "Vintage"}</span>
                            <input value={value.vintage} inputMode="numeric" onChange={(event) => overrideName(row, "vintage", event.target.value)} />
                          </label>
                        </div>
                      </li>
                    );
                  })}
              </ul>
              {preview.names.length > NAME_ROWS_SHOWN && !showAllNames ? (
                <button type="button" className="secondary compact" onClick={() => setShowAllNames(true)}>
                  {it ? `Mostra tutti i ${preview.names.length} nomi` : `Show all ${preview.names.length} names`}
                </button>
              ) : null}
            </section>
          ) : null}
          <label className="spreadsheet-table-option">
            <span>{it ? "Vini già presenti in cantina" : "Wines already in the cellar"}</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as ImportMode)}>
              <option value="skip_duplicates">{it ? "Salta quelli già presenti (consigliato)" : "Skip those already there (recommended)"}</option>
              <option value="update_existing">{it ? "Aggiornali con i dati del file" : "Update them with the file's data"}</option>
              <option value="add_all">{it ? "Importa comunque tutte le righe" : "Import every row anyway"}</option>
            </select>
          </label>
          <div className="spreadsheet-wizard-actions">
            <button type="button" className="secondary" onClick={() => setStep("columns")} disabled={busy}>
              {it ? "Indietro" : "Back"}
            </button>
            <button type="button" className="secondary" onClick={() => void runPreview()} disabled={busy}>
              {it ? "Aggiorna anteprima" : "Refresh preview"}
            </button>
            <button type="button" onClick={() => void runImport()} disabled={busy || needsBalanceAnswer}>
              <ButtonBusyContent busy={busy} idleLabel={it ? "Importa" : "Import"} busyLabel={it ? "Importo…" : "Importing…"} icon={appActionSvgIcon("import")} />
            </button>
          </div>
        </div>
      ) : null}

      {result && step === "done" ? (
        <div className="spreadsheet-wizard-body">
          <dl className="spreadsheet-summary">
            <div>
              <dt>{it ? "Vini in cantina" : "Cellar wines"}</dt>
              <dd>
                +{result.wines_imported}
                {result.wines_updated ? `, ${result.wines_updated} ${it ? "aggiornati" : "updated"}` : ""}
                {result.wines_skipped ? `, ${result.wines_skipped} ${it ? "saltati" : "skipped"}` : ""}
              </dd>
            </div>
            <div>
              <dt>Wishlist</dt>
              <dd>
                +{result.wishlist_imported}
                {result.wishlist_skipped ? `, ${result.wishlist_skipped} ${it ? "saltati" : "skipped"}` : ""}
              </dd>
            </div>
            <div>
              <dt>{it ? "Degustazioni" : "Tastings"}</dt>
              <dd>+{result.tastings_imported}</dd>
            </div>
            {result.movements_imported ? (
              <div>
                <dt>{it ? "Movimenti" : "Movements"}</dt>
                <dd>+{result.movements_imported}</dd>
              </div>
            ) : null}
          </dl>
          {result.wines_over_free_tier ? (
            <p className="spreadsheet-wizard-note is-warning">
              {it
                ? `${result.wines_over_free_tier} vini non sono stati importati per il limite del piano gratuito.`
                : `${result.wines_over_free_tier} wines were not imported because of the free plan limit.`}
            </p>
          ) : null}
          <p className="spreadsheet-wizard-note">
            {it ? "Le scelte di questa importazione sono salvate: la prossima volta che carichi lo stesso file le ritroverai." : "This import's choices are saved: the next time you upload the same file you will find them again."}
          </p>
          <div className="spreadsheet-wizard-actions">
            <button type="button" onClick={onClose}>
              {it ? "Fine" : "Done"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
