import { expect, test } from "@playwright/test";
import { wine, session, memberships, mockApi } from "./fixtures/app";
import { personalDashboardCatalogue } from "../src/components/personalDashboardCatalogue";

test("personal dashboard preview retries server errors without leaving the editor", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: [] });
  await page.goto("/");
  await expect(page.locator(".authenticated-app-shell")).toBeVisible();
  await page.evaluate(() => {
    const original = window.fetch;
    let fail = true;
    window.fetch = async (input, init) => {
      if (String(input).includes("taste-profile/me") && fail) {
        fail = false;
        return new Response(JSON.stringify({ detail: "Private internal detail" }), { status: 503 });
      }
      return original(input, init);
    };
  });
  await page.getByRole("button", { name: "Personalizza", exact: true }).click();
  await page.getByRole("button", { name: "Anteprima: Geografia del gusto", exact: true }).click();
  const preview = page.getByRole("region", { name: "Anteprima: Geografia del gusto", exact: true });
  await expect(preview.getByRole("alert")).toContainText("Codice risposta: 503");
  await expect(preview).not.toContainText("Private internal detail");
  await preview.screenshot({ path: testInfo.outputPath("preview-load-error.png") });
  await preview.getByRole("button", { name: "Riprova", exact: true }).click();
  await expect(preview.getByRole("alert")).toHaveCount(0);
  await expect(preview.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator("[data-widget-id]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salva dashboard", exact: true })).toBeVisible();
});

test("personal dashboard previews without selecting and supports keyboard and compact screens", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: [] });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Personalizza", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Anteprima: Ultimi vini aggiunti", exact: true });
  const preview = page.getByRole("region", { name: "Anteprima: Ultimi vini aggiunti", exact: true });
  await trigger.hover();
  await page.getByRole("searchbox", { name: "Cerca widget" }).hover();
  await page.waitForTimeout(450);
  await expect(preview).toBeHidden();
  await trigger.hover();
  await expect(preview).toBeVisible();
  await expect(preview.locator(".summary-bottle")).toHaveCount(1);
  await expect(page.locator("[data-widget-id]")).toHaveCount(0);
  await preview.hover();
  await page.waitForTimeout(450);
  await expect(preview).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preview-desktop.png") });
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Aggiungi widget", exact: true }).click();
  await expect(page.locator('[data-widget-id="recent"]')).toHaveCount(1);
  await expect(preview.getByRole("button", { name: "Selezionato", exact: true })).toBeDisabled();
  await preview.getByRole("button", { name: "Chiudi anteprima" }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  // Click the uncovered heading, outside the floating preview.
  await page.getByRole("heading", { name: "La mia dashboard", exact: true }).click();
  await expect(preview).toBeHidden();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await trigger.click();
    await expect(preview).toBeVisible();
    const bounds = (await preview.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`preview-${width}.png`) });
    if (width === 390) await expect(preview).toHaveScreenshot("widget-preview-compact.png", { animations: "disabled" });
    await preview.getByRole("button", { name: "Chiudi anteprima" }).click();
  }
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(page.locator("[data-widget-id]")).toHaveCount(0);
});

test("personal dashboard preview opens on touch and every widget can be inspected", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: [] });
  await page.goto("/");
  await page.getByRole("button", { name: "Personalizza", exact: true }).tap();
  for (const widget of personalDashboardCatalogue) {
    const name = `Anteprima: ${widget.it[0]}`;
    await page.getByRole("button", { name, exact: true }).tap();
    const preview = page.getByRole("region", { name, exact: true });
    await expect(preview).toBeVisible();
    await expect(preview.locator(".dashboard-summary")).toBeVisible();
    await expect(page.locator("[data-widget-id]")).toHaveCount(0);
    const footer = (await preview.locator(":scope > footer").boundingBox())!;
    const header = (await preview.locator(":scope > header").boundingBox())!;
    const body = (await preview.locator(".personal-preview-body").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(844);
    expect(header.y + header.height).toBeLessThanOrEqual(body.y);
    expect(body.y + body.height).toBeLessThanOrEqual(footer.y + 1);
    if (widget.id === "taste" || widget.id === "regions") {
      await page.screenshot({ path: testInfo.outputPath(`preview-${widget.id}.png`) });
    }
    await preview.getByRole("button", { name: "Chiudi anteprima" }).tap();
    await expect(preview).toBeHidden();
  }
  await context.close();
});

