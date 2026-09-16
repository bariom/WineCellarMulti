import { expect, test } from "@playwright/test";

test("taste preferences use an individual scale and expandable wine styles", async ({ page }) => {
  await page.route("**/taste-profile-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {default: Panel} = await import('/src/components/TasteProfilePanel.tsx');
      await import('/src/styles.css');
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Panel, {locale:'it', variant:'insight', wines:[{rating:4}, {rating:0}], isAppAdmin:true}));
    </script></body></html>`,
  }));
  const profile = (category: string, sampleCount: number) => ({
    category,
    dimensions: { body: { preference: .7, confidence: .5, samples: sampleCount }, tannin: { preference: .46, confidence: .5, samples: sampleCount } },
    attributes: { preferred_regions: [["Toscana", .8]] },
    confidence: .5,
    sample_count: sampleCount,
    tasting_count: sampleCount,
    star_rating_count: 3,
    confidence_level: "probable",
  });
  const white = profile("white", 5);
  white.dimensions.tannin.preference = .40;
  await page.route("**/api/v1/taste-profile/me**", route => route.fulfill({ json: {
    profiles: [profile("global", 16), profile("red", 8), white],
    evidence: { tasting_rating_count: 16, enjoyment_only_count: 0, direct_rating_count: 3, unique_wine_count: 14, sensory_covered_count: 19, sensory_missing_count: 0 },
  } }));
  await page.route("**/api/v1/taste-profile/me/algorithm-diagnostics", route => route.fulfill({ json: {
    mode: "shadow",
    active_version: 2,
    candidate_version: 3,
    categories: [{
      category: "global",
      sample_count: 16,
      v2_version: 2,
      v2_confidence: .5,
      v3_version: 3,
      v3_confidence: .42,
      rebuilt_at: "2026-09-15T12:00:00Z",
      dimensions: [{ dimension: "body", v2_preference: .6, v2_confidence: .5, v3_preference: .72, v3_confidence: .42, delta: .12 }],
    }],
  } }));
  await page.route("**/api/v1/map-config", route => route.fulfill({ json: {} }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/taste-profile-test");
  await expect(page.locator(".taste-profile-hero-copy small")).toContainText("I valori non sono percentuali da sommare.");
  await expect(page.locator(".taste-profile-evidence-summary > div").nth(1).locator("strong")).toHaveText("3");
  await expect(page.locator(".taste-profile-evidence-summary > div").first().locator("strong")).toHaveText("14");
  await expect(page.locator(".taste-profile-evidence-summary")).toContainText("copertura 100%");
  await expect(page.locator(".taste-profile-hero-metrics")).toContainText("70/100");
  await expect(page.locator(".taste-profile-sensory-groups")).toContainText("Struttura");
  const red = page.locator(".taste-profile-category").filter({ hasText: "Rossi" });
  await expect(red).toHaveAttribute("open", "");
  await red.locator("summary").click();
  await expect(red).not.toHaveAttribute("open", "");
  await red.locator("summary").click();
  await expect(red).toHaveAttribute("open", "");
  await expect(red.getByText("8 esperienze")).toBeVisible();
  await expect(red.getByText(/Nessuno scostamento abbastanza solido/)).toBeVisible();
  await page.getByRole("button", { name: "Tutti gli indicatori" }).click();
  await expect(red.locator(".sensory-signature-row")).toHaveCount(2);
  const whiteCategory = page.locator(".taste-profile-category").filter({ hasText: "Bianchi" });
  await whiteCategory.locator("summary").click();
  await page.getByRole("button", { name: "Differenze", exact: true }).click();
  await expect(whiteCategory.locator(".sensory-signature-row")).toHaveCount(1);
  await expect(whiteCategory.getByText("Profilo generale", { exact: true })).toBeVisible();
  await expect(whiteCategory.getByText("Δ -6", { exact: true })).toBeVisible();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("Come Vinaris ha costruito questo profilo", { exact: true }).click();
  await page.getByRole("button", { name: "Mostra confronto", exact: true }).click();
  const diagnostics = page.getByLabel("Diagnostica algoritmo gusto");
  await expect(diagnostics.getByText("Confronto algoritmo V2/V3", { exact: true })).toBeVisible();
  await expect(diagnostics.getByText("Il V2 resta attivo. Il V3 è solo osservato e non modifica affinità o suggerimenti.", { exact: true })).toBeVisible();
  await expect(diagnostics.getByText("+12", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("external tasting enrichment reports profile and catalog outcomes separately", async ({ page }) => {
  await page.route("**/taste-profile-enrichment-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {default: Panel} = await import('/src/components/TasteProfilePanel.tsx');
      await import('/src/styles.css');
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Panel, {locale:'it', variant:'insight', wines:[]}));
    </script></body></html>`,
  }));
  const profiles = { profiles: [] };
  const tasting = { id: "tasting-nv-1", name: "Réflexion Brut Balthazar", producer: "Lallier", vintage: "", type: "Sparkling", region: "Champagne", appellation: "Champagne" };
  await page.route("**/api/v1/taste-profile/me", route => route.fulfill({ json: profiles }));
  await page.route("**/api/v1/taste-profile/me/legacy-tastings", route => route.fulfill({ json: { unassigned_count: 0 } }));
  await page.route("**/api/v1/taste-profile/me/external-tastings/enrichment-preview", route => route.fulfill({ json: { missing_count: 1, items: [tasting] } }));
  await page.route("**/api/v1/taste-profile/me/external-tastings/enrich", route => route.fulfill({ json: {
    ...profiles,
    processed_count: 1,
    enriched_count: 1,
    unresolved_count: 0,
    catalog_pending_count: 1,
    catalog_existing_count: 0,
    results: [{ id: tasting.id, name: tasting.name, profile_status: "available", catalog_status: "pending", issue: "" }],
    estimated_cost_usd: "0.0042",
  } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/taste-profile-enrichment-test");
  await expect(page.getByText("Lallier · Réflexion Brut Balthazar")).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Completa 1 degustazioni con AI" }).click();

  const outcome = page.getByRole("status");
  await expect(outcome).toContainText("1 profilo sensoriale aggiunto");
  await expect(outcome).toContainText("Catalogo centrale: 1 da approvare, 0 già presenti, 0 non proposti");
  await expect(outcome).toContainText("Costo AI: $0.0042");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
