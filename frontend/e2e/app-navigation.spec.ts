import { expect, test } from "@playwright/test";
import { wine, session, memberships, multiCellarMemberships, mockApi, openRecordTasting } from "./fixtures/app";

for (const width of [1200, 1440]) {
  test(`Home AI navigation overlays without shifting content ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto("/");
    const navigation = page.locator(".view-tabs-navigation");
    const group = navigation.locator(".view-tabs-ai-group");
    const after = navigation.getByRole("button", { name: "Wine Pulse", exact: true });
    const dashboard = page.locator(".dashboard-focus-navigation");
    const before = await Promise.all([navigation, after, dashboard].map(el => el.boundingBox()));
    await group.locator("summary").click();
    const afterOpen = await Promise.all([navigation, after, dashboard].map(el => el.boundingBox()));
    for (let index = 0; index < before.length; index++) {
      expect(afterOpen[index]!.x).toBeCloseTo(before[index]!.x, 0);
      expect(afterOpen[index]!.y).toBeCloseTo(before[index]!.y, 0);
      expect(afterOpen[index]!.height).toBeCloseTo(before[index]!.height, 0);
    }
    const options = group.locator(".view-tabs-ai-options");
    await expect(options.getByRole("button", { name: "Intelligence", exact: true })).toBeVisible();
    const box = (await options.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual((await group.locator("summary").boundingBox())!.y);
    const hit = await options.evaluate(el => { const b = el.getBoundingClientRect(); const point = document.elementFromPoint(b.x + b.width / 2, b.y + 18); return { inside: el.contains(point), element: point?.outerHTML.slice(0, 220), navOverflow: getComputedStyle(el.closest(".view-tabs-navigation")!).overflow, tabsOverflow: getComputedStyle(el.closest(".view-tabs")!).overflow }; });
    expect(hit, JSON.stringify(hit)).toMatchObject({ inside: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-ai-menu-${width}.png`) });
    await options.getByRole("button", { name: "Intelligence", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Piano cantina", exact: true })).toBeVisible();
  });
}

