import { expect, test, type Page } from "@playwright/test";

async function renderPanel(page: Page, locale: string) {
  await page.route("**/sensory-agent-test", route => route.fulfill({ contentType: "text/html", body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const {default: React} = await import('/node_modules/.vite/deps/react.js');
    const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
    const {SensoryResearchPanel} = await import('/src/components/SensoryResearchPanel.tsx');
    await import('/src/styles.css');
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(SensoryResearchPanel, {locale:'${locale}', onApplied:async()=>{}}));
    </script></body></html>` }));
}

const result = {
  wine_id: "wine-one", identity_id: "identity", name: "Barolo Riserva", producer: "Cantina di Test", vintage: "2020",
  status: "ready", issue: "", summary: "Un vino strutturato, con acidità fresca e tannino deciso.", limitations: "Profilo atteso: non descrive la singola bottiglia bevuta.",
  vintage_confirmed: true, confidence: .65, baseline: { body: .4 },
  dimensions: { body: { value: .8, basis: "documented", excerpt: "Full-bodied with firm tannins.", source_url: "https://producer.example/technical-sheet-2020" }, acidity: { value: .7, basis: "inferred", excerpt: "Fresh and balanced finish.", source_url: "https://producer.example/technical-sheet-2020" } },
  aromas: [{ name: "ciliegia", excerpt: "Cherry", source_url: "https://producer.example/technical-sheet-2020" }],
  sources: [{ title: "Scheda tecnica del produttore · 2020", url: "https://producer.example/technical-sheet-2020" }], model: "test", prompt_version: "1", cost_usd: "0.02",
};

const completed = { id: "run-one", status: "completed", issue: "", max_wines: 10, budget_usd: "1", cost_usd: "0.02", results: [result, { ...result, wine_id: "wine-two", name: "Vino senza annata verificata", status: "incomplete", vintage_confirmed: false }, { ...result, wine_id: "wine-three", name: "Vino senza annata", vintage: "", status: "skipped", issue: "missing_vintage", vintage_confirmed: false, dimensions: {}, aromas: [], sources: [], summary: "", limitations: "", cost_usd: "0" }], created_at: "2026-10-07T08:00:00Z", updated_at: "2026-10-07T08:01:00Z" };

for (const locale of ["it", "en"]) {
  test(`Sensory agent ${locale}: background research, source review and explicit apply`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await renderPanel(page, locale);
    let applied = false;
    await page.route("**/api/v1/taste-profile/admin/research-runs**", async route => {
      const request = route.request();
      if (request.url().endsWith("/apply")) {
        applied = true;
        await route.fulfill({ json: { ...completed, results: [{ ...result, status: "applied" }] } });
      } else if (request.method() === "POST") {
        expect(request.postDataJSON()).toEqual({ max_wines: 10, budget_usd: "1" });
        await route.fulfill({ status: 202, json: { ...completed, status: "queued", results: [], cost_usd: "0" } });
      } else await route.fulfill({ json: request.url().endsWith("run-one") ? completed : [] });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sensory-agent-test");
    await page.getByRole("button", { name: it ? "Avvia ricerca autonoma" : "Start autonomous research" }).click();
    await expect(page.getByRole("button", { name: it ? "Ricerca in corso…" : "Researching…" })).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(it ? "Ricerca completata" : "Research completed");
    const proposals = page.getByRole("article");
    await expect(proposals).toHaveCount(3);
    await expect(proposals.nth(1).getByRole("button")).toHaveCount(0);
    await expect(proposals.first()).toContainText(it ? "Annata richiesta: 2020" : "Requested vintage: 2020");
    await expect(proposals.nth(2)).toContainText(it ? "Mancante nella scheda vino" : "Missing from wine details");
    await expect(proposals.nth(2)).toContainText(it ? "Ricerca non eseguita" : "Research skipped");
    await expect(proposals.nth(2).getByRole("button")).toHaveCount(0);
    await proposals.first().getByText(it ? "Confronto e prove" : "Comparison and evidence", { exact: true }).click();
    await expect(proposals.first()).toContainText("0.4 → 0.8");
    await expect(proposals.first()).toContainText(it ? "Interpretazione" : "Inferred");
    await expect(proposals.first().getByRole("link").first()).toHaveAttribute("rel", "noopener noreferrer");
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const button = (await page.getByRole("button", { name: it ? "Avvia ricerca autonoma" : "Start autonomous research" }).boundingBox())!;
      const input = (await page.getByLabel(it ? "Budget AI (USD)" : "AI budget (USD)").boundingBox())!;
      expect(button.x + button.width <= input.x || input.x + input.width <= button.x || button.y >= input.y + input.height).toBe(true);
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`agent-${width}.png`), fullPage: true });
    }
    expect(applied).toBe(false);
    await proposals.first().getByRole("button", { name: it ? "Usa questo profilo" : "Apply this profile" }).click();
    await expect(page.getByText(it ? "Profilo utilizzato" : "Profile applied", { exact: true })).toBeVisible();
    expect(applied).toBe(true);
  });
}

test("Sensory agent exposes startup errors and restores controls", async ({ page }) => {
  await renderPanel(page, "it");
  await page.route("**/api/v1/taste-profile/admin/research-runs", route => route.fulfill(route.request().method() === "POST" ? { status: 409, json: { detail: "Research is already running for this cellar" } } : { json: [] }));
  await page.goto("/sensory-agent-test");
  const start = page.getByRole("button", { name: "Avvia ricerca autonoma" });
  await start.click();
  await expect(page.getByRole("alert")).toContainText("already running");
  await expect(start).toBeEnabled();
});
