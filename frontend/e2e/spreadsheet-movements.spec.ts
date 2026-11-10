import { expect, test, type Page } from "@playwright/test";
import { mockApi, session, wine, memberships } from "./fixtures/app";
import { stashAnalysis } from "./fixtures/spreadsheetStash";

const basePreview = {
  tables: [
    { id: "t0", kind: "inventory", rows: 2, wines: 2, bottles: 8, wishlist: 0, tastings: 0, movements: 0, skipped_rows: 0 },
    { id: "t1", kind: "movements", rows: 1, wines: 0, bottles: 0, wishlist: 0, tastings: 0, movements: 1, skipped_rows: 0 },
  ],
  names: [],
  unresolved_names: 0,
  wines_total: 2, wine_new: 2, wine_duplicates: 0, sample_wine_duplicates: [],
  bottles_total: 8, wishlist_total: 0, wishlist_new: 0, wishlist_duplicates: 0,
  tastings_total: 0, tastings_linked: 0,
  warnings: [],
  free_tier_label_limit: null, free_tier_active_labels: 0, free_tier_labels_required: 0, free_tier_importable_wines: null,
  ai_free_names_left: 15,
  movements_total: 1, movements_linked: 1, movements_drunk: 1, movements_unmatched: 0,
  balance_questions: ["t1"],
  balance_example: {
    table_id: "t1",
    wine: "Masi Campofiorin 2020",
    stock: 6,
    stock_sheet: "Our bottles",
    movements_sheet: "Taken out",
    steps: [{ date: "2026-05-11", delta: -2 }],
    if_included: 6,
    if_applied: 4,
  },
};

const result = {
  wines_imported: 2, wines_updated: 0, wines_skipped: 0, wines_over_free_tier: 0,
  wishlist_imported: 0, wishlist_skipped: 0, tastings_imported: 1, movements_imported: 1,
};

type Table = { id: string; kind: string; movement_direction: string; stock_includes_movements: string | null };
type Call = { path: string; tables: Table[] };

/** The preview answers the "already included?" question once the mapping carries an answer. */
async function mockSpreadsheetApi(page: Page) {
  await page.addInitScript(({ analysis, previewBody, resultBody }) => {
    const mockedFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, location.href);
      if (!url.pathname.startsWith("/api/v1/imports/spreadsheet")) return mockedFetch(input, init);
      const form = init?.body instanceof FormData ? init.body : null;
      const raw = form?.get("mapping");
      const mapping = typeof raw === "string" ? (JSON.parse(raw) as { tables: Table[] }) : { tables: [] };
      const calls = JSON.parse(sessionStorage.getItem("spreadsheet-calls") || "[]");
      calls.push({ path: url.pathname, tables: mapping.tables });
      sessionStorage.setItem("spreadsheet-calls", JSON.stringify(calls));
      if (url.pathname.endsWith("/analyze")) return Response.json(analysis);
      if (url.pathname.endsWith("/preview")) {
        const answer = mapping.tables.find((table) => table.kind === "movements")?.stock_includes_movements;
        return Response.json({
          ...previewBody,
          balance_questions: answer ? [] : ["t1"],
          bottles_total: answer === "no" ? 6 : 8,
        });
      }
      return Response.json(resultBody);
    };
  }, { analysis: stashAnalysis, previewBody: basePreview, resultBody: result });
  return async (): Promise<Call[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem("spreadsheet-calls") || "[]"));
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

for (const locale of ["it", "en"] as const) {
  test(`spreadsheet import replays a register after asking whether the counts include it (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockApi(page, [], false, memberships, [wine], { ...session, locale });
    const readCalls = await mockSpreadsheetApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: it ? "Impostazioni" : "Settings", exact: true }).click();
    await page.getByRole("tab", { name: it ? "Dati" : "Data", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const card = page.getByRole("region", { name: it ? "Importa la tua cantina" : "Import your cellar", exact: true });
    await card.getByLabel(it ? "Carica file Excel" : "Upload spreadsheet", { exact: true }).setInputFiles({
      name: "stash.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("PK fake workbook"),
    });

    const wizard = card.getByRole("region", { name: it ? "Importa dal tuo Excel" : "Import from your spreadsheet", exact: true });
    const kinds = wizard.getByRole("combobox", { name: it ? "Contiene" : "Holds" });
    await expect(kinds.nth(1)).toHaveValue("movements");
    await expect(wizard.getByText(it ? "Acquisti e bottiglie uscite diventano la storia" : "Purchases and bottles taken out become the stock history", { exact: false })).toBeVisible();
    await wizard.getByRole("button", { name: it ? "Avanti" : "Next", exact: true }).click();

    // "Taken out" only says how many: the sheet name makes them outflows.
    const direction = wizard.getByRole("combobox", { name: it ? "Le righe di questo foglio sono" : "The rows of this sheet are", exact: true });
    await expect(direction).toHaveValue("out");
    await wizard.getByRole("button", { name: it ? "Prepara l'anteprima" : "Prepare preview", exact: true }).click();

    const balance = wizard.getByRole("region", { name: it ? "Uscite e quantità" : "Outflows and counts", exact: true });
    await expect(balance.getByText(it ? "Per esempio Masi Campofiorin 2020: nel foglio «Our bottles» ne risultano 6" : "For example Masi Campofiorin 2020: the “Our bottles” sheet says 6", { exact: false })).toBeVisible();
    await expect(balance.getByText("11/05/2026 −2", { exact: false })).toBeVisible();
    const importButton = wizard.getByRole("button", { name: it ? "Importa" : "Import", exact: true });
    await expect(importButton).toBeDisabled();
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await balance.screenshot({ path: testInfo.outputPath(`spreadsheet-balance-${locale}-390.png`) });

    await balance.getByRole("radio", { name: it ? "No, le uscite vanno ancora tolte: restano 4" : "No, the outflows still need taking off: 4 left", exact: true }).check();
    await expect(importButton).toBeEnabled();
    await expect(wizard.getByText(it ? "1 (1 bevuta)" : "1 (1 drunk)", { exact: true })).toBeVisible();
    await importButton.click();
    await expect(wizard.getByText(it ? "Movimenti" : "Movements", { exact: true })).toBeVisible();

    const calls = await readCalls();
    const sent = calls[calls.length - 1];
    expect(sent.path).toBe("/api/v1/imports/spreadsheet");
    const register = sent.tables.find((table) => table.id === "t1");
    expect(register).toMatchObject({ kind: "movements", movement_direction: "out", stock_includes_movements: "no" });
    await wizard.screenshot({ path: testInfo.outputPath(`spreadsheet-movements-done-${locale}-390.png`) });
  });
}
