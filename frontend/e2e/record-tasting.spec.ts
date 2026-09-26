import { expect, test } from "@playwright/test";
import { wine, session, memberships, tastingArchive, mockApi, openRecordTasting } from "./fixtures/app";

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
  test(`tasting navigation belongs in the menu at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockApi(page, [], false, memberships, [wine], { ...session, theme_preference: viewport.width === 360 || viewport.width === 430 ? "private-cellar" : "light" });
    await page.goto("/");
    await expect(page.locator(".record-tasting-entry")).toHaveCount(0);
    const mobile = viewport.width < 900;
    if (mobile) {
      await expect(page.getByRole("button", { name: "Registra bevuta", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Menu", exact: true }).click();
    }
    const navigation = mobile ? page.getByRole("dialog", { name: "Menu di navigazione" }) : page.locator(".view-tabs-navigation");
    const action = navigation.getByRole("button", { name: "Registra bevuta", exact: true });
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("aria-haspopup", "dialog");
    const [history, tasting] = await Promise.all([
      navigation.getByRole("button", { name: "Storico", exact: true }).boundingBox(),
      action.boundingBox(),
    ]);
    if (mobile) expect(history!.y + history!.height).toBeLessThanOrEqual(tasting!.y);
    else {
      expect(history!.x + history!.width).toBeLessThanOrEqual(tasting!.x);
      expect(Math.abs(history!.y - tasting!.y)).toBeLessThan(1);
    }
    expect(tasting!.height).toBeGreaterThanOrEqual(44);
    expect(tasting!.x).toBeGreaterThanOrEqual(0);
    expect(tasting!.x + tasting!.width).toBeLessThanOrEqual(viewport.width);
    expect(tasting!.y + tasting!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`tasting-menu-${viewport.width}.png`) });
    await action.click();
    if (mobile) await expect(navigation).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Registra bevuta" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: mobile ? "Menu" : "Registra bevuta", exact: true })).toBeFocused();
  });
}

test("record tasting saves an external wine and preserves failures for retry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  await openRecordTasting(page);
  const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
  await dialog.getByRole("button", { name: /Un altro vino/ }).click();
  await dialog.getByLabel("Nome del vino", { exact: true }).fill("Vino da amici");
  await dialog.getByLabel("Produttore", { exact: true }).fill("Cantina Test");
  await dialog.getByLabel("Un ricordo di questo vino").fill("Cena insieme");
  await expect(dialog.locator("details")).not.toHaveAttribute("open", "");
  await page.evaluate(() => {
    const original = window.fetch;
    let attempts = 0;
    (window as any).tastingWrites = [];
    window.fetch = async (input, init) => {
      if (init?.method === "POST") {
        (window as any).tastingWrites.push({ url: String(input), payload: JSON.parse(String(init.body)) });
        if (String(input).endsWith("/wishlist/tastings")) {
          attempts++;
          return new Response(JSON.stringify(attempts === 1 ? { detail: "Salvataggio non disponibile" } : { id: "tasting-new" }), { status: attempts === 1 ? 503 : 201, headers: { "Content-Type": "application/json" } });
        }
      }
      return original(input, init);
    };
  });
  await dialog.getByRole("button", { name: "Salva bevuta" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Nome del vino", { exact: true })).toHaveValue("Vino da amici");
  await dialog.getByRole("button", { name: "Salva bevuta" }).click();
  await expect(dialog.getByText("Bevuta salvata nello Storico", { exact: true })).toBeVisible();
  const writes = await page.evaluate(() => (window as any).tastingWrites);
  expect(writes).toHaveLength(2);
  expect(writes.every((write: any) => write.url.endsWith("/wishlist/tastings"))).toBe(true);
  expect(writes[1].payload).toMatchObject({ name: "Vino da amici", producer: "Cantina Test", note: "Cena insieme", tasting_rating: 0 });
  await dialog.getByRole("button", { name: "Aggiungi alla wishlist" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('input[value="Vino da amici"]')).toBeVisible();
});

test("record tasting cellar flow consumes the chosen bottle", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await openRecordTasting(page);
  const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
  await dialog.getByRole("button", { name: /Dalla mia cantina/ }).click();
  await dialog.getByRole("button", { name: /Nebbiolo di Test/ }).click();
  await expect(dialog.getByText("Verrà scalata una bottiglia dalla cantina.")).toBeVisible();
  await page.evaluate(fixture => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (init?.method === "POST" && String(input).endsWith("/consume")) {
        (window as any).consumedUrl = String(input);
        return new Response(JSON.stringify({ ...fixture, quantity: 3 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return original(input, init);
    };
  }, wine);
  await dialog.getByRole("button", { name: "Salva bevuta" }).click();
  await expect(dialog.getByText("Bevuta salvata nello Storico", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).consumedUrl)).toContain("/wines/wine-e2e-1/consume");
  await expect(dialog.getByRole("button", { name: "Aggiungi alla wishlist" })).toHaveCount(0);
});

test("record tasting reuses wishlist search and confirms photo suggestions", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [wine], { ...session, can_use_label_recognition: true });
  await page.goto("/");
  await openRecordTasting(page);
  await page.evaluate(() => {
    const original = window.fetch;
    let scans = 0;
    const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/wishlist/lists")) return json([{ id: "assaggi", name: "Assaggi" }]);
      if (url.includes("/wishlist?")) return json([{ id: "known-wine", wishlist_list_id: "assaggi", name: "Barolo noto", producer: "Produttore", vintage: "2020", format: "", type: "Red", region: "Piemonte", appellation: "Barolo" }]);
      if (url.includes("/catalog?")) return json([]);
      if (url.endsWith("/recognize-bottle")) {
        scans++;
        return json({ recognition_id: "scan", status: scans === 1 ? "not_recognized" : "ambiguous", wine_name: "Barolo foto", producer: "Produttore foto", vintage: "2021", estate: "", cuvee: "", appellation: "Barolo", region: "Piemonte", wine_type: "Red", country: "Italia", alternative_candidates: [], estimated_cost_usd: "0.001", label_text: [], matches: [], needs_user_confirmation: true, recognition_notes: [], provider: "luna" });
      }
      if (url.endsWith("/wishlist/tastings") && init?.method === "POST") { (window as any).photoTasting = JSON.parse(String(init.body)); return json({ id: "saved" }); }
      return original(input, init);
    };
  });
  const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
  await dialog.getByRole("button", { name: /Un altro vino/ }).click();
  await dialog.getByLabel("Cerca un vino").fill("Barolo");
  await dialog.getByRole("button", { name: /Barolo noto/ }).click();
  await expect(dialog.getByLabel("Nome del vino", { exact: true })).toHaveValue("Barolo noto");
  const file = { name: "label.png", mimeType: "image/png", buffer: Buffer.from("test photo") };
  await dialog.getByLabel("Foto etichetta", { exact: true }).setInputFiles(file);
  await expect(dialog.getByRole("alert")).toContainText("Etichetta non riconosciuta");
  await expect(dialog.getByLabel("Nome del vino", { exact: true })).toHaveValue("Barolo noto");
  await dialog.getByLabel("Foto etichetta", { exact: true }).setInputFiles(file);
  await expect(dialog.getByLabel("Nome del vino", { exact: true })).toHaveValue("Barolo foto");
  await expect(dialog.getByText("Controlla e conferma i dati qui sotto.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("record-tasting-photo.png") });
  await dialog.getByLabel("Nome del vino", { exact: true }).fill("Barolo confermato");
  await dialog.getByRole("button", { name: "Salva bevuta" }).click();
  await expect(dialog.getByText("Bevuta salvata nello Storico", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).photoTasting)).toMatchObject({ name: "Barolo confermato", vintage: "2021" });
  expect(await page.evaluate(() => (window as any).photoTasting.wishlist_item_id)).toBeUndefined();
});

test("record tasting is available from History with origin filters", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Storico/ }).first().click();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).includes("/tasting-archive?")) (window as any).archiveUrl = String(input);
      return original(input, init);
    };
  });
  await page.getByLabel("Provenienza della bevuta").selectOption("external");
  await expect.poll(() => page.evaluate(() => (window as any).archiveUrl)).toContain("origin=external");
  await openRecordTasting(page);
  await expect(page.getByRole("dialog", { name: "Registra bevuta" })).toBeVisible();
});

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 900 }]) {
  test(`record tasting responsive layout ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockApi(page);
    await page.goto("/");
    await openRecordTasting(page);
    const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
    const cellar = await dialog.getByRole("button", { name: /Dalla mia cantina/ }).boundingBox();
    const external = await dialog.getByRole("button", { name: /Un altro vino/ }).boundingBox();
    expect(cellar!.y + cellar!.height).toBeLessThanOrEqual(external!.y);
    if (viewport.width === 390) {
      await page.mouse.move(0, 0);
      await page.screenshot({ path: testInfo.outputPath("record-tasting-choice.png") });
      await expect(dialog).toHaveScreenshot("record-tasting-choice-mobile.png");
    }
    await dialog.getByRole("button", { name: /Un altro vino/ }).click();
    await dialog.getByLabel("Nome del vino", { exact: true }).fill("Barolo Riserva");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const input of await dialog.locator('input:not([hidden]), select, textarea').all()) {
      const box = await input.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    if (viewport.width === 390) await page.screenshot({ path: testInfo.outputPath("record-tasting-form.png") });
    await dialog.getByRole("button", { name: "Salva bevuta" }).scrollIntoViewIfNeeded();
    const save = await dialog.getByRole("button", { name: "Salva bevuta" }).boundingBox();
    expect(save!.y + save!.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width === 390) await page.screenshot({ path: testInfo.outputPath("record-tasting-form-bottom.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: viewport.width < 900 ? "Menu" : "Registra bevuta", exact: true })).toBeFocused();
  });
}

for (const width of [360, 390, 430]) {
  test(`history stays within the mobile viewport ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : 844 });
    const fullArchive = { ...tastingArchive, total: 32, rated_count: 29, notes_count: 19, latest_consumed_at: "2026-09-21" };
    await mockApi(page, [], true, memberships, [wine], session, [], undefined, fullArchive);
    await page.goto("/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Storico", exact: true }).click();
    const workspace = page.locator(".history-workspace");
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole("heading", { name: "Bottiglie bevute", exact: true })).toBeVisible();
    await expect(workspace.locator(".pagination-bar")).toBeVisible();

    const viewport = page.viewportSize()!;
    for (const locator of [
      workspace,
      workspace.locator(".wine-list"),
      workspace.locator(".history-section-tabs"),
      workspace.locator(".record-tasting-origin"),
      workspace.locator(".stats-panel-wrapper"),
      workspace.locator(".collection-filter-dock"),
      workspace.locator(".pagination-bar"),
      workspace.locator(".tasting-archive-entry").first(),
    ]) {
      const box = (await locator.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    for (const button of await workspace.locator(".pagination-actions button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    const pagination = (await workspace.locator(".pagination-actions").boundingBox())!;
    const bottomNavigation = (await page.getByRole("navigation", { name: "Navigazione principale" }).boundingBox())!;
    expect(pagination.y + pagination.height).toBeLessThanOrEqual(bottomNavigation.y);
    const archiveTitle = (await workspace.locator(".tasting-archive-title").first().boundingBox())!;
    const archiveSummary = (await workspace.locator(".tasting-archive-summary").first().boundingBox())!;
    expect(archiveSummary.y).toBeGreaterThanOrEqual(archiveTitle.y + archiveTitle.height);
    const summaryItems = await workspace.locator(".tasting-archive-summary").first().locator(":scope > *").all();
    const summaryBoxes = await Promise.all(summaryItems.map(item => item.boundingBox()));
    const entryBox = (await workspace.locator(".tasting-archive-entry").first().boundingBox())!;
    for (const box of summaryBoxes) {
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(entryBox.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(entryBox.x + entryBox.width);
    }
    for (let first = 0; first < summaryBoxes.length; first += 1) {
      for (let second = first + 1; second < summaryBoxes.length; second += 1) {
        const a = summaryBoxes[first]!;
        const b = summaryBoxes[second]!;
        const overlap = !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
        expect(overlap).toBe(false);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: testInfo.outputPath("history-mobile-390.png"), fullPage: true, animations: "disabled" });
  });
}
