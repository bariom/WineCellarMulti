import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

type Options = { locale?: "it" | "en"; theme?: string };

const previewCounts = {
  wines: 42,
  wine_tasting_entries: 118,
  external_wine_tastings: 9,
  wine_stock_lots: 51,
  wine_sales: 0,
  wishlist_items: 7,
  purchase_imports: 12,
  wine_strategy_allocations: 30,
  user_taste_profiles: 1,
  wine_value_history: 20,
  wine_stock_movements: 5,
};

/** Mocks the three backup endpoints on top of the shared API fixtures; calls land in sessionStorage. */
async function setup(page: Page, { locale = "it", theme = "light" }: Options = {}) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page, [], false, memberships, [wine], { ...session, locale, theme_preference: theme });
  await page.addInitScript((counts) => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, location.href);
      if (!url.pathname.startsWith("/api/v1/backup/")) return original(input, init);
      // Like the network, a request aborted straight away (React's development double mount) never arrives.
      await Promise.resolve();
      if (init?.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const file = init?.body instanceof FormData ? init.body.get("file") : null;
      const calls = JSON.parse(sessionStorage.getItem("backup-calls") || "[]");
      calls.push({ path: url.pathname, method: init?.method || "GET", file: file instanceof File ? file.name : null });
      sessionStorage.setItem("backup-calls", JSON.stringify(calls));
      const status = Number(sessionStorage.getItem(`backup-status:${url.pathname}`) || 200);
      if (status === 413) return new Response("<html><head><title>413 Request Entity Too Large</title></head></html>", { status: 413, headers: { "Content-Type": "text/html" } });
      if (status === 409) return Response.json({ detail: "La cantina non è vuota: svuotala prima di ripristinare." }, { status: 409 });
      if (url.pathname.endsWith("/export")) {
        const bytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
        return new Response(bytes, { status: 200, headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(bytes.byteLength),
          "Content-Disposition": 'attachment; filename="vinaris-backup-cantina-e2e-2026-11-23.zip"',
        } });
      }
      if (url.pathname.endsWith("/preview")) return Response.json({
        schema: "vinaris-backup/1",
        exported_at: "2026-11-20T18:30:00Z",
        household_name: "Cantina E2E",
        counts,
        file_count: 57,
        target_empty: sessionStorage.getItem("backup-target-full") !== "1",
        warnings: ["2 foto non erano leggibili e non sono nel backup."],
      });
      return Response.json({ restored: counts, skipped: { wine_value_history: 1 }, file_count: 57, warnings: [] });
    };
  }, previewCounts);
  await page.goto("/");
  await page.getByRole("button", { name: locale === "it" ? "Impostazioni" : "Settings", exact: true }).click();
  await page.getByRole("tab", { name: locale === "it" ? "Dati" : "Data", exact: true }).click();
}

const calls = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("backup-calls") || "[]") as Array<{ path: string; method: string; file: string | null }>);
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const zip = { name: "vinaris-backup-cantina-e2e-2026-11-20.zip", mimeType: "application/zip", buffer: Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]) };

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

test("the complete backup downloads as a ZIP and the JSON export stays available underneath", async ({ page }, testInfo) => {
  await setup(page);
  const card = page.getByRole("region", { name: "Backup completo", exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByText(/Non contiene le chiavi API, l'account e l'abbonamento/)).toBeVisible();
  // The custom JSON export is still there, folded away below the import.
  const jsonExport = page.getByRole("button", { name: "Esporta JSON", exact: true });
  await expect(jsonExport).toBeHidden();
  await page.getByText("Esportazione JSON personalizzata", { exact: true }).click();
  await expect(jsonExport).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "Scarica backup completo", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("vinaris-backup-cantina-e2e-2026-11-23.zip");
  await expect(card.getByText(/^Backup scaricato: vinaris-backup-cantina-e2e-2026-11-23\.zip/)).toBeVisible();
  expect(await calls(page)).toEqual([{ path: "/api/v1/backup/export", method: "GET", file: null }]);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("full-backup-download-1440.png") });
});

