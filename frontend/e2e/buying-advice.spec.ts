import { expect, test } from "@playwright/test";

test("keeps location optional until immediate availability is requested", async ({ page }) => {
  await page.route("**/buying-advice-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {default: BuyingAdviceView} = await import('/src/views/BuyingAdviceView.tsx');
      const {translations} = await import('/src/i18n.ts');
      await import('/src/styles.css');
      function TestView() {
        const [purpose, setPurpose] = React.useState('drink_now');
        const [pairing, setPairing] = React.useState('');
        const [preferences, setPreferences] = React.useState('');
        const [wineType, setWineType] = React.useState('');
        const [region, setRegion] = React.useState('');
        const [useProfile, setUseProfile] = React.useState(true);
        const [checkAvailability, setCheckAvailability] = React.useState(false);
        const [neededBy, setNeededBy] = React.useState('today');
        const [location, setLocation] = React.useState('');
        const [minPrice, setMinPrice] = React.useState('20');
        const [maxPrice, setMaxPrice] = React.useState('50');
        const [submitted, setSubmitted] = React.useState(false);
        const advice = {
          summary: 'Proposta selezionata.', warning: '', profile_applied: true,
          availability_checked: false, model: 'test', reasoning_effort: 'low', estimated_cost_usd: '0.01',
          recommendations: [{ name: 'Barolo Test', producer: 'Produttore', vintage: '2020', merchant: '', merchant_type: 'online', price: '42.00', currency: 'CHF', availability: '', delivery_estimate: '', source_url: 'https://example.com/barolo', reason: 'In linea con il profilo.', local: false, confidence: 'high' }],
        };
        return React.createElement(React.Fragment, null,
          React.createElement(BuyingAdviceView, {
            canGenerateAi: true, generatingAi: '', locale: 'it',
            buyingPurpose: purpose, buyingPairingWith: pairing, buyingPreferences: preferences,
            buyingWineType: wineType, buyingRegion: region, buyingUseTasteProfile: useProfile,
            buyingCheckAvailability: checkAvailability, buyingNeededBy: neededBy,
            buyingLocation: location, buyingMinPrice: minPrice, buyingMaxPrice: maxPrice,
            buyingAdviceResult: advice, formatAiBudget: String,
            onGenerateBuyingAdvice: event => { event.preventDefault(); setSubmitted(true); },
            canWriteWishlist: true, onAddRecommendationToWishlist: async () => {},
            setBuyingPurpose: setPurpose, setBuyingPairingWith: setPairing,
            setBuyingPreferences: setPreferences, setBuyingWineType: setWineType,
            setBuyingRegion: setRegion, setBuyingUseTasteProfile: setUseProfile,
            setBuyingCheckAvailability: setCheckAvailability, setBuyingNeededBy: setNeededBy,
            setBuyingLocation: setLocation, setBuyingMinPrice: setMinPrice,
            setBuyingMaxPrice: setMaxPrice, t: key => translations.it[key] || key,
          }),
          submitted ? React.createElement('div', { role: 'status' }, 'Richiesta inviata') : null
        );
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(TestView));
    </script></body></html>`,
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/buying-advice-test");

  const addToWishlist = page.getByRole("button", { name: "Aggiungi alla wishlist", exact: true });
  await expect(addToWishlist).toBeVisible();
  await addToWishlist.click();
  await expect(page.getByRole("button", { name: "Aggiunto alla wishlist", exact: true })).toBeDisabled();
  await expect(page.getByText("La disponibilità non verrà considerata", { exact: false })).toBeVisible();
  await expect(page.getByText("✓ Selezionato", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Dove vuoi acquistare o ricevere?")).toHaveCount(0);
  await page.getByRole("button", { name: "Ottieni i consigli", exact: true }).click();
  await expect(page.getByRole("status", { name: "" })).toContainText("Richiesta inviata");

  await page.getByRole("button", { name: /Trova dove acquistarlo ora/ }).click();
  await expect(page.getByText("✓ Selezionato", { exact: true })).toBeVisible();
  const location = page.getByLabel("Dove vuoi acquistare o ricevere?");
  await expect(location).toBeVisible();
  await expect(location).toHaveAttribute("required", "");
  await expect(page.getByRole("button", { name: "Cerca offerte disponibili", exact: true })).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
