import { expect, test, type Page, type Route } from "@playwright/test";
import { featuredValue } from "../src/domain/featuredValue";
import { personalDashboardCatalogue } from "../src/components/personalDashboardCatalogue";

for (const width of [360, 390, 430, 1440]) {
  test(`admin announcements preview and safe retry ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await mockApi(page, [], false, memberships, [wine], { ...session, is_app_admin: true });
    await page.goto("/");
    await page.evaluate(() => {
      const original = window.fetch;
      const writes: unknown[] = [];
      Object.assign(window, { announcementWrites: writes });
      window.fetch = async (input, init) => {
        const url = String(input);
        if (!url.includes("/admin/announcements")) return original(input, init);
        if (url.endsWith("/audience")) return new Response(JSON.stringify({ recipient_count: 23 }));
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body));
          writes.push(payload);
          if (writes.length === 1) return new Response(JSON.stringify({ detail: "Temporary error" }), { status: 503 });
          return new Response(JSON.stringify({ ...payload, recipient_count: 23, created_by_user_id: "admin", created_at: "2026-09-26T12:00:00Z" }));
        }
        return new Response("[]");
      };
    });
    if (width < 1100) {
      await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
      await page.getByRole("menuitem", { name: "Impostazioni", exact: true }).click();
    } else await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
    await page.locator(".settings-tabs").getByRole("tab", { name: "Comunicazioni", exact: true }).click();
    const form = page.getByRole("region", { name: "Comunicazioni agli utenti", exact: true });
    await expect(form).toContainText("23 destinatari attuali");
    await form.getByRole("button", { name: "Prepara annuncio nuova grafica", exact: true }).click();
    await expect(form.getByLabel("Titolo", { exact: true })).toHaveValue("Vinaris si rinnova");
    await expect(form.getByLabel("Messaggio", { exact: true })).toHaveValue(/I tuoi vini e i tuoi dati restano invariati/);
    expect(await page.evaluate(() => (window as any).announcementWrites.length)).toBe(0);
    await form.getByLabel("Titolo", { exact: true }).fill("Vinaris si rinnova");
    await form.getByLabel("Messaggio", { exact: true }).fill("La tua cantina ha una nuova veste.\nScopri la Home e le nuove dashboard. <img src=x onerror=alert(1)>");
    await form.getByRole("combobox").selectOption("/home");
    await form.getByRole("button", { name: "Anteprima invio", exact: true }).click();
    const preview = form.getByRole("region", { name: "Anteprima comunicazione" });
    await expect(preview).toContainText("attualmente 23");
    await expect(preview.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).announcementWrites.length)).toBe(0);
    await preview.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("announcement-preview.png") });
    await expect(page.locator(".back-to-top-button")).toBeHidden();
    if (width === 390) await expect(preview).toHaveScreenshot("admin-announcement-preview-compact.png");
    await preview.getByRole("button", { name: "Conferma e invia a tutti", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Invio non confermato");
    await expect(preview.getByRole("button", { name: "Modifica", exact: true })).toBeDisabled();
    await preview.getByRole("button", { name: "Riprova invio", exact: true }).click();
    await expect(form.getByRole("status")).toContainText("inviata a 23 utenti");
    await expect(form.getByRole("region", { name: "Storico comunicazioni" })).toContainText("Vinaris si rinnova");
    const writes = await page.evaluate(() => (window as any).announcementWrites);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[0].confirm).toBe(true);
    await expect(form.getByLabel("Titolo", { exact: true })).toHaveValue("");
  });
}

test("admin announcements are not offered to cellar owners", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  await expect(page.locator(".settings-tabs")).toBeVisible();
  await expect(page.locator(".settings-tabs").getByRole("tab", { name: "Comunicazioni" })).toHaveCount(0);
});

test("admin announcements appear for recipients and open Home", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const center = {
    items: [{ id: "announcement-copy", source: "notification", kind: "admin_announcement", category: "system", state: "unread",
      title: "Vinaris si rinnova", message: "Scopri la nuova Home.\nI tuoi dati restano invariati.", action_url: "/home",
      action_kind: "open", resource_id: null, actor_label: null, metadata: {}, created_at: "2026-09-26T12:00:00Z", read_at: null, archived_at: null }],
    counts: { total: 1, unread: 1, actionable: 0, attention: 1, actions: 0, updates: 0, system: 1 }, offset: 0, next_offset: null, has_more: false,
  };
  await mockApi(page, [], false, memberships, [wine], session, [], center);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.getByRole("button", { name: "Notifiche", exact: true }).click();
  const section = page.getByRole("region", { name: "Notifiche", exact: true });
  await expect(section).toContainText("Vinaris si rinnova");
  await expect(section.getByText("Scopri la nuova Home.\nI tuoi dati restano invariati.", { exact: true })).toHaveCSS("white-space", "pre-wrap");
  await expect(section.getByRole("button", { name: "Archivia", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("recipient.png") });
  await section.getByRole("button", { name: "Apri", exact: true }).click();
  await expect(page.locator(".cellar-home-hero")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Notifiche", exact: true })).toBeHidden();
});

// Component snapshots should not include fixed page controls over the component.
async function snapshotChrome(page: Page, visible: boolean) {
  await page.locator(".topbar, .mobile-bottom-navigation, .back-to-top-button").evaluateAll((elements, show) => {
    for (const element of elements) {
      if (show) (element as HTMLElement).style.removeProperty("opacity");
      else (element as HTMLElement).style.setProperty("opacity", "0", "important");
    }
  }, visible);
}

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
  test(`cellar detail column stays steady when selecting a wine ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    const list = page.locator(".wine-list");
    const panel = page.locator(".wine-side-panel");
    const emptyWidth = (await panel.boundingBox())!.width;
    if (width === 1440) await page.screenshot({ path: testInfo.outputPath("empty-cellar-1440.png") });
    await page.locator('[data-wine-row-id="wine-e2e-1"] .wine-title').click();
    await expect(panel.locator(".wine-detail:not(.empty-detail)")).toBeVisible();
    const listBox = (await list.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.width).toBeCloseTo(emptyWidth, 0);
    expect(panelBox.width).toBeLessThanOrEqual(550);
    expect(listBox.width).toBeGreaterThan(500);
    expect(listBox.x + listBox.width).toBeLessThanOrEqual(panelBox.x);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`selected-cellar-${width}.png`) });
  });

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

test("wine detail separates speculative legacy scores from ratings", async ({ page }, testInfo) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".authenticated-app-shell")).toBeVisible();
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (String(input).endsWith("/wines") || String(input).endsWith("/wines/wine-e2e-1")) {
        const body = await response.json();
        const enrich = (item: object) => ({ ...item, scores: [
          { critic: "Critico ipotetico", score: "92-94", note: "Possibile fascia; da verificare", verification_status: "unverified" },
          { critic: "Fonte documentata", score: "92", note: "Punteggio pubblicato", source_url: "https://example.com/review" },
        ] });
        return new Response(JSON.stringify(Array.isArray(body) ? body.map(enrich) : enrich(body)), { headers: { "Content-Type": "application/json" } });
      }
      return response;
    };
  });
  await page.reload();
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
  const detail = page.locator(".wine-detail:visible").first();
  await detail.locator('summary').filter({ hasText: "Profilo e riconoscimenti" }).click();
  await expect(detail.getByText("Fonte documentata 92", { exact: true })).toBeVisible();
  await expect(detail.getByRole("link", { name: "Consulta la fonte" })).toHaveAttribute("href", "https://example.com/review");
  await expect(detail.getByText("Critico ipotetico 92-94", { exact: true })).toBeHidden();
  await detail.locator("summary").filter({ hasText: "Dati precedenti non verificati" }).click();
  await expect(detail.getByText("Critico ipotetico 92-94", { exact: true })).toBeVisible();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const legacy = (await detail.locator(".unverified-score-section").boundingBox())!;
    const following = (await detail.locator(".unverified-score-section + .detail-section").boundingBox())!;
    expect(legacy.y + legacy.height).toBeLessThanOrEqual(following.y);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await detail.locator('[data-wine-detail-section="03"]').screenshot({ path: testInfo.outputPath("score-review-390.png") });
  await expect(detail.locator('[data-wine-detail-section="03"]')).toHaveScreenshot("critic-score-review-compact.png");
});

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

