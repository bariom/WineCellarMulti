import { expect, test } from "@playwright/test";
import { wine } from "./fixtures/app";

for (const mode of ["discovery", "empty", "countries"] as const) {
  test(`taste origins explain evidence and handle ${mode}`, async ({ page }) => {
    const attributes = mode === "countries"
      ? { preferred_countries: [["Italia", 8]] }
      : { preferred_regions: [["Toscana", 8], ["Bordeaux", 12], ["Champagne", 2], ["Piemonte", 0]], preferred_grapes: [["Merlot", 10]] };
    const wines = mode === "empty" ? [] : [
      { ...wine, region: "Toscana", quantity: 3 },
      { ...wine, id: "outside", name: "Merlot da esplorare", region: "Ticino", vineyard_country: "Svizzera", grapes: [{ name: "Merlot" }] },
      { ...wine, id: "pending", region: "Toscana", quantity: 20, status: "ordered" },
    ];
    await page.route("**/taste-origins-test", route => route.fulfill({
      contentType: "text/html",
      body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const {default: React} = await import('/node_modules/.vite/deps/react.js');
        const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
        const {TasteOrigins} = await import('/src/components/TasteOrigins.tsx');
        await import('/src/styles.css');
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(TasteOrigins, {
          locale:'it', profile:${JSON.stringify({ attributes, confidence_level: "emerging" })}, wines:${JSON.stringify(wines)},
          onOpenWine: wine => { document.title = wine.id; }
        }));
      </script></body></html>`,
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/taste-origins-test");
    await expect(page.getByText(/La quantità in cantina indica disponibilità, non gradimento/)).toBeVisible();
    await expect(page.getByText(/questa classifica può cambiare/)).toBeVisible();
    const cards = page.locator(".taste-origin-card");
    if (mode === "countries") {
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText("Paese");
      await expect(cards.first()).toContainText("3 bottiglie in cantina");
    } else {
      await expect(cards).toHaveCount(3);
      await expect(cards.first().getByRole("heading")).toHaveText("Bordeaux");
      await expect(cards.nth(1)).toContainText(`${mode === "empty" ? 0 : 3} bottiglie in cantina`);
    }
    if (mode === "discovery") {
      await expect(page.locator(".taste-origin-discovery")).toContainText("Merlot emerge");
      await expect(page.locator(".taste-origin-discovery")).toContainText("non è una previsione di gradimento");
      await page.getByRole("button", { name: "Apri la bottiglia da esplorare" }).click();
      await expect(page).toHaveTitle("outside");
    } else {
      await expect(page.getByText(/Non ci sono ancora bottiglie con dati sufficienti/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Apri la bottiglia da esplorare" })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
