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
  test(`Complete inferred profile without accessible sources (${locale})`, async ({ page }, testInfo) => {
    await renderPanel(page, locale);
    const it = locale === "it";
    const keys = ["body", "acidity", "tannin", "sweetness", "aromatic_intensity", "fruit", "wood", "spice", "minerality"];
    const completeProfile = Object.fromEntries(keys.map(key => [key, {
      value: .5, origin: "ai_inference", confidence: 0, issue: "source_unreadable",
      rationale: "Expected style estimate; grape composition is an unverified assumption.",
      lower: .3, upper: .7, evidence: [], references: [],
    }]));
    const proposal = { ...result, prompt_version: "6", vintage_confirmed: false,
      complete_profile: completeProfile, dimensions: {}, comparisons: [], aromas: [], sources: [],
      coverage: { available: 9, total: 9, exact_vintage: 0, corroborated: 0, estimated: 9, inferred: 9, unknown: 0 },
      confidence: 0, summary: "Expected wine profile, inferred rather than verified.", limitations: "Vintage-specific characteristics are not verified." };
    let applied = false;
    await page.route("**/api/v1/taste-profile/admin/research-runs**", route => {
      if (route.request().url().endsWith("/apply")) {
        applied = true;
        return route.fulfill({ json: { ...completed, results: [{ ...proposal, status: "applied" }] } });
      }
      return route.fulfill({ json: [{ ...completed, selected_wines: 1, results: [proposal] }] });
    });
    await page.goto("/sensory-agent-test");
    const article = page.getByRole("article");
    await expect(article).toContainText(`${it ? "Completezza" : "Completeness"}: 9/9`);
    await expect(article).toContainText(it ? "9 tratti sono inferenze" : "9 traits are model inferences");
    await expect(article).not.toContainText(it ? "proposta non applicabile" : "proposal cannot be applied");
    await article.getByText(it ? "Confronto e prove" : "Comparison and evidence", { exact: true }).click();
    await expect(article.getByRole("table").getByRole("row")).toHaveCount(10);
    await expect(article).toContainText(it ? "Inferenza del modello" : "Model inference");
    await expect(article).toContainText(it ? "Intervallo plausibile: 0.30–0.70" : "Plausible range: 0.30–0.70");
    await article.getByText(it ? "Motivazione proposta dall'agente · non verificata" : "Agent rationale · unverified", { exact: true }).first().click();
    await expect(article.getByText("Expected style estimate; grape composition is an unverified assumption.", { exact: true }).first()).toBeVisible();
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const card = (await article.boundingBox())!;
      const table = (await article.getByRole("table").boundingBox())!;
      expect(table.x).toBeGreaterThanOrEqual(card.x);
      expect(table.x + table.width).toBeLessThanOrEqual(card.x + card.width + 1);
      const button = (await article.getByRole("button").boundingBox())!;
      expect(button.x + button.width).toBeLessThanOrEqual(width);
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`inference-${width}.png`), fullPage: true });
    }
    await article.getByRole("button", { name: it ? "Usa questo profilo" : "Apply this profile" }).click();
    await expect(article).toContainText(it ? "Profilo utilizzato" : "Profile applied");
    expect(applied).toBe(true);
  });
}

test("Ambiguous identity keeps complete estimates provisional", async ({ page }) => {
  await renderPanel(page, "it");
  const proposal = { ...result, prompt_version: "6", identity_ambiguous: true, status: "incomplete", issue: "ambiguous_identity", coverage: { available: 9, total: 9, inferred: 9, exact_vintage: 0, corroborated: 0, estimated: 9, unknown: 0 } };
  await page.route("**/api/v1/taste-profile/admin/research-runs", route => route.fulfill({ json: [{ ...completed, results: [proposal] }] }));
  await page.goto("/sensory-agent-test");
  await expect(page.getByRole("article")).toContainText("Identità del vino ambigua");
  await expect(page.getByRole("article")).not.toContainText("Il profilo è utilizzabile");
  await expect(page.getByRole("article")).toContainText("Il profilo resta provvisorio e non applicabile");
  await expect(page.getByRole("button", { name: "Usa questo profilo" })).toHaveCount(0);
});