const wine = {
  id: "wine-e2e-1",
  details_loaded: true,
  shared_data_features: [],
  shared_data_updated_at: null,
  household_id: "household-e2e",
  name: "Nebbiolo di Test",
  producer: "Cantina Vinaris",
  vintage: "2019",
  quantity: 4,
  storage_allocations: [],
  strategy_purposes: [],
  currency: "CHF",
  price: "42.00",
  sale_price: "55.00",
  glass_price: null,
  pour_size_ml: 100,
  reorder_threshold: 2,
  reorder_enabled: true,
  commercial_status: "active",
  open_bottle_ml: 0,
  current_value: "48.00",
  value_not_found: false,
  status: "in_cellar",
  format: "750ml",
  type: "red",
  region: "Piemonte",
  appellation: "Langhe",
  merchant: "Enoteca Test",
  order_date: null,
  expected_delivery: null,
  owner_share_pct: "100",
  notes: "Nota di test",
  ai_notes: "Profilo di test",
  drink_from: 2024,
  drink_peak_from: 2026,
  drink_peak_to: 2028,
  drink_to: 2032,
  drink_window_notes: "Finestra stabile per la verifica E2E.",
  ai_value_notes: "Valore verificato.",
  ai_value_estimated_at: null,
  rating: 0,
  owners: [],
  tags: [],
  grapes: [{ name: "Nebbiolo", percentage_from: 100, percentage_to: 100 }],
  grapes_source_url: "",
  grapes_source_title: "",
  grapes_verified_at: null,
  grapes_not_applicable: false,
  scores: [],
  scores_not_applicable: false,
  vineyard_name: "Vigna Test",
  vineyard_locality: "Barolo",
  vineyard_country: "Italia",
  vineyard_latitude: 44.6102,
  vineyard_longitude: 7.9446,
  vineyard_precision: "estate",
  vineyard_source_url: "",
  vineyard_source_title: "",
  vineyard_notes: "Origine di test.",
  vineyard_verified_at: null,
  vineyard_not_found: false,
  photo_thumbnail_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='160' viewBox='0 0 80 160'%3E%3Crect x='26' y='8' width='28' height='18' rx='3' fill='%23754a24'/%3E%3Crect x='17' y='22' width='46' height='128' rx='12' fill='%2343372d'/%3E%3Crect x='21' y='64' width='38' height='48' fill='%23ede1bf'/%3E%3C/svg%3E",
  photo_detail_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='160' viewBox='0 0 80 160'%3E%3Crect x='26' y='8' width='28' height='18' rx='3' fill='%23754a24'/%3E%3Crect x='17' y='22' width='46' height='128' rx='12' fill='%2343372d'/%3E%3Crect x='21' y='64' width='38' height='48' fill='%23ede1bf'/%3E%3C/svg%3E",
  created_at: "2026-01-01T00:00:00Z",
  tasting_history: [],
  value_history: [],
};

const session = {
  authenticated: true,
  user_display_name: "E2E User",
  user_email: "e2e@example.test",
  active_household_id: "household-e2e",
  active_household_name: "Cantina E2E",
  active_household_mode: "private",
  restaurant_mode_available: false,
  membership_role: "owner",
  is_app_admin: false,
  is_demo: false,
  pending_approval: false,
  pending_email_verification: false,
  requires_legal_acceptance: false,
  legal_document_version: "2026-01",
  locale: "it",
  theme_preference: "light",
  dashboard_focus: "balanced",
  daily_wine_budget_chf: null,
  can_use_label_recognition: false,
  can_manage_wine_photos: true,
  cellar_ai_assistant_available: false,
  is_free_tier: false,
  free_tier_label_limit: 15,
  can_use_personal_openai_key: false,
  has_active_entitlement: true,
  entitlement_valid_until: null,
  entitlement_days_remaining: null,
};

const memberships = [{ membership_id: "membership-e2e", household_id: "household-e2e", household_name: "Cantina E2E", role: "owner", operating_mode: "private" }];
const merchants = [
  { id: "merchant-e2e-1", name: "Enoteca Test" },
  { id: "merchant-e2e-2", name: "Vini della Riserva" },
];

const tastingArchive = {
  total: 1,
  limit: 5,
  offset: 0,
  rated_count: 1,
  notes_count: 1,
  latest_consumed_at: "2026-08-20",
  profile: [],
  items: [{
    tasting_id: "tasting-e2e-1",
    wine_id: wine.id,
    wine_name: wine.name,
    wine_producer: wine.producer,
    wine_vintage: wine.vintage,
    wine_format: wine.format,
    wine_type: wine.type,
    wine_region: wine.region,
    wine_appellation: wine.appellation,
    wine_status: "consumed",
    consumed_at: "2026-08-20",
    note: "Degustazione di test.",
    rating: 5,
    enjoyment: "positive",
    occasion: "Cena",
    pairing: "Brasato",
    companions: "Amici",
    sommelier_feedback: "",
    sommelier_pairing_score: null,
    sommelier_pairing_advice: "",
    sommelier_feedback_cost_usd: null,
    sommelier_feedback_at: null,
    created_at: "2026-08-20T20:00:00Z",
  }],
};

const tasteProfileCollection = {
  profiles: [
    {
      category: "global",
      dimensions: {
        body: { preference: .70, confidence: .72, samples: 21 },
        acidity: { preference: .75, confidence: .74, samples: 21 },
        tannin: { preference: .63, confidence: .66, samples: 16 },
        sweetness: { preference: .54, confidence: .61, samples: 21 },
        aromatic_intensity: { preference: .74, confidence: .73, samples: 21 },
        fruit: { preference: .72, confidence: .71, samples: 21 },
        wood: { preference: .61, confidence: .64, samples: 18 },
        spice: { preference: .65, confidence: .67, samples: 18 },
        minerality: { preference: .68, confidence: .69, samples: 15 },
      },
      attributes: {
        preferred_countries: [["Italia", .88], ["Francia", .76], ["Svizzera", .61]],
        preferred_regions: [["Toscana", .82], ["Champagne", .78], ["Piemonte", .72], ["Ticino", .62]],
        preferred_appellations: [["Brunello di Montalcino DOCG", .74], ["Champagne Grand Cru", .70], ["Ticino DOC", .62]],
      },
      confidence: .72,
      sample_count: 21,
      tasting_count: 21,
      star_rating_count: 35,
      confidence_level: "probable",
    },
    {
      category: "red",
      dimensions: {
        body: { preference: .77, confidence: .70, samples: 15 },
        acidity: { preference: .71, confidence: .68, samples: 15 },
        tannin: { preference: .73, confidence: .69, samples: 15 },
        aromatic_intensity: { preference: .75, confidence: .70, samples: 15 },
        fruit: { preference: .76, confidence: .69, samples: 15 },
      },
      attributes: {}, confidence: .70, sample_count: 15, confidence_level: "probable",
    },
    {
      category: "white",
      dimensions: {
        body: { preference: .60, confidence: .55, samples: 5 },
        acidity: { preference: .82, confidence: .58, samples: 5 },
        sweetness: { preference: .48, confidence: .51, samples: 5 },
        aromatic_intensity: { preference: .70, confidence: .57, samples: 5 },
        minerality: { preference: .76, confidence: .56, samples: 5 },
      },
      attributes: {}, confidence: .56, sample_count: 5, confidence_level: "emerging",
    },
    {
      category: "rose",
      dimensions: {
        body: { preference: .52, confidence: .38, samples: 3 },
        acidity: { preference: .78, confidence: .40, samples: 3 },
        sweetness: { preference: .50, confidence: .35, samples: 3 },
        aromatic_intensity: { preference: .69, confidence: .39, samples: 3 },
        fruit: { preference: .74, confidence: .40, samples: 3 },
      },
      attributes: {}, confidence: .39, sample_count: 3, confidence_level: "emerging",
    },
  ],
};