test("personal dashboard scenic summaries share data and keep charts compact", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-09-24T12:00:00Z"));
  const ids = ["collection_value", "featured", "recent", "taste", "taste_origins", "regions", "maturity", "styles", "best_tastings", "recent_tastings", "tasting_rhythm", "value_changes", "news"];
  const stock = [{ ...wine, value_history: [
    { id: "old", recorded_at: "2026-01-01", value: "40", currency: "CHF", source: "manual" },
    { id: "different-currency", recorded_at: "2026-02-01", value: "500", currency: "EUR", source: "manual" },
    { id: "new", recorded_at: "2026-09-01", value: "48", currency: "CHF", source: "manual" },
  ] }, { ...wine, id: "white", name: "Chardonnay di Test", producer: "Domaine Test", type: "White", region: "Borgogna", vintage: "2022", quantity: 7 }, { ...wine, id: "ticino", name: "Merlot di Test", region: "Ticino", quantity: 2 }];
  await mockApi(page, [], false, memberships, stock, { ...session, personal_dashboard_widgets: ids.map(id => ({ id, width: id === "collection_value" ? "full" : "half" })) });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".authenticated-app-shell")).toBeVisible();
  await page.evaluate(() => {
    const original = window.fetch;
    (window as any).summaryRequests = [];
    window.fetch = async (input, init) => {
      const url = String(input);
      (window as any).summaryRequests.push(url);
      if (url.includes("value-history/portfolio")) return new Response(JSON.stringify([{ recorded_at: "2026-06-01", value: "420" }, { recorded_at: "2026-08-01", value: "480" }, { recorded_at: "2026-09-20", value: "624" }]), { headers: { "Content-Type": "application/json" } });
      if (url.includes("wine-pulse")) return new Response(JSON.stringify({ items: [{ id: "story", source: "Vinaris Test", headline: "Un viaggio tra le vigne del Ticino", article_url: "https://example.com/wine", published_at: "2026-09-23", image_url: null }] }), { headers: { "Content-Type": "application/json" } });
      return original(input, init);
    };
  });
  await page.getByRole("tab", { name: "La mia dashboard", exact: true }).click();
  const taste = page.locator('[data-widget-id="taste"]');
  await expect(taste.getByRole("img", { name: /Mappa del gusto/ })).toBeVisible();
  await expect(taste).toContainText("21 esperienze");
  await expect(taste).not.toContainText("Confronto algoritmo");
  await expect(page.locator('[data-widget-id="recent"] .summary-bottle')).toHaveCount(3);
  await expect(page.locator('[data-widget-id="collection_value"] .time-series-chart')).toBeVisible();
  await expect(page.locator('[data-widget-id="news"]')).toContainText("Un viaggio tra le vigne");
  await expect(page.locator('[data-widget-id="recent_tastings"]')).toContainText("Nebbiolo");
  await expect(page.locator('[data-widget-id="value_changes"]')).toContainText("+20%");
  const requests: string[] = await page.evaluate(() => (window as any).summaryRequests);
  expect(requests.filter(url => url.includes("taste-profile/me"))).toHaveLength(1);
  expect(requests.filter(url => url.includes("tasting-archive") && url.includes("limit=200"))).toHaveLength(1);
  expect(requests.some(url => url.includes("currency=CHF"))).toBe(true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ["collection_value", "taste", "recent", "maturity", "styles", "tasting_rhythm", "value_changes"]) {
      const widget = page.locator(`[data-widget-id="${id}"]`);
      await widget.scrollIntoViewIfNeeded();
      expect((await widget.boundingBox())!.height).toBeLessThan(750);
      const header = (await widget.locator(".dashboard-summary > header").boundingBox())!;
      const body = (await widget.locator(".summary-body").boundingBox())!;
      const footer = (await widget.locator(".dashboard-summary > footer").boundingBox())!;
      expect(header.y + header.height).toBeLessThanOrEqual(body.y);
      expect(body.y + body.height).toBeLessThanOrEqual(footer.y);
      expect(header.width).toBeGreaterThan(240);
      await widget.evaluate(element => window.scrollBy(0, element.getBoundingClientRect().top - 110));
      await widget.screenshot({ path: testInfo.outputPath(`summary-${id}-${width}.png`), animations: "disabled" });
      if (width === 390 && id === "taste") await expect(widget).toHaveScreenshot("personal-taste-summary-compact.png", { animations: "disabled" });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await taste.getByRole("button", { name: "Approfondisci" }).click();
  await expect(page.locator(".taste-profile-premium-hero")).toBeVisible();
});