for (const width of [1100, 1440, 1920]) {
  test(`desktop navigation stays horizontal across sections ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto("/");
    for (const [label, view] of [[/^Cantina/, "cellar"], [/^Wishlist/, "wishlist"], [/^Storico$/, "history"]] as const) {
      await page.getByRole("button", { name: label }).first().click();
      const navigation = page.locator(".view-tabs-navigation");
      const nav = (await navigation.boundingBox())!;
      const header = (await page.locator(".topbar").boundingBox())!;
      expect(nav.y).toBeGreaterThanOrEqual(header.y + header.height);
      expect(nav.y - (header.y + header.height)).toBeLessThan(20);
      expect(nav.height).toBeLessThan(110);
      const home = (await navigation.getByRole("button", { name: "Home", exact: true }).boundingBox())!;
      const cellar = (await navigation.getByRole("button", { name: /^Cantina/ }).boundingBox())!;
      expect(home.y).toBeCloseTo(cellar.y, 0);
      expect(home.x + home.width).toBeLessThanOrEqual(cellar.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (view === "cellar") {
        const list = (await page.locator(".wine-list").boundingBox())!;
        const side = (await page.locator(".wine-side-panel").boundingBox())!;
        expect(list.y).toBeGreaterThanOrEqual(nav.y + nav.height);
        expect(side.x).toBeGreaterThanOrEqual(list.x + list.width);
        await page.screenshot({ path: testInfo.outputPath(`cellar-horizontal-${width}.png`) });
      }
      if (width === 1440 && view !== "cellar") await page.screenshot({ path: testInfo.outputPath(`${view}-horizontal.png`) });
    }
    const nav = page.locator(".view-tabs-navigation");
    const pulse = nav.getByRole("button", { name: "Wine Pulse", exact: true });
    const pulseBefore = (await pulse.boundingBox())!;
    await nav.locator(".view-tabs-ai-group > summary").click();
    const options = nav.locator(".view-tabs-ai-options");
    await expect(options.getByRole("button", { name: "Intelligence", exact: true })).toBeVisible();
    expect((await pulse.boundingBox())!.y).toBeCloseTo(pulseBefore.y, 0);
    expect(await options.evaluate(el => { const b = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + 18)); })).toBe(true);
    await options.getByRole("button", { name: "Intelligence", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Piano cantina", exact: true })).toBeVisible();
    await nav.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.locator(".cellar-home-hero")).toBeVisible();
  });
}

for (const [width, theme] of [[360, "atelier"], [390, "atelier"], [430, "atelier"], [1024, "atelier"], [1440, "atelier"], [1440, "private-cellar"], [1440, "midnight-ledger"], [1440, "maison-champagne"], [1440, "pietra-vigna"], [1440, "cave-privee"]] as const) {
  test(`compact section header ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 901 ? 844 : 1000 });
    await mockApi(page, [], false, [...memberships, { ...memberships[0], membership_id: "second", household_id: "second", household_name: "Seconda cantina" }], [wine], { ...session, theme_preference: theme });
    await page.goto("/");
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    const header = page.locator(".cellar-compact-header");
    await expect(header).toBeVisible();
    await expect(header.locator(".topbar-brand-mark")).toBeHidden();
    await expect(header.locator(".eyebrow")).toHaveCSS("font-family", "Georgia, serif");
    await expect(header.locator(".tier-badge")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const bounds = (await header.boundingBox())!;
    expect(bounds.height).toBeLessThanOrEqual(110);
    const brand = (await header.locator(".topbar-brand").boundingBox())!;
    const actions = (await header.locator(".session-pill").boundingBox())!;
    expect(brand.x + brand.width).toBeLessThanOrEqual(actions.x);
    expect(actions.x + actions.width).toBeLessThanOrEqual(width);
    const selector = header.getByRole("combobox", { name: "Cambia cantina" });
    await expect(selector).toBeVisible();
    await expect(header.locator(".household-switch")).toHaveCSS("border-radius", "50%");
    const bell = header.getByRole("button", { name: "Notifiche", exact: true });
    await expect(bell.locator("svg")).toHaveCSS("stroke", "rgb(250, 247, 239)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("cellar.png") });
    if (theme === "atelier" && (width === 390 || width === 1440)) {
      await expect(header).toHaveScreenshot(`compact-section-header-${width}.png`);
    }
    await bell.click();
    const panel = page.getByRole("dialog", { name: "Notifiche", exact: true });
    await expect(panel).toBeVisible();
    expect(await panel.evaluate(el => { const b = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.x + 24, b.y + 24)); })).toBe(true);
    await page.locator(".notification-backdrop").click({ position: { x: 2, y: 2 } });
    if (width >= 1100) {
      const search = header.getByRole("textbox", { name: "Cerca", exact: true });
      await expect(search).toBeVisible();
      const searchBounds = (await header.locator(".desktop-topbar-search").boundingBox())!;
      expect(brand.x + brand.width).toBeLessThanOrEqual(searchBounds.x);
      expect(searchBounds.x + searchBounds.width).toBeLessThanOrEqual(actions.x);
      await page.getByRole("button", { name: /^Wishlist/ }).first().click();
      await expect(header).toBeVisible();
      await header.getByRole("button", { name: "Impostazioni", exact: true }).click();
      await expect(page.locator(".settings-tabs")).toBeVisible();
      await expect(header).toBeVisible();
      await expect(header.locator(".desktop-topbar-search")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath("settings.png") });
    }
  });
}

test("header palettes stay coherent and legible across all themes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page);
  await page.goto("/");
  await expect(page.locator(".cellar-home-backdrop img")).toBeVisible();
  const palettes = {
    light: "#183c31", dark: "#172a24", "private-cellar": "#30231b",
    sepia: "#403326", "white-wine": "#333822", "red-wine": "#421b2a",
    "rose-wine": "#482b35", champagne: "#403326", bordeaux: "#421b2a",
    burgundy: "#482b35", tuscany: "#462622", piedmont: "#333822",
    ticino: "#243a33", atelier: "#421b2a", "midnight-ledger": "#172a24",
    "maison-champagne": "#403326", "pietra-vigna": "#243a33", "cave-privee": "#202623",
  };
  const luminance = (rgb: number[]) => rgb.map(value => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const image = await page.locator(".cellar-home-backdrop img").getAttribute("src");
  for (const section of ["home", "cellar"]) {
    if (section === "cellar") await page.getByRole("button", { name: /^Cantina/ }).first().click();
    for (const [theme, hex] of Object.entries(palettes)) {
      // Exercise the theme CSS contract on both real header compositions without reloading.
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const rgb = hex.match(/[a-f0-9]{2}/g)!.map(value => parseInt(value, 16));
      await expect(page.locator(".topbar")).toHaveCSS("background-color", `rgb(${rgb.join(", ")})`);
      const text = await page.locator(".topbar .eyebrow").evaluate(el => getComputedStyle(el).color);
      expect((luminance(text.match(/\d+/g)!.map(Number)) + .05) / (luminance(rgb) + .05)).toBeGreaterThan(4.5);
      await expect(page.getByRole("button", { name: "Notifiche", exact: true }).locator("svg")).toHaveCSS("stroke", "rgb(250, 247, 239)");
      if (section === "home") await expect(page.locator(".cellar-home-backdrop img")).toHaveAttribute("src", image!);
    }
  }
});