const multiCellarMemberships = [
  ...memberships,
  { membership_id: "membership-e2e-2", household_id: "household-e2e-2", household_name: "Riserva E2E", role: "owner", operating_mode: "private" },
];

const intelligenceSnapshot = {
  generated_at: "2026-08-21T12:00:00Z",
  fingerprint: "snapshot-current",
  preferences: { annual_drink_target: 24, protected_capital_pct: 50, special_occasion_target: 6, next_special_occasion_date: null, planning_horizon_years: 5, refresh_interval_days: 30 },
  wine_count: 1,
  bottle_count: 4,
  allocated_bottle_count: 0,
  allocation_coverage_pct: 0,
  purpose_totals: { drink: 0, maturation: 0, investment: 0, special_occasion: 0, undecided: 0 },
  drink_now_count: 0,
  maturation_count: 0,
  investment_count: 0,
  undecided_count: 4,
  wines: [{
    wine_id: wine.id,
    name: wine.name,
    photo_thumbnail_url: wine.photo_thumbnail_url,
    producer: wine.producer,
    vintage: wine.vintage,
    region: wine.region,
    type: wine.type,
    quantity: wine.quantity,
    allocated_quantity: 0,
    unallocated_quantity: wine.quantity,
    currency: wine.currency,
    purchase_value: "168.00",
    current_value: "192.00",
    drink_from: wine.drink_from,
    drink_peak_from: wine.drink_peak_from,
    drink_peak_to: wine.drink_peak_to,
    drink_to: wine.drink_to,
    readiness: "ready",
    purposes: {},
    signals: [],
  }],
};

const intelligencePlan = {
  model: "test-model",
  reasoning_effort: "low",
  overview: "Piano di test per la cantina.",
  immediate_action: "Rivedi Nebbiolo di Test.",
  risk_note: "Controlla i dati mancanti.",
  recommendations: [{ wine_id: wine.id, action: "decide", priority: "high", quantity: 4, reason: "La finestra è aperta.", recommended_purpose: "drink", confidence: "medium", data_quality_score: 68, missing_inputs: ["current_value", "purchase_price"] }],
  applied_recommendation_keys: [],
  input_fingerprint: "snapshot-old",
  stale: true,
  stale_reasons: ["cellar_data_changed"],
  generated_at: "2026-08-20T12:00:00Z",
  estimated_cost_usd: "0.001",
};

const previousIntelligencePlan = {
  ...intelligencePlan,
  recommendations: [{ ...intelligencePlan.recommendations[0], action: "monitor", recommended_purpose: null, quantity: 2 }],
  stale: false,
  stale_reasons: [],
  generated_at: "2026-08-10T12:00:00Z",
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockApi(
  page: Page,
  strategyAllocations: unknown[] = [],
  aiEnabled = false,
  cellarMemberships = memberships,
  fixtureWines = [wine],
  fixtureSession = session,
  fixturePendingCatalog: unknown[] = [],
  fixtureNotificationCenter: unknown = { items: [], counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 }, offset: 0, next_offset: null, has_more: false },
  fixtureTastingArchive = tastingArchive,
  heroScene: string | null = "vineyard",
) {
  await page.addInitScript(scene => {
    if (scene && !sessionStorage.getItem("vinaris.home-backdrop.v1")) sessionStorage.setItem("vinaris.home-backdrop.v1", scene);
  }, heroScene);
  await page.addInitScript(() => {
    window.localStorage.setItem("vinaris.cookie-consent", JSON.stringify({ marketing: false, updatedAt: "2026-01-01T00:00:00Z" }));
  });
  await page.addInitScript(({ fixtureWine, fixtureWines, fixtureSession, fixturePendingCatalog, fixtureNotificationCenter, fixtureStrategyAllocations, fixtureIntelligenceSnapshot, fixtureIntelligencePlan, fixturePreviousIntelligencePlan, fixtureAiEnabled, fixtureCellarMemberships, fixtureMerchants, fixtureTastingArchive, tasteProfileCollection }) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(requestUrl, window.location.origin);
      if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
      const path = url.pathname;
      let body: unknown = [];
      if (path.endsWith("/session")) body = { ...fixtureSession, ...JSON.parse(window.sessionStorage.getItem("vinaris-test-preferences") || "{}") };
      else if (path.endsWith("/auth/preferences")) {
        if (window.sessionStorage.getItem("vinaris-test-save-error")) return new Response(JSON.stringify({ detail: "Save unavailable" }), { status: 503 });
        const preferences = { ...JSON.parse(window.sessionStorage.getItem("vinaris-test-preferences") || "{}"), ...JSON.parse(String(init?.body || "{}")) };
        window.sessionStorage.setItem("vinaris-test-preferences", JSON.stringify(preferences));
        body = { ...fixtureSession, ...preferences };
      }
      else if (path.endsWith("/intelligence/cellar")) body = fixtureIntelligenceSnapshot;
      else if (path.endsWith("/ai/cellar-intelligence/latest")) body = fixtureIntelligencePlan;
      else if (path.endsWith("/ai/cellar-intelligence/history")) body = [fixtureIntelligencePlan, fixturePreviousIntelligencePlan];
      else if (path.endsWith("/intelligence/allocations/bulk/reassign")) body = { changed_wines: 1, assigned_bottles: 4, purpose: "drink" };
      else if (path.includes("/intelligence/wines/")) body = fixtureStrategyAllocations;
      else if (path.includes("/storage/allocations")) body = [];
      else if (path.endsWith("/merchants")) body = fixtureMerchants;
      else if (path.includes("/share-offer") || path.includes("/co-ownership-agreements") || path.includes("/recipients")) body = [];
      else if (path.endsWith("/taste-profile/wines/matches")) {
        const wineIds = JSON.parse(String(init?.body || "{}"))?.wine_ids || [];
        const batches = JSON.parse(window.sessionStorage.getItem("vinaris-test-taste-batches") || "[]");
        window.sessionStorage.setItem("vinaris-test-taste-batches", JSON.stringify([...batches, wineIds]));
        body = { matches: Object.fromEntries(wineIds.map((wineId: string) => [wineId, { score: 0.86, confidence: 0.3, matching_traits: ["body", "tannin"], conflicting_traits: [] }])) };
      }
      else if (path.endsWith("/sensory")) body = JSON.parse(window.sessionStorage.getItem("vinaris-test-sensory") || "null");
      else if (path.includes("/taste-profile/wines/")) body = { score: 0.86, confidence: 0.3, matching_traits: ["body", "tannin"], conflicting_traits: [] };
      else if (path.includes("/wines/tasting-archive")) body = fixtureTastingArchive;
      else if (path.endsWith("/wines/catalog/pending")) body = fixturePendingCatalog;
      else if (path.endsWith("/wines")) body = fixtureWines;
      else if (path.includes("/wines/wine-e2e-1")) body = fixtureWine;
      else if (path.includes("/wine-pulse")) body = { items: [], total: 0, offset: 0, limit: 3, has_more: false };
      else if (path.includes("value-history/portfolio") || path.includes("wishlist/lists") || path.includes("operational-action-snoozes")) body = [];
      else if (path.includes("regional-gap-settings")) body = { targets: [], last_ai_suggestion: null };
      else if (path.includes("taste-profile/me")) body = tasteProfileCollection;
      else if (path.includes("notifications")) body = fixtureNotificationCenter;
      else if (path.endsWith("/billing/redeem-codes")) body = [];
      else if (path.includes("billing")) body = { is_free_tier: false, has_active_entitlement: true, entitlement_valid_until: null, entitlement_days_remaining: null, ai_credit_balance_usd: "0" };
      else if (path.includes("household/memberships")) body = fixtureCellarMemberships;
      else if (path.includes("audit") || path.includes("tags") || path.includes("agreements") || path.includes("share-offers") || path.includes("share-offer") || path.includes("invites") || path.includes("recipients")) body = [];
      else if (path.includes("ai/settings")) body = { provider_mode: fixtureAiEnabled ? "auto" : "application", has_openai_api_key: false, can_use_app_credits: fixtureAiEnabled, ai_notes_model: "", drink_window_model: "", value_model: "", grape_model: "", score_model: "", wishlist_model: "", model_advisor_enabled: false, pairing_preferences: "", pairing_candidate_limit: 5 };
      else if (path.includes("public-config")) body = {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }, { fixtureWine: wine, fixtureWines, fixtureSession, fixturePendingCatalog, fixtureNotificationCenter, fixtureStrategyAllocations: strategyAllocations, fixtureIntelligenceSnapshot: intelligenceSnapshot, fixtureIntelligencePlan: intelligencePlan, fixturePreviousIntelligencePlan: previousIntelligencePlan, fixtureAiEnabled: aiEnabled, fixtureCellarMemberships: cellarMemberships, fixtureMerchants: merchants, fixtureTastingArchive, tasteProfileCollection });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname;
    if (path.endsWith("/session")) return fulfillJson(route, fixtureSession);
    if (path.endsWith("/intelligence/cellar")) return fulfillJson(route, intelligenceSnapshot);
    if (path.endsWith("/ai/cellar-intelligence/latest")) return fulfillJson(route, intelligencePlan);
    if (path.endsWith("/ai/cellar-intelligence/history")) return fulfillJson(route, [intelligencePlan, previousIntelligencePlan]);
    if (path.endsWith("/intelligence/preferences")) return fulfillJson(route, intelligenceSnapshot.preferences);
    if (path.endsWith("/intelligence/allocations/bulk/reassign")) return fulfillJson(route, { changed_wines: 1, assigned_bottles: 4, purpose: "drink" });
    if (path.endsWith("/intelligence/allocations/bulk")) return fulfillJson(route, { changed_wines: 1, assigned_bottles: 4, purpose: "maturation" });
    if (path.includes("/intelligence/wines/")) return fulfillJson(route, strategyAllocations);
    if (path.includes("/storage/allocations")) return fulfillJson(route, []);
    if (path.endsWith("/merchants")) return fulfillJson(route, merchants);
    if (path.endsWith("/taste-profile/wines/matches")) {
      const wineIds = route.request().postDataJSON()?.wine_ids || [];
      return fulfillJson(route, { matches: Object.fromEntries(wineIds.map((wineId: string) => [wineId, { score: 0.86, confidence: 0.3, matching_traits: ["body", "tannin"], conflicting_traits: [] }])) });
    }
    if (path.endsWith("/sensory")) return fulfillJson(route, null);
    if (path.includes("/taste-profile/wines/")) return fulfillJson(route, { score: 0.86, confidence: 0.3, matching_traits: ["body", "tannin"], conflicting_traits: [] });
    if (path.includes("/wines/tasting-archive")) return fulfillJson(route, fixtureTastingArchive);
    if (path.endsWith("/wines/catalog/pending")) return fulfillJson(route, fixturePendingCatalog);
    if (path.endsWith("/wines")) return fulfillJson(route, fixtureWines);
    if (path.includes("/wines/wine-e2e-1")) return fulfillJson(route, wine);
    if (path.includes("/wine-pulse")) return fulfillJson(route, { items: [], total: 0, offset: 0, limit: 3, has_more: false });
    if (path.includes("value-history/portfolio")) return fulfillJson(route, []);
    if (path.includes("wishlist/lists")) return fulfillJson(route, []);
    if (path.includes("notifications")) return fulfillJson(route, fixtureNotificationCenter);
    if (path.includes("regional-gap-settings")) return fulfillJson(route, { targets: [], last_ai_suggestion: null });
    if (path.includes("taste-profile/me")) return fulfillJson(route, tasteProfileCollection);
    if (path.includes("operational-action-snoozes")) return fulfillJson(route, []);
    if (path.endsWith("/billing/redeem-codes")) return fulfillJson(route, []);
    if (path.includes("billing")) return fulfillJson(route, { is_free_tier: false, has_active_entitlement: true, entitlement_valid_until: null, entitlement_days_remaining: null, ai_credit_balance_usd: "0" });
    if (path.includes("household/memberships")) return fulfillJson(route, cellarMemberships);
    if (path.includes("audit") || path.includes("tags") || path.includes("agreements") || path.includes("share-offers") || path.includes("share-offer") || path.includes("invites") || path.includes("recipients")) return fulfillJson(route, []);
    if (route.request().method() === "GET") return fulfillJson(route, []);
    return fulfillJson(route, route.request().method() === "PATCH" ? wine : {});
  });
  await page.route("https://{a,b,c}.tile.openstreetmap.org/**", (route) => route.fulfill({ status: 204, body: "" }));
}