test("a failed download explains itself and leaves the button usable", async ({ page }) => {
  await setup(page, { locale: "en" });
  await page.evaluate(() => sessionStorage.setItem("backup-status:/api/v1/backup/export", "413"));
  const card = page.getByRole("region", { name: "Complete backup", exact: true });
  await card.getByRole("button", { name: "Download complete backup", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("too large");
  await expect(card.getByRole("button", { name: "Download complete backup", exact: true })).toBeEnabled();
});

for (const locale of ["it", "en"] as const) {
  test(`a ZIP backup shows its contents, then restores into an empty cellar (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await setup(page, { locale });
    const importCard = page.getByRole("region", { name: it ? "Importa la tua cantina" : "Import your cellar", exact: true });
    await importCard.getByLabel(it ? "Carica backup Vinaris (ZIP o JSON)" : "Upload Vinaris backup (ZIP or JSON)", { exact: true }).setInputFiles(zip);
    const restore = importCard.getByRole("region", { name: it ? "Ripristina il backup completo" : "Restore the complete backup", exact: true });
    await expect(restore).toBeVisible();
    // The sources close while the backup is open, as with every other import.
    await expect(importCard.getByRole("group", { name: it ? "Origine dei dati" : "Data source", exact: true })).toHaveCount(0);
    await expect(restore.getByText("Cantina E2E", { exact: true })).toBeVisible();
    await expect(restore.getByText(it ? "20 novembre 2026" : "20 November 2026", { exact: false })).toBeVisible();
    const summary = restore.getByLabel(it ? "Contenuto del backup" : "Backup contents", { exact: true });
    for (const [label, value] of it
      ? [["Vini", "42"], ["Bevute e degustazioni", "118"], ["Foto e documenti", "57"], ["Documenti d'acquisto", "12"], ["Altri dati", "25"]]
      : [["Wines", "42"], ["Tastings", "118"], ["Photos and documents", "57"], ["Purchase documents", "12"], ["Other records", "25"]]) {
      await expect(summary.locator("div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd")).toHaveText(value);
    }
    // Tables with nothing in them are left out of the summary.
    await expect(summary.getByText(it ? "Vendite" : "Sales", { exact: true })).toHaveCount(0);
    await expect(restore.getByText("2 foto non erano leggibili e non sono nel backup.", { exact: true })).toBeVisible();
    expect((await calls(page)).map((call) => [call.path, call.file])).toEqual([["/api/v1/backup/preview", zip.name]]);

    for (const [width, height] of [[360, 800], [390, 844], [430, 932], [1440, 1000]] as const) {
      await page.setViewportSize({ width, height });
      await restore.scrollIntoViewIfNeeded();
      expect(await noHorizontalOverflow(page)).toBe(true);
      const bounds = (await restore.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      const confirm = (await restore.getByRole("button", { name: it ? "Ripristina backup" : "Restore backup", exact: true }).boundingBox())!;
      expect(confirm.height).toBeGreaterThanOrEqual(44);
      expect(confirm.x + confirm.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      const heading = (await restore.getByRole("heading", { level: 4 }).boundingBox())!;
      const close = (await restore.getByRole("button", { name: it ? "Chiudi" : "Close", exact: true }).boundingBox())!;
      expect(overlaps(heading, close)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`full-backup-preview-${locale}-${width}.png`), fullPage: false });
    }

    await restore.getByRole("button", { name: it ? "Ripristina backup" : "Restore backup", exact: true }).click();
    await expect(restore.getByText(it ? "Ripristino completato: la cantina è tornata com'era nel backup." : "Restore complete: the cellar is back as it was in the backup.", { exact: true })).toBeVisible();
    await expect(restore.getByText(it ? "1 elemento del file non è stato ripristinato." : "1 record in the file was not restored.", { exact: true })).toBeVisible();
    expect((await calls(page)).map((call) => call.path)).toEqual(["/api/v1/backup/preview", "/api/v1/backup/restore"]);
    await page.setViewportSize({ width: 390, height: 844 });
    await restore.scrollIntoViewIfNeeded();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`full-backup-restored-${locale}-390.png`) });
    await restore.getByRole("button", { name: it ? "Fine" : "Done", exact: true }).click();
    await expect(restore).toHaveCount(0);
    await expect(importCard.getByRole("group", { name: it ? "Origine dei dati" : "Data source", exact: true })).toBeVisible();
  });
}

test("a cellar that is not empty must be emptied first, then checked again", async ({ page }, testInfo) => {
  await setup(page);
  await page.evaluate(() => sessionStorage.setItem("backup-target-full", "1"));
  const importCard = page.getByRole("region", { name: "Importa la tua cantina", exact: true });
  await importCard.getByLabel("Carica backup Vinaris (ZIP o JSON)", { exact: true }).setInputFiles(zip);
  const restore = importCard.getByRole("region", { name: "Ripristina il backup completo", exact: true });
  await expect(restore.getByText("Prima svuota la cantina", { exact: true })).toBeVisible();
  const confirm = restore.getByRole("button", { name: "Ripristina backup", exact: true });
  await expect(confirm).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await restore.getByText("Prima svuota la cantina", { exact: true }).scrollIntoViewIfNeeded();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("full-backup-not-empty-390.png") });
  // Nothing is emptied automatically: the button only leads to the existing action.
  await restore.getByRole("button", { name: "Vai a Svuota cantina", exact: true }).click();
  const emptyButton = page.getByRole("button", { name: "Svuota cantina", exact: true });
  await expect(emptyButton).toBeFocused();
  await expect(emptyButton).toBeInViewport();
  await page.evaluate(() => sessionStorage.removeItem("backup-target-full"));
  await restore.getByRole("button", { name: "Controlla di nuovo", exact: true }).click();
  await expect(confirm).toBeEnabled();
  expect((await calls(page)).map((call) => call.path)).toEqual(["/api/v1/backup/preview", "/api/v1/backup/preview"]);
});

test("a restore refused because the cellar filled up meanwhile asks to empty it again", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => sessionStorage.setItem("backup-status:/api/v1/backup/restore", "409"));
  const importCard = page.getByRole("region", { name: "Importa la tua cantina", exact: true });
  await importCard.getByLabel("Carica backup Vinaris (ZIP o JSON)", { exact: true }).setInputFiles(zip);
  const restore = importCard.getByRole("region", { name: "Ripristina il backup completo", exact: true });
  await restore.getByRole("button", { name: "Ripristina backup", exact: true }).click();
  await expect(restore.getByRole("alert")).toHaveText("La cantina non è vuota: svuotala prima di ripristinare.");
  await expect(restore.getByText("Prima svuota la cantina", { exact: true })).toBeVisible();
  await expect(restore.getByRole("button", { name: "Ripristina backup", exact: true })).toBeDisabled();
});

test("a backup too large for the server gets the friendly upload message", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => sessionStorage.setItem("backup-status:/api/v1/backup/preview", "413"));
  const importCard = page.getByRole("region", { name: "Importa la tua cantina", exact: true });
  await importCard.getByLabel("Carica backup Vinaris (ZIP o JSON)", { exact: true }).setInputFiles(zip);
  const restore = importCard.getByRole("region", { name: "Ripristina il backup completo", exact: true });
  await expect(restore.getByRole("alert")).toContainText("troppo grande");
  await expect(restore.getByRole("button", { name: "Riprova", exact: true })).toBeEnabled();
});

test("the complete backup reads well in the private-cellar theme on a phone", async ({ page }, testInfo) => {
  await setup(page, { theme: "private-cellar" });
  for (const [width, height] of [[360, 800], [390, 844], [430, 932]] as const) {
    await page.setViewportSize({ width, height });
    const card = page.getByRole("region", { name: "Backup completo", exact: true });
    await card.scrollIntoViewIfNeeded();
    expect(await noHorizontalOverflow(page)).toBe(true);
    const bounds = (await card.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    const button = (await card.getByRole("button", { name: "Scarica backup completo", exact: true }).boundingBox())!;
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.x + button.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    const intro = (await card.getByText(/^Scarica tutta la cantina in un file ZIP/).boundingBox())!;
    expect(overlaps(intro, button)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`full-backup-private-cellar-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("region", { name: "Importa la tua cantina", exact: true }).getByLabel("Carica backup Vinaris (ZIP o JSON)", { exact: true }).setInputFiles(zip);
  const restore = page.getByRole("region", { name: "Ripristina il backup completo", exact: true });
  await expect(restore.getByText("Cantina E2E", { exact: true })).toBeVisible();
  await restore.scrollIntoViewIfNeeded();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("full-backup-private-cellar-preview-390.png") });
});
