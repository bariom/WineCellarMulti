import { expect, test, type Page } from "@playwright/test";
import { mockApi, session, wine, memberships } from "./fixtures/app";
import { spreadsheetAnalysis } from "./fixtures/spreadsheetImport";

const preview = {
  tables: [
    { id: "t0", kind: "inventory", rows: 5, wines: 5, bottles: 12, wishlist: 0, tastings: 0, skipped_rows: 0 },
    { id: "t1", kind: "wishlist", rows: 2, wines: 0, bottles: 0, wishlist: 2, tastings: 0, skipped_rows: 0 },
  ],
  names: [
    { ref: "t0:Vini in casa!2", table_id: "t0", sheet: "Vini in casa", row: 2, raw: "Ripasso Valpolicella - Tommasi", producer: "Tommasi", name: "Ripasso Valpolicella", vintage: "2020", rule: "separator" },
    { ref: "t0:Vini in casa!3", table_id: "t0", sheet: "Vini in casa", row: 3, raw: "Planeta La Segreta Rosso", producer: "", name: "Planeta La Segreta Rosso", vintage: "2022", rule: "unresolved" },
  ],
  unresolved_names: 1,
  wines_total: 5, wine_new: 4, wine_duplicates: 1, sample_wine_duplicates: ["Masi Campofiorin"],
  bottles_total: 12, wishlist_total: 2, wishlist_new: 2, wishlist_duplicates: 0,
  tastings_total: 0, tastings_linked: 0,
  warnings: [{ code: "quantity_assumed", table_id: "t0", sheet: "Vini in casa", row: 4, column: "", value: "" }],
  free_tier_label_limit: null, free_tier_active_labels: 0, free_tier_labels_required: 0, free_tier_importable_wines: null,
  ai_free_names_left: 15,
  movements_total: 0, movements_linked: 0, movements_drunk: 0, movements_unmatched: 0,
  balance_questions: [], balance_example: null,
};

const nameSplit = {
  suggestions: [{ raw: "Planeta La Segreta Rosso", producer: "Planeta", name: "La Segreta Rosso", vintage: "", confidence: "high" }],
  unsplit: 0, free_names_used: 1, ai_free_names_left: 14, needs_credits: 0, charged_cost_usd: "0",
};

const result = { wines_imported: 4, wines_updated: 0, wines_skipped: 1, wines_over_free_tier: 0, wishlist_imported: 2, wishlist_skipped: 0, tastings_imported: 0, movements_imported: 0 };

type Call = { path: string; mode: string | null; file: string; mapping: Record<string, unknown> | null; names: string[] | null };

/** Answers the spreadsheet endpoints in the page, ahead of the app-wide API mock. */
async function mockSpreadsheetApi(page: Page) {
  await page.addInitScript(({ analysis, previewBody, resultBody, namesBody }) => {
    const mockedFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, location.href);
      if (!url.pathname.startsWith("/api/v1/imports/spreadsheet")) return mockedFetch(input, init);
      const form = init?.body instanceof FormData ? init.body : null;
      const file = form?.get("file");
      const mapping = form?.get("mapping");
      const calls = JSON.parse(sessionStorage.getItem("spreadsheet-calls") || "[]");
      calls.push({
        path: url.pathname,
        mode: url.searchParams.get("mode"),
        file: file instanceof File ? file.name : "",
        mapping: typeof mapping === "string" ? JSON.parse(mapping) : null,
        names: typeof init?.body === "string" ? JSON.parse(init.body).names : null,
      });
      sessionStorage.setItem("spreadsheet-calls", JSON.stringify(calls));
      const path = url.pathname;
      const body = path.endsWith("/analyze") ? analysis : path.endsWith("/preview") ? previewBody : path.endsWith("/names") ? namesBody : resultBody;
      return Response.json(body);
    };
  }, { analysis: spreadsheetAnalysis, previewBody: preview, resultBody: result, namesBody: nameSplit });
  return async (): Promise<Call[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem("spreadsheet-calls") || "[]"));
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

