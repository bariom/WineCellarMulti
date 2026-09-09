import { expect, test } from "@playwright/test";

test("wishlist buying strategy exposes taste-profile control on mobile", async ({ page }) => {
  await page.route("**/wishlist-strategy-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {WishlistPortfolioStrategyPanel} = await import('/src/components/AppPanels.tsx');
      const {translations} = await import('/src/i18n.ts');
      await import('/src/styles.css');
      const strategy = {
        model: 'gpt-5.5', reasoning_effort: 'low',
        overview: 'Tre candidati con priorità differenti.',
        buy_now: '1. Barolo Test: alta affinità, qualità documentata e prezzo coerente.',
        wait_watch: 'Monitorare Champagne Test fino a un prezzo migliore.',
        allocation: 'Concentrare il budget sul primo candidato.',
        next_step: 'Verificare la disponibilità del Barolo Test.',
        wishlist_list_id: 'list-1', wishlist_list_name: 'Da acquistare', item_count: 3,
        generated_at: '2026-09-09T10:00:00Z', estimated_cost_usd: '0.04',
        profile_applied: true, stale: false,
      };
      function TestPanel() {
        const [enabled, setEnabled] = React.useState(true);
        return React.createElement(WishlistPortfolioStrategyPanel, {
          strategy, canGenerate: true, generating: false, onGenerate: () => {},
          open: true, onToggle: () => {}, useTasteProfile: enabled,
          onUseTasteProfileChange: setEnabled, t: key => translations.it[key] || key,
        });
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(TestPanel));
    </script></body></html>`,
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wishlist-strategy-test");

  const profileToggle = page.getByLabel("Considera il mio profilo di gusto");
  await expect(profileToggle).toBeChecked();
  await expect(page.getByText("Gusto personale incluso in questa strategia")).toBeVisible();
  await expect(page.getByText(/Barolo Test: alta affinità/)).toBeVisible();
  await profileToggle.uncheck();
  await expect(profileToggle).not.toBeChecked();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(/Barolo Test: alta affinità/)).toBeVisible();
});
