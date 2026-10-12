import { expect, test } from "@playwright/test";
import { mockApi, session, wine, memberships } from "./fixtures/app";

for (const locale of ["it", "en"] as const) {
  test(`data import explains CellarTracker and backup sources, previews before confirmation (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockApi(page, [], false, memberships, [wine], { ...session, locale });
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        const url = new URL(String(input), location.href);
        if (!url.pathname.startsWith("/api/v1/imports/")) return original(input, init);
        const calls = JSON.parse(sessionStorage.getItem("data-import-calls") || "[]");
        calls.push({ path: url.pathname, mode: url.searchParams.get("mode"), body: JSON.parse(String(init?.body || "{}")) });
        sessionStorage.setItem("data-import-calls", JSON.stringify(calls));
        if (url.pathname.endsWith("/preview")) return Response.json({
          format: url.pathname.includes("cellartracker") ? "cellartracker" : "vinaris",
          included_blocks: ["wines"], wines_total: 3, wishlist_total: 0, wine_new: 2,
          wine_duplicates: 1, wishlist_new: 0, wishlist_duplicates: 0,
          sample_wine_duplicates: ["Barolo 2020"], sample_wishlist_duplicates: [],
          members_total: 0, invites_total: 0, share_offers_total: 0, user_tags_total: 0, ai_audit_total: 0, sales_total: 0,
        });
        return Response.json({ wines_imported: 2, wines_updated: 0, wines_skipped: 1,
          wishlist_imported: 0, wishlist_updated: 0, wishlist_skipped: 0 });
      };
    });
    await page.goto("/");
    await page.getByRole("button", { name: it ? "Impostazioni" : "Settings", exact: true }).click();
    await page.getByRole("tab", { name: it ? "Dati" : "Data", exact: true }).click();
    const card = page.getByRole("region", { name: it ? "Importa la tua cantina" : "Import your cellar", exact: true });
    const tracker = card.getByRole("region", { name: it ? "Importa da CellarTracker" : "Import from CellarTracker", exact: true });
    const backup = card.getByRole("region", { name: it ? "Ripristina un backup" : "Restore a backup", exact: true });
    const confirm = card.getByRole("button", { name: it ? "Conferma importazione" : "Confirm import", exact: true });
    await expect(tracker).toBeVisible();
    await expect(backup).toBeVisible();
    await expect(confirm).toBeDisabled();
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await tracker.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const a = (await tracker.boundingBox())!, b = (await backup.boundingBox())!;
      expect(a.x + a.width <= b.x || a.y + a.height <= b.y).toBe(true);
      for (const input of await card.locator('input[type="file"]').all()) {
        const box = (await input.boundingBox())!, bounds = (await card.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`data-import-${locale}-${width}.png`) });
      if (width === 390 && it) await expect(card.getByRole("group", { name: "Origine dei dati", exact: true })).toHaveScreenshot("data-import-sources-compact.png", { animations: "disabled" });
    }
    const mode = card.getByLabel(it ? "Come importare i dati" : "How to import your data", { exact: true });
    await expect(mode).toHaveValue("skip_duplicates");
    await mode.selectOption("replace_all");
    await expect(card.getByText(it ? "Attenzione: elimina tutti i vini e la wishlist della cantina attiva prima di importare il file." : "Warning: deletes all wines and the wishlist in the active cellar before importing the file.", { exact: true })).toBeVisible();
    await mode.selectOption("skip_duplicates");
    await card.getByLabel(it ? "Carica CSV CellarTracker" : "Upload CellarTracker CSV", { exact: true }).setInputFiles({ name: "my-cellar.csv", mimeType: "text/csv", buffer: Buffer.from("Wine,Vintage,Quantity\nBarolo,2020,3") });
    await expect(card.getByText("CellarTracker My Cellar CSV", { exact: true })).toBeVisible();
    await expect(card.getByText(/my-cellar.csv/, { exact: false })).toBeVisible();
    await expect(card.getByText("Barolo 2020", { exact: true })).toBeVisible();
    await expect(confirm).toBeEnabled();
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("data-import-calls") || "[]").map((call: { path: string }) => call.path))).toEqual(["/api/v1/imports/cellartracker/preview"]);
    // A Vinaris backup replaces the previous choice, so confirmation uses its own endpoint.
    const payload = { wines: [], wishlist: [] };
    await card.getByLabel(it ? "Carica backup JSON Vinaris" : "Upload Vinaris JSON backup", { exact: true }).setInputFiles({ name: "vinaris-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)) });
    await expect(card.getByText("Vinaris export v2", { exact: true })).toBeVisible();
    await expect(card.getByText(/vinaris-backup.json/, { exact: false })).toBeVisible();
    await expect(card.getByText("CellarTracker My Cellar CSV", { exact: true })).toHaveCount(0);
    await confirm.click();
    await expect(card.getByText(it ? "Riepilogo import" : "Import summary", { exact: true })).toBeVisible();
    const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("data-import-calls") || "[]"));
    expect(calls).toHaveLength(3);
    expect(calls[0].body.csv_base64).toBe(Buffer.from("Wine,Vintage,Quantity\nBarolo,2020,3").toString("base64"));
    expect(calls[2]).toMatchObject({ path: "/api/v1/imports/json", mode: "skip_duplicates", body: { ...payload, import_blocks: ["wines"] } });
    await expect(confirm).toBeDisabled();
    // CellarTracker also completes its own import after explicit confirmation.
    await card.getByLabel(it ? "Carica CSV CellarTracker" : "Upload CellarTracker CSV", { exact: true }).setInputFiles({ name: "my-cellar.csv", mimeType: "text/csv", buffer: Buffer.from("Wine,Quantity\nBarolo,3") });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(card.getByText(it ? "Riepilogo import" : "Import summary", { exact: true })).toBeVisible();
    const latest = await page.evaluate(() => JSON.parse(sessionStorage.getItem("data-import-calls") || "[]").at(-1));
    expect(latest).toMatchObject({ path: "/api/v1/imports/cellartracker", mode: "skip_duplicates", body: { csv_base64: Buffer.from("Wine,Quantity\nBarolo,3").toString("base64") } });
  });
}