for (const theme of ["atelier", "private-cellar", "midnight-ledger", "maison-champagne", "pietra-vigna", "cave-privee"]) {
  for (const width of theme === "atelier" ? [360, 390, 430, 1440] : [390, 1440]) {
    test(`Home backdrop themes ${theme} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "collector", theme_preference: theme });
      await page.goto("/");
      const photo = page.locator(".cellar-home-backdrop img");
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(1000);
      const bell = page.getByRole("button", { name: "Notifiche", exact: true });
      await expect(bell.locator("svg")).toHaveCSS("stroke", "rgb(250, 247, 239)");
      const bellBounds = (await bell.locator("svg").boundingBox())!;
      // Mobile retains its existing compact icon; the desktop bell is now 21 px.
      expect(bellBounds.width).toBeGreaterThanOrEqual(width === 1440 ? 21 : 17);
      expect(bellBounds.height).toBeGreaterThanOrEqual(width === 1440 ? 21 : 17);
      const header = (await page.locator(".topbar").boundingBox())!;
      if (width === 1440) {
        expect(header.height).toBeLessThan(260);
        await expect(page.locator(".view-tabs-navigation")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("theme.png") });
      await bell.click();
      const panel = page.getByRole("dialog", { name: "Notifiche", exact: true });
      await expect(panel).toBeVisible();
      // Visibility alone does not detect the topbar painting over this body portal.
      expect(await panel.evaluate(element => {
        const box = element.getBoundingClientRect();
        return [24, box.width / 2, box.width - 24].every(dx =>
          element.contains(document.elementFromPoint(box.x + dx, box.y + 24)));
      })).toBe(true);
      expect(await page.locator(".topbar-brand").evaluate(element => {
        const box = element.getBoundingClientRect();
        return document.elementFromPoint(box.x + 4, box.y + 4)?.classList.contains("notification-backdrop");
      })).toBe(true);
      const panelBounds = (await panel.boundingBox())!;
      expect(panelBounds.x).toBeGreaterThanOrEqual(0);
      expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath("notifications-open.png") });
      await page.locator(".notification-backdrop").click({ position: { x: 2, y: 2 } });
      await expect(panel).toBeHidden();
    });
  }
}

for (const [random, scene] of [[0.08, "vineyard"], [0.25, "barrels"], [0.42, "tasting"], [0.58, "lakeside"], [0.75, "harvest"], [0.92, "bottle-cellar"]] as const) {
  test(`Home backdrop session ${scene}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript(value => { Math.random = () => value; }, random);
    await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "collector" }, [], undefined, undefined, null);
    await page.goto("/");
    const backdrop = page.locator(".cellar-home-backdrop");
    await expect(backdrop).toHaveAttribute("data-scene", scene);
    await expect.poll(() => backdrop.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(1000);
    await page.screenshot({ path: testInfo.outputPath("scene.png") });
    if (["lakeside", "harvest", "bottle-cellar"].includes(scene)) {
      for (const width of [360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(backdrop).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        if (width === 390) await page.screenshot({ path: testInfo.outputPath("scene-mobile.png") });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.evaluate(() => { Math.random = () => 0.99; });
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    await expect(backdrop).toHaveCount(0);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(backdrop).toHaveAttribute("data-scene", scene);
    await page.reload();
    await expect(backdrop).not.toHaveAttribute("data-scene", scene);
    const reloadedScene = await backdrop.getAttribute("data-scene");
    expect(await page.evaluate(() => sessionStorage.getItem("vinaris.home-backdrop.v1"))).toBe(reloadedScene);
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(backdrop).toHaveAttribute("data-scene", reloadedScene!);
    const cdp = await page.context().newCDPSession(page);
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      cdp.send("Page.reload", { ignoreCache: true }),
    ]);
    await expect(backdrop).toBeVisible();
    await expect(backdrop).not.toHaveAttribute("data-scene", reloadedScene!);
    await expect.poll(() => backdrop.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(1000);
    await cdp.detach();
    await page.locator(".topbar-logout-button").click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("vinaris.home-backdrop.v1"))).toBeNull();
  });
}

