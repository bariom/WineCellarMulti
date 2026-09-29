import { expect, test } from "@playwright/test";
import { mockApi, wine, session, memberships } from "./fixtures/app";

test("reference market saves independently of language and persists after reload", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, market_country: "CH" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  const select = page.getByLabel("Mercato di riferimento", { exact: true });
  await expect(select).toHaveValue("CH");
  for (const country of ["IT", "DE", "US", "", "CH"]) {
    await select.selectOption(country);
    await expect(select).toHaveValue(country);
    await expect(page.getByText("Mercato di riferimento salvato.", { exact: true })).toBeVisible();
  }
  await page.reload();
  await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  await expect(select).toHaveValue("CH");
  await page.evaluate(() => sessionStorage.setItem("vinaris-test-save-error", "1"));
  await select.selectOption("DE");
  await expect(page.getByText("Save unavailable", { exact: false })).toBeVisible();
  await expect(select).toHaveValue("CH");
  await page.evaluate(() => sessionStorage.removeItem("vinaris-test-save-error"));
  await select.selectOption("IT");
  await expect(select).toHaveValue("IT");
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await select.scrollIntoViewIfNeeded();
    const box = (await select.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390 || width === 1440) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: testInfo.outputPath(`market-settings-${width}.png`), fullPage: true });
    }
  }
});

for (const kind of ["wine", "wishlist"]) {
  test(`saved ${kind} valuation shows its original market and foreign sources`, async ({ page }, testInfo) => {
    await page.route("**/valuation-test", route => route.fulfill({ contentType: "text/html", body: `
      <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {MarketValueModal} = await import('/src/components/AppPanels.tsx');
      const {translations} = await import('/src/i18n.ts');
      await import('/src/styles.css');
      const wine = ${JSON.stringify(wine)};
      const context = {kind: '${kind}', wine: {...wine, ai_value_market_country: 'IT'}, item: {...wine, ai_market_price: '48', ai_market_price_currency: 'CHF', ai_market_price_market_country: 'IT'}, entry: {sources: [
        {kind:'valuation_market',country:'IT'},
        {kind:'market_source',merchant:'Negozio locale',country:'Italy',price:48,currency:'CHF',url:'https://example.com/local'},
        {kind:'market_source',merchant:'Negozio estero',country:'France',price:52,currency:'EUR',url:'https://example.com/foreign'}
      ]}};
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MarketValueModal, {context,locale:'it',t:key=>translations.it[key]||key,onClose:()=>{}}));
      </script></body></html>` }));
    await page.goto("/valuation-test");
    await expect(page.getByText("Mercato: Italia · CHF", { exact: true })).toBeVisible();
    await expect(page.getByText(/Include fonti estere/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Negozio estero \(France\)/ })).toBeVisible();
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const card = page.locator(".market-modal-card");
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`market-valuation-${width}.png`) });
    }
  });
}