test("personal dashboard migrates legacy panels and persists distribution grouping", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: [
    { id: "value_producer", width: "half" }, { id: "value_type", width: "full" }, { id: "balance", width: "full" }, { id: "regions", width: "half" }, { id: "composition", width: "half" }, { id: "maturity", width: "full" },
  ] });
  await page.goto("/");
  await expect(page.locator('[data-widget-id]')).toHaveCount(3);
  expect(await page.locator('[data-widget-id]').evaluateAll(elements => elements.map(element => element.getAttribute("data-widget-id")))).toEqual(["value_distribution", "regions", "maturity"]);
  await expect(page.getByLabel("Distribuzione", { exact: true })).toHaveValue("producer");
  await page.getByRole("button", { name: "Personalizza", exact: true }).click();
  await page.getByLabel("Raggruppa valore", { exact: true }).selectOption("type");
  await page.getByRole("button", { name: "Salva dashboard", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Distribuzione", { exact: true })).toHaveValue("type");
  await expect(page.locator('[data-widget-id="value_distribution"]')).toHaveClass(/personal-widget-half/);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("vinaris-test-preferences")!).personal_dashboard_widgets)).toEqual([
    { id: "value_distribution", width: "half", group_by: "type" }, { id: "regions", width: "full" }, { id: "maturity", width: "half" },
  ]);
});

test("personal dashboard summary errors retry and currencies stay separate", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine, { ...wine, id: "eur", currency: "EUR", current_value: "100" }], { ...session, personal_dashboard_widgets: [{ id: "taste", width: "half" }, { id: "collection_value", width: "half" }] });
  await page.goto("/");
  await expect(page.locator(".authenticated-app-shell")).toBeVisible();
  await page.evaluate(() => {
    const original = window.fetch;
    let failed = false;
    window.fetch = async (input, init) => {
      if (String(input).includes("taste-profile/me") && !failed) { failed = true; return new Response("Unavailable", { status: 503 }); }
      return original(input, init);
    };
  });
  await page.getByRole("tab", { name: "La mia dashboard", exact: true }).click();
  const taste = page.locator('[data-widget-id="taste"]');
  await expect(taste.getByRole("alert")).toBeVisible();
  await taste.getByRole("button", { name: "Riprova" }).click();
  await expect(taste.getByRole("img", { name: /Mappa del gusto/ })).toBeVisible();
  const value = page.locator('[data-widget-id="collection_value"]');
  await expect(value).toContainText("192");
  await value.getByLabel("Valuta", { exact: true }).selectOption("EUR");
  await expect(value).toContainText("400");
  await expect(value).not.toContainText("592");
  await expect(value).toContainText("Servono almeno due rilevazioni");
});