for (const incomplete of [false, true]) {
  test(`Completed sensory profile: provenance and responsive review (${incomplete ? "conflict" : "complete"})`, async ({ page }, testInfo) => {
    await renderPanel(page, "it");
    const evidence = { scope: "exact_vintage", vintage: "2020", published_year: 2021,
      publisher: "Cantina di Test", role: "producer", excerpt: "Full-bodied with firm tannins.",
      source_url: "https://producer.example/technical-sheet-2020" };
    const keys = ["body", "acidity", "tannin", "sweetness", "aromatic_intensity", "fruit", "wood", "spice", "minerality"];
    const completeProfile = Object.fromEntries(keys.map((key, index) => [key, {
      value: incomplete && key === "tannin" ? null : index === 0 ? .8 : .42,
      origin: incomplete && key === "tannin" ? "unknown" : index === 0 ? "corroborated" : "similar_wines",
      confidence: index === 0 ? .8 : .35,
      issue: incomplete && key === "tannin" ? "conflicting_sources" : "",
      evidence: [evidence],
      references: index === 0 ? [] : [{ name: "Vino di riferimento", producer: "Produttore esterno", vintage: "2021", similarity: .65, value: .42, evidence, identity_evidence: evidence, production_evidence: [{ ...evidence, excerpt: "Target matured in French oak barrels" }, { ...evidence, excerpt: "Reference matured in French oak barrels" }] }],
    }]));
    const proposal = { ...result, prompt_version: "4", status: incomplete ? "incomplete" : "ready", complete_profile: completeProfile,
      coverage: { available: incomplete ? 8 : 9, total: 9, exact_vintage: 1, corroborated: 1, estimated: incomplete ? 7 : 8, unknown: incomplete ? 1 : 0 },
      warnings: incomplete ? ["tannin:conflicting_sources"] : [] };
    await page.route("**/api/v1/taste-profile/admin/research-runs", route => route.fulfill({ json: [{ ...completed, selected_wines: 1, results: [proposal] }] }));
    await page.goto("/sensory-agent-test");
    const article = page.getByRole("article");
    await expect(article).toContainText(`Completezza: ${incomplete ? 8 : 9}/9`);
    await article.getByText("Confronto e prove", { exact: true }).click();
    await expect(article).toContainText("Stima da vini simili");
    await expect(article).toContainText("Vino di riferimento");
    await article.getByText("Confronto dello stile produttivo", { exact: true }).first().click();
    await expect(article.getByText("Reference matured in French oak barrels", { exact: true }).first()).toBeVisible();
    const tannin = article.getByRole("table").getByRole("row", { name: /Tannini/ });
    await expect(tannin).toContainText(incomplete ? "—" : "0.42");
    if (incomplete) {
      await expect(article).toContainText("Fonti discordanti");
      await expect(article.getByRole("button", { name: "Usa questo profilo" })).toHaveCount(0);
    } else await expect(article.getByRole("button", { name: "Usa questo profilo" })).toBeVisible();
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const table = (await article.getByRole("table").boundingBox())!;
      const card = (await article.boundingBox())!;
      expect(table.x).toBeGreaterThanOrEqual(card.x);
      expect(table.x + table.width).toBeLessThanOrEqual(card.x + card.width + 1);
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`complete-${width}.png`), fullPage: true });
    }
  });
}

for (const sourceStatus of ["unavailable", "cloudflare_challenge"]) {
test(`Source diagnostics distinguish blocked retrieval and unmatched quotations (${sourceStatus})`, async ({ page }, testInfo) => {
  await renderPanel(page, "it");
  const proposal = { ...result, prompt_version: "5", status: "no_evidence", vintage_confirmed: false, confidence: 0, aromas: [],
    dimensions: {}, comparisons: [], complete_profile: { body: { value: null, origin: "unknown", confidence: 0, issue: "source_unreadable", evidence: [], references: [] } },
    source_checks: {
      "https://producer.example/technical-sheet-2020": { status: sourceStatus, content_type: "text/html", http_status: 403, matched_excerpts: 0, unmatched_excerpts: 1 },
      "https://critic.example/review-2020": { status: "readable", content_type: "application/pdf", http_status: 200, matched_excerpts: 2, unmatched_excerpts: 1 },
    }, sources: [...result.sources, { title: "Nota critica PDF", url: "https://critic.example/review-2020" }] };
  await page.route("**/api/v1/taste-profile/admin/research-runs", route => route.fulfill({ json: [{ ...completed, selected_wines: 1, results: [proposal] }] }));
  await page.goto("/sensory-agent-test");
  const article = page.getByRole("article");
  await expect(article).toContainText("HTTP 403");
  if (sourceStatus === "cloudflare_challenge") await expect(article).toContainText("Verifica anti-bot richiesta (Cloudflare)");
  await expect(article).toContainText("2 citazioni verificate, 1 non corrispondenti");
  await expect(article).toContainText("La sintesi dell'agente può descriverle");
  await article.getByText("Confronto e prove", { exact: true }).click();
  await expect(article).toContainText("Fonte non leggibile dal server");
  await expect(article.getByRole("button", { name: "Usa questo profilo" })).toHaveCount(0);
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`sources-${width}.png`), fullPage: true });
  }
});
}

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


