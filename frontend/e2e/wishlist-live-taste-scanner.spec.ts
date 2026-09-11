import { expect, test } from "@playwright/test";

test("live wishlist scanner shows the recognised wine and personal affinity on mobile", async ({ page }) => {
  await page.route("**/wishlist-live-scanner-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {WishlistLiveTasteScanner} = await import('/src/components/WishlistLiveTasteScanner.tsx');
      await import('/src/styles.css');
      function TestScanner() {
        return React.createElement(WishlistLiveTasteScanner, {
          disabled: false,
          locale: 'it',
          onConfirm: () => {},
          onAnalyse: async () => ({
            recognition: {
              recognition_id: 'scan-1', status: 'recognized', producer: 'Produttore Test', estate: '',
              wine_name: 'Barolo Riserva', cuvee: '', vintage: '2020', appellation: 'Barolo DOCG',
              region: 'Piemonte', country: 'Italia', label_text: ['BAROLO RISERVA', '2020'],
              alternative_candidates: [], needs_user_confirmation: true, recognition_notes: [], provider: 'luna', matches: [],
            },
            match: { score: .84, confidence: .62, matching_traits: ['corpo', 'tannini', 'frutto'], conflicting_traits: [] },
          }),
        });
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(TestScanner));
    </script></body></html>`,
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wishlist-live-scanner-test");
  await page.getByRole("button", { name: "Scansione gusto live" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "label.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });

  await expect(page.getByText("Barolo Riserva")).toBeVisible();
  await expect(page.getByText("5/6")).toBeVisible();
  await expect(page.getByText(/In sintonia: corpo, tannini, frutto/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Conferma e usa" })).toBeVisible();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
