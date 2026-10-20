import { expect, test } from "@playwright/test";
import { mockApi, session, snapshotChrome } from "./fixtures/app";

for (const locale of ["it", "en"] as const) {
  test(`My Taste portrait keeps its signature and metrics readable (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await mockApi(page, [], false, undefined, undefined, { ...session, locale });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.locator(".dashboard-analysis-switcher > summary").click();
    await page.getByRole("tab", { name: it ? "Il mio gusto" : "My Taste", exact: true }).click();
    const hero = page.getByRole("region", { name: it ? "Ritratto del gusto" : "Taste portrait", exact: true });
    const wheel = hero.getByRole("figure", { name: it ? "La tua firma sensoriale" : "Your sensory signature", exact: true });
    await expect(wheel).toBeVisible();
    await expect(hero).toHaveCSS("background-image", /linear-gradient/);
    await expect(wheel.locator(".taste-wheel-point")).toHaveCount(9);
    await expect(wheel.locator(".taste-wheel-shape")).toHaveCount(1);
    // The badge counts clear dimensions instead of claiming a blanket coverage.
    const badge = hero.locator(".taste-profile-evidence-summary small");
    await expect(badge).toContainText(it ? "dimensioni chiare" : "dimensions clear");
    if (await wheel.locator(".taste-wheel-point.is-weak").count()) await expect(badge).not.toContainText(it ? "firma consolidata" : "established signature");
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const copy = (await hero.locator(".taste-profile-hero-copy").boundingBox())!;
      const graphic = (await wheel.boundingBox())!;
      const metrics = (await hero.locator(".taste-profile-hero-data").boundingBox())!;
      const intersects = (a: typeof copy, b: typeof copy) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      expect(intersects(copy, graphic)).toBe(false);
      expect(intersects(graphic, metrics)).toBe(false);
      expect(intersects(copy, metrics)).toBe(false);
      for (const label of await wheel.locator("svg text").all()) {
        const box = (await label.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(graphic.x);
        expect(box.x + box.width).toBeLessThanOrEqual(graphic.x + graphic.width);
      }
      if (it && (viewport.width === 390 || viewport.width === 1440)) {
        await snapshotChrome(page, false);
        await hero.screenshot({ path: testInfo.outputPath(`taste-portrait-${viewport.width}.png`) });
        if (viewport.width === 390) await expect(hero).toHaveScreenshot("taste-portrait-compact.png", { animations: "disabled" });
        await snapshotChrome(page, true);
      }
    }
  });
}

test("Taste signature distinguishes a zero preference from missing dimensions", async ({ page }) => {
  await page.route("**/taste-wheel-test", route => route.fulfill({ contentType: "text/html", body: `
    <html><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const {default: React} = await import('/node_modules/.vite/deps/react.js');
    const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
    const {default: Wheel} = await import('/src/components/TasteSignatureWheel.tsx');
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Wheel, {locale:'it', labels:{body:'Corpo', acidity:'Acidità', tannin:'Tannini'}, dimensions:{body:{preference:0}, acidity:{preference:.75}}}));
    </script></body></html>` }));
  await page.goto("/taste-wheel-test");
  await expect(page.locator("svg desc")).toContainText("Corpo: 0/100");
  await expect(page.locator("svg desc")).toContainText("Tannini: dati insufficienti");
  await expect(page.locator(".taste-wheel-point")).toHaveCount(2);
  await expect(page.locator(".taste-wheel-shape")).toHaveCount(0);
});

test("Taste signature tells strong preferences from weak, near-neutral ones", async ({ page }) => {
  await page.route("**/taste-wheel-strength-test", route => route.fulfill({ contentType: "text/html", body: `
    <html><body style="background:#3a1c22"><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const {default: React} = await import('/node_modules/.vite/deps/react.js');
    const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
    const {default: Wheel} = await import('/src/components/TasteSignatureWheel.tsx');
    await import('/src/components/TasteProfilePortrait.css');
    const levels = {acidity: .76, aromatic_intensity: .75, body: .72, fruit: .74, minerality: .67, spice: .64, sweetness: .53, tannin: .66, wood: .63};
    const dimensions = Object.fromEntries(Object.entries(levels).map(([key, preference]) => [key, {preference, confidence: .83, samples: 80}]));
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Wheel, {locale:'it', labels:{body:'Corpo', acidity:'Acidità', tannin:'Tannini', sweetness:'Dolcezza', fruit:'Frutto', wood:'Legno', spice:'Spezie', minerality:'Mineralità'}, dimensions}));
    </script></body></html>` }));
  await page.goto("/taste-wheel-strength-test");
  // Acidity 76 is a clear, well-supported preference; sweetness 53 says almost nothing.
  await expect(page.locator(".taste-wheel-label.is-strong").filter({ hasText: "Acidità" })).toHaveCount(1);
  await expect(page.locator(".taste-wheel-label.is-medium").filter({ hasText: "Tannini" })).toHaveCount(1);
  const sweetness = page.locator(".taste-wheel-label.is-weak").filter({ hasText: "Dolcezza" });
  await expect(sweetness).toHaveCount(1);
  await expect(sweetness).toContainText("53 · debole");
  await expect(page.locator(".taste-wheel-point.is-weak")).toHaveCount(1);
  // Both sides touching the weak dimension are dashed, the others solid.
  await expect(page.locator(".taste-wheel-edge.is-weak")).toHaveCount(2);
  await expect(page.locator(".taste-wheel-edge:not(.is-weak)")).toHaveCount(7);
  await expect(page.locator("svg desc")).toContainText("Dolcezza: 53/100, influenza debole");
  await expect(page.locator(".taste-wheel-legend")).toContainText("Influenza forte");
});

// Retain the original suite title and viewport for stable test identity.
test.describe("Wine Detail compact/mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("ranking handles unsorted weights, ties and insufficient data", async ({ page }) => {
    await page.route("**/preference-chart-test", route => route.fulfill({ contentType: "text/html", body: `
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {PreferenceRankingChart} = await import('/src/components/PreferenceRankingChart.tsx');
      await import('/src/styles.css');
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('main', {},
        React.createElement(PreferenceRankingChart, {values:[['Cabernet Sauvignon', 2], ['Merlot', 8, 3, 5.33], ['Chardonnay', 8, 0, 6], ['Neutral', 0], ['Negative', -1]], title:'Preferred grapes', locale:'en'}),
        React.createElement(PreferenceRankingChart, {values:[], title:'Empty grapes', locale:'en'})));
      </script></body></html>` }));
    await page.goto("/preference-chart-test");
    const chart = page.getByRole("figure", { name: "Chart: Preferred grapes", exact: true });
    await expect(chart.getByRole("listitem")).toHaveCount(3);
    await expect(chart.getByRole("listitem").first()).toContainText("Merlot");
    await expect(chart.getByRole("listitem").nth(1)).toContainText("Chardonnay");
    await expect(chart.getByLabel("Relative support: 100/100")).toHaveCount(2);
    await expect(chart.getByLabel("Relative support: 25/100")).toBeVisible();
    // Each favourite says why it ranks there; entries saved before this detail show none.
    await expect(chart.getByRole("listitem").first()).toContainText("3 bottles drunk · average 5.3 of 6");
    await expect(chart.getByRole("listitem").nth(1).locator(".taste-preference-evidence")).toHaveText("average 6.0 of 6");
    await expect(chart.getByRole("listitem").nth(2).locator(".taste-preference-evidence")).toHaveCount(0);
    await expect(page.getByRole("figure", { name: "Chart: Empty grapes" })).toContainText("not enough evidence");
    await expect(page.getByRole("figure", { name: "Chart: Empty grapes" }).getByRole("listitem")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("shows preferred grapes as ranked bars before opening preference details", async ({ page }, testInfo) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator(".dashboard-analysis-switcher > summary").click();
    await page.getByRole("tab", { name: "Il mio gusto", exact: true }).click();
    const section = page.getByRole("region", { name: "Le tue uve preferite", exact: true });
    const chart = section.getByRole("figure", { name: "Grafico: Uve preferite", exact: true });
    await expect(chart).toBeVisible();
    await expect(chart.getByRole("listitem")).toHaveCount(5);
    await expect(chart.getByRole("listitem").first()).toContainText("Merlot");
    await expect(chart.getByRole("listitem").nth(1)).toContainText("Chardonnay");
    await expect(chart.getByLabel("Riscontro relativo: 100/100")).toBeVisible();
    await expect(chart.getByLabel("Riscontro relativo: 50/100")).toBeVisible();
    const first = chart.locator(".taste-preference-track > span").first();
    const second = chart.locator(".taste-preference-track > span").nth(1);
    await expect(first).toHaveAttribute("style", "width: 100%;");
    await expect(second).toHaveAttribute("style", "width: 50%;");
    await expect(section).toContainText("Nei blend il giudizio riguarda il vino nel suo insieme");
    const details = page.locator(".taste-origin-preferences");
    await expect(details).not.toHaveAttribute("open", "");
    await details.locator("summary").click();
    await expect(details.getByRole("figure", { name: "Grafico: Regioni preferite" })).toBeVisible();
    await expect(details.getByRole("figure", { name: "Grafico: Denominazioni preferite" })).toBeVisible();
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await section.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const rows = await chart.getByRole("listitem").all();
      let bottom = 0;
      for (const row of rows) {
        const box = (await row.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(bottom);
        bottom = box.y + box.height;
        const label = (await row.locator("strong").boundingBox())!;
        const value = (await row.locator(".taste-preference-value").boundingBox())!;
        expect(label.x + label.width).toBeLessThanOrEqual(value.x);
      }
      if (width === 390 || width === 1440) {
        await section.screenshot({ path: testInfo.outputPath(`grapes-${width}.png`) });
        await details.screenshot({ path: testInfo.outputPath(`preferences-${width}.png`) });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await snapshotChrome(page, false);
    await expect(section).toHaveScreenshot("preferred-grapes-compact.png");
    await snapshotChrome(page, true);
  });

  test("renders My Taste without compact overflow", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator(".dashboard-analysis-switcher > summary").click();
    await page.getByRole("tab", { name: "Il mio gusto", exact: true }).click();
    await expect(page.locator(".taste-profile-panel").getByRole("heading", { name: "Il mio gusto", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Le tue origini più apprezzate" })).toBeVisible();
    await page.getByText("Tutte le tue preferenze", { exact: true }).click();
    await expect(page.getByText("Regioni preferite", { exact: true })).toBeVisible();
    await expect(page.locator(".taste-profile-panel").getByText("vini distinti", { exact: false })).toBeVisible();
    await page.getByText("Come Vinaris ha costruito questo profilo", { exact: true }).click();
    await expect(page.getByText(/Vinaris usa solo le degustazioni che hai registrato tu/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
    await expect(profile.getByRole("heading", { name: "Dove vale la pena esplorare" })).toBeVisible();
    const geography = profile.getByRole("region", { name: "Dove vale la pena esplorare" });
    await expect(geography.locator(".taste-origin-card")).toHaveCount(3);
    await expect(geography.locator(".taste-origin-card").nth(2)).toContainText("4 bottiglie in cantina · 1 etichetta");
    await expect(geography.locator(".taste-origin-preferences")).not.toHaveAttribute("open", "");
    await expect(profile.getByRole("heading", { name: "Come cambia il tuo gusto" })).toBeVisible();
    const redSignature = profile.locator(".taste-profile-category").filter({ hasText: /^Rossi/ });
    const whiteSignature = profile.locator(".taste-profile-category").filter({ hasText: /^Bianchi/ });
    await expect(redSignature).toHaveAttribute("open", "");
    await whiteSignature.locator("summary").click();
    await expect(whiteSignature).toHaveAttribute("open", "");
    await expect(redSignature).not.toHaveAttribute("open", "");
    await geography.screenshot({ path: "test-results/taste-origins-desktop-review.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      await expect(profile).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const heroBox = await profile.locator(".taste-profile-premium-hero").boundingBox();
      expect(heroBox).not.toBeNull();
      expect(heroBox!.x).toBeGreaterThanOrEqual(0);
      expect(heroBox!.x + heroBox!.width).toBeLessThanOrEqual(viewport.width);
      const cards = await geography.locator(".taste-origin-card").all();
      let previousBottom = 0;
      for (const card of cards) {
        const box = (await card.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y).toBeGreaterThanOrEqual(previousBottom);
        previousBottom = box.y + box.height;
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await geography.locator(".taste-origin-discovery").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/taste-origins-viewport-review.png" });
    await snapshotChrome(page, false);
    await geography.screenshot({ path: "test-results/taste-origins-compact-review.png" });
    await expect(geography).toHaveScreenshot("taste-origins-compact.png");
    await snapshotChrome(page, true);
    const piedmont = geography.locator(".taste-origin-card").filter({ hasText: "Piemonte" });
    await piedmont.getByText("Vedi i vini in cantina", { exact: true }).click();
    await piedmont.getByRole("button", { name: /Nebbiolo di Test/ }).click();
    await expect(page.getByRole("dialog", { name: "Nebbiolo di Test", exact: true })).toBeVisible();
  });
});

for (const theme of ["light", "private-cellar"] as const) {
  test(`My Taste uses the available width in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, [], false, undefined, undefined, { ...session, theme_preference: theme });
    await page.goto("/");
    await page.locator(".dashboard-analysis-switcher > summary").click();
    await page.getByRole("tab", { name: "Il mio gusto", exact: true }).click();
    const profile = page.locator(".taste-profile-panel--insight");
    const grid = page.locator(".taste-dashboard-carousel > .dashboard-grid");
    const hero = profile.getByRole("region", { name: "Ritratto del gusto", exact: true });
    await expect(hero).toBeVisible();
    for (const viewport of [
      { width: 360, height: 800 }, { width: 390, height: 844 },
      { width: 430, height: 932 }, { width: 820, height: 1180 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      const gridBox = (await grid.boundingBox())!;
      const profileBox = (await profile.boundingBox())!;
      expect(profileBox.x).toBe(gridBox.x);
      expect(profileBox.width).toBe(gridBox.width);
      expect(profileBox.x).toBeGreaterThanOrEqual(0);
      expect(profileBox.x + profileBox.width).toBeLessThanOrEqual(viewport.width);
      expect(await grid.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await profile.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (viewport.width === 390 || viewport.width === 1440) {
        await profile.getByRole("heading", { name: "Il mio gusto", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`taste-width-${viewport.width}.png`) });
        await snapshotChrome(page, false);
        await hero.screenshot({ path: testInfo.outputPath(`taste-hero-${viewport.width}.png`) });
        await snapshotChrome(page, true);
      }
    }
  });
}