async function openWineDetail(page: Page, strategyAllocations: unknown[] = []) {
  await mockApi(page, strategyAllocations);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  const wineRow = page.locator('[data-wine-row-id="wine-e2e-1"] article');
  await expect(wineRow).toBeVisible();
  await expect(wineRow.getByLabel("Affinità personale: 5 su 6")).toBeVisible();
  await wineRow.click();
  await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
}

test("wine sensory signature shows intensity and missing values across viewports", async ({ page }, testInfo) => {
  await page.addInitScript(() => sessionStorage.setItem("vinaris-test-sensory", JSON.stringify({
    identity_id: "sensory-test", generation_status: "available", source: "metadata", confidence: 0.65, validated: false,
    dimensions: { body: 0.8, acidity: 0.65, tannin: 0.75, sweetness: 0, aromatic_intensity: 0.7, fruit: 0.8, wood: null, spice: 0.4, minerality: 0.3 },
  })));
  await page.setViewportSize({ width: 390, height: 844 });
  await openWineDetail(page);
  const panel = page.locator('.wine-detail:visible').first().getByRole('region', { name: 'Impronta sensoriale' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.wine-sensory-indicator').filter({ hasText: 'Dolcezza' })).toContainText('0 / 10');
  await expect(panel.locator('.wine-sensory-indicator').filter({ hasText: 'Legno' })).toContainText('Non disponibile');
  await expect(panel).toContainText('Affidabilità: 65%');
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const visiblePanel = page.locator('.wine-detail:visible').first().getByRole('region', { name: 'Impronta sensoriale' });
    await visiblePanel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const row of await visiblePanel.locator('.wine-sensory-indicator').all()) {
      const label = (await row.locator('dt').boundingBox())!;
      const value = (await row.locator('dd').boundingBox())!;
      expect(label.x + label.width).toBeLessThanOrEqual(value.x);
    }
    await visiblePanel.screenshot({ path: testInfo.outputPath(`sensory-${width}.png`) });
    if (width === 390) await expect(visiblePanel).toHaveScreenshot('wine-sensory-signature-compact.png', { animations: 'disabled' });
  }
});

test("wine sensory signature omits absent profiles and rejects invalid intensities", async ({ page }) => {
  await openWineDetail(page);
  const detail = page.locator('.wine-detail:visible').first();
  await expect(detail.getByRole('region', { name: 'Impronta sensoriale' })).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('vinaris-test-sensory', JSON.stringify({
    generation_status: 'available', source: 'ai', confidence: 0.2, validated: false,
    dimensions: { body: 3, acidity: -0.2, tannin: '0.8', sweetness: 0 },
  })));
  await page.locator('[data-wine-row-id="wine-e2e-1"] .wine-row').click();
  await page.locator('[data-wine-row-id="wine-e2e-1"] .wine-row').click();
  const panel = detail.getByRole('region', { name: 'Impronta sensoriale' });
  await expect(panel).toBeVisible();
  for (const label of ['Corpo', 'Acidità', 'Tannini']) {
    await expect(panel.locator('.wine-sensory-indicator').filter({ hasText: label })).toContainText('Non disponibile');
  }
  await expect(panel.locator('.wine-sensory-indicator').filter({ hasText: 'Dolcezza' })).toContainText('0 / 10');
});

async function openRecordTasting(page: Page) {
  await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Registra bevuta", exact: true }).click();
}

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
  test(`tasting navigation belongs in the menu at ${viewport.width}`, async ({ page }) => {
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
    await page.screenshot({ path: `test-results/tasting-menu-${viewport.width}.png` });
    await action.click();
    if (mobile) await expect(navigation).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Registra bevuta" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: mobile ? "Menu" : "Registra bevuta", exact: true })).toBeFocused();
  });
}

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