test("local entry reload keeps a single application and unsaved dashboard edits", async ({ page }, testInfo) => {
  const rootWarnings: string[] = [];
  page.on("console", message => { if (message.text().includes("createRoot")) rootWarnings.push(message.text()); });
  await mockApi(page);
  await page.goto("/");
  test.skip(await page.locator('script[src="/@vite/client"]').count() === 0, "Entry updates apply only to the Vite development server.");
  await expect(page.locator(".authenticated-app-shell")).toHaveCount(1);
  await page.getByRole("tab", { name: "La mia dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Personalizza", exact: true }).click();
  await page.getByRole("checkbox", { name: /Mappa delle regioni/ }).uncheck();
  const dashboard = page.getByRole("region", { name: "La mia dashboard", exact: true });
  for (const width of [1440, 390]) {
    await page.evaluate(async () => {
      // Re-evaluate the entry as a local development module update would.
      await import(/* @vite-ignore */ `/src/main.tsx?t=${Date.now()}`);
    });
    await page.setViewportSize({ width, height: 844 });
    await expect(dashboard).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Mappa delle regioni/ })).not.toBeChecked();
    await expect(dashboard.locator(".personal-widget")).toHaveCount(3);
    await dashboard.locator(".personal-widget").last().scrollIntoViewIfNeeded();
    await expect(page.locator(".authenticated-app-shell")).toHaveCount(1);
    await expect(page.locator(".topbar")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`entry-update-${width}.png`), animations: "disabled" });
  }
  expect(rootWarnings).toEqual([]);
});

test("personal dashboard editor keeps a single application through the last widget", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: personalDashboardCatalogue.map(({ id }) => ({ id, width: "full" })) });
  await page.goto("/");
  const dashboard = page.getByRole("region", { name: "La mia dashboard", exact: true });
  await dashboard.getByRole("button", { name: "Personalizza", exact: true }).click();
  await expect(dashboard.locator(".personal-widget")).toHaveCount(personalDashboardCatalogue.length);
  for (const width of [1440, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await dashboard.locator(".personal-widget").last().scrollIntoViewIfNeeded();
    await expect(page.locator(".authenticated-app-shell")).toHaveCount(1);
    await expect(page.locator(".topbar")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath(`editor-bottom-${width}.png`), animations: "disabled" });
  }
  await dashboard.getByRole("button", { name: "Salva dashboard", exact: true }).click();
  await page.reload();
  await expect(dashboard.locator(".personal-widget")).toHaveCount(personalDashboardCatalogue.length);
  await expect(page.locator(".authenticated-app-shell")).toHaveCount(1);
  await dashboard.getByRole("button", { name: "Personalizza", exact: true }).click();
  await dashboard.locator(".personal-widget").last().scrollIntoViewIfNeeded();
  await expect(page.locator(".topbar")).toHaveCount(1);
});

