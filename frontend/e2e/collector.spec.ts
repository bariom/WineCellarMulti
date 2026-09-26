import { expect, test } from "@playwright/test";
import { snapshotChrome, wine, session, memberships, mockApi } from "./fixtures/app";
import { featuredValue } from "../src/domain/featuredValue";

for (const width of [1024, 1280, 1366, 1440, 1600, 1920]) {
  test(`desktop cellar editorial composition ${width}`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
    await page.setViewportSize({ width, height: 1000 });
    const stock = Array.from({ length: 5 }, (_, index) => ({ ...wine, id: index ? `desktop-${index}` : wine.id, name: index ? `Riserva della collezione ${index}` : wine.name }));
    await mockApi(page, [], false, memberships, stock, { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    await expect(page.locator(".cellar-home-hero")).toBeVisible();
    await expect(page.getByRole("region", { name: "Riepilogo cantina" })).toContainText("CHF 960");
    const summary = (await page.locator(".cellar-home-stats").boundingBox())!;
    expect(summary.y + summary.height).toBeLessThan(720);
    if (width >= 1100) expect((await page.locator(".view-tabs-navigation").boundingBox())!.height).toBeLessThan(130);
    const stage = page.locator(".collector-wine-stage");
    const key = stage.locator(".key-position-button").first();
    await expect(key).toBeVisible();
    const image = (await key.locator("img").boundingBox())!;
    const title = (await key.locator("h2").boundingBox())!;
    expect(image.height).toBeGreaterThanOrEqual(400);
    expect(image.x + image.width).toBeLessThanOrEqual(title.x);
    const featured = (await stage.locator(".key-position-card").boundingBox())!;
    const arrivals = (await stage.locator(".recent-wines-card").boundingBox())!;
    const ready = (await stage.locator(".priority-card").boundingBox())!;
    expect(arrivals.y).toBeGreaterThanOrEqual(featured.y + featured.height);
    expect(arrivals.x + arrivals.width).toBeLessThanOrEqual(ready.x);
    expect(Math.abs(arrivals.y - ready.y)).toBeLessThan(1);
    expect(arrivals.width).toBeGreaterThan(ready.width);
    await expect(page.locator(".cellar-riserva:visible")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`desktop-home-${width}.png`), animations: "disabled" });
    if (width === 1440) await expect(page).toHaveScreenshot("collector-desktop-home.webp", { animations: "disabled" });
    await stage.screenshot({ path: testInfo.outputPath(`desktop-stage-${width}.png`), animations: "disabled" });
    if (width === 1440) {
      await snapshotChrome(page, false);
      await expect(stage).toHaveScreenshot("collector-desktop-stage.webp", { animations: "disabled" });
      await snapshotChrome(page, true);
    }
    await key.click();
    await expect(page.locator(".wine-detail:visible").first()).toContainText(wine.name);
  });
}

test("desktop cellar Riserva and navigation preserve existing actions", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page, [], false, [...memberships, { ...memberships[0], membership_id: "second", household_id: "second", household_name: "Seconda cantina" }], [wine], { ...session, dashboard_focus: "collector", has_active_entitlement: false, is_free_tier: true });
  await page.goto("/");
  const banner = page.locator(".collector-desktop-riserva");
  await expect(banner).toBeVisible();
  const featured = (await page.locator(".collector-wine-stage > .key-position-card").boundingBox())!;
  const bounds = (await banner.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(featured.y + featured.height);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual((await page.locator(".recent-wines-card").boundingBox())!.y);
  const brand = (await page.locator(".topbar-brand").boundingBox())!;
  const search = (await page.locator(".desktop-topbar-search").boundingBox())!;
  const actions = (await page.locator(".session-pill").boundingBox())!;
  expect(brand.x + brand.width).toBeLessThanOrEqual(search.x);
  expect(search.x + search.width).toBeLessThanOrEqual(actions.x);
  await expect(page.getByRole("combobox", { name: "Cambia cantina" })).toBeVisible();
  const selector = page.locator(".household-switch");
  await expect(selector).toHaveCSS("border-radius", "50%");
  await expect(selector).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect((await selector.boundingBox())!.width).toBe(44);
  await page.locator(".topbar").screenshot({ path: testInfo.outputPath("desktop-header-cellars.png") });
  await page.mouse.move(0, 0);
  await page.locator(".collector-wine-stage").screenshot({ path: testInfo.outputPath("desktop-riserva.png"), animations: "disabled" });
  await banner.getByRole("button", { name: "Scopri Riserva" }).click();
  await expect(page.locator(".settings-tabs")).toBeVisible();
});

