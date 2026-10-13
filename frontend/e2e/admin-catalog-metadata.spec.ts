import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

for (const locale of ["it", "en"] as const) {
  test(`Admin completes metadata for a wine outside the active cellar (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockApi(page, [], false, memberships, [wine], { ...session, locale, is_app_admin: true });
    await page.addInitScript(() => {
      const original = window.fetch;
      let entry = { id: "catalog-massucco", name: "La Luna dei Tempi", producer: "Massucco", type: "", region: "", appellation: "", country: "", format: "", grapes_text: "", is_active: true, source: "user" };
      let saves = 0;
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.href).pathname;
        if (path.endsWith("/admin/operations/overview")) return Response.json(null);
        if (path.endsWith("/admin/operations/vineyards")) return Response.json({ located: 0, pending: 0, not_found: 0, filtered: 0, candidates: [], precision_counts: {} });
        if (path.endsWith("/admin/operations/ai-pricing")) return Response.json({ price_book: {}, ai_pack_markup_percent: "15", free_tier_ai_pack_markup_percent: "100", updated_at: null });
        if (path.endsWith("/wine-pulse/status")) return Response.json({ published: 0, latest_run: null, sources: [], next_cycle: null });
        if (path.endsWith("/taste-profile/admin/summary")) return Response.json({ wines_with_profile: 0, wines_without_profile: 1 });
        if (path.endsWith("/wines/catalog/admin")) return Response.json([entry]);
        if (path.endsWith("/wines/catalog/catalog-massucco/metadata") && init?.method === "PUT") {
          saves++;
          if (saves === 1) return Response.json({ detail: "Temporary save failure" }, { status: 503 });
          const change = JSON.parse(String(init.body));
          sessionStorage.setItem("catalog-metadata-change", JSON.stringify(change));
          entry = { ...entry, ...change };
          return Response.json(entry);
        }
        return original(input, init);
      };
    });
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("/");
    await page.getByRole("button", { name: it ? "Impostazioni" : "Settings", exact: true }).click();
    await page.getByRole("tab", { name: it ? "Operatività" : "Operations", exact: true }).click();
    await page.getByRole("button", { name: it ? /Catalogo vini/ : /Wine catalog/ }).click();
    await page.getByText(it ? "Cerca e gestisci le schede" : "Search and manage entries", { exact: true }).click();
    const section = page.locator(".settings-card").filter({ has: page.getByRole("heading", { name: it ? "Cerca entry catalogo" : "Search catalog entries", exact: true }) });
    await section.getByPlaceholder("Dogaia, 36 lune...").fill("massucco");
    await section.getByRole("button", { name: it ? "Cerca" : "Search", exact: true }).click();
    await section.getByText(it ? "Modifica dati condivisi" : "Edit shared metadata", { exact: true }).click();
    const editor = section.getByRole("form", { name: `${it ? "Dati condivisi" : "Shared metadata"}: La Luna dei Tempi`, exact: true });
    await editor.getByLabel(it ? "Tipologia" : "Wine type", { exact: true }).selectOption("Red");
    await editor.getByLabel(it ? "Regione" : "Region", { exact: true }).fill("Piemonte");
    await editor.getByLabel(it ? "Denominazione" : "Appellation", { exact: true }).fill("Langhe DOC");
    await editor.getByLabel(it ? "Paese" : "Country", { exact: true }).fill("Italia");
    await editor.getByLabel(it ? "Formato" : "Bottle format", { exact: true }).fill("750ml");
    await editor.getByLabel(it ? "Vitigni" : "Grapes", { exact: true }).fill("Nebbiolo, Barbera");
    const save = editor.getByRole("button", { name: it ? "Salva dati condivisi" : "Save shared metadata", exact: true });
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await editor.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const bounds = (await editor.boundingBox())!;
      for (const control of await editor.locator("input, select, textarea, button").all()) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      const grapes = (await editor.getByLabel(it ? "Vitigni" : "Grapes", { exact: true }).boundingBox())!;
      const button = (await save.boundingBox())!;
      expect(button.y).toBeGreaterThanOrEqual(grapes.y + grapes.height);
      if (it && (width === 390 || width === 1440)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath(`admin-catalog-editor-${width}.png`), fullPage: true });
      }
    }
    await save.click();
    await expect(editor.getByRole("alert")).toContainText("Temporary save failure");
    await expect(editor.getByLabel(it ? "Vitigni" : "Grapes", { exact: true })).toHaveValue("Nebbiolo, Barbera");
    await save.click();
    await expect(editor.getByRole("status")).toContainText(it ? "Dati condivisi salvati" : "Shared metadata saved");
    const payload = await page.evaluate(() => JSON.parse(sessionStorage.getItem("catalog-metadata-change") || "null"));
    expect(payload).toEqual({ type: "Red", region: "Piemonte", appellation: "Langhe DOC", country: "Italia", format: "750ml", grapes_text: "Nebbiolo, Barbera" });
    await section.getByRole("button", { name: it ? "Cerca" : "Search", exact: true }).click();
    await expect(editor.getByLabel(it ? "Regione" : "Region", { exact: true })).toHaveValue("Piemonte");
    expect(pageErrors).toEqual([]);
  });
}