test("personal dashboard saves selection, order, width and default; preserves edits on failure", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-09-24T12:00:00Z"));
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const dashboard = page.getByRole("region", { name: "La mia dashboard", exact: true });
  await dashboard.getByRole("button", { name: "Personalizza", exact: true }).click();
  await page.getByRole("checkbox", { name: /Mappa delle regioni/ }).uncheck();
  await page.getByRole("checkbox", { name: /Panorama di maturità/ }).uncheck();
  await page.getByRole("button", { name: "Sposta su: Ultimi vini aggiunti", exact: true }).click();
  await page.getByLabel("Larghezza: Ultimi vini aggiunti", { exact: true }).selectOption("full");
  await page.evaluate(() => sessionStorage.setItem("vinaris-test-save-error", "1"));
  await page.getByRole("button", { name: "Salva dashboard", exact: true }).click();
  await expect(dashboard.getByRole("alert")).toContainText("Le modifiche sono ancora qui");
  await expect(dashboard.getByRole("alert")).toContainText("HTTP 503");
  await page.evaluate(() => sessionStorage.removeItem("vinaris-test-save-error"));
  await page.getByRole("button", { name: "Salva dashboard", exact: true }).click();
  await expect(dashboard.getByRole("status")).toContainText("salvata");
  const saved = [{ id: "recent", width: "full" }, { id: "ready", width: "half" }];
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("vinaris-test-preferences")!).personal_dashboard_widgets)).toEqual(saved);
  await page.reload();
  await expect(dashboard.getByRole("region", { name: "Ultimi vini aggiunti", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("personal-compact-review.png"), fullPage: true, animations: "disabled" });
  await expect(page).toHaveScreenshot("personal-dashboard-compact.png", { fullPage: true });
  await dashboard.getByRole("button", { name: "Personalizza", exact: true }).click();
  await page.getByRole("button", { name: "Rimuovi: Ultimi vini aggiunti", exact: true }).click();
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(dashboard.getByRole("region", { name: "Ultimi vini aggiunti", exact: true })).toBeVisible();
  await dashboard.getByRole("button", { name: "Personalizza", exact: true }).click();
  await page.getByRole("button", { name: "Rimuovi: Ultimi vini aggiunti", exact: true }).click();
  await page.getByRole("button", { name: "Rimuovi: Da bere adesso", exact: true }).click();
  await page.getByRole("button", { name: "Salva dashboard", exact: true }).click();
  await page.reload();
  await expect(dashboard).toContainText("La tua dashboard è vuota");
  await page.getByRole("tab", { name: /Focus collezionista/ }).click();
  await expect(page.getByText("La mia cantina", { exact: true })).toBeVisible();
});

test("personal dashboard widgets fit mobile and desktop and can become the default", async ({ page }, testInfo) => {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "La mia dashboard", exact: true }).click();
  const dashboard = page.getByRole("region", { name: "La mia dashboard", exact: true });
  await dashboard.getByRole("button", { name: "Usa come iniziale", exact: true }).click();
  await expect(dashboard.getByText("Dashboard iniziale", { exact: true })).toBeVisible();
  await page.reload();
  await expect(dashboard).toBeVisible();
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width < 900) {
      await expect(page.locator(".cellar-home-hero")).toBeVisible();
      const nav = (await page.locator(".dashboard-focus-navigation").boundingBox())!;
      expect(nav.y + nav.height).toBeLessThanOrEqual((await dashboard.boundingBox())!.y);
      await expect(dashboard.locator(".dashboard-summary").first()).toHaveCSS("border-radius", "14px");
    }
    const boxes = await dashboard.locator('.personal-widget').evaluateAll(elements => elements.map(element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }));
    for (const box of boxes) { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); }
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1], b = boxes[i];
      expect(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1).toBe(true);
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`personal-${width}.png`) });
  }
  await dashboard.getByRole("button", { name: "Personalizza", exact: true }).click();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Salva dashboard", exact: true }).click();
  await expect(dashboard.locator('.personal-widget')).toHaveCount(personalDashboardCatalogue.length);
  await page.reload();
  await expect(dashboard.locator('.personal-widget')).toHaveCount(personalDashboardCatalogue.length);
  expect(await dashboard.locator('[data-widget-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-widget-id')).sort())).toEqual(personalDashboardCatalogue.map(widget => widget.id).sort());
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await dashboard.getByRole("button", { name: "Personalizza", exact: true }).click();
  await page.getByRole("group", { name: "Scegli i tuoi widget" }).screenshot({ path: testInfo.outputPath("personal-editor-390.png") });
});

test("personal dashboard demo stays read-only", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, is_demo: true });
  await page.goto("/");
  await page.getByRole("tab", { name: "La mia dashboard", exact: true }).click();
  await expect(page.getByRole("button", { name: "Personalizza", exact: true })).toBeDisabled();
});