for (const theme of ["atelier", "midnight-ledger"]) {
  test(`desktop cellar empty English and theme ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockApi(page, [], false, memberships, [], { ...session, dashboard_focus: "collector", theme_preference: theme, locale: "en" });
    await page.goto("/");
    await expect(page.locator(".cellar-home-hero")).toContainText("0 bottles");
    await expect(page.locator(".cellar-home-stats")).not.toContainText("NaN");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`desktop-empty-${theme}.png`) });
    const navigation = page.locator(".view-tabs-navigation");
    await navigation.locator("summary").click();
    await navigation.getByRole("button", { name: "Intelligence", exact: true }).click();
    await expect(page.locator(".home-dashboard")).toHaveCount(0);
  });
}

for (const width of [360, 390, 412, 430, 480, 768]) {
  test(`collector premium Home composition ${width}`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : 844 });
    await mockApi(page, [], false, memberships, [wine, { ...wine, id: "second", name: "Una riserva dalla lunga storia", producer: "Un produttore dal nome particolarmente lungo", vintage: "2008", drink_to: 2025, drink_peak_to: 2025 }], { ...session, dashboard_focus: "collector", has_active_entitlement: false, is_free_tier: true });
    await page.goto("/");
    const hero = page.getByRole("region", { name: "La mia cantina", exact: true });
    const stats = page.getByRole("region", { name: "Riepilogo cantina" });
    await expect(hero).toContainText("8 bottiglie · 2 vini");
    await expect(stats.getByRole("article", { name: "Valore cantina" })).toContainText("CHF 384");
    await expect(stats.getByRole("article", { name: "Da monitorare" }).locator("strong")).toHaveText("1");
    const featured = page.getByRole("region", { name: "In primo piano", exact: true });
    const banner = page.getByRole("region", { name: "Vinaris Riserva" });
    const recent = page.getByRole("region", { name: "Ultimi arrivi", exact: true });
    const boxes = await Promise.all([hero, stats, featured, banner, recent].map(el => el.boundingBox()));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height);
    const card = featured.getByRole("listitem").first();
    const photo = (await card.locator(".key-position-bottle-visual").boundingBox())!;
    const identity = (await card.locator(".cellar-featured-identity").boundingBox())!;
    const maturity = (await card.locator(".collector-maturity").boundingBox())!;
    const insight = (await card.locator(".cellar-wine-insight").boundingBox())!;
    expect(photo.height).toBeGreaterThanOrEqual(220);
    expect(photo.x + photo.width).toBeLessThanOrEqual(identity.x);
    expect(maturity.y).toBeGreaterThanOrEqual(photo.y + photo.height);
    expect(insight.y).toBeGreaterThanOrEqual(maturity.y + maturity.height);
    const controls = page.locator(".topbar").getByRole("button");
    let right = 0;
    for (const control of await controls.all()) {
      if (!await control.isVisible()) continue;
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(right);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      right = box.x + box.width;
    }
    await stats.evaluate(el => el.scrollTo({ left: el.scrollWidth, behavior: "instant" }));
    await expect(stats.getByRole("article", { name: "Da monitorare" })).toBeInViewport({ ratio: 1 });
    await stats.evaluate(el => el.scrollTo({ left: 0, behavior: "instant" }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`premium-home-${width}.png`), fullPage: true, animations: "disabled" });
    if (width === 390) await expect(page).toHaveScreenshot("collector-riserva-home-compact.png", { fullPage: true });
    await banner.getByRole("button", { name: "Scopri Riserva" }).click();
    await expect(page.locator(".settings-tabs")).toBeVisible();
  });
}

test("collector premium summary keeps currencies, unavailable data and entitlements honest", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], false, memberships, [wine,
    { ...wine, id: "euro", currency: "EUR", current_value: "10", price: null },
    { ...wine, id: "unknown", current_value: null, price: null, drink_from: null, drink_to: null, drink_peak_from: null, drink_peak_to: null },
  ], { ...session, dashboard_focus: "collector" });
  await page.goto("/");
  const value = page.getByRole("article", { name: "Valore cantina" });
  await expect(value).toContainText("CHF 192");
  await expect(value).toContainText("EUR 40");
  await expect(value).toContainText("2/3 vini");
  await expect(page.getByRole("region", { name: "Vinaris Riserva" })).toHaveCount(0);
  await page.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(page.locator("#mobile-topbar-search input")).toBeFocused();
  await page.getByRole("button", { name: "Chiudi ricerca" }).click();
  await page.getByRole("button", { name: "Apri menu account" }).click();
  await expect(page.getByRole("menu", { name: "Menu account" })).toBeVisible();
});

test("collector premium empty Home supports English without fabricated figures", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockApi(page, [], false, memberships, [], { ...session, dashboard_focus: "collector", locale: "en" });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "My cellar", exact: true })).toContainText("0 bottles · 0 wines");
  await expect(page.getByRole("article", { name: "Cellar value" }).locator("strong")).toHaveText("—");
  await expect(page.getByRole("article", { name: "Ready to drink" }).locator("strong")).toHaveText("0");
  await expect(page.getByRole("region", { name: "Highlights", exact: true })).toContainText("No wines in this selection.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("collector premium Home keeps multiple cellars and read-only navigation usable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockApi(page, [], false, [...memberships, { ...memberships[0], membership_id: "second-member", household_id: "second-cellar", household_name: "Seconda cantina" }], [wine], { ...session, dashboard_focus: "collector", membership_role: "viewer", active_household_name: "Una cantina dal nome particolarmente lungo" });
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Cambia cantina" })).toBeVisible();
  const brand = (await page.locator(".topbar-brand").boundingBox())!;
  const actions = (await page.locator(".session-pill").boundingBox())!;
  expect(brand.x + brand.width).toBeLessThanOrEqual(actions.x);
  expect(actions.x + actions.width).toBeLessThanOrEqual(360);
  for (const width of [360, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const selector = page.locator(".topbar .household-switch");
    await expect(selector).toHaveCSS("border-radius", "50%");
    await expect(selector).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const box = (await selector.boundingBox())!;
    expect(box.width).toBe(44);
    expect(box.height).toBe(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.locator(".topbar").screenshot({ path: testInfo.outputPath(`cellar-selector-${width}.png`) });
  }
  await expect(page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Aggiungi un vino" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Cantina", exact: true }).click();
  await expect(page.locator(".cellar-list-header")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

for (const width of [360, 390, 430]) {
  test(`collector dashboard choices stay above the content ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 360 ? 800 : 844 });
    await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    const navigation = page.getByRole("region", { name: "Focus principale della dashboard", exact: true });
    const summary = page.getByRole("region", { name: "Riepilogo cantina" });
    const featured = page.getByRole("region", { name: "In primo piano", exact: true });
    const summaryBox = (await summary.boundingBox())!;
    const navigationBox = (await navigation.boundingBox())!;
    const featuredBox = (await featured.boundingBox())!;
    // Switching panels can trigger browser scroll anchoring; compare document coordinates.
    const navigationTop = await navigation.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
    const bottom = (await page.getByRole("navigation", { name: "Navigazione principale" }).boundingBox())!;
    const headerBox = (await page.locator(".topbar").boundingBox())!;
    expect(navigationBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
    expect(navigationBox.y + navigationBox.height).toBeLessThanOrEqual(summaryBox.y);
    expect(summaryBox.y + summaryBox.height).toBeLessThanOrEqual(featuredBox.y);
    expect(navigationBox.y + navigationBox.height).toBeLessThanOrEqual(bottom.y);
    await expect(navigation.getByRole("tab", { name: "La mia dashboard", exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath(`dashboard-choice-${width}.png`) });
    for (const name of ["Bere bene oggi", "Cantina equilibrata", "La mia dashboard"]) {
      await navigation.getByRole("tab", { name, exact: true }).click();
      await expect(navigation.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
      expect(await navigation.evaluate(element => element.getBoundingClientRect().top + window.scrollY)).toBeCloseTo(navigationTop, 1);
      await navigation.getByRole("tab", { name: "Focus collezionista", exact: true }).click();
      await expect(featured).toBeVisible();
      expect(await navigation.evaluate(element => element.getBoundingClientRect().top + window.scrollY)).toBeCloseTo(navigationTop, 1);
    }
    await navigation.getByText("Approfondimenti", { exact: true }).click();
    await expect(navigation.getByRole("tablist", { name: "Approfondimenti", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("collector scroll cues track navigation and disappear without overflow", async ({ page }, testInfo) => {
  const stock = Array.from({ length: 5 }, (_, index) => ({ ...wine, id: index ? `gallery-${index}` : wine.id, name: `Vino ${index + 1}` }));
  await mockApi(page, [], false, memberships, stock, { ...session, dashboard_focus: "collector" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const gallery = page.getByRole("region", { name: "Ultimi arrivi", exact: true });
  const next = gallery.getByRole("button", { name: "Successivo: Ultimi arrivi" });
  const previous = gallery.getByRole("button", { name: "Precedente: Ultimi arrivi" });
  await expect(gallery.getByText("1 di 5", { exact: true })).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(gallery.getByText("Scorri per esplorare →")).toBeVisible();
  await next.click();
  await expect(gallery.getByText("2 di 5", { exact: true })).toBeVisible();
  await expect(gallery.getByText("Scorri per esplorare →")).toHaveCount(0);
  await expect(previous).toBeEnabled();
  await gallery.getByRole("list").evaluate(element => element.scrollTo({ left: element.scrollWidth, behavior: "instant" }));
  await expect(gallery.getByText("5 di 5", { exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  await previous.focus();
  await page.keyboard.press("Enter");
  await expect(next).toBeEnabled();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const header = (await gallery.locator("header").boundingBox())!;
    const title = (await gallery.getByRole("heading").boundingBox())!;
    const controls = (await gallery.getByRole("group").boundingBox())!;
    expect(controls.x + controls.width).toBeLessThanOrEqual(header.x + header.width + 1);
    expect(title.x + title.width <= controls.x || title.y + title.height <= controls.y).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole("region", { name: "In primo piano", exact: true }).screenshot({ path: testInfo.outputPath(`scroll-cues-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(next).toBeHidden();
});

test("scroll cues stay hidden for one wine and follow dashboard overflow", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "collector" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const recent = page.getByRole("region", { name: "Ultimi arrivi", exact: true });
  await expect(recent.getByRole("listitem")).toHaveCount(1);
  await expect(recent.getByRole("group")).toHaveCount(0);
  await expect(recent.getByText("Scorri per esplorare →")).toHaveCount(0);
  await page.getByRole("tab", { name: "Bere bene oggi", exact: true }).click();
  const shell = page.locator(".daily-dashboard-carousel");
  await expect(shell).toBeVisible();
  const overflows = await shell.locator(".dashboard-grid").evaluate(el => el.scrollWidth > el.clientWidth + 2);
  if (overflows) {
    await expect(shell.getByRole("group")).toBeVisible();
    const next = shell.getByRole("button", { name: /^Successivo:/ });
    await next.click();
    await expect(shell.getByRole("button", { name: /^Precedente:/ })).toBeEnabled();
    await shell.screenshot({ path: testInfo.outputPath("dashboard-scroll-cues.png") });
  } else await expect(shell.getByRole("group")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("collector scroll cues respond to a native touch swipe", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await mockApi(page, [], false, memberships, [wine, { ...wine, id: "second", name: "Secondo vino" }, { ...wine, id: "third", name: "Terzo vino" }], { ...session, dashboard_focus: "collector" });
  await page.goto("/");
  const gallery = page.getByRole("region", { name: "Ultimi arrivi", exact: true });
  await gallery.scrollIntoViewIfNeeded();
  await gallery.evaluate(element => window.scrollBy(0, element.getBoundingClientRect().top - 110));
  const rail = (await gallery.getByRole("list").boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const y = rail.y + 100;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 300, y }] });
  for (const x of [250, 200, 150, 100, 50]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(gallery.getByRole("button", { name: "Precedente: Ultimi arrivi" })).toBeEnabled();
  await expect(gallery.getByText("Scorri per esplorare →")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await context.close();
});

test("collector evolution retries failures and labels partial movement history", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "collector" });
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("inventory/movements") || url.includes("value-history/portfolio")) {
        if (!sessionStorage.getItem("history-recovered")) return new Response("{}", { status: 503 });
        const body = url.includes("inventory/movements") ? Array.from({ length: 500 }, () => ({ movement_type: "purchase", quantity_delta: 1, occurred_on: "2026-08-01" })) : [{ recorded_at: "2026-09-01", value: "100" }];
        return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
      }
      return original(input, init);
    };
  });
  await page.goto("/");
  const evolution = page.getByRole("region", { name: "Come sta cambiando la tua cantina" });
  await expect(evolution.getByRole("alert")).toHaveCount(2);
  await expect(evolution.locator(".evolution-movements")).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem("history-recovered", "yes"));
  await evolution.getByRole("button", { name: "Riprova" }).first().click();
  await evolution.getByRole("button", { name: "Riprova" }).click();
  await expect(evolution.getByRole("alert")).toHaveCount(0);
  await expect(evolution.getByText(/ultimi 500: dati parziali/)).toBeVisible();
  await expect(evolution.locator(".evolution-metric")).toHaveCount(0);
});

for (const width of [360, 390, 430, 1440]) {
  test(`collector evolution uses recorded data ${width}`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page, [], false, memberships, [{ ...wine, drink_to: 2028 }, { ...wine, id: "eur", currency: "EUR", drink_to: 2035 }], { ...session, dashboard_focus: "collector" });
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("value-history/portfolio")) return new Response(JSON.stringify(url.includes("EUR") ? [] : [{ recorded_at: "2026-01-01", value: "100" }, { recorded_at: "2026-09-01", value: "140" }]), { headers: { "Content-Type": "application/json" } });
        if (url.includes("inventory/movements")) return new Response(JSON.stringify([
          { movement_type: "purchase", quantity_delta: 12, occurred_on: "2026-01-01" },
          { movement_type: "initial_purchase", quantity_delta: 2, occurred_on: "2026-02-01" },
          { movement_type: "consumption", quantity_delta: -3, occurred_on: "2026-03-01" },
          { movement_type: "sale", quantity_delta: -5, occurred_on: "2026-04-01" },
          { movement_type: "sale_void", quantity_delta: 2, occurred_on: "2026-04-02" },
          { movement_type: "opening_balance", quantity_delta: 100, occurred_on: "2026-01-01" },
          { movement_type: "purchase", quantity_delta: 99, occurred_on: "2020-01-01" },
          { movement_type: "purchase", quantity_delta: 99, occurred_on: "2027-01-01" },
        ]), { headers: { "Content-Type": "application/json" } });
        return original(input, init);
      };
    });
    await page.goto("/");
    if (width < 900) await page.getByRole("tab", { name: "Collezione", exact: true }).click();
    const evolution = page.getByRole("region", { name: "Come sta cambiando la tua cantina" });
    await expect(evolution.locator(".evolution-metric")).toContainText("40");
    await expect(evolution.locator(".evolution-movements > div").filter({ hasText: "Aggiunte" })).toContainText("14");
    await expect(evolution.locator(".evolution-movements > div").filter({ hasText: "Bevute" })).toContainText("3");
    await expect(evolution.locator(".evolution-movements > div").filter({ hasText: "Vendite nette" })).toContainText("3");
    await expect(evolution.getByRole("button", { name: "2031+: 4 bottiglie", exact: true })).toBeEnabled();
    for (const tile of await evolution.locator("article").all()) {
      const box = (await tile.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(evolution.locator(".time-series-chart canvas")).toBeVisible();
    await evolution.locator(".time-series-chart").scrollIntoViewIfNeeded();
    await expect(evolution.locator(".time-series-chart .uplot")).toHaveCSS("opacity", "1");
    await snapshotChrome(page, false);
    await evolution.screenshot({ path: testInfo.outputPath(`evolution-${width}.png`), animations: "disabled" });
    if (width === 390) await expect(evolution).toHaveScreenshot("collector-evolution-compact.png");
    await snapshotChrome(page, true);
    await evolution.getByRole("button", { name: "2031+: 4 bottiglie", exact: true }).click();
    await expect(evolution.locator(".collector-wine-list button")).toHaveCount(1);
    await evolution.getByLabel("Valuta dello storico").selectOption("EUR");
    await expect(evolution.getByText("Servono due rilevazioni per mostrare l’andamento.")).toBeVisible();
    await expect(evolution.locator(".evolution-metric")).toHaveCount(0);
  });
}

for (const theme of ["atelier", "private-cellar", "midnight-ledger", "maison-champagne", "pietra-vigna", "cave-privee"]) {
  test(`collector editorial hierarchy in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "collector", theme_preference: theme });
    await page.goto("/");
    const card = page.locator(".collector-mobile-highlights .collector-photo-rail button").first();
    await expect(card).toBeVisible();
    const label = (await card.locator(".collector-highlight-label").boundingBox())!;
    const value = (await card.locator(".collector-highlight-value").boundingBox())!;
    expect(value.y).toBeGreaterThanOrEqual(label.y + label.height);
    const maturity = (await card.locator(".collector-maturity").boundingBox())!;
    expect(maturity.y).toBeGreaterThanOrEqual(value.y + value.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`collector-${theme}.png`), animations: "disabled" });
  });
}

for (const width of [360, 390, 430, 1440]) {
  test(`collector atlas exposes its visual scenes ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    if (width < 900) await page.getByRole("tab", { name: "Collezione", exact: true }).click();
    const atlas = page.getByRole("region", { name: "Atlante della collezione" });
    await atlas.scrollIntoViewIfNeeded();
    await expect(atlas.locator(".geographic-map-card")).toBeVisible();
    await expect(page.locator(".collector-explore")).not.toHaveAttribute("open", "");
    for (const label of ["Maturità", "Valore", "Origini"]) {
      const tab = atlas.getByRole("tab", { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(atlas.getByRole("tabpanel")).toBeVisible();
      if (label === "Valore") await expect(atlas.locator(".collector-ranking-card")).toHaveCount(2);
      if (label === "Maturità") await expect(atlas.locator(".maturity-heatmap-card")).toBeVisible();
      const bounds = (await atlas.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await atlas.screenshot({ path: testInfo.outputPath(`atlas-${label}-${width}.png`) });
    }
    await atlas.getByRole("tab", { name: "Origini", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(atlas.getByRole("tab", { name: "Maturità", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(atlas.getByRole("tabpanel")).toBeFocused();
  });
}

for (const width of [360, 390, 430, 1440]) {
  test(`collector glance summary and exclusive maturity ${width}`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : width === 1440 ? 1000 : 844 });
    const stock = [
      { ...wine, quantity: 4, drink_from: 2020, drink_peak_from: 2022, drink_to: 2028 },
      { ...wine, id: "future", quantity: 3, drink_from: 2028, drink_peak_from: 2029, drink_to: 2035 },
      { ...wine, id: "closing", quantity: 2, drink_from: 2020, drink_to: 2026 },
      { ...wine, id: "past", quantity: 1, drink_from: 2018, drink_to: 2025 },
      { ...wine, id: "unknown", quantity: 5, drink_from: 2030, drink_to: 2025 },
      { ...wine, id: "ordered", quantity: 6, currency: "EUR", status: "ordered" },
    ];
    await mockApi(page, [], false, memberships, stock, { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    if (width < 900) await page.getByRole("tab", { name: "Collezione", exact: true }).click();
    const overview = page.getByRole("region", { name: "Panoramica collezionista" });
    await expect(overview.locator(".collector-glance-details")).toHaveCount(0);
    await expect(overview.getByRole("heading", { name: "Copertura valutazioni" })).toBeHidden();
    await expect(overview.locator(".collector-glance-numbers")).toContainText("21");
    const maturity = overview.getByRole("article", { name: "Maturità in cantina", exact: true });
    const bar = maturity.getByRole("img");
    await expect(bar).toHaveAttribute("aria-label", "Da attendere: 3; Pronte da bere: 4; In chiusura quest’anno: 2; Oltre la finestra: 1; Senza finestra: 5");
    const sizes = await bar.locator("span").evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width));
    expect(sizes[1] / sizes[0]).toBeCloseTo(4 / 3, 1);
    const priorities = overview.getByRole("region", { name: "Da seguire adesso" });
    await expect(priorities.locator("summary")).toHaveCount(2);
    await expect(priorities.getByText("Da ritirare", { exact: true })).toHaveCount(0);
    const blocks = overview.locator(":scope > header, :scope > div, :scope > section, :scope > details");
    let bottom = -Infinity;
    for (const block of await blocks.all()) {
      const box = (await block.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(bottom - 1);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      bottom = box.y + box.height;
    }
    for (const row of await overview.locator(".collector-distribution-entry summary").all()) {
      const rowBox = (await row.boundingBox())!;
      const countBox = (await row.locator("span").boundingBox())!;
      expect(countBox.x + countBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
      expect(countBox.y + countBox.height).toBeLessThanOrEqual(rowBox.y + rowBox.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await overview.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -100));
    await page.screenshot({ path: testInfo.outputPath(`glance-viewport-${width}.png`), animations: "disabled" });
    await snapshotChrome(page, false);
    await overview.screenshot({ path: testInfo.outputPath(`glance-${width}.png`), animations: "disabled" });
    if (width === 390) await expect(overview).toHaveScreenshot("collector-glance-compact.png");
    await snapshotChrome(page, true);
    await maturity.locator("summary").filter({ hasText: "Pronte da bere" }).click();
    await expect(maturity.getByRole("button", { name: /Nebbiolo di Test/ })).toBeVisible();
  });
}

test("collector overview has consistent counts, currency coverage and actionable priorities", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
  const stock = [
    wine,
    { ...wine, id: "old", name: "Riserva storica", quantity: 12, drink_from: 2015, drink_peak_from: 2017, drink_peak_to: 2019, drink_to: 2020 },
    { ...wine, id: "closing", name: "Finestra 2026", quantity: 3, drink_to: 2026, drink_peak_to: 2026, current_value: "", price: "20" },
    { ...wine, id: "collect", name: "Ritiro in enoteca", quantity: 6, status: "to_collect", current_value: "", price: "", drink_from: null, drink_to: null },
    { ...wine, id: "euro", name: "Collezione europea", quantity: 2, currency: "EUR", current_value: "50", price: "40", status: "ordered" },
    { ...wine, id: "empty", quantity: 0 },
  ];
  await mockApi(page, [], false, memberships, stock, { ...session, dashboard_focus: "collector" });
  await page.goto("/");
  const overview = page.getByRole("region", { name: "Panoramica collezionista" });
  await expect(overview.locator(".collector-glance-numbers")).toContainText("27");
  await expect(overview.locator(".collector-glance-details")).toHaveCount(0);
  await expect(overview.getByRole("article", { name: "Disponibilità", exact: true })).toContainText("19 bottiglie");
  const value = overview.locator("article").filter({ has: page.getByRole("heading", { name: "Valore della collezione", exact: true }) });
  await expect(value).toContainText("828");
  await expect(value).toContainText("100");
  await expect(value).toContainText("EUR");
  await expect(value).toContainText("CHF");
  await expect(value.locator(".collector-currency-total")).toHaveCount(2);
  const currencyLabels = value.locator(".collector-currency-total strong small");
  const chfLabel = (await currencyLabels.nth(0).boundingBox())!;
  const eurLabel = (await currencyLabels.nth(1).boundingBox())!;
  expect(Math.abs(chfLabel.x - eurLabel.x)).toBeLessThan(1);
  const priorities = page.getByRole("region", { name: "Da seguire adesso" });
  await expect(priorities).toContainText("12 bottiglie · 1 vino");
  await expect(priorities).toContainText("3 bottiglie · 1 vino");
  await expect(priorities).toContainText("6 bottiglie · 1 vino");
  await priorities.locator("summary").filter({ hasText: "Finestra superata" }).click();
  await expect(priorities.getByRole("button", { name: /Riserva storica/ })).toBeVisible();
  await expect(page.locator(".collector-explore")).not.toHaveAttribute("open", "");
  // A missing purchase date must not create a synthetic time series.
  await expect(page.locator(".key-position-card").getByText("Acquisto → valore attuale / bott.").first()).toBeVisible();
  const available = overview.locator("summary").filter({ hasText: /^In cantina/ });
  await available.click();
  await overview.getByRole("button", { name: /Nebbiolo di Test/ }).first().click();
  await expect(page.locator(".wine-detail:visible").first()).toContainText(wine.name);
});

for (const width of [360, 390, 430, 1440]) {
  test(`collector responsive layout ${width}`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : width === 1440 ? 1000 : 844 });
    const galleryWines = Array.from({ length: 5 }, (_, index) => ({ ...wine, id: index ? `gallery-${index}` : wine.id, name: index ? `Riserva della collezione ${index}` : wine.name }));
    await mockApi(page, [], false, memberships, galleryWines, { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    if (width < 900) {
      const tabs = page.getByRole("tablist", { name: "Dashboard collezionista" });
      const mobile = page.locator(".collector-mobile-photos");
      await expect(tabs.getByRole("tab", { name: "Vini", exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(mobile.getByRole("heading", { name: "In primo piano" })).toBeVisible();
      await expect(mobile.getByRole("heading", { name: "Ultimi arrivi" })).toBeVisible();
      await expect(mobile.getByRole("heading", { name: "Da bere ora" })).toHaveCount(0);
      await expect(page.locator(".collector-overview")).toBeHidden();
      await expect(page.locator(".collector-wine-stage")).toBeHidden();
      const firstCard = mobile.locator(".collector-mobile-highlights .collector-photo-rail button").first();
      // The editorial card intentionally follows the hero and live summary.
      // It must be fully readable when scrolled into view, above the fixed navigation.
      await firstCard.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
      const firstHighlight = (await firstCard.boundingBox())!;
      const bottomNavigation = (await page.getByRole("navigation", { name: "Navigazione principale" }).boundingBox())!;
      expect(firstHighlight.y + firstHighlight.height).toBeLessThanOrEqual(bottomNavigation.y);
      await page.evaluate(() => window.scrollTo(0, 0));
      async function checkRails() {
        for (const rail of await mobile.getByRole("list").all()) {
          const before = (await rail.boundingBox())!;
          const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
          const cards = rail.getByRole("listitem");
          for (const card of await cards.all()) {
            const box = (await card.boundingBox())!;
            expect(box.height).toBe((await cards.first().boundingBox())!.height);
            const photo = (await card.locator(".key-position-bottle-visual").boundingBox())!;
            const title = (await card.locator("strong").boundingBox())!;
            expect(photo.height).toBeGreaterThanOrEqual(150);
            const image = (await card.locator("img").boundingBox())!;
            if (await card.evaluate(el => Boolean(el.closest(".collector-mobile-highlights")))) {
              expect(photo.x + photo.width).toBeLessThanOrEqual(title.x);
              expect(image.y + image.height).toBeLessThanOrEqual(box.y + box.height);
              const maturity = (await card.locator(".collector-maturity").boundingBox())!;
              const caption = (await card.locator("small").boundingBox())!;
              expect(maturity.y).toBeGreaterThanOrEqual(photo.y + photo.height);
              expect(maturity.y).toBeGreaterThanOrEqual(caption.y + caption.height);
            } else {
              expect(photo.y + photo.height).toBeLessThanOrEqual(title.y);
              expect(image.y + image.height).toBeLessThanOrEqual(title.y);
            }
            const caption = (await card.locator("small").boundingBox())!;
            expect(caption.y + caption.height).toBeLessThanOrEqual(box.y + box.height);
          }
          await rail.evaluate(element => element.scrollTo({ left: element.scrollWidth, behavior: "instant" }));
          await expect.poll(async () => (await rail.boundingBox())!.height).toBe(before.height);
          expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(pageHeight);
          await rail.evaluate(element => element.scrollTo({ left: 0, behavior: "instant" }));
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      }
      await checkRails();
      await page.screenshot({ path: testInfo.outputPath(`collector-${width}.png`), fullPage: true });
      await tabs.getByRole("tab", { name: "Priorità", exact: true }).click();
      await expect(mobile.getByRole("heading", { name: "Da bere ora" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Da seguire adesso" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Valore della collezione" })).toBeHidden();
      await checkRails();
      await page.screenshot({ path: testInfo.outputPath(`collector-priorities-${width}.png`), fullPage: true });
      await tabs.getByRole("tab", { name: "Collezione", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Valore della collezione" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Da seguire adesso" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Orizzonte di beva" })).toBeVisible();
      const tiles = await page.locator(".collector-evolution-grid > article").all();
      let bottom = -Infinity;
      for (const tile of tiles) {
        const box = (await tile.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(bottom);
        bottom = box.y + box.height;
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`collector-collection-${width}.png`), fullPage: true });
      await page.locator(".collector-atlas").getByRole("tab", { name: "Origini", exact: true }).click();
      await expect(page.locator(".collector-atlas .geographic-map-card")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await tabs.getByRole("tab", { name: "Collezione", exact: true }).focus();
      await page.keyboard.press("Home");
      await expect(tabs.getByRole("tab", { name: "Vini", exact: true })).toBeFocused();
      await expect(tabs.getByRole("tab", { name: "Vini", exact: true })).toHaveAttribute("aria-selected", "true");
      await page.evaluate(() => window.scrollTo(0, 0));
      // Returning from a lower section can leave the pointer over the first wine.
      await page.mouse.move(0, 0);
      if (width === 390) await expect(page).toHaveScreenshot("collector-compact.png", { fullPage: true });
      await mobile.getByRole("button", { name: /Nebbiolo di Test/ }).first().click();
      await expect(page.getByRole("dialog")).toContainText("Dati datati insufficienti");
      await page.getByRole("button", { name: "Apri scheda vino", exact: true }).click();
      await expect(page.locator(".wine-detail:visible").first()).toContainText(wine.name);
      return;
    }
    await expect(page.getByRole("heading", { name: "La cantina, a colpo d’occhio" })).toBeVisible();
    const stage = page.getByRole("region", { name: "I vini della tua collezione" });
    await expect(stage.locator(".key-position-card img").first()).toBeVisible();
    await expect(stage.locator(".priority-card img").first()).toBeVisible();
    await expect(stage.locator(".recent-wines-card img").first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`collector-opening-${width}.png`), fullPage: true });
    for (const selector of [".priority-card", ".recent-wines-card"]) {
      const photoBox = await stage.locator(`${selector} .key-position-bottle-visual`).first().boundingBox();
      expect(photoBox!.height).toBeGreaterThanOrEqual(140);
    }
    const arrivals = stage.locator(".recent-wines-card");
    const gallery = arrivals.getByRole("list");
    await expect(gallery.getByRole("listitem")).toHaveCount(5);
    const galleryItems = await gallery.getByRole("listitem").all();
    const firstGalleryBox = await galleryItems[0].boundingBox();
    for (const item of galleryItems) {
      const itemBox = (await item.boundingBox())!;
      expect(itemBox.y).toBeGreaterThanOrEqual(firstGalleryBox!.y);
      const galleryBox = (await gallery.boundingBox())!;
      expect(itemBox.x).toBeGreaterThanOrEqual(galleryBox.x);
      expect(itemBox.x + itemBox.width).toBeLessThanOrEqual(galleryBox.x + galleryBox.width);
      const copyBox = (await item.locator(".dashboard-bottle-copy").boundingBox())!;
      expect(copyBox.y + copyBox.height).toBeLessThanOrEqual(itemBox.y + itemBox.height);
    }
    const arrivalsBox = await arrivals.boundingBox();
    expect((await galleryItems[3].boundingBox())!.y).toBeGreaterThan(firstGalleryBox!.y + firstGalleryBox!.height);
    expect((await galleryItems[4].boundingBox())!.y + (await galleryItems[4].boundingBox())!.height).toBeLessThanOrEqual(arrivalsBox!.y + arrivalsBox!.height);
    if (width === 1440) {
      const readySelection = stage.getByRole("region", { name: "Selezione da bere ora" });
      await expect(readySelection.locator(".collector-ready-wine")).toHaveCount(2);
      const readyTiles = await readySelection.locator(".collector-ready-wine").all();
      const firstReady = (await readyTiles[0].boundingBox())!;
      const secondReady = (await readyTiles[1].boundingBox())!;
      expect(firstReady.x + firstReady.width).toBeLessThanOrEqual(secondReady.x);
      expect(firstReady.y).toBe(secondReady.y);
      await readySelection.getByRole("button", { name: "Vini successivi", exact: true }).click();
      await expect(readySelection.locator(".collector-ready-controls")).toContainText("3–4 / 5");
      await readySelection.getByRole("button", { name: "Vini successivi", exact: true }).click();
      await expect(readySelection.locator(".collector-ready-wine")).toHaveCount(1);
      expect((await readySelection.locator(".collector-ready-wine").boundingBox())!.height).toBeLessThan(200);
      await expect(readySelection.getByRole("button", { name: "Vini successivi", exact: true })).toBeDisabled();
      await readySelection.getByRole("button", { name: "Vini precedenti", exact: true }).click();
      await readySelection.getByRole("button", { name: "Vini precedenti", exact: true }).click();
      await expect(readySelection.locator(".collector-ready-controls")).toContainText("1–2 / 5");
      const featuredBox = (await stage.locator(".key-position-card").boundingBox())!;
      const readyBox = (await stage.locator(".priority-card").boundingBox())!;
      expect(readyBox.y).toBeGreaterThanOrEqual(featuredBox.y + featuredBox.height);
      expect((await arrivals.boundingBox())!.y).toBe(readyBox.y);
    }
    const stageBox = await stage.boundingBox();
    const overviewBox = await page.locator(".collector-overview").boundingBox();
    expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(overviewBox!.y);
    const stageCards = await stage.locator(":scope > article").all();
    for (const card of width === 1440 ? stageCards : []) {
      const box = await card.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    const tiles = await page.locator(".collector-tile:visible").all();
    const boxes = await Promise.all(tiles.map(tile => tile.boundingBox()));
    for (const [index, box] of width === 1440 ? boxes.entries() : []) {
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      for (const previous of boxes.slice(0, index)) {
        expect(box!.x >= previous!.x + previous!.width - .5 || previous!.x >= box!.x + box!.width - .5 || box!.y >= previous!.y + previous!.height - .5 || previous!.y >= box!.y + box!.height - .5).toBe(true);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const key = page.locator(".key-position-button").first();
    const photo = await key.locator(".key-position-bottle-visual").boundingBox();
    const title = await key.locator("h2").boundingBox();
    const metrics = await key.locator(".key-position-metrics").boundingBox();
    const bottleImage = (await key.locator("img").boundingBox())!;
    expect(bottleImage.x + bottleImage.width).toBeLessThanOrEqual(metrics!.x);
    expect(photo!.x + photo!.width).toBeLessThanOrEqual(title!.x);
    expect(title!.y + title!.height).toBeLessThanOrEqual(metrics!.y);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`collector-${width}.png`), fullPage: true });
    await page.locator(".collector-atlas").getByRole("tab", { name: "Origini", exact: true }).click();
    await expect(page.locator(".collector-atlas .geographic-map-card")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`collector-expanded-${width}.png`), fullPage: true });
    if (width === 1440) {
      await stage.getByRole("region", { name: "Selezione da bere ora" }).getByRole("button", { name: /Nebbiolo di Test/ }).click();
      await expect(page.locator(".wine-detail:visible").first()).toContainText(wine.name);
    }
  });
}

for (const width of [1024, 1280, 1920]) {
  test(`collector editorial instrument ${width}`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
    await page.setViewportSize({ width, height: 900 });
    const featured = { ...wine, name: "Les Femelottes — Bourgogne Chardonnay", producer: "Domaine Chavy-Chouet", price: "20", current_value: "60", order_date: "2024-01-01", ai_value_estimated_at: "2026-09-01T12:00:00Z", value_history: [
      { id: "mid", value: "40", currency: "CHF", source: "manual", recorded_at: "2025-01-01T12:00:00Z" },
    ] };
    const waiting = { ...wine, id: "waiting", name: "Riserva da attendere", drink_from: 2027, drink_peak_from: 2027, drink_peak_to: 2030, drink_to: 2034 };
    await mockApi(page, [], false, memberships, [featured, waiting], { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    const hero = page.locator(".key-position-button").first();
    await expect(hero.getByRole("heading", { name: featured.name })).toBeVisible();
    await expect(hero.locator(".key-position-trend")).toContainText("200");
    await expect(hero.locator(".key-position-trend-line")).toHaveCSS("stroke-dasharray", "none");
    const summary = (await page.locator(".cellar-home-stats").boundingBox())!;
    const feature = (await page.locator(".collector-wine-stage > .key-position-card").boundingBox())!;
    expect(summary.y + summary.height).toBeLessThanOrEqual(feature.y);
    expect(feature.y).toBeLessThan(800);
    expect((await page.locator(".collector-wine-stage > .priority-card").boundingBox())!.y).toBeGreaterThanOrEqual(feature.y + feature.height);
    await expect(hero.locator(".collector-maturity")).toContainText("2026–2028");
    const photo = (await hero.locator("img").boundingBox())!;
    const title = (await hero.getByRole("heading").boundingBox())!;
    const metrics = (await hero.locator(".key-position-metrics").boundingBox())!;
    expect(photo.x + photo.width).toBeLessThanOrEqual(title.x);
    expect(photo.x + photo.width).toBeLessThanOrEqual(metrics.x);
    expect(title.y + title.height).toBeLessThanOrEqual(metrics.y);
    const dates = await hero.locator(".collector-maturity-dates > span").all();
    for (const date of dates) {
      expect(await date.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator(".priority-next-list")).toContainText(waiting.name);
    await page.screenshot({ path: testInfo.outputPath(`editorial-${width}.png`), fullPage: true, animations: "disabled" });
    await page.locator(".priority-next-heading button").click();
    await expect(page.locator(`[data-wine-row-id="${waiting.id}"]`)).toBeVisible();
  });
}

for (const scenario of [{ dpr: 1, failed: false }, { dpr: 2, failed: false }, { dpr: 2, failed: true }]) {
  test.describe(`collector responsive photos ${scenario.dpr}x${scenario.failed ? " fallback" : ""}`, () => {
    test.use({ deviceScaleFactor: scenario.dpr });
    test("chooses the appropriate resolution", async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const photoWine = { ...wine, photo_thumbnail_url: "/test-photos/thumbnail.png", photo_detail_url: "/test-photos/detail.png" };
      await mockApi(page, [], false, memberships, [photoWine], { ...session, dashboard_focus: "collector" });
      const requested: string[] = [];
      await page.route("**/test-photos/*", route => {
        const detail = route.request().url().includes("detail");
        requested.push(detail ? "detail" : "thumbnail");
        if (detail && scenario.failed) return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${detail ? 480 : 160}" height="${detail ? 720 : 240}" viewBox="0 0 160 240"><rect x="66" y="15" width="28" height="40" rx="4" fill="#64503b"/><rect x="50" y="48" width="60" height="178" rx="16" fill="#38372a"/><rect x="54" y="112" width="52" height="64" fill="#efe9d6"/></svg>` });
      });
      await page.goto("/");
      const expected = scenario.dpr === 2 && !scenario.failed ? "detail.png" : "thumbnail.png";
      const hero = page.locator(".key-position-button img").first();
      // The large editorial hero needs the detail image even on a 1x display.
      await expect.poll(() => hero.evaluate((img: HTMLImageElement, suffix) => img.complete && img.naturalWidth > 0 && img.currentSrc.endsWith(suffix), scenario.failed ? "thumbnail.png" : "detail.png")).toBe(true);
      const arrivals = page.locator(".recent-wines-card img").first();
      await arrivals.scrollIntoViewIfNeeded();
      await expect.poll(() => arrivals.evaluate((img: HTMLImageElement, suffix) => img.complete && img.naturalWidth > 0 && img.currentSrc.endsWith(suffix), expected)).toBe(true);
      await expect(arrivals).toHaveAttribute("loading", "lazy");
      await expect(arrivals).toHaveAttribute("decoding", "async");
      if (!scenario.failed) expect(requested).toContain("detail");
      else expect(requested).toEqual(expect.arrayContaining(["detail", "thumbnail"]));
      await page.screenshot({ path: testInfo.outputPath("responsive-photos.png"), fullPage: true, animations: "disabled" });
    });
  });
}

for (const failed of [false, true]) {
  test(`collector loads featured history on first visit${failed ? " with unavailable detail" : ""}`, async ({ page }, testInfo) => {
    const detail = { ...wine, details_loaded: true, order_date: "2024-01-01", price: "20", current_value: "60", ai_value_estimated_at: "2026-09-01T00:00:00Z", value_history: [
      { id: "early", value: "70", currency: "CHF", source: "manual", recorded_at: "2025-01-01T00:00:00Z" },
      { id: "later", value: "40", currency: "CHF", source: "manual", recorded_at: "2026-01-01T00:00:00Z" },
    ] };
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], false, memberships, [{ ...detail, details_loaded: false, value_history: [] }], { ...session, dashboard_focus: "collector" });
    await page.addInitScript(({ detail, failed }) => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        if (new URL(url, location.origin).pathname === `/api/v1/wines/${detail.id}`) {
          sessionStorage.setItem("featured-detail-requests", String(Number(sessionStorage.getItem("featured-detail-requests") || 0) + 1));
          await new Promise(resolve => setTimeout(resolve, 500));
          sessionStorage.setItem("featured-detail-result", failed ? "failed" : "loaded");
          return new Response(JSON.stringify(failed ? { detail: "Unavailable" } : detail), { status: failed ? 503 : 200, headers: { "Content-Type": "application/json" } });
        }
        return original(input, init);
      };
    }, { detail, failed });
    await page.goto("/");
    const hero = page.locator(".key-position-button").first();
    await expect(hero).toContainText(detail.name);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("featured-detail-requests"))).toBe("1");
    if (failed) {
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem("featured-detail-result"))).toBe("failed");
      await expect(hero).toContainText("Acquisto → valore attuale");
      await expect(hero.locator(".key-position-trend-line")).toHaveCount(0);
    } else {
      const line = hero.locator(".key-position-trend-line");
      await expect(line).toHaveAttribute("d", /C/);
      const firstPath = await line.getAttribute("d");
      await page.screenshot({ path: testInfo.outputPath("first-visit-history.png"), animations: "disabled" });
      await page.getByRole("button", { name: /^Cantina/ }).first().click();
      await page.getByRole("button", { name: "Home", exact: true }).first().click();
      await expect(line).toHaveAttribute("d", firstPath!);
    }
  });
}

