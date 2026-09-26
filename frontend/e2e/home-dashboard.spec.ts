import { expect, test } from "@playwright/test";
import { wine, session, memberships, mockApi } from "./fixtures/app";

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

// Retain the original suite title and viewport for stable test identity.
test.describe("Wine Detail compact/mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

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
});