for (const locale of ["it", "en"]) {
  test(`Checked report separates qualitative proof and blocked assumptions (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await renderPanel(page, locale);
    const evidence = { excerpt: "Notes of oak", source_url: "https://producer.example/2020", scope: "exact_vintage", vintage: "2020", published_year: null, publisher: "Producer", role: "producer" };
    const blocked = { ...evidence, excerpt: "Residual sugar 0.5 g/l", source_url: "https://critic.example/2020", publisher: "Critic", role: "critic" };
    const proposal = { ...result, prompt_version: "7", identity_confirmed: false, vintage_confirmed: false,
      confidence: 0, dimensions: {}, comparisons: [], aromas: [], sources: [{ url: blocked.source_url, title: "Blocked review" }],
      summary: it ? "Annata non confermata dalle verifiche del server." : "Vintage not confirmed by server verification.",
      agent_summary: "Identity and vintage confirmed; 100% Merlot.", agent_limitations: "Producer accessible.",
      coverage: { available: 9, total: 9, exact_vintage: 0, corroborated: 0, estimated: 9, inferred: 9, unknown: 0, qualitative: 1 },
      source_checks: { [evidence.source_url]: { status: "readable", matched_excerpts: 1, unmatched_excerpts: 0 }, [blocked.source_url]: { status: "cloudflare_challenge", http_status: 403, matched_excerpts: 0, unmatched_excerpts: 1 } },
      complete_profile: Object.fromEntries(["body", "acidity", "tannin", "sweetness", "aromatic_intensity", "fruit", "wood", "spice", "minerality"].map(key => [key, {
        value: .5, origin: "ai_inference", confidence: 0, issue: key === "wood" ? "unverified_excerpt" : "", rationale: "Expected style estimate with unverified analytical information.", lower: .3, upper: .7, references: [],
        evidence: key === "wood" ? [evidence] : [], unverified_evidence: key === "sweetness" ? [blocked] : [],
        inference_basis: key === "wood" ? "verified_description" : key === "sweetness" ? "unverified_source" : "model_knowledge",
      }])) };
    await page.route("**/api/v1/taste-profile/admin/research-runs**", route => route.fulfill({ json: [{ ...completed, selected_wines: 1, results: [proposal] }] }));
    await page.goto("/sensory-agent-test");
    const article = page.getByRole("article");
    await expect(article.getByText(proposal.summary, { exact: true })).toBeVisible();
    await expect(article.getByText(proposal.agent_summary, { exact: true })).not.toBeVisible();
    await expect(article).toContainText(it ? "1/9 tratti con descrizioni qualitative" : "1/9 traits with qualitative descriptions");
    await article.getByText(it ? "Confronto e prove" : "Comparison and evidence", { exact: true }).click();
    await expect(article.getByText(it ? "Stima da descrizioni qualitative verificate; intensità inferita." : "Estimate from verified qualitative descriptions; intensity inferred.", { exact: true })).toBeVisible();
    await expect(article.getByText(it ? "Citazione non verificabile sulla pagina della fonte" : "Quotation could not be verified on the source page", { exact: true })).toHaveCount(0);
    await expect(article.getByText(it ? "La descrizione non sostiene l'intensità" : "Description does not support intensity", { exact: true })).toBeVisible();
    await expect(article.getByText(it ? "Informazioni non verificate: non sono prove" : "Unverified information: not evidence", { exact: true })).toBeVisible();
    await expect(article.getByRole("link", { name: it ? "Apri fonte non verificata ↗" : "Open unverified source ↗" })).toHaveAttribute("href", blocked.source_url);
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const card = (await article.boundingBox())!;
      const table = (await article.getByRole("table").boundingBox())!;
      expect(table.x + table.width).toBeLessThanOrEqual(card.x + card.width + 1);
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`checked-report-${width}.png`), fullPage: true });
    }
    await article.getByText(it ? "Testo proposto dall'agente · non verificato" : "Agent draft text · unverified", { exact: true }).click();
    await expect(article.getByText(proposal.agent_summary, { exact: true })).toBeVisible();
  });
}


test("Coverage distinguishes source-backed style from model inference in saved reports", async ({ page }) => {
  await renderPanel(page, "en");
  const keys = ["body", "acidity", "tannin", "sweetness", "aromatic_intensity", "fruit", "wood", "spice", "minerality"];
  const proposal = { ...result, prompt_version: "7", coverage: { available: 9, total: 9, exact_vintage: 0, corroborated: 0, estimated: 9, inferred: 5, unknown: 0 },
    complete_profile: Object.fromEntries(keys.map((key, index) => [key, { value: .5, origin: index < 4 ? "wine_style" : "ai_inference", confidence: index < 4 ? .4 : 0, issue: "", rationale: "Expected style estimate.", evidence: [], references: [] }])) };
  await page.route("**/api/v1/taste-profile/admin/research-runs", route => route.fulfill({ json: [{ ...completed, results: [proposal] }] }));
  await page.goto("/sensory-agent-test");
  const article = page.getByRole("article");
  await expect(article).toContainText("Completeness: 9/9");
  await expect(article).toContainText("4 source-supported intensities");
  await expect(article).toContainText("5 model inferences");
  await expect(article).not.toContainText("9 estimated");
});
