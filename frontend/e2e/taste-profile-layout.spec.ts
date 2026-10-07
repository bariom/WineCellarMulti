import { expect, test } from "@playwright/test";
import { mockApi, snapshotChrome } from "./fixtures/app";

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
        React.createElement(PreferenceRankingChart, {values:[['Cabernet Sauvignon', 2], ['Merlot', 8], ['Chardonnay', 8], ['Neutral', 0], ['Negative', -1]], title:'Preferred grapes', locale:'en'}),
        React.createElement(PreferenceRankingChart, {values:[], title:'Empty grapes', locale:'en'})));
      </script></body></html>` }));
    await page.goto("/preference-chart-test");
    const chart = page.getByRole("figure", { name: "Chart: Preferred grapes", exact: true });
    await expect(chart.getByRole("listitem")).toHaveCount(3);
    await expect(chart.getByRole("listitem").first()).toContainText("Merlot");
    await expect(chart.getByRole("listitem").nth(1)).toContainText("Chardonnay");
    await expect(chart.getByLabel("Relative support: 100/100")).toHaveCount(2);
    await expect(chart.getByLabel("Relative support: 25/100")).toBeVisible();
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
