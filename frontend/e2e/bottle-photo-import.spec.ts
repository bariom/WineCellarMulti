import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

// A tiny real PNG, so the label thumbnails can be drawn from it.
const photo = {
  name: "tavolo.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8DAwMDAwMDAAAANAAH/1E4GHQAAAABJRU5ErkJggg==", "base64"),
};

async function setup(page: Page, canGenerate = true) {
  await mockApi(page, [], true, memberships, [wine], { ...session, locale: "it", has_active_entitlement: true, is_free_tier: false, theme_preference: "light" });
  await page.addInitScript(({ wine, canGenerate }) => {
    const previous = window.fetch;
    let polls = 0;
    const row = (fields: Record<string, unknown>) => ({ format: "", style: "Red", region: "", confidence: "high", image_index: 0, x: 0.2, y: 0.2, width: 0.2, height: 0.3, existing_wine: null, catalog: null, ...fields });
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      if (url.pathname.endsWith("/ai/settings")) {
        const response = await previous(input, init);
        return Response.json({ ...await response.json(), provider_mode: "credits", can_use_app_credits: canGenerate, has_openai_api_key: false });
      }
      if (url.pathname === "/api/v1/bottle-photos/scans") {
        const data = init?.body as FormData;
        sessionStorage.setItem("bottle-photo-upload", String(data.getAll("images").length));
        return Response.json({ id: "job-1", status: "running", stage: "reading", photos_total: 1, photos_done: 0, wines_found: 0, error: "", result: null }, { status: 202 });
      }
      if (url.pathname === "/api/v1/bottle-photos/scans/job-1") {
        polls += 1;
        if (polls < 2) return Response.json({ id: "job-1", status: "running", stage: "reading", photos_total: 1, photos_done: 0, wines_found: 0, error: "", result: null });
        return Response.json({ id: "job-1", status: "done", stage: "done", photos_total: 1, photos_done: 1, wines_found: 3, error: "", result: { photo_count: 1, model: "gpt-5.5", estimated_cost_usd: "0.02", rows: [
          row({ name: wine.name, producer: wine.producer, vintage: wine.vintage, quantity: 2, existing_wine: { wine_id: wine.id, name: wine.name, producer: wine.producer, vintage: wine.vintage, quantity: wine.quantity } }),
          row({ name: "Sassicaia", producer: "Tenuta San Guido", vintage: "2019", quantity: 1, catalog: { id: "catalog-1", name: "Sassicaia", producer: "Tenuta San Guido", vintage: "", type: "Red", region: "Bolgheri", appellation: "Bolgheri Sassicaia DOC", country: "Italia", grapes: "" } }),
          row({ name: "Rosso della Casa", producer: "", vintage: "", quantity: 1, confidence: "low" }),
        ] } });
      }
      if (url.pathname === "/api/v1/bottle-photos/confirm") {
        const payload = JSON.parse(String(init?.body));
        sessionStorage.setItem("bottle-photo-confirm", JSON.stringify(payload));
        return Response.json({ created_wine_ids: ["new-1", "new-2"], updated_wine_ids: [wine.id], bottles: payload.rows.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0), saved_rows: payload.rows.length, limit_reached: false });
      }
      return previous(input, init);
    };
  }, { wine, canGenerate });
}

