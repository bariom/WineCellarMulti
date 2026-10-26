import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, snapshotChrome, tastingArchive, wine } from "./fixtures/app";

for (const [width, locale] of [[390, "it"], [1440, "en"]] as const) {
  test(`${locale}: wine details open directly from tasting history at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const linked = { ...tastingArchive.items[0], source: "cellar" };
    const unlinked = { ...linked, tasting_id: "external-unlinked", wine_id: "missing-wine", wine_name: "Vino esterno", source: "external_tasting" };
    await mockApi(page, [], false, memberships, [wine], { ...session, locale }, [], undefined, { ...tastingArchive, items: [linked, unlinked], total: 2 });
    await page.goto("/");
    if (width === 390) await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: locale === "it" ? "Diario" : "Journal", exact: true }).click();

    const history = page.locator(".history-workspace");
    const linkedEntry = history.locator(".tasting-archive-entry").filter({ hasText: wine.name });
    const unlinkedEntry = history.locator(".tasting-archive-entry").filter({ hasText: "Vino esterno" });
    const link = linkedEntry.getByRole("button", { name: locale === "it" ? "Scheda vino" : "Wine details" });
    await expect(link).toBeVisible();
    await expect(unlinkedEntry.getByRole("button", { name: /Scheda vino|Wine details/ })).toHaveCount(0);
    const head = (await linkedEntry.locator(".tasting-archive-head").boundingBox())!;
    const action = (await link.boundingBox())!;
    expect(action.y).toBeGreaterThanOrEqual(head.y + head.height);
    expect(action.x + action.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await link.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`tasting-wine-link-${width}.png`) });

    await link.click();
    const detail = page.getByRole("dialog", { name: new RegExp(wine.name) });
    await expect(detail).toBeVisible();
    await expect(detail.locator(".wine-detail")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`tasting-wine-detail-${width}.png`) });
    await expect(linkedEntry).not.toHaveAttribute("open", "");
    await detail.getByRole("button", { name: locale === "it" ? "Chiudi" : "Close" }).click();
    await expect(detail).toHaveCount(0);
    await expect(linkedEntry).toBeVisible();
    await linkedEntry.locator("summary").click();
    await linkedEntry.getByRole("button", { name: locale === "it" ? "Modifica" : "Edit", exact: true }).click();
    await expect(linkedEntry.getByRole("region", { name: /Dati del vino degustato|Tasted wine details/ })).toHaveCount(0);
  });
}


for (const [width, locale] of [[390, "it"], [1440, "en"]] as const) {
  test(`${locale}: correct an external tasting wine without losing the memory at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const external = { ...tastingArchive.items[0], source: "external_tasting", tasting_id: "external-edit",
      wine_id: "external-edit", wine_name: "Lambrusco dolce", wine_type: "Sweet" };
    await mockApi(page, [], false, memberships, [wine], { ...session, locale }, [], undefined,
      { ...tastingArchive, items: [external], total: 1 });
    await page.goto("/");
    await page.evaluate(() => {
      const original = window.fetch;
      (window as any).correctionWrites = [];
      window.fetch = async (input, init) => {
        const url = String(input);
        if (init?.method === "PATCH" && url.endsWith("/wishlist/tastings/external-edit")) {
          const writes = (window as any).correctionWrites;
          writes.push(JSON.parse(String(init.body)));
          return new Response(JSON.stringify(writes.length === 1 ? { detail: "Save unavailable" } : {}),
            { status: writes.length === 1 ? 503 : 200, headers: { "Content-Type": "application/json" } });
        }
        const response = await original(input, init);
        if (url.includes("/wines/tasting-archive") && (window as any).correctionWrites.length > 1) {
          const body = await response.json();
          body.items[0].wine_type = "Red";
          return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
        }
        return response;
      };
    });
    if (width === 390) await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: locale === "it" ? "Diario" : "Journal", exact: true }).click();
    const entry = page.locator(".tasting-archive-entry").filter({ hasText: "Lambrusco dolce" });
    await entry.locator("summary").click();
    await entry.getByRole("button", { name: locale === "it" ? "Modifica" : "Edit", exact: true }).click();
    const editor = entry.getByRole("region", { name: locale === "it" ? "Dati del vino degustato" : "Tasted wine details" });
    await expect(editor).toBeVisible();
    const type = editor.getByRole("combobox", { name: locale === "it" ? "Tipologia" : "Wine type", exact: true });
    await expect(type).toHaveValue("Sweet");
    const name = editor.getByLabel(locale === "it" ? "Nome vino" : "Wine name", { exact: true });
    const save = entry.getByRole("button", { name: locale === "it" ? "Salva modifiche" : "Save changes", exact: true });
    await name.fill("   ");
    await expect(save).toBeDisabled();
    await name.fill("Lambrusco dolce");
    await type.selectOption("Red");
    for (const size of width === 390 ? [360, 390, 430] : [1440]) {
      await page.setViewportSize({ width: size, height: size === 1440 ? 1000 : 844 });
      const bounds = (await editor.boundingBox())!;
      const controls = await editor.locator("input, select").all();
      let previous: Awaited<ReturnType<typeof type.boundingBox>> = null;
      for (const control of controls) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 0.01);
        if (previous) expect(box.x >= previous.x + previous.width || box.y >= previous.y + previous.height).toBe(true);
        previous = box;
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (size === width) {
        await snapshotChrome(page, false);
        await page.mouse.move(0, 0);
        await editor.screenshot({ path: testInfo.outputPath(`external-tasting-editor-${width}.png`) });
        if (width === 390) await expect(editor).toHaveScreenshot("external-tasting-editor-compact.png");
        await snapshotChrome(page, true);
      }
    }
    await save.click();
    await expect(editor).toBeVisible();
    await expect(type).toHaveValue("Red");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(editor).toHaveCount(0);
    await expect(entry.locator(".tasting-archive-meta")).toContainText(locale === "it" ? "Rosso" : "Red");
    const writes = await page.evaluate(() => (window as any).correctionWrites);
    expect(writes).toHaveLength(2);
    expect(writes[1].wine).toMatchObject({ name: "Lambrusco dolce", type: "Red", producer: external.wine_producer });
    expect(writes[1].note).toBe(external.note);
    expect(writes[1].tasting_rating).toBe(external.rating);
    expect(writes[1].tasting_companions).toBe(external.companions);
    expect(writes[1]).not.toHaveProperty("memory_photo");
  });
}