test("personal dashboard supports every widget at half width", async ({ page }, testInfo) => {
  const ids = personalDashboardCatalogue.map(widget => widget.id);
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: ids.map(id => ({ id, width: "half" })) });
  await page.goto("/");
  const dashboard = page.getByRole("region", { name: "La mia dashboard", exact: true });
  await expect(dashboard.locator('.personal-widget')).toHaveCount(ids.length);
  for (const width of [360, 390, 430, 768, 1100, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const widget of await dashboard.locator('.personal-widget').all()) {
      await widget.scrollIntoViewIfNeeded();
      expect(await widget.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${width}px: ${await widget.getAttribute("aria-label")}`).toBe(true);
      const header = (await widget.locator(".dashboard-summary > header").boundingBox())!;
      const body = (await widget.locator(".summary-body").boundingBox())!;
      const footer = (await widget.locator(".dashboard-summary > footer").boundingBox())!;
      expect(header.y + header.height).toBeLessThanOrEqual(body.y + 1);
      expect(body.y + body.height).toBeLessThanOrEqual(footer.y + 1);
      expect(header.width).toBeGreaterThan((await widget.boundingBox())!.width - 60);
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`personal-all-${width}.png`), fullPage: true, animations: "disabled" });
  }
});

for (const width of [360, 390, 430, 1440]) {
  test(`personal dashboard drag and drop ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: [
      { id: "deliveries", width: "half" }, { id: "recent", width: "half" }, { id: "ready", width: "full" },
    ] });
    await page.goto("/");
    await page.getByRole("button", { name: "Personalizza", exact: true }).click();
    const handle = page.getByRole("button", { name: "Trascina per riordinare: Bottiglie in viaggio", exact: true });
    const order = () => page.locator('[data-widget-id]').evaluateAll(elements => elements.map(e => e.getAttribute('data-widget-id')));
    const original = ["deliveries", "recent", "ready"];
    // Keyboard ordering retains focus on the same handle.
    await handle.focus();
    await handle.press("ArrowDown");
    await expect.poll(order).toEqual(["recent", "deliveries", "ready"]);
    await expect(handle).toBeFocused();
    await handle.press("ArrowUp");
    await expect.poll(order).toEqual(original);
    await page.locator('[data-widget-id="deliveries"]').evaluate(element => window.scrollBy(0, element.getBoundingClientRect().top - 110));
    const source = (await handle.boundingBox())!;
    const target = (await page.getByRole("button", { name: "Trascina per riordinare: Ultimi vini aggiunti", exact: true }).boundingBox())!;
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    expect(end.y).toBeLessThan(760);
    const cdp = width === 1440 ? null : await page.context().newCDPSession(page);
    async function startDrag() {
      if (cdp) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + 10, y: start.y + 10, id: 1 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...end, id: 1 }] });
      } else {
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
      }
      await expect(page.locator('[data-widget-id="recent"]')).toHaveClass(/is-drop-target/);
    }
    await startDrag();
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    else { await page.keyboard.press("Escape"); await page.mouse.up(); }
    await expect(page.locator('.personal-widget-drag-preview')).toHaveCount(0);
    await expect.poll(order).toEqual(original);
    if (!cdp) {
      await startDrag();
      await page.mouse.move(5, 400);
      await page.mouse.up();
      await expect.poll(order).toEqual(original);
    }
    await startDrag();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`drag-${width}.png`), animations: "disabled" });
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    else await page.mouse.up();
    await expect.poll(order).toEqual(["recent", "deliveries", "ready"]);
    await expect(page.locator('.personal-widget-drag-preview')).toHaveCount(0);
    await page.getByRole("button", { name: "Salva dashboard", exact: true }).click();
    await expect(page.getByRole("button", { name: "Personalizza", exact: true })).toBeVisible();
    await page.reload();
    await expect.poll(order).toEqual(["recent", "deliveries", "ready"]);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("vinaris-test-preferences")!).personal_dashboard_widgets)).toEqual([
      { id: "recent", width: "half" }, { id: "deliveries", width: "half" }, { id: "ready", width: "full" },
    ]);
    await cdp?.detach();
  });
}