async function openChooser(page: Page) {
  await page.goto("/");
  if ((page.viewportSize()?.width || 0) >= 1000) {
    await page.getByRole("button", { name: /^Cantina \(/ }).click();
    await page.getByRole("button", { name: "Aggiungi vino", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Aggiungi un vino", exact: true }).first().click();
  }
  const chooser = page.getByRole("dialog", { name: "Come vuoi inserire i vini?" });
  await expect(chooser).toBeVisible();
  return chooser;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => Array.from(document.querySelectorAll("dialog[open], dialog[open] *")).some((element) => element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX !== "visible"));
  expect(overflow).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("adding a wine offers the quick photo path or the detailed form", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const chooser = await openChooser(page);
  await expect(chooser.getByRole("button", { name: /^Inserimento veloce/ })).toBeVisible();
  await expect(chooser.getByRole("button", { name: /^Da scontrino o fattura/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("add-wine-chooser-390.png") });
  await chooser.getByRole("button", { name: /^Inserimento dettagliato/ }).click();
  await expect(chooser).toHaveCount(0);
  await expect(page.locator(".wine-editor-form")).toBeVisible();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 800 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
  test(`bottles from a photo are reviewed and added at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setup(page);
    const chooser = await openChooser(page);
    await chooser.getByRole("button", { name: /^Inserimento veloce/ }).click();
    const dialog = page.getByRole("dialog", { name: "Fotografa le tue bottiglie" });
    await expect(dialog).toBeVisible();
    await dialog.locator('input[type="file"][multiple]').setInputFiles(photo);
    await expect(dialog.getByRole("img", { name: "Foto 1" })).toBeVisible();
    await dialog.getByRole("button", { name: "Riconosci le bottiglie", exact: true }).click();

    await expect(dialog.getByText("Ho trovato 3 vini.", { exact: false })).toBeVisible();
    // The total of the recognition call, as for the other AI features.
    await expect(dialog.locator(".bottle-photo-ai-cost")).toContainText("Costo AI 0.0200");
    expect(await page.evaluate(() => sessionStorage.getItem("bottle-photo-upload"))).toBe("1");
    const rows = dialog.locator(".bottle-photo-rows > li");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).getByText(`Già in cantina (${wine.quantity} bott.)`, { exact: false })).toBeVisible();
    await expect(rows.nth(1).getByText("Dal catalogo · Bolgheri · Red")).toBeVisible();
    await expect(rows.nth(2).getByText("Lettura incerta: controlla l'etichetta")).toBeVisible();
    await rows.nth(0).getByRole("button", { name: "Una bottiglia in più" }).click();
    await rows.nth(2).getByRole("textbox", { name: "Annata" }).fill("2021");
    await expectNoHorizontalOverflow(page);
    if (viewport.width === 390 || viewport.width === 1440) await page.screenshot({ path: test.info().outputPath(`bottle-photo-review-${viewport.width}.png`) });

    await dialog.getByRole("button", { name: "Aggiungi 3 vini · 5 bottiglie", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "5 bottiglie aggiunte" })).toBeVisible();
    await expect(dialog.locator(".bottle-photo-ai-cost")).toContainText("Costo AI del riconoscimento 0.0200");
    const payload = JSON.parse(await page.evaluate(() => sessionStorage.getItem("bottle-photo-confirm") || "{}"));
    expect(payload.rows).toEqual([
      expect.objectContaining({ name: wine.name, quantity: 3, existing_wine_id: wine.id }),
      expect.objectContaining({ name: "Sassicaia", quantity: 1, region: "Bolgheri", appellation: "Bolgheri Sassicaia DOC", existing_wine_id: null }),
      expect.objectContaining({ name: "Rosso della Casa", vintage: "2021", quantity: 1, existing_wine_id: null }),
    ]);
    // Only the wine the catalog did not know is offered to the AI.
    await expect(dialog.getByRole("button", { name: /^Completa con AI il vino non trovato/ })).toBeVisible();
    await dialog.getByRole("button", { name: "Vai alla cantina", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test("without AI credit the quick path explains how to activate it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, false);
  const chooser = await openChooser(page);
  await chooser.getByRole("button", { name: /^Inserimento veloce/ }).click();
  const dialog = page.getByRole("dialog", { name: "Fotografa le tue bottiglie" });
  await expect(dialog.getByText("Il riconoscimento usa il credito AI.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Scatta una foto" })).toHaveCount(0);
});

test("the receipt path opens the purchase import", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  const chooser = await openChooser(page);
  await chooser.getByRole("button", { name: /^Da scontrino o fattura/ }).click();
  await expect(chooser).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Aggiungi un acquisto", exact: true })).toBeVisible();
});
