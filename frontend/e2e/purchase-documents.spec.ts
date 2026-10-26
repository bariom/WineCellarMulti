import { expect, test, type Page } from "@playwright/test";
import { mockApi, wine, session, memberships } from "./fixtures/app";

async function setupDocuments(page: Page, locale: "it" | "en", wineCount = 2) {
  await mockApi(page, [], false, memberships, [wine], { ...session, locale });
  await page.addInitScript(({ wineCount }) => {
    const original = window.fetch;
    let deleted = false;
    let wineDeleted = false;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      if (url.pathname.endsWith("/imports/purchases/documents")) {
        if (sessionStorage.getItem("documents-fail")) return Response.json({ detail: "Unavailable" }, { status: 503 });
        if (deleted || (url.searchParams.has("unlinked_only") && !wineDeleted)) return Response.json([]);
        return Response.json([{ id: "document-1", filename: "fattura-cantina-vinaris-acquisto-bottiglie-ottobre-2026.pdf", mime: "application/pdf", size: 42000,
          supplier: "Enoteca delle Colline", reference: "INV-42", status: "received", wine_count: wineDeleted ? wineCount - 1 : wineCount,
          url: "/api/v1/imports/purchases/document-1/document" }]);
      }
      if (url.pathname.endsWith("/document-1/document") && init?.method === "DELETE") {
        if (sessionStorage.getItem("document-delete-fail")) return Response.json({ detail: "Unavailable" }, { status: 503 });
        deleted = true;
        sessionStorage.setItem("document-deleted", url.search);
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith("/wines/wine-e2e-1") && init?.method === "DELETE") {
        wineDeleted = true;
        sessionStorage.setItem("document-wine-deleted", "true");
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith("/wines") && wineDeleted) return Response.json([]);
      return original(input, init);
    };
  }, { wineCount });
}

for (const locale of ["it", "en"] as const) {
  test(`purchase originals can be opened, downloaded and deleted without deleting wine (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 390, height: 844 });
    await setupDocuments(page, locale);
    await page.goto("/");
    await page.getByRole("button", { name: it ? /^Cantina/ : /^Cellar/ }).first().click();
    await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
    const detail = page.locator(".wine-detail:visible").first();
    await detail.locator("summary").filter({ hasText: it ? "Giacenza e acquisti" : "Stock and purchases" }).click();
    const documents = detail.getByRole("region", { name: it ? "Documenti d’acquisto" : "Purchase documents", exact: true });
    await expect(documents.getByText("INV-42", { exact: false })).toBeVisible();
    await expect(documents.getByRole("link", { name: it ? "Apri documento" : "Open document", exact: true })).toHaveAttribute("href", "/api/v1/imports/purchases/document-1/document");
    await expect(documents.getByRole("link", { name: it ? "Scarica" : "Download", exact: true })).toHaveAttribute("href", /download=true/);
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      if (!(await documents.isVisible())) await detail.locator("summary").filter({ hasText: it ? "Giacenza e acquisti" : "Stock and purchases" }).click();
      await documents.scrollIntoViewIfNeeded();
      // Resizing can put the stationary pointer over Delete and activate its hover lift.
      await page.mouse.move(0, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const frame = (await documents.boundingBox())!;
      for (const control of await documents.locator("a, button").all()) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(frame.x);
        expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`purchase-documents-${locale}-${width}.png`) });
      if (width === 390 && it) await expect(documents).toHaveScreenshot("purchase-documents-compact.png", { animations: "disabled" });
    }
    const remove = documents.getByRole("button", { name: it ? "Elimina documento" : "Delete document", exact: true });
    page.once("dialog", dialog => dialog.dismiss());
    await remove.click();
    await expect(remove).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("document-deleted"))).toBeNull();
    await page.evaluate(() => sessionStorage.setItem("document-delete-fail", "true"));
    page.once("dialog", dialog => dialog.accept());
    await remove.click();
    await expect(documents.getByRole("alert")).toBeVisible();
    await page.evaluate(() => sessionStorage.removeItem("document-delete-fail"));
    page.once("dialog", dialog => dialog.accept());
    await remove.click();
    await expect(remove).toHaveCount(0);
    await expect(detail.getByRole("heading", { name: wine.name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("document-wine-deleted"))).toBeNull();
  });
}

test("purchase archive retains unlinked documents and allows explicit removal", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setupDocuments(page, "it", 1);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.getByRole("button", { name: "Aggiungi vino", exact: true }).click();
  await page.getByRole("dialog", { name: "Cosa vuoi aggiungere?" }).getByRole("button", { name: /^Inserimento dettagliato/ }).click();
  await page.getByRole("button", { name: "Aggiungi un acquisto da ricevuta o fattura", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Aggiungi un acquisto", exact: true });
  await dialog.locator("summary").filter({ hasText: "Documenti archiviati" }).click();
  const documents = dialog.getByRole("region", { name: "Documenti d’acquisto", exact: true });
  await expect(documents.getByRole("link", { name: "Apri documento", exact: true })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await documents.getByRole("button", { name: "Elimina documento", exact: true }).click();
  await expect(documents.getByText("Nessun documento archiviato.", { exact: false })).toBeVisible();
});

for (const keep of [true, false]) {
  test(`deleting the last linked wine explicitly ${keep ? "keeps" : "removes"} the original`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setupDocuments(page, "it", 1);
    await page.goto("/");
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
    await page.getByRole("button", { name: "Modifica", exact: true }).last().click();
    let prompts = 0;
    page.on("dialog", async dialog => {
      prompts++;
      if (prompts === 1) await dialog.accept();
      else { expect(dialog.message()).toContain("non è più collegato ad alcun vino"); if (keep) await dialog.dismiss(); else await dialog.accept(); }
    });
    await page.getByRole("button", { name: "Elimina", exact: true }).click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("document-wine-deleted"))).toBe("true");
    await expect.poll(() => prompts).toBe(2);
    if (keep) expect(await page.evaluate(() => sessionStorage.getItem("document-deleted"))).toBeNull();
    else await expect.poll(() => page.evaluate(() => sessionStorage.getItem("document-deleted"))).toBe("?only_unlinked=true");
  });
}