test("personal dashboard drag scrolls on touch and stops after cancellation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal" });
  await page.goto("/");
  await page.getByRole("button", { name: "Personalizza", exact: true }).click();
  const handle = page.getByRole("button", { name: "Trascina per riordinare: Da bere adesso", exact: true });
  await handle.evaluate(element => window.scrollBy(0, element.getBoundingClientRect().top - 130));
  const box = (await handle.boundingBox())!;
  const initialScroll = await page.evaluate(() => scrollY);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 20, y: box.y + 20, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 20, y: 820, id: 1 }] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(initialScroll + 40);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect(page.locator('.personal-widget-drag-preview')).toHaveCount(0);
  const stopped = await page.evaluate(() => scrollY);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => scrollY)).toBe(stopped);
  expect(await page.locator('[data-widget-id]').evaluateAll(elements => elements.map(e => e.getAttribute('data-widget-id')))).toEqual(["ready", "recent", "regions", "maturity"]);
  await cdp.detach();
});

test("personal dashboard financial widgets work at every width", async ({ page }, testInfo) => {
  const ids = ["featured", "top_value", "value_type", "value_region", "value_producer"];
  const stock = Array.from({ length: 6 }, (_, index) => ({ ...wine, id: `finance-${index}`, name: `Selezione ${index + 1}`, type: index % 2 ? "White" : "Red", current_value: String(40 + index * 10) }));
  await mockApi(page, [], false, memberships, stock, { ...session, dashboard_focus: "personal", personal_dashboard_widgets: ids.map(id => ({ id, width: "half" })) });
  await page.goto("/");
  const widgets = page.locator('[data-widget-id]');
  await expect(widgets).toHaveCount(3);
  await expect(page.locator('[data-widget-id="top_value"] .summary-bottle')).toHaveCount(3);
  await expect(page.locator('[data-widget-id="top_value"] .summary-bottle').first()).toContainText("Selezione 6");
  const tiles = page.locator('[data-widget-id="value_distribution"] .summary-mosaic rect');
  await expect(tiles).toHaveCount(2);
  const areas = await tiles.evaluateAll(elements => elements.map(element => { const rect = element as SVGRectElement; return rect.width.baseVal.value * rect.height.baseVal.value; }));
  expect(areas[0] / (areas[0] + areas[1])).toBeCloseTo(840 / 1560, 5);
  for (const width of [360, 390, 430, 768, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const widget of await widgets.all()) {
      await widget.scrollIntoViewIfNeeded();
      expect(await widget.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${width}: ${await widget.getAttribute('data-widget-id')}`).toBe(true);
      await expect(widget.getByRole('heading').first()).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390 || width === 1100) await page.screenshot({ path: testInfo.outputPath(`finance-${width}.png`), fullPage: true, animations: "disabled" });
  }
  await page.locator('[data-widget-id="top_value"] .summary-bottle').first().click();
  await expect(page.locator('.wine-detail:visible').first()).toContainText('Selezione 6');
});

test("personal dashboard operational widgets and separate summaries", async ({ page }, testInfo) => {
  const ids = ["tonight", "past_window", "to_collect", "data_quality", "styles", "collection_value", "overview", "maturity"];
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: ids.map(id => ({ id, width: "half" })) });
  await page.goto("/");
  const widgets = page.locator('[data-widget-id]');
  await expect(widgets).toHaveCount(ids.length);
  for (const width of [360, 390, 430, 768, 1100, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const widget of await widgets.all()) {
      await widget.scrollIntoViewIfNeeded();
      await expect(widget.getByRole('heading').first()).toBeVisible();
      expect(await widget.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${width}: ${await widget.getAttribute('data-widget-id')}`).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390 || width === 1100) await page.screenshot({ path: testInfo.outputPath(`operations-${width}.png`), fullPage: true, animations: "disabled" });
  }
  const value = page.locator('[data-widget-id="collection_value"]');
  await expect(value).toContainText('CHF');
  await expect(value).toContainText('192');
  await expect(value).not.toContainText('Da seguire adesso');
  await expect(page.locator('[data-widget-id="overview"]')).toContainText('4');
  await expect(page.locator('[data-widget-id="maturity"]')).toContainText('bottiglie con finestra nota');
  await page.getByRole('button', { name: 'Personalizza', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Cerca widget', exact: true }).fill('produttor');
  await expect(page.getByRole('checkbox', { name: /Produttori protagonisti/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Una bottiglia per stasera/ })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Cerca widget', exact: true }).fill('inesistente');
  await expect(page.getByText('Nessun widget corrisponde alla ricerca.')).toBeVisible();
  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(widgets).toHaveCount(ids.length);
  await page.locator('[data-widget-id="data_quality"]').getByRole('button', { name: 'Approfondisci' }).click();
  await expect(page.locator('.data-dashboard-carousel')).toBeVisible();
});

test("personal dashboard complete catalogue handles an empty cellar in English", async ({ page }) => {
  await mockApi(page, [], false, memberships, [], { ...session, locale: 'en', dashboard_focus: 'personal', personal_dashboard_widgets: personalDashboardCatalogue.map(({ id }) => ({ id, width: 'full' })) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('[data-widget-id]')).toHaveCount(personalDashboardCatalogue.length);
  await expect(page.getByRole('heading', { name: 'My dashboard', exact: true })).toBeVisible();
  for (const widget of await page.locator('[data-widget-id]').all()) {
    await widget.scrollIntoViewIfNeeded();
    await expect(widget).not.toContainText('NaN');
    await expect(widget).not.toContainText('Infinity');
    expect(await widget.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
});

test("personal dashboard operational lists open the right wines", async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-24T12:00:00Z'));
  const past = { ...wine, id: 'past-window', name: 'Vino da verificare', drink_from: 2015, drink_peak_from: 2018, drink_peak_to: 2020, drink_to: 2022 };
  const pickup = { ...wine, id: 'pickup', name: 'Vino da ritirare', status: 'to_collect', expected_delivery: '2026-09-20' };
  const widgets = [{ id: 'past_window', width: 'half' }, { id: 'to_collect', width: 'half' }];
  await mockApi(page, [], false, memberships, [wine, past, pickup], { ...session, dashboard_focus: 'personal', personal_dashboard_widgets: widgets });
  await page.goto('/');
  await page.locator('[data-widget-id="past_window"]').getByRole('button', { name: /Vino da verificare/ }).click();
  await expect(page.locator('.wine-detail:visible').first()).toContainText('Vino da verificare');
  await page.reload();
  await page.locator('[data-widget-id="to_collect"]').getByRole('button', { name: /Vino da ritirare/ }).click();
  await expect(page.locator('.wine-detail:visible').first()).toContainText('Vino da ritirare');
});

test("personal dashboard links to matching insights, filtered cellar, or nowhere", async ({ page }) => {
  const pickup = { ...wine, id: 'pickup', name: 'Vino da ritirare', status: 'to_collect', expected_delivery: '2026-09-20' };
  const widgets = [
    { id: 'styles', width: 'half' },
    { id: 'to_collect', width: 'half' },
    { id: 'vintages', width: 'half' },
  ];
  await mockApi(page, [], false, memberships, [wine, pickup], { ...session, dashboard_focus: 'personal', personal_dashboard_widgets: widgets });
  await page.goto('/');

  await expect(page.locator('[data-widget-id="vintages"] .summary-explore')).toHaveCount(0);
  await page.locator('[data-widget-id="styles"]').getByRole('button', { name: 'Approfondisci' }).click();
  await expect(page.locator('.balanced-dashboard-carousel')).toBeVisible();

  await page.reload();
  await page.locator('[data-widget-id="to_collect"]').getByRole('button', { name: 'Apri cantina filtrata' }).click();
  await expect(page.locator('.active-cellar-filters')).toContainText('Vini da ritirare');
  await expect(page.locator('[data-wine-row-id]')).toHaveCount(1);
  await expect(page.locator('[data-wine-row-id]').first()).toContainText('Vino da ritirare');
});