for (const locale of ["it", "en"] as const) {
  test(`spreadsheet import reads the file, confirms tables and columns, previews and imports (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockApi(page, [], false, memberships, [wine], { ...session, locale });
    const readCalls = await mockSpreadsheetApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: it ? "Impostazioni" : "Settings", exact: true }).click();
    await page.getByRole("tab", { name: it ? "Dati" : "Data", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const card = page.getByRole("region", { name: it ? "Importa la tua cantina" : "Import your cellar", exact: true });
    const source = card.getByRole("region", { name: it ? "Importa da Excel" : "Import from Excel", exact: true });
    await expect(source).toBeVisible();
    await source.getByLabel(it ? "Carica file Excel" : "Upload spreadsheet", { exact: true }).setInputFiles({
      name: "vini.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("PK fake workbook"),
    });

    const wizard = card.getByRole("region", { name: it ? "Importa dal tuo Excel" : "Import from your spreadsheet", exact: true });
    // The CellarTracker / backup confirmation does not apply to the spreadsheet.
    await expect(card.getByRole("button", { name: it ? "Conferma importazione" : "Confirm import" })).toHaveCount(0);
    await expect(wizard.getByText("Vini in casa", { exact: true })).toBeVisible();
    await expect(wizard.getByText("Da comprare", { exact: true })).toBeVisible();
    const kinds = wizard.getByRole("combobox", { name: it ? "Contiene" : "Holds" });
    await expect(kinds.nth(0)).toHaveValue("inventory");
    await expect(kinds.nth(1)).toHaveValue("wishlist");
    await expectNoHorizontalOverflow(page);
    await wizard.screenshot({ path: testInfo.outputPath(`spreadsheet-tables-${locale}-390.png`) });
    await wizard.getByRole("button", { name: it ? "Avanti" : "Next", exact: true }).click();

    // "Per quando" looked like a date but holds occasions: the wizard says why it is a tag.
    const perQuando = wizard.getByRole("combobox", { name: it ? "Campo per Per quando" : "Field for Per quando", exact: true });
    await expect(perQuando).toHaveValue("tags");
    await expect(wizard.getByText(it ? "Il nome fa pensare a «Data», ma i valori non lo sono." : "The header suggests “Date”, but the values don't fit.", { exact: true })).toBeVisible();
    // Moving "Nota mia" to the merchant sends "Dove l'ho preso" back to the notes.
    await wizard.getByRole("combobox", { name: it ? "Campo per Nota mia" : "Field for Nota mia", exact: true }).selectOption("merchant");
    await expect(wizard.getByRole("combobox", { name: it ? "Campo per Dove l'ho preso" : "Field for Dove l'ho preso", exact: true })).toHaveValue("notes");
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await wizard.screenshot({ path: testInfo.outputPath(`spreadsheet-columns-${locale}-390.png`) });
    await wizard.getByRole("button", { name: it ? "Prepara l'anteprima" : "Prepare preview", exact: true }).click();

    await expect(wizard.getByText(it ? "4 nuovi, 1 già presenti" : "4 new, 1 already there", { exact: true })).toBeVisible();
    await expect(wizard.getByText(it ? "Righe senza quantità: contata 1 bottiglia ciascuna" : "Rows without a quantity: counted as 1 bottle each", { exact: true })).toBeVisible();
    const names = wizard.getByRole("region", { name: it ? "Produttore, vino e annata" : "Producer, wine and vintage", exact: true });
    // Unresolved names come first; AI can propose a split from the label alone.
    const firstProducer = names.getByRole("textbox", { name: it ? "Produttore" : "Producer", exact: true }).first();
    await expect(firstProducer).toHaveValue("");
    await expect(names.getByText(it ? "I primi 15 nomi sono gratuiti: te ne restano 15" : "The first 15 names are free: 15 left", { exact: false })).toBeVisible();
    await expect(names.getByText(it ? "1 nome non è stato diviso con certezza" : "1 name could not be split with certainty", { exact: false })).toBeVisible();
    await names.screenshot({ path: testInfo.outputPath(`spreadsheet-names-ai-${locale}-390.png`) });
    await names.getByRole("button", { name: it ? "Dividi con l'AI (1)" : "Split with AI (1)", exact: true }).click();
    await expect(names.getByText(it ? "L'AI ha proposto produttore e vino per 1 riga: controllala qui sotto." : "AI suggested producer and wine for 1 row: check it below.", { exact: true })).toBeVisible();
    await expect(names.getByText(it ? "Tutti i nomi sono stati divisi." : "Every name was split.", { exact: false })).toBeVisible();
    await expect(firstProducer).toHaveValue("Planeta");
    await expect(names.getByRole("textbox", { name: it ? "Vino" : "Wine", exact: true }).first()).toHaveValue("La Segreta Rosso");
    await expect(names.getByText(it ? "Planeta La Segreta Rosso · Proposto dall'AI, controlla" : "Planeta La Segreta Rosso · Suggested by AI, please check", { exact: true })).toBeVisible();
    await expect(names.getByRole("button", { name: it ? "Dividi con l'AI (1)" : "Split with AI (1)" })).toHaveCount(0);
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await wizard.screenshot({ path: testInfo.outputPath(`spreadsheet-preview-${locale}-390.png`) });
    await wizard.getByRole("button", { name: it ? "Importa" : "Import", exact: true }).click();

    await expect(wizard.getByText("+4", { exact: false }).first()).toBeVisible();
    await expect(wizard.getByText(it ? "Le scelte di questa importazione sono salvate" : "This import's choices are saved", { exact: false })).toBeVisible();
    const calls = await readCalls();
    expect(calls[0].file).toBe("vini.xlsx");
    // The dev server's StrictMode may run the analysis effect twice; everything after it runs once.
    expect(calls.filter((call) => !call.path.endsWith("/analyze")).map((call) => call.path)).toEqual([
      "/api/v1/imports/spreadsheet/preview",
      "/api/v1/imports/spreadsheet/names",
      "/api/v1/imports/spreadsheet",
    ]);
    // Only the unresolved label goes to the AI, nothing else from the file.
    expect(calls.find((call) => call.path.endsWith("/names"))?.names).toEqual(["Planeta La Segreta Rosso"]);
    const sent = calls[calls.length - 1];
    expect(sent.mode).toBe("skip_duplicates");
    const tables = (sent.mapping as { fingerprint: string; tables: { id: string; kind: string; columns: Record<string, string>; name_overrides: Record<string, unknown> }[] });
    expect(tables.fingerprint).toBe(spreadsheetAnalysis.fingerprint);
    expect(tables.tables.map((table) => [table.id, table.kind])).toEqual([["t0", "inventory"], ["t1", "wishlist"]]);
    expect(tables.tables[0].columns.c7).toBe("merchant");
    expect(tables.tables[0].columns.c5).toBe("notes");
    expect(tables.tables[0].name_overrides).toEqual({
      "t0:Vini in casa!3": { producer: "Planeta", name: "La Segreta Rosso", vintage: "2022" },
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wizard.screenshot({ path: testInfo.outputPath(`spreadsheet-done-${locale}-1440.png`) });
  });
}