test("record tasting reuses wishlist search and confirms photo suggestions", async ({ page }) => {
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
  await page.screenshot({ path: "test-results/record-tasting-photo.png" });
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
  test(`record tasting responsive layout ${viewport.width}`, async ({ page }) => {
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
      await page.screenshot({ path: "test-results/record-tasting-choice.png" });
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
    if (viewport.width === 390) await page.screenshot({ path: "test-results/record-tasting-form.png" });
    await dialog.getByRole("button", { name: "Salva bevuta" }).scrollIntoViewIfNeeded();
    const save = await dialog.getByRole("button", { name: "Salva bevuta" }).boundingBox();
    expect(save!.y + save!.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width === 390) await page.screenshot({ path: "test-results/record-tasting-form-bottom.png" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: viewport.width < 900 ? "Menu" : "Registra bevuta", exact: true })).toBeFocused();
  });
}

for (const focus of ["daily", "balanced", "value", "readiness", "timeline", "data", "taste"]) {
  for (const width of [360, 390, 430, 1440]) {
    test(`editorial dashboard ${focus} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: focus });
      await page.goto("/");
      const dashboard = page.locator(".home-dashboard-secondary");
      await expect(dashboard).toBeVisible();
      const heading = dashboard.locator(focus === "taste" ? ".taste-dashboard-carousel h2" : ".hero-copy h2").first();
      await expect(heading).toBeVisible();
      await expect(heading).toHaveCSS("font-family", "Georgia, serif");
      if (width < 900) {
        const header = page.locator(".cellar-home-hero");
        await expect(header).toBeVisible();
        const navigation = dashboard.locator(".dashboard-focus-navigation");
        const nav = (await navigation.boundingBox())!;
        const title = (await heading.boundingBox())!;
        expect(nav.y).toBeGreaterThanOrEqual((await header.boundingBox())!.y + (await header.boundingBox())!.height);
        expect(nav.y + nav.height).toBeLessThanOrEqual(title.y);
        expect(nav.y + nav.height).toBeLessThan((await page.locator(".mobile-bottom-navigation").boundingBox())!.y);
        await expect(page.locator(".cellar-home-search")).toBeVisible();
      }
      if (focus !== "taste" && width < 900) {
        const hero = (await dashboard.locator(".hero-panel").boundingBox())!;
        expect(hero.height).toBeLessThanOrEqual(210);
        for (const kpi of await dashboard.locator(".hero-kpi").all()) {
          const label = (await kpi.locator(":scope > span").boundingBox())!;
          const value = (await kpi.locator(":scope > strong").boundingBox())!;
          expect(label.y + label.height).toBeLessThanOrEqual(value.y);
          const bounds = (await kpi.boundingBox())!;
          expect(value.x).toBeGreaterThanOrEqual(bounds.x);
          expect(value.x + value.width).toBeLessThanOrEqual(bounds.x + bounds.width);
          await expect(kpi).toHaveCSS("border-radius", "12px");
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const card = dashboard.locator(".dashboard-card").first();
      if (await card.count()) {
        await expect(card).toHaveCSS("border-radius", width < 900 ? "14px" : "0px");
        const bounds = (await card.boundingBox())!;
        if (width < 900 && focus !== "taste") {
          const hero = (await dashboard.locator(".hero-panel").boundingBox())!;
          // The shared cellar masthead adds context above the focus-specific summary.
          // Check real section order instead of tying the first card to an absolute page offset.
          expect(bounds.y).toBeGreaterThanOrEqual(hero.y + hero.height);
        }
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        const title = card.locator(".card-heading h2").first();
        if (await title.count()) {
          const titleBounds = (await title.boundingBox())!;
          expect(titleBounds.x + titleBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width);
        }
      }
      if (focus === "daily" && width < 900) {
        for (const empty of await dashboard.locator(".daily-tone-empty").all()) {
          expect((await empty.boundingBox())!.height).toBeLessThanOrEqual(120);
        }
      }
      if (focus === "value" && width === 1440) {
        const tile = dashboard.locator(".top-value-showcase-item").first();
        const image = (await tile.locator("img").boundingBox())!;
        const copy = (await tile.locator(".top-value-showcase-copy").boundingBox())!;
        expect(image.y + image.height).toBeLessThanOrEqual(copy.y);
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`${focus}-${width}.png`), fullPage: true, animations: "disabled" });
      if (focus === "balanced" && width === 390) {
        await expect(page).toHaveScreenshot("balanced-home-compact.png", { fullPage: true, animations: "disabled" });
      }
    });
  }
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

for (const theme of ["maison-champagne", "pietra-vigna", "cave-privee"]) {
  for (const width of [360, 430, 1440]) {
    test(`premium theme ${theme} fits ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 360 ? 800 : 932 });
      await mockApi(page, [], false, memberships, [wine], { ...session, theme_preference: theme });
      await page.goto("/");
      await expect(page.locator(".home-dashboard")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`premium-${theme}-${width}.png`), animations: "disabled" });
    });
  }
}

