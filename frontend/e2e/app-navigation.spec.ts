import { expect, test } from "@playwright/test";
import { wine, session, memberships, multiCellarMemberships, mockApi, openRecordTasting, openSommelierFeature } from "./fixtures/app";


for (const locale of ["it", "en"] as const) {
  test(`the Sommelier AI page leads to every AI feature (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], false, memberships, [wine], { ...session, locale, cellar_ai_assistant_available: true });
    await page.goto("/");
    const navigation = page.locator(".view-tabs-navigation");
    const destinations = [
      [it ? /^Chiedi alla tua cantina/ : /^Ask your cellar/, it ? "Assistente Cantina AI" : "AI Cellar Assistant"],
      [it ? /^Abbinamento a casa/ : /^Pairing at home/, it ? "Trova abbinamento" : "Find pairing"],
      [it ? /^Al ristorante/ : /^At the restaurant/, it ? "Come vuoi scegliere il vino?" : "How would you like to choose a wine?"],
      [it ? /^In enoteca: Scaffale AI/ : /^At the wine shop: Shelf scanner/, ""],
      [it ? /^Cosa comprare/ : /^What to buy/, it ? "Sommelier acquisti" : "AI buying sommelier"],
      [it ? /^Strategia della cantina/ : /^Cellar strategy/, it ? "Piano cantina" : "Cellar plan"],
    ] as const;
    for (const [card, heading] of destinations) {
      await navigation.getByRole("button", { name: "Sommelier AI", exact: true }).click();
      const hub = page.locator(".sommelier-hub");
      await expect(hub.getByRole("heading", { name: "Sommelier AI", exact: true })).toBeVisible();
      if (card === destinations[0][0]) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`sommelier-hub-${locale}.png`) });
      }
      await hub.getByRole("button", { name: card }).click();
      // The shelf scanner opens on its own tab of the buying page.
      if (heading) await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      else await expect(page.locator(".buying-place-switch button").nth(1)).toHaveAttribute("aria-pressed", "true");
      // The tab stays lit on every AI feature, so the way back is obvious.
      await expect(navigation.getByRole("button", { name: "Sommelier AI", exact: true })).not.toHaveClass(/secondary/);
    }
  });
}

for (const width of [1200, 1440]) {
  test(`desktop bar keeps every section and the add button on one row ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto("/");
    const navigation = page.locator(".view-tabs-navigation");
    const home = (await navigation.getByRole("button", { name: "Home", exact: true }).boundingBox())!;
    const sommelier = (await navigation.getByRole("button", { name: "Sommelier AI", exact: true }).boundingBox())!;
    const add = (await navigation.getByRole("button", { name: "Aggiungi", exact: true }).boundingBox())!;
    expect(Math.abs(home.y + home.height / 2 - (sommelier.y + sommelier.height / 2))).toBeLessThan(2);
    expect(Math.abs(home.y + home.height / 2 - (add.y + add.height / 2))).toBeLessThan(2);
    expect(add.x + add.width).toBeLessThanOrEqual(width);
    // The old tasting tab lives in the "+" sheet now, Momenti in the Diario, the guide in "? Guida".
    for (const gone of ["Registra bevuta", "Momenti"]) await expect(navigation.getByRole("button", { name: gone, exact: true })).toHaveCount(0);
    const guide = navigation.getByRole("button", { name: "Guida", exact: true });
    await expect(guide).toHaveCount(1);
    expect(Math.abs(home.y + home.height / 2 - ((await guide.boundingBox())!.y + (await guide.boundingBox())!.height / 2))).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`desktop-bar-${width}.png`) });
  });
}