for (const width of [390, 1440]) {
  test(`collector missing photo stays discreet ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await mockApi(page, [], false, memberships, [{ ...wine, photo_thumbnail_url: "", photo_detail_url: "" }], { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    const glasses = page.locator(".home-dashboard-editorial .key-position-wine-illustration:visible");
    await expect(glasses.first()).toBeVisible();
    for (const glass of await glasses.all()) {
      const icon = (await glass.locator("svg").boundingBox())!;
      const container = (await glass.locator("..").boundingBox())!;
      expect(icon.width).toBeLessThanOrEqual(90);
      expect(icon.height).toBe(140);
      expect(icon.y).toBeGreaterThanOrEqual(container.y);
      expect(icon.y + icon.height).toBeLessThanOrEqual(container.y + container.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`fallback-${width}.png`), fullPage: true, animations: "disabled" });
  });
}

test("collector empty state has no misleading percentages", async ({ page }) => {
  await mockApi(page, [], false, memberships, [], { ...session, dashboard_focus: "collector", locale: "en" });
  await page.goto("/");
  const overview = page.getByRole("region", { name: "Collector overview" });
  await expect(overview.locator(".collector-glance-numbers")).toContainText("Bottles0");
  await expect(overview).not.toContainText("NaN");
  await expect(overview).not.toContainText("100%");
  await expect(overview.locator(".collector-glance-numbers").getByText("—", { exact: true })).toBeVisible();
  await expect(overview.getByText("No bottles to summarise.")).toHaveCount(2);
});

test("collector excludes incomplete windows and keeps dated history changes consistent", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
  const item = { ...wine, drink_from: 2030, drink_to: 2025, producer: "", current_value: "48", value_history: [
    { id: "a", value: "40", currency: "CHF", source: "manual", recorded_at: "2025-01-01T12:00:00Z" },
    { id: "b", value: "48", currency: "CHF", source: "manual", recorded_at: "2026-01-01T12:00:00Z" },
  ] };
  await mockApi(page, [], false, memberships, [item], { ...session, dashboard_focus: "collector" });
  await page.goto("/");
  await expect(page.locator(".collector-data-actions")).toHaveCount(0);
  await expect(page.locator(".evolution-columns button:not([disabled])")).toHaveCount(0);
  const priorities = page.getByRole("region", { name: "Da seguire adesso" });
  await expect(priorities).not.toContainText("4 bottiglie");
  await expect(page.locator(".key-position-trend")).toContainText("20");
  await expect(page.locator(".key-position-trend")).not.toContainText("14.3");
});

for (const width of [360, 390, 430]) {
  test(`collector highlight insight ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : 844 });
    const growth = { ...wine, price: "40", current_value: "60", order_date: "2024-01-01", ai_value_estimated_at: "2026-01-01T12:00:00Z",
      value_history: [{ id: "mid", value: "45", currency: "CHF", source: "manual", recorded_at: "2025-01-01T12:00:00Z" }] };
    const valuable = { ...wine, id: "valuable", name: "Riserva di grande valore della collezione", price: "200", current_value: "180" };
    await mockApi(page, [], false, memberships, [growth, valuable], { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    const rail = page.getByRole("list", { name: "In primo piano", exact: true });
    const card = rail.getByRole("button", { name: /Nebbiolo di Test/ });
    await expect(card).toContainText("+50%");
    await card.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("CHF 40");
    await expect(dialog).toContainText("CHF 60");
    await expect(dialog.getByRole("img", { name: /Andamento del valore/ })).toBeVisible();
    const heading = (await dialog.getByRole("heading", { level: 2 }).boundingBox())!;
    const close = (await dialog.getByRole("button", { name: "Chiudi approfondimento" }).boundingBox())!;
    expect(heading.x + heading.width).toBeLessThanOrEqual(close.x);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const facts = await dialog.locator(".featured-wine-facts > div").all();
    for (const fact of facts) {
      const label = (await fact.locator("dt").boundingBox())!;
      const value = (await fact.locator("dd").first().boundingBox())!;
      expect(label.y + label.height).toBeLessThanOrEqual(value.y);
    }
    await page.screenshot({ path: testInfo.outputPath(`highlight-${width}.png`) });
    if (width === 390) await expect(dialog).toHaveScreenshot("collector-highlight-insight.png");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(card).toBeFocused();
    const valueCard = rail.getByRole("button", { name: /Riserva di grande valore/ });
    await valueCard.scrollIntoViewIfNeeded();
    const offset = await rail.evaluate(el => el.scrollLeft);
    await valueCard.click();
    await expect(dialog).toContainText("Valore della tua quota");
    await expect(dialog).toContainText("CHF 720");
    await expect(dialog.getByRole("img")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`highlight-value-${width}.png`) });
    await dialog.getByRole("button", { name: "Chiudi approfondimento" }).click();
    await expect(valueCard).toBeFocused();
    expect(await rail.evaluate(el => el.scrollLeft)).toBe(offset);
    await card.click();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Apri scheda vino" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Chiudi approfondimento" })).toBeFocused();
    await dialog.getByRole("button", { name: "Apri scheda vino" }).click();
    await expect(page.locator(".wine-detail:visible").first()).toContainText(wine.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("collector highlight comparison handles gifts, currencies, missing dates and invalid values", () => {
  const item = { ...wine, price: "0.01", current_value: "60", value_history: [
    { id: "later", value: "50", currency: "CHF", source: "manual", recorded_at: "2025-01-01" },
    { id: "foreign", value: "1", currency: "EUR", source: "manual", recorded_at: "2023-01-01" },
    { id: "first", value: "40", currency: "CHF", source: "manual", recorded_at: "2024-01-01" },
    { id: "invalid", value: "broken", currency: "CHF", source: "manual", recorded_at: "2022-01-01" },
  ] };
  const evidence = featuredValue(item as unknown as Parameters<typeof featuredValue>[0]);
  expect(evidence.baseline).toBe(40);
  expect(evidence.changePct).toBe(50);
  expect(evidence.fromPurchase).toBe(false);
  expect(evidence.points).toEqual([]);
  const dated = featuredValue({ ...item, ai_value_estimated_at: "2026-01-01" } as unknown as Parameters<typeof featuredValue>[0]);
  expect(dated.points.map(point => point.value)).toEqual([40, 50, 60]);
  expect(featuredValue({ ...item, price: "100" } as unknown as Parameters<typeof featuredValue>[0]).changePct).toBe(-40);
  expect(featuredValue({ ...item, current_value: null, value_history: [] } as unknown as Parameters<typeof featuredValue>[0]).changePct).toBeNull();
});

test("collector declining values have no growth label and insights support English", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], false, memberships, [{ ...wine, price: "100", current_value: "80" }], { ...session, dashboard_focus: "collector", locale: "en" });
  await page.goto("/");
  const card = page.getByRole("list", { name: "Highlights", exact: true }).getByRole("button");
  await expect(card).not.toContainText("Largest price increase");
  await expect(card).toContainText("Value of your share");
  await card.click();
  await expect(page.getByRole("dialog")).toContainText("Your share");
  await page.mouse.click(5, 5);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toBeFocused();
});