test("Home backdrop unavailable photograph falls back", async ({ page }) => {
  await mockApi(page);
  await page.route("**/images/home-vineyard-v1.jpg", route => route.fulfill({ status: 404 }));
  await page.goto("/");
  await expect(page.locator(".cellar-home-backdrop img")).toHaveAttribute("src", "/images/premium-cellar-empty.jpg");
  await expect.poll(() => page.locator(".cellar-home-backdrop img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test("Home backdrop works without session storage and missing images", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], session, [], undefined, undefined, null);
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) {
      if (key === "vinaris.home-backdrop.v1") throw new Error("Storage unavailable");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function(key, value) {
      if (key === "vinaris.home-backdrop.v1") throw new Error("Storage unavailable");
      return set.call(this, key, value);
    };
  });
  await page.route("**/images/home-*-v1.jpg", route => route.fulfill({ status: 404 }));
  await page.route("**/images/premium-cellar-empty.jpg", route => route.fulfill({ status: 404 }));
  await page.goto("/");
  await expect(page.locator(".cellar-home-backdrop")).toBeAttached();
  await expect(page.locator(".cellar-home-backdrop img")).toHaveCount(0);
  await expect(page.locator(".cellar-home-hero")).toBeVisible();
});

test("secondary tools load only when opened", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requestedModules: string[] = [];
  page.on("request", request => {
    if (/\/(CellarAssistantView|RecordTastingDialog|WishlistLiveTasteScanner)(?:-|\.tsx)/.test(request.url())) requestedModules.push(request.url());
  });
  await mockApi(page, [], false, memberships, [wine], { ...session, cellar_ai_assistant_available: true });
  await page.goto("/");
  await expect(page.locator(".home-dashboard")).toBeVisible();
  expect(requestedModules).toEqual([]);
  await openRecordTasting(page);
  await expect(page.getByRole("dialog", { name: "Registra bevuta" })).toBeVisible();
  expect(requestedModules.some(url => url.includes("RecordTastingDialog"))).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.locator(".mobile-navigation-sheet summary").filter({ hasText: "Strumenti AI" }).click();
  await page.getByRole("button", { name: "Assistente AI", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Assistente Cantina AI" })).toBeVisible();
  expect(requestedModules.some(url => url.includes("CellarAssistantView"))).toBe(true);
  expect(requestedModules.some(url => url.includes("WishlistLiveTasteScanner"))).toBe(false);
});

test("opens the buying sommelier from desktop and mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.goto("/");

  const primaryNavigation = [
    page.getByRole("button", { name: "Home", exact: true }),
    page.getByRole("button", { name: /^Cantina/ }).first(),
    page.getByRole("button", { name: /^Wishlist/ }).first(),
    page.getByRole("button", { name: "Storico", exact: true }),
    page.locator(".view-tabs-ai-group > summary"),
  ];
  const primaryNavigationBoxes = await Promise.all(primaryNavigation.map((item) => item.boundingBox()));
  primaryNavigationBoxes.forEach((box, index) => {
    expect(box).not.toBeNull();
    if (index > 0) {
      expect(box!.x).toBeGreaterThanOrEqual(primaryNavigationBoxes[index - 1]!.x + primaryNavigationBoxes[index - 1]!.width);
      expect(Math.abs(box!.y - primaryNavigationBoxes[index - 1]!.y)).toBeLessThan(1);
    }
  });

  await page.locator(".view-tabs-ai-group > summary").click();
  await page.getByRole("button", { name: "Sommelier acquisti", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sommelier acquisti", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.locator(".mobile-navigation-ai-group > summary").click();
  await page.getByRole("button", { name: "Sommelier acquisti", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sommelier acquisti", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

// Retain the original suite title and viewport for stable test identity.
test.describe("Wine Detail compact/mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps iPad navigation coherent and within the viewport", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 834, height: 1210 });
    await mockApi(page, [], false, multiCellarMemberships);
    await page.goto("/");

    const cellarSwitch = page.getByLabel("Cambia cantina");
    const notifications = page.getByRole("button", { name: "Notifiche", exact: true });
    const accountMenu = page.getByRole("button", { name: "Apri menu account", exact: true });
    await expect(cellarSwitch).toBeVisible();
    await expect(notifications).toBeVisible();
    await expect(accountMenu).toBeVisible();
    await expect(page.locator(".view-tabs")).toBeHidden();
    await expect(page.locator(".desktop-topbar-search")).toBeHidden();
    const bottomNavigation = page.getByRole("navigation", { name: "Navigazione principale" });
    const addWine = bottomNavigation.getByRole("button", { name: "Aggiungi un vino", exact: true });
    await expect(bottomNavigation).toBeVisible();
    await expect(addWine).toBeVisible();
    const insights = page.locator(".dashboard-analysis-switcher");
    await insights.locator("summary").click();
    await expect(insights).toHaveAttribute("open", "");
    const insightOptions = insights.getByRole("tab");
    await expect(insightOptions.first()).toBeVisible();
    const [summaryBox, optionBox] = await Promise.all([
      insights.locator("summary").boundingBox(),
      insightOptions.first().boundingBox(),
    ]);
    expect(optionBox!.y).toBeGreaterThanOrEqual(summaryBox!.y + summaryBox!.height);
    await insights.getByRole("tab", { name: "Qualità dati", exact: true }).click();
    const dataGrid = page.locator(".data-dashboard-carousel .dashboard-grid");
    const firstDataCard = dataGrid.locator("> .dashboard-card").first();
    await expect(firstDataCard).toBeVisible();
    const dataCardBox = (await firstDataCard.boundingBox())!;
    expect(dataCardBox.width).toBeGreaterThan(620);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const [cellarBox, notificationsBox, accountBox] = await Promise.all([
      cellarSwitch.boundingBox(),
      notifications.boundingBox(),
      accountMenu.boundingBox(),
    ]);
    expect(cellarBox).not.toBeNull();
    expect(notificationsBox).not.toBeNull();
    expect(accountBox).not.toBeNull();
    // Home controls now use 44px touch targets (the select sits inside its border).
    expect(cellarBox!.width).toBeLessThanOrEqual(44);
    expect(cellarBox!.x + cellarBox!.width).toBeLessThanOrEqual(notificationsBox!.x);
    expect(notificationsBox!.x + notificationsBox!.width).toBeLessThanOrEqual(accountBox!.x);
    expect(Math.abs(cellarBox!.y - notificationsBox!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(notificationsBox!.y - accountBox!.y)).toBeLessThanOrEqual(2);
    expect(accountBox!.x + accountBox!.width).toBeLessThanOrEqual(834);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await bottomNavigation.getByRole("button", { name: "Cantina", exact: true }).click();
    const tabletWineRow = page.locator('[data-wine-row-id="wine-e2e-1"] article');
    await expect(tabletWineRow).toBeVisible();
    await tabletWineRow.click();
    const tabletWineDetail = page.getByRole("dialog", { name: "Nebbiolo di Test" });
    await expect(tabletWineDetail).toBeVisible();
    await expect(tabletWineDetail.getByRole("button", { name: "Chiudi", exact: true })).toBeVisible();
    await tabletWineDetail.getByRole("button", { name: "Chiudi", exact: true }).click();
    await expect(tabletWineDetail).toBeHidden();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Storico", exact: true }).click();
    const historyList = page.locator(".content-workspace .wine-list");
    await expect(historyList).toBeVisible();
    await expect(page.locator(".content-workspace .wine-side-panel")).toBeHidden();
    expect((await historyList.boundingBox())!.width).toBeGreaterThan(700);
    await page.screenshot({ path: testInfo.outputPath("tablet-topbar.png") });
  });
});