for (const width of [1100, 1440, 1920]) {
  test(`desktop navigation stays horizontal across sections ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto("/");
    for (const [label, view] of [[/^Cantina/, "cellar"], [/^Wishlist/, "wishlist"], [/^Diario$/, "history"]] as const) {
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
    await nav.getByRole("button", { name: "Sommelier AI", exact: true }).click();
    await page.locator(".sommelier-hub").getByRole("button", { name: /^Strategia della cantina/ }).click();
    await expect(page.getByRole("heading", { name: "Piano cantina", exact: true })).toBeVisible();
    await nav.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.locator(".cellar-home-hero")).toBeVisible();
  });
}

for (const [width, theme] of [[360, "atelier"], [390, "atelier"], [430, "atelier"], [1024, "atelier"], [1440, "atelier"], [1440, "private-cellar"], [1440, "maison-champagne"], [1440, "cave-privee"]] as const) {
  test(`compact section header ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 901 ? 844 : 1000 });
    await mockApi(page, [], false, [...memberships, { ...memberships[0], membership_id: "second", household_id: "second", household_name: "Seconda cantina" }], [wine], { ...session, theme_preference: theme });
    await page.goto("/");
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    const header = page.locator(".cellar-compact-header");
    await expect(header).toBeVisible();
    await expect(header.locator(".topbar-brand-mark")).toBeHidden();
    await expect(header.locator(".eyebrow")).toHaveCSS("font-family", /^"Newsreader Variable", /);
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
    atelier: "#421b2a", "maison-champagne": "#403326", "cave-privee": "#202623",
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

