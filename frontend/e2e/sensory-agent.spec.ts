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
  vintage_confirmed: true, confidence: .65, baseline: { body: .4, wood: .3 },
  baseline_source: "metadata", baseline_validated: false, baseline_confidence: .8,
  dimensions: { body: { value: .8, basis: "documented", excerpt: "Full-bodied with firm tannins.", source_url: "https://producer.example/technical-sheet-2020" }, acidity: { value: .7, basis: "inferred", excerpt: "Fresh and balanced finish.", source_url: "https://producer.example/technical-sheet-2020" } },
  comparisons: [{ dimension: "body", agreement: "corroborated", independent: true,
    explanation: "Producer and independent critic agree on a full body.", evidence: [
      { excerpt: "Full-bodied with firm tannins.", source_url: "https://producer.example/technical-sheet-2020" },
      { excerpt: "Rich and full-bodied.", source_url: "https://critic.example/review-2020" },
    ] }],
  aromas: [{ name: "ciliegia", excerpt: "Cherry", source_url: "https://producer.example/technical-sheet-2020" }],
  sources: [{ title: "Scheda tecnica del produttore · 2020", url: "https://producer.example/technical-sheet-2020" }], model: "test", prompt_version: "1", cost_usd: "0.02",
};

const completed = { id: "run-one", status: "completed", issue: "", max_wines: 10, selected_wines: 3, budget_usd: "1", cost_usd: "0.02", results: [result, { ...result, wine_id: "wine-two", name: "Vino senza annata verificata", status: "incomplete", vintage_confirmed: false }, { ...result, wine_id: "wine-three", name: "Vino senza annata", vintage: "", status: "skipped", issue: "missing_vintage", vintage_confirmed: false, dimensions: {}, aromas: [], sources: [], summary: "", limitations: "", cost_usd: "0" }], created_at: "2026-10-07T08:00:00Z", updated_at: "2026-10-07T08:01:00Z" };

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
    await expect(page.getByRole("status")).toContainText("3/3");
    await expect(page.getByRole("status")).toContainText(it ? "1 saltato" : "1 skipped");
    await expect(page.getByText(it ? /Selezionati 3 vini da valutare, su un massimo di 10/ : /Selected 3 wines to review, with a maximum of 10/)).toBeVisible();
    const proposals = page.getByRole("article");
    await expect(proposals).toHaveCount(3);
    await expect(proposals.nth(1).getByRole("button")).toHaveCount(0);
    await expect(proposals.first()).toContainText(it ? "Annata richiesta: 2020" : "Requested vintage: 2020");
    await expect(proposals.nth(2)).toContainText(it ? "Mancante nella scheda vino" : "Missing from wine details");
    await expect(proposals.nth(2)).toContainText(it ? "Ricerca non eseguita" : "Research skipped");
    await expect(proposals.nth(2).getByRole("button")).toHaveCount(0);
    await proposals.first().getByText(it ? "Confronto e prove" : "Comparison and evidence", { exact: true }).click();
    await expect(proposals.first()).toContainText("0.4 → 0.8");
    const comparison = proposals.first().getByRole("table");
    await expect(comparison.getByRole("row", { name: it ? /Corpo/ : /body/ })).toContainText("+0.40");
    await expect(comparison.getByRole("row", { name: it ? /Legno/ : /wood/ })).toContainText("0.30");
    await expect(comparison.getByRole("row", { name: it ? /Legno/ : /wood/ })).toContainText("—");
    await expect(proposals.first()).toContainText(it ? "Interpretazione" : "Inferred");
    await expect(proposals.first()).toContainText(it ? "Fonti concordanti" : "Corroborated sources");
    await expect(proposals.first().getByRole("link", { name: it ? "Confronta fonte ↗" : "Compare source ↗" }).nth(1)).toHaveAttribute("href", "https://critic.example/review-2020");
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

for (const locale of ["it", "en"]) {
  test(`Sensory agent ${locale}: choose wines independently of the automatic sample`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await renderPanel(page, locale);
    let requested: unknown;
    await page.route("**/api/v1/taste-profile/admin/research-runs**", async route => {
      if (route.request().url().endsWith("/candidates")) {
        await route.fulfill({ json: [
          { id: "poggio", name: "Rosso di Montalcino", producer: "Poggio Landi", vintage: "2016" },
          { id: "frati", name: "I Frati", producer: "Cà dei Frati", vintage: "2020" },
          { id: "missing", name: "Senza annata", producer: "Test", vintage: "" },
        ] });
      } else if (route.request().method() === "POST") {
        requested = route.request().postDataJSON();
        await route.fulfill({ status: 202, json: { ...completed, selected_wines: 1, max_wines: 1 } });
      } else await route.fulfill({ json: [] });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sensory-agent-test");
    await page.getByLabel(it ? "Vini da analizzare" : "Wines to research", { exact: true }).selectOption("manual");
    const start = page.getByRole("button", { name: it ? "Avvia ricerca autonoma" : "Start autonomous research" });
    await expect(start).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: /Senza annata/ })).toBeDisabled();
    const filter = page.getByLabel(it ? "Cerca nome, produttore o annata" : "Search name, producer or vintage");
    await filter.fill("2020");
    await expect(page.getByRole("checkbox")).toHaveCount(1);
    await page.getByRole("checkbox", { name: /I Frati/ }).check();
    await filter.fill("");
    await expect(page.getByRole("checkbox", { name: /I Frati/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Rosso di Montalcino/ })).not.toBeChecked();
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const list = (await page.getByRole("group", { name: it ? "Scegli fino a 20 vini" : "Choose up to 20 wines" }).boundingBox())!;
      const button = (await start.boundingBox())!;
      expect(button.y).toBeGreaterThanOrEqual(list.y + list.height);
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`picker-${width}.png`), fullPage: true });
    }
    await start.click();
    expect(requested).toEqual({ max_wines: 1, budget_usd: "1", wine_ids: ["frati"] });
  });
}

test("Sensory agent compares validated previous profiles without offering an overwrite", async ({ page }, testInfo) => {
  await renderPanel(page, "it");
  await page.route("**/api/v1/taste-profile/admin/research-runs", route => route.fulfill({ json: [{ ...completed, results: [{ ...result, baseline_validated: true }] }] }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sensory-agent-test");
  const proposal = page.getByRole("article");
  await proposal.getByText("Confronto e prove", { exact: true }).click();
  await expect(proposal).toContainText("Profilo precedente: metadata · validato");
  await expect(proposal).toContainText("il profilo precedente manuale o validato resta conservato");
  await expect(proposal.getByRole("button", { name: "Usa questo profilo" })).toHaveCount(0);
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const table = (await proposal.getByRole("table").boundingBox())!;
    expect(table.x).toBeGreaterThanOrEqual(0);
    expect(table.x + table.width).toBeLessThanOrEqual(width);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`comparison-${width}.png`), fullPage: true });
  }
});