test("editorial surfaces respect every user theme", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "daily" });
  await page.goto("/");
  await expect(page.locator(".daily-picks-card")).toBeVisible();
  for (const theme of ["light", "dark", "private-cellar", "sepia", "white-wine", "red-wine", "rose-wine", "champagne", "bordeaux", "burgundy", "tuscany", "piedmont", "ticino", "atelier", "midnight-ledger", "maison-champagne", "pietra-vigna", "cave-privee"]) {
    await page.evaluate((selected) => document.documentElement.setAttribute("data-theme", selected), theme);
    await expect(page.locator(".authenticated-app-shell")).toHaveCSS("background-image", "none");
    // Theme changes animate surfaces; compare their settled colors.
    await expect.poll(() => page.evaluate(() => {
      const probe = document.createElement("span");
      // The mobile Home paper is tinted while remaining derived from the active theme.
      probe.style.backgroundColor = "color-mix(in srgb, var(--surface) 88%, #c5ad86)";
      document.body.append(probe);
      const surface = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return surface === getComputedStyle(document.querySelector(".daily-picks-card")!).backgroundColor;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (["light", "atelier", "private-cellar", "midnight-ledger"].includes(theme)) {
      await page.screenshot({ path: testInfo.outputPath(`surfaces-${theme}.png`), animations: "disabled" });
    }
  }
});

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

test("shows contextual KPIs for every dashboard insight", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");

  const hero = page.locator(".hero-panel");
  const insightSwitcher = page.locator(".dashboard-analysis-switcher");
  const insights = [
    { focus: "Valore", labels: ["Valore totale", "Rendimento vs acquisto", "Valore medio bottiglia"] },
    { focus: "Finestra degustazione", labels: ["Pronti da bere", "In attesa della finestra ideale", "Finestra scaduta"] },
    { focus: "Timeline", labels: ["Consegne future", "Prossimi 30 giorni", "Prossima consegna"] },
    { focus: "Qualità dati", labels: ["Completezza dati", "Dati incompleti", "Campi da completare"] },
  ];

  for (const insight of insights) {
    await insightSwitcher.locator("summary").click();
    await insightSwitcher.getByRole("tab", { name: insight.focus, exact: true }).click();
    await expect(hero.getByRole("heading", { name: insight.focus, exact: true })).toBeVisible();
    for (const label of insight.labels) await expect(hero.getByText(label, { exact: true })).toBeVisible();
    await expect(hero.getByText("Le mie bottiglie", { exact: true })).toHaveCount(0);
    const kpiCards = await hero.locator(".hero-kpi").all();
    const kpiBoxes = (await Promise.all(kpiCards.map((card) => card.boundingBox()))).filter((box) => box !== null);
    expect(kpiBoxes).toHaveLength(3);
    // Mobile KPIs form a horizontal rail; each card must be reachable and fit the viewport.
    kpiBoxes.forEach((box, index) => {
      if (index > 0) expect(kpiBoxes[index - 1].x + kpiBoxes[index - 1].width).toBeLessThanOrEqual(box.x);
    });
    for (const card of kpiCards) {
      await card.scrollIntoViewIfNeeded();
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(391);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await insightSwitcher.locator("summary").click();
  await insightSwitcher.getByRole("tab", { name: "Valore", exact: true }).click();
  const desktopCards = await hero.locator(".hero-kpi").all();
  const desktopBoxes = (await Promise.all(desktopCards.map((card) => card.boundingBox()))).filter((box) => box !== null);
  expect(desktopBoxes).toHaveLength(3);
  desktopBoxes.forEach((box, index) => {
    expect(box.x + box.width).toBeLessThanOrEqual(1441);
    if (index > 0) expect(desktopBoxes[index - 1].x + desktopBoxes[index - 1].width).toBeLessThanOrEqual(box.x);
  });
});

for (const withCellarReminders of [false, true]) {
  test(`app admin sees pending catalog wines ${withCellarReminders ? "alongside cellar reminders" : "without cellar reminders"}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
    const pendingCatalogEntry = {
      id: "catalog-pending-e2e",
      name: "Nuovo Vino Test",
      producer: "Tenuta E2E",
      region: "Ticino",
      appellation: "Ticino DOC",
      type: "Red",
      format: "Bottle (750ml)",
      country: "Svizzera",
      grapes_text: "Merlot",
      source: "confirmed_recognition",
      is_active: false,
    };
    await mockApi(
      page,
      [],
      false,
      memberships,
      withCellarReminders ? [wine] : [],
      { ...session, is_app_admin: true },
      [pendingCatalogEntry],
    );

    await page.goto("/");

    const notifications = page.getByRole("button", { name: "Notifiche", exact: true });
    // The badge includes live cellar reminders as well as catalog approvals.
    await expect(notifications.locator("strong")).toHaveText(withCellarReminders ? "4" : "1");
    await notifications.click();
    const reminders = page.getByRole("region", { name: "Promemoria operativi" });
    await expect(reminders.getByRole("button", { name: /1 Vini in catalogo da approvare/ })).toBeVisible();
    await expect(reminders.getByRole("button", { name: "Rimanda di 14 giorni" })).toHaveCount(withCellarReminders ? 3 : 0);
    if (withCellarReminders) {
      await expect(reminders.getByRole("button", { name: /Da bere ora/ })).toBeVisible();
      await expect(reminders.getByRole("button", { name: /Valori da aggiornare/ })).toBeVisible();
      await expect(reminders.getByRole("button", { name: /Punteggi mancanti/ })).toBeVisible();
    }
  });
}

test("a wine marked To Collect immediately appears in notifications", async ({ page }) => {
  await mockApi(page, [], false, memberships, [{ ...wine, status: "To Collect" }]);
  await page.goto("/");

  const notifications = page.getByRole("button", { name: "Notifiche", exact: true });
  await expect(notifications.locator("strong")).toBeVisible();
});

test("separates archivable notifications from operational reminders", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const notificationCenter = {
    items: [{
      id: "notification-e2e-1",
      source: "notification",
      kind: "value_updated",
      category: "update",
      state: "unread",
      title: "Valore aggiornato",
      message: "La stima di mercato è stata aggiornata.",
      action_url: null,
      action_kind: "open",
      resource_id: null,
      actor_label: null,
      metadata: {},
      created_at: "2026-09-12T10:00:00Z",
      read_at: null,
      archived_at: null,
    }],
    counts: { total: 1, unread: 1, actionable: 0, attention: 1, actions: 0, updates: 1, system: 0 },
    offset: 0,
    next_offset: null,
    has_more: false,
  };
  await mockApi(page, [], false, memberships, [{ ...wine, status: "To Collect" }], session, [], notificationCenter);
  await page.goto("/");

  await page.getByRole("button", { name: "Notifiche", exact: true }).click();
  await expect(page.getByLabel(/elementi da controllare/)).toBeVisible();

  const notificationSection = page.getByRole("region", { name: "Notifiche" });
  await expect(notificationSection.getByText("Messaggi ed eventi: puoi segnarli come letti o archiviarli.")).toBeVisible();
  await expect(notificationSection.getByRole("button", { name: "Segna letta" })).toBeVisible();
  await expect(notificationSection.getByRole("button", { name: "Archivia" })).toBeVisible();

  const reminderSection = page.getByRole("region", { name: "Promemoria operativi" });
  await expect(reminderSection.getByText(/Derivano dallo stato della cantina/)).toBeVisible();
  await expect(reminderSection.getByText("Non è una notifica da archiviare").first()).toBeVisible();
  await expect(reminderSection.getByRole("button", { name: "Rimanda di 14 giorni" }).first()).toBeVisible();
  await expect(reminderSection.getByRole("button", { name: "Archivia" })).toHaveCount(0);

  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    const [notificationBox, reminderBox] = await Promise.all([notificationSection.boundingBox(), reminderSection.boundingBox()]);
    expect(notificationBox).not.toBeNull();
    expect(reminderBox).not.toBeNull();
    expect(notificationBox!.y + notificationBox!.height).toBeLessThanOrEqual(reminderBox!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
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

test("groups untracked wine regions under Other origins in the regional radar", async ({ page }) => {
  const maipoWine = {
    ...wine,
    id: "wine-e2e-maipo",
    name: "Mussonet Gran Reserva",
    producer: "Haras de Pirque",
    vintage: "2023",
    region: "Maipo Valley",
    appellation: "Valle del Maipo",
    current_value: "22.00",
    price: "22.00",
    quantity: 2,
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], false, memberships, [wine, maipoWine]);
  await page.goto("/");

  const radar = page.locator(".regional-gap-card");
  await expect(radar.getByText("Altre origini", { exact: true })).toBeVisible();
  await expect(radar.getByText(/Le regioni fuori dagli assi tracciati/)).toBeVisible();
});

test("batches taste matches for visible cellar rows", async ({ page }) => {
  const secondWine = { ...wine, id: "wine-e2e-2", name: "Barolo E2E" };
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], false, memberships, [wine, secondWine]);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();

  await expect.poll(
    () => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("vinaris-test-taste-batches") || "[]").map((batch: string[]) => [...batch].sort())),
  ).toEqual([["wine-e2e-1", "wine-e2e-2"]]);
});

test.describe("Wine Detail compact/mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("renders functional hierarchy without horizontal overflow", async ({ page }) => {
    await openWineDetail(page);
    const detail = page.locator(".wine-detail:visible").first();
    await expect(detail.getByRole("heading", { name: "Nebbiolo di Test" })).toBeVisible();
    await expect(detail.getByText("Nota di gusto", { exact: true })).toBeVisible();
    await expect(detail.getByText("86% in sintonia con i tuoi gusti", { exact: true })).toBeVisible();
    await expect(detail.getByLabel("Affinità personale: 5 su 6")).toBeVisible();
    await expect(detail.getByText("Stato", { exact: true }).first()).toBeVisible();
    await expect(detail.getByText("Quantità", { exact: true }).first()).toBeVisible();
    await expect(detail.getByRole("heading", { name: "Finestra degustazione" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Registra bevuta", exact: true })).toHaveCount(1);
    await expect(detail.getByRole("button", { name: "Registra vendita", exact: true })).toHaveCount(1);

    const metrics = detail.locator(".detail-hero-metrics");
    const drinkingWindow = detail.locator(".detail-hero-window");
    const photoAction = detail.getByRole("button", { name: "Sostituisci foto", exact: true });
    const origin = detail.getByRole("button", { name: /Origine/ });
    await expect(photoAction).toBeVisible();
    await expect(origin).toBeVisible();
    const metricsBox = (await metrics.boundingBox())!;
    const photoActionBox = (await photoAction.boundingBox())!;
    const originBox = (await origin.boundingBox())!;
    expect(photoActionBox.y + photoActionBox.height).toBeLessThanOrEqual(metricsBox.y);
    expect(originBox.y + originBox.height).toBeLessThanOrEqual(metricsBox.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(detail.locator(".detail-market-block")).not.toHaveAttribute("open", "");
    await expect(detail.locator(".ai-audit-detail")).not.toHaveAttribute("open", "");
  });

  test("opens a wine detail from tasting history on mobile", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Storico", exact: true }).click();
    await page.getByText("Nebbiolo di Test", { exact: true }).first().click();
    await page.getByRole("button", { name: "Apri vino", exact: true }).click();

    const detailDialog = page.getByRole("dialog", { name: "Nebbiolo di Test" });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.locator(".wine-detail").getByRole("heading", { name: "Nebbiolo di Test" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("renders My Taste without compact overflow", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator(".dashboard-analysis-switcher > summary").click();
    await page.getByRole("tab", { name: "Il mio gusto", exact: true }).click();
    await expect(page.locator(".taste-profile-panel").getByRole("heading", { name: "Il mio gusto", exact: true })).toBeVisible();
    await expect(page.getByText("Regioni preferite", { exact: true })).toBeVisible();
    await expect(page.locator(".taste-profile-panel").getByText("vini distinti", { exact: false })).toBeVisible();
    await page.getByText("Come Vinaris ha costruito questo profilo", { exact: true }).click();
    await expect(page.getByText(/Vinaris usa solo le degustazioni che hai registrato tu/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("keeps the desktop detail smoke path available", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWineDetail(page);
    await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nebbiolo di Test", exact: true }).first()).toBeVisible();
    const expandDetail = page.getByRole("button", { name: "Espandi dettaglio vino", exact: true }).first();
    await expect(expandDetail).toBeVisible();
    await expandDetail.click();
    await expect(page.locator(".wine-detail-modal")).toBeVisible();
  });

  test("includes cellar purpose in data quality", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await page.locator(".dashboard-analysis-switcher > summary").click();
    await page.getByRole("tab", { name: "Qualità dati", exact: true }).click();

    const qualityCard = page.getByRole("heading", { name: "Obiettivo cantina", exact: true }).locator("..").locator("..").locator("..");
    await expect(qualityCard.getByText("Obiettivo cantina mancante", { exact: true })).toBeVisible();
    await expect(qualityCard.getByRole("button", { name: "Assegna", exact: true })).toBeVisible();
  });

  test("explains Intelligence modes in a responsive help dialog", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Piano cantina", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Come usare Intelligence", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Come usare Intelligence" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Equilibrata", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Cosa bere", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Maturazione", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Investimento", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("makes the first AI plan value clear on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.addInitScript(() => {
      const currentFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        if (url.pathname === "/api/v1/ai/cellar-intelligence/latest") {
          return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.pathname === "/api/v1/ai/cellar-intelligence/history") {
          return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return currentFetch(input, init);
      };
    });
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();
    await page.setViewportSize({ width: 390, height: 844 });

    await expect(page.getByRole("heading", { name: "Trasforma i segnali della cantina in un ordine d’azione" })).toBeVisible();
    await expect(page.getByText("bottiglie ancora da decidere", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("shows Intelligence confidence, history, simulation, goals and group actions", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();

    await expect(page.getByText("Il piano riflette dati precedenti", { exact: true })).toBeVisible();
    await expect(page.getByText("Affidabilità 68%", { exact: true })).toBeVisible();
    await expect(page.getByText("DAL PIANO PRECEDENTE", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Simula", exact: true }).click();
    const simulation = page.getByRole("dialog", { name: /Nebbiolo di Test/ });
    await expect(simulation.getByText("BERE ORA", { exact: true })).toBeVisible();
    await expect(simulation.getByText("ATTENDERE", { exact: true })).toBeVisible();
    await expect(simulation.getByText("PROPOSTA INTELLIGENCE", { exact: true })).toBeVisible();
    await expect(simulation.getByText(/Perdita potenziale prudenziale/)).toBeVisible();
    await simulation.getByRole("button", { name: "Chiudi simulazione", exact: true }).click();

    await page.getByText("Imposta la strategia della cantina", { exact: true }).click();
    await expect(page.getByText("Bottiglie da bere all’anno", { exact: true })).toBeVisible();
    await page.getByText("Seleziona e gestisci più vini", { exact: true }).click();
    await expect(page.getByLabel("Filtra per produttore")).toBeVisible();
    await expect(page.getByLabel("Filtra per regione")).toBeVisible();
    await expect(page.getByLabel("Filtra per tipologia")).toBeVisible();
  });

  test("moves a selected group between cellar purposes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], true);
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();
    await page.getByText("Seleziona e gestisci più vini", { exact: true }).click();
    await page.getByRole("button", { name: "Seleziona visibili", exact: true }).click();
    const moveAction = page.locator(".intelligence-group-action-move");
    await moveAction.getByLabel("Nuovo obiettivo per le assegnate").selectOption("drink");
    await moveAction.getByRole("button", { name: "Sposta assegnate", exact: true }).click();
    await expect(page.getByText("4 bottiglie di 1 vini spostate a Bere.", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("shows the AI animation while generating a cellar plan", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], true);
    await page.addInitScript((fixturePlan) => {
      const currentFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        if (url.pathname === "/api/v1/ai/cellar-intelligence" && init?.method === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return new Response(JSON.stringify(fixturePlan), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return currentFetch(input, init);
      };
    }, intelligencePlan);
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();

    await page.getByRole("button", { name: "Crea piano AI", exact: true }).click();
    const overlay = page.locator(".ai-generation-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay.getByText("Piano della cantina", { exact: true })).toBeVisible();
    await expect(overlay.getByText("Sto analizzando l'intera cantina: obiettivi delle bottiglie, finestre di beva, valori e qualità dei dati.", { exact: true })).toBeVisible();
    await expect(overlay).toBeHidden();
  });

  test("shows AI feedback immediately before saving a recognized wine for full enrichment", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, [], true, memberships, [wine], { ...session, can_use_label_recognition: true });
    await page.addInitScript(({ fixtureWine, imageSvg }) => {
      window.createImageBitmap = async () => {
        const canvas = document.createElement("canvas") as HTMLCanvasElement & { close: () => void };
        canvas.width = 480;
        canvas.height = 720;
        canvas.getContext("2d")?.fillRect(180, 80, 120, 560);
        canvas.close = () => undefined;
        return canvas as unknown as ImageBitmap;
      };
      const currentFetch = window.fetch.bind(window);
      const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        if (url.pathname === "/api/v1/ai/settings") {
          return jsonResponse({ provider_mode: "auto", has_openai_api_key: false, can_use_app_credits: true, ai_notes_model: "gpt-5-mini", drink_window_model: "gpt-5-mini", value_model: "gpt-5-mini", grape_model: "gpt-5-mini", score_model: "gpt-5-mini", wishlist_model: "gpt-5-mini", model_advisor_enabled: false, model_options: [], pairing_preferences: "", pairing_candidate_limit: 5 });
        }
        if (url.pathname === "/api/v1/wines/photo/warmup") return new Response(null, { status: 204 });
        if (url.pathname === "/api/v1/wines/photo/process") {
          return new Response(imageSvg, { status: 200, headers: { "Content-Type": "image/svg+xml" } });
        }
        if (url.pathname === "/api/v1/wines/catalog/recognize-bottle") {
          return jsonResponse({
            recognition_id: "11111111-1111-4111-8111-111111111111",
            status: "recognized",
            producer: "Cantina Vinaris",
            estate: "",
            wine_name: "Nebbiolo Riconosciuto",
            cuvee: "",
            vintage: "2020",
            appellation: "Langhe DOC",
            region: "Piemonte",
            country: "Italia",
            wine_type: "Red",
            label_text: ["Nebbiolo Riconosciuto", "2020"],
            alternative_candidates: [],
            needs_user_confirmation: true,
            recognition_notes: [],
            provider: "luna",
            matches: [],
            estimated_cost_usd: "0.001",
          });
        }
        if (url.pathname === "/api/v1/wines" && init?.method === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          return jsonResponse({ ...fixtureWine, id: "wine-recognized-e2e", name: "Nebbiolo Riconosciuto", vintage: "2020" });
        }
        if (url.pathname === "/api/v1/wines/catalog/recognition/confirm") {
          return jsonResponse({ catalog_entry_id: null, catalog_status: "pending", sensory_profile_status: "pending", sensory_profile_source: "" });
        }
        if (url.pathname.includes("/api/v1/wines/wine-recognized-e2e/photo")) {
          return jsonResponse({ ...fixtureWine, id: "wine-recognized-e2e" });
        }
        if (url.pathname === "/api/v1/ai/wines/wine-recognized-e2e/all") {
          return jsonResponse({ ...fixtureWine, id: "wine-recognized-e2e", name: "Nebbiolo Riconosciuto", vintage: "2020" });
        }
        return currentFetch(input, init);
      };
    }, {
      fixtureWine: wine,
      imageSvg: "<svg xmlns='http://www.w3.org/2000/svg' width='480' height='720'><rect width='480' height='720' fill='#eee'/><rect x='180' y='80' width='120' height='560' rx='40' fill='#53202f'/></svg>",
    });
    await page.goto("/");

    await page.getByRole("button", { name: "Aggiungi un vino", exact: true }).click();
    const editor = page.locator(".wine-editor-form");
    await editor.getByRole("button", { name: "Aggiungi vino da foto", exact: true }).click();
    const capture = page.getByRole("dialog", { name: "Fotografa bottiglia" });
    await capture.locator('input[type="file"]').setInputFiles({
      name: "wine.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='480' height='720'><rect width='480' height='720' fill='#eee'/><rect x='180' y='80' width='120' height='560' rx='40' fill='#53202f'/></svg>"),
    });
    await capture.getByRole("button", { name: "Usa questa foto", exact: true }).click();
    await expect(editor.getByText("Vino riconosciuto proposto", { exact: true })).toBeVisible();
    await expect(editor.getByText("Come vuoi continuare?", { exact: true })).toBeVisible();
    await expect(editor.getByText(/Scegli se completare la scheda modificabile/)).toBeVisible();

    await editor.getByRole("button", { name: "Salva e analizza tutto", exact: true }).click();
    const overlay = page.locator(".ai-generation-overlay");
    await expect(overlay).toHaveCount(1, { timeout: 250 });
    await expect(overlay).toBeVisible({ timeout: 750 });
    await expect(overlay.getByText("Analisi completa del vino", { exact: true })).toBeVisible();
    await expect(overlay).toBeHidden({ timeout: 5000 });
  });

  test("keeps the expanded wine editor above the cellar list", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWineDetail(page);
    await page.getByRole("button", { name: "Modifica selezionato" }).click();

    const editor = page.locator(".wine-editor-form");
    await expect(editor).toBeVisible();
    await editor.getByRole("button", { name: "Espandi modifica vino" }).click();
    await expect(editor).toHaveClass(/is-expanded/);

    const editorBox = (await editor.boundingBox())!;
    expect(editorBox.width).toBeGreaterThan(1000);
    expect(await page.evaluate(() => {
      const expandedEditor = document.querySelector<HTMLElement>(".wine-editor-form.is-expanded");
      if (!expandedEditor) return false;
      const box = expandedEditor.getBoundingClientRect();
      return document.elementFromPoint(box.left + 20, box.top + 20)?.closest(".wine-editor-form") === expandedEditor;
    })).toBe(true);
  });

  test("offers registered merchants in the wine editor", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWineDetail(page);
    await page.getByRole("button", { name: "Modifica selezionato" }).click();

    const editor = page.locator(".wine-editor-form");
    await editor.getByRole("button", { name: /Prezzi e valore/ }).click();
    const merchantInput = editor.getByLabel("Commerciante");
    await expect(merchantInput).toHaveAttribute("list");
    const options = editor.locator("datalist option");
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveAttribute("value", "Enoteca Test");
    await expect(options.nth(1)).toHaveAttribute("value", "Vini della Riserva");
  });

  test("keeps wine editor sections aligned with the detail view", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWineDetail(page, [{
      id: "strategy-e2e-1",
      wine_id: wine.id,
      stock_lot_id: null,
      purpose: "maturation",
      quantity: 1,
      horizon_year: null,
      note: "",
    }]);
    await page.getByRole("button", { name: "Modifica selezionato" }).click();

    const editor = page.locator(".wine-editor-form");
    await expect(editor).toBeVisible();
    const sectionKeys = ["identity", "value", "profile", "strategy", "stock", "history", "audit"];
    const sectionTitles = [
      "Identità e disponibilità",
      "Prezzi e valore",
      "Profilo e riconoscimenti",
      "Obiettivo in cantina",
      "Giacenza e acquisti",
      "Note e storia",
      "Audit AI",
    ];

    for (const title of sectionTitles) await expect(editor.getByText(title, { exact: true })).toBeVisible();
    for (const [index, key] of sectionKeys.entries()) {
      await expect(editor.locator(`[data-wine-editor-section="${key}"]`).getByText(String(index + 1).padStart(2, "0"), { exact: true }).first()).toBeVisible();
    }
    const positions = await Promise.all(sectionKeys.map(async (key) => {
      const box = await editor.locator(`[data-wine-editor-section="${key}"]`).boundingBox();
      return box?.y ?? -1;
    }));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));

    const strategyToggle = editor.getByRole("button", { name: /Obiettivo in cantina/ });
    const auditToggle = editor.getByRole("button", { name: /Audit AI/ });
    const auditCounter = auditToggle.getByText("0", { exact: true });
    await expect(auditCounter).toBeVisible();
    for (const [toggle, counter] of [[auditToggle, auditCounter]]) {
      const toggleBox = (await toggle.boundingBox())!;
      const counterBox = (await counter.boundingBox())!;
      expect(counterBox.x).toBeGreaterThan(toggleBox.x + toggleBox.width * 0.7);
    }

    await expect(strategyToggle.getByText("– / 4", { exact: true })).toBeVisible();
    await strategyToggle.click();
    await expect(strategyToggle.getByText("1 / 4", { exact: true })).toBeVisible();

    await editor.getByRole("button", { name: /Profilo e riconoscimenti/ }).click();
    await expect(editor.getByRole("heading", { name: "Punteggi" })).toBeVisible();
    await expect(editor.getByText("Tag", { exact: true }).first()).toBeVisible();
    await editor.getByRole("button", { name: /Profilo e riconoscimenti/ }).click();

    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
  });

  test("keeps the mobile layout free of horizontal overflow at supported widths", async ({ page }) => {
    for (const viewport of [{ width: 360, height: 800 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      await openWineDetail(page);
      await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });

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

  test("presents the personal taste profile as a responsive editorial portrait", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockApi(page);
    await page.goto("/");
    const insights = page.locator(".dashboard-analysis-switcher");
    await insights.locator("summary").click();
    await insights.getByRole("tab", { name: "Il mio gusto", exact: true }).click();

    const profile = page.locator(".taste-profile-panel--insight");
    await expect(page.locator(".home-dashboard > .hero-panel")).toHaveCount(0);
    await expect(profile.getByRole("heading", { name: "Il mio gusto", exact: true })).toBeVisible();
    await expect(profile.getByText("Il tuo gusto cerca freschezza, intensità aromatica e frutto.", { exact: true })).toBeVisible();
    await expect(profile.getByRole("heading", { name: "Il carattere del tuo gusto" })).toBeVisible();
    await expect(profile.getByRole("heading", { name: "Le origini che cerchi" })).toBeVisible();
    await expect(profile.getByRole("heading", { name: "Come cambia il tuo gusto" })).toBeVisible();
    const redSignature = profile.locator(".taste-profile-category").filter({ hasText: /^Rossi/ });
    const whiteSignature = profile.locator(".taste-profile-category").filter({ hasText: /^Bianchi/ });
    await expect(redSignature).toHaveAttribute("open", "");
    await whiteSignature.locator("summary").click();
    await expect(whiteSignature).toHaveAttribute("open", "");
    await expect(redSignature).not.toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      await expect(profile).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const heroBox = await profile.locator(".taste-profile-premium-hero").boundingBox();
      expect(heroBox).not.toBeNull();
      expect(heroBox!.x).toBeGreaterThanOrEqual(0);
      expect(heroBox!.x + heroBox!.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  test("matches the compact visual baseline", async ({ page }) => {
    await openWineDetail(page);
    await expect(page).toHaveScreenshot("wine-detail-compact.png", { fullPage: true });
  });
});

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