for (const theme of ["atelier", "private-cellar", "maison-champagne", "cave-privee"]) {
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
        const navigation = page.locator(".view-tabs-navigation");
        await expect(navigation).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        const home = navigation.getByRole("button", { name: "Home", exact: true });
        await expect(home).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(home).toHaveCSS("font-weight", "650");
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

for (const [random, scene] of [
  [0.05, "vineyard"], [0.15, "barrels"], [0.25, "tasting"],
  [0.35, "lakeside"], [0.45, "harvest"], [0.55, "bottle-cellar"],
  [0.65, "sparkling-cellar"], [0.75, "autumn-vineyard"],
  [0.85, "evening-tasting"], [0.95, "wine-press"],
] as const) {
  test(`Home backdrop session ${scene}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript(value => { Math.random = () => value; }, random);
    await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "collector" }, [], undefined, undefined, null);
    await page.goto("/");
    const backdrop = page.locator(".cellar-home-backdrop");
    await expect(backdrop).toHaveAttribute("data-scene", scene);
    await expect.poll(() => backdrop.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(1000);
    await page.screenshot({ path: testInfo.outputPath("scene.png") });
    if (["lakeside", "harvest", "bottle-cellar", "sparkling-cellar", "autumn-vineyard", "evening-tasting", "wine-press"].includes(scene)) {
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
  await openSommelierFeature(page, /^Chiedi alla tua cantina/);
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
    page.getByRole("button", { name: "Diario", exact: true }),
    page.locator(".view-tabs-navigation").getByRole("button", { name: "Sommelier AI", exact: true }),
  ];
  const primaryNavigationBoxes = await Promise.all(primaryNavigation.map((item) => item.boundingBox()));
  primaryNavigationBoxes.forEach((box, index) => {
    expect(box).not.toBeNull();
    if (index > 0) {
      expect(box!.x).toBeGreaterThanOrEqual(primaryNavigationBoxes[index - 1]!.x + primaryNavigationBoxes[index - 1]!.width);
      expect(Math.abs(box!.y - primaryNavigationBoxes[index - 1]!.y)).toBeLessThan(1);
    }
  });

  await openSommelierFeature(page, /^Cosa comprare/);
  await expect(page.getByRole("heading", { name: "Sommelier acquisti", exact: true })).toBeVisible();

  // On the phone the same page sits in the bottom bar: two taps, no menu.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Sommelier AI", exact: true }).click();
  await page.locator(".sommelier-hub").getByRole("button", { name: /^Cosa comprare/ }).click();
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
    const addWine = bottomNavigation.getByRole("button", { name: "Aggiungi", exact: true });
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
    const firstDataCard = page.locator(".data-quality-board .dq-summary");
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
    await page.getByRole("button", { name: "Diario", exact: true }).click();
    const historyList = page.locator(".content-workspace .wine-list");
    await expect(historyList).toBeVisible();
    await expect(page.locator(".content-workspace .wine-side-panel")).toBeHidden();
    expect((await historyList.boundingBox())!.width).toBeGreaterThan(700);
    await page.screenshot({ path: testInfo.outputPath("tablet-topbar.png") });
  });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`the Diario keeps Momenti as a tab, full width, at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockApi(page, [], true, memberships, [wine], { ...session, has_active_entitlement: true, is_free_tier: false });
    await page.goto("/");
    if (viewport.width < 1000) {
      await page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Menu", exact: true }).click();
      await page.getByRole("dialog", { name: "Menu di navigazione" }).getByRole("button", { name: "Diario", exact: true }).click();
    } else {
      await page.locator(".view-tabs-navigation").getByRole("button", { name: "Diario", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Momenti", exact: true }).click();
    const moments = page.locator(".diary-moments");
    await expect(moments.getByRole("button", { name: "Registra una bevuta", exact: true })).toBeVisible();
    await expect(moments.getByRole("button", { name: "Sfoglia i ricordi", exact: true })).toBeVisible();
    // No wine list or empty wine panel beside it: the tab uses the whole width.
    await expect(page.locator(".wine-side-panel")).toHaveCount(0);
    const box = (await moments.boundingBox())!;
    expect(box.width).toBeGreaterThan(viewport.width * 0.8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`diary-moments-${viewport.width}.png`) });
    await moments.getByRole("button", { name: "Sfoglia i ricordi", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Momenti", exact: true })).toBeVisible();
  });
}

test("the Diario's Vendite and Momenti tabs never list wishlist wines", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], true, memberships, [wine], { ...session, has_active_entitlement: true, is_free_tier: false });
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const item = { id: "wish-1", household_id: "household-e2e", wishlist_list_id: "list-1", name: "Barolo da scoprire", producer: "Produttore Test", vintage: "2020", format: "0.75 L", type: "Red", region: "Piemonte", appellation: "Barolo", target_price: "50", offer_price: "45", investment_amount: null, ai_market_price: "", ai_market_price_currency: "CHF", currency: "CHF", merchant: "Enoteca", priority: "High", purpose: "Drink", status: "Wishlist", notes: "", ai_context_note: "", ai_strategy: "", ai_purpose_advice: "" };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url, location.origin);
      if (url.pathname === "/api/v1/wishlist/lists") return new Response(JSON.stringify([{ id: "list-1", household_id: "household-e2e", name: "Da scoprire", item_count: 1, description: "", portfolio_strategy: null }]));
      if (url.pathname === "/api/v1/wishlist") return new Response(JSON.stringify([item]));
      return original(input, init);
    };
  });
  await page.goto("/");
  const navigation = page.locator(".view-tabs-navigation");
  await navigation.getByRole("button", { name: /^Wishlist/ }).click();
  await expect(page.locator(".wishlist-row")).toHaveCount(1);
  await navigation.getByRole("button", { name: "Diario", exact: true }).click();
  for (const tab of ["Vendite", "Momenti"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".wishlist-row")).toHaveCount(0);
  }
});

test("the cellar sommelier stays quiet: no halo, and a month of silence once closed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.goto("/");
  await page.locator(".view-tabs-navigation").getByRole("button", { name: /^Cantina/ }).click();
  // The row chip still opens it whenever the user wants.
  await page.getByRole("button", { name: "Consiglio disponibile" }).first().click();
  const sommelier = page.getByRole("complementary", { name: "Sommelier della cantina" });
  await expect(sommelier).toBeVisible();
  const shadow = await sommelier.locator("section").first().evaluate((element) => getComputedStyle(element).boxShadow);
  expect(shadow).not.toContain("0px 0px 0px 6px");
  await sommelier.getByRole("button", { name: "Chiudi" }).click();
  await expect(sommelier).toHaveCount(0);
  const nextPrompt = await page.evaluate(() => Number(localStorage.getItem("vinaris:cellar-sommelier-next-prompt")));
  expect(nextPrompt - Date.now()).toBeGreaterThan(29 * 86_400_000);
});
