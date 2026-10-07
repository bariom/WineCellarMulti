import { test, expect } from "@playwright/test";

test("Optional Astra refinement opens evidence and protects validated profiles", async ({ page }, testInfo) => {
  await page.route("**/sensory-refinement-test", route => route.fulfill({ contentType: "text/html", body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const {default: React} = await import('/node_modules/.vite/deps/react.js');
    const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
    const {default: Panel} = await import('/src/components/AdminSensoryProfilesPanel.tsx');
    await import('/src/styles.css');
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Panel, {locale:'it'}));
    </script></body></html>` }));
  let researched = false;
  let saved = false;
  const original = { identity_id: "test", name: "Testamatta", producer: "Bibi Graetz", vintage: "2018", source: "metadata", confidence: .4, validated: false, dimensions: { body: .64, fruit: .67 }, generation_status: "available" };
  const refined = { ...original, dimensions: { body: .68, fruit: .67 }, model: "gpt-6-astra", estimated_cost_usd: ".12", provenance: { body: { value: .68, lower: .55, upper: .8, calculation_method: "contextual_research_v1", rationale: "Stima contestuale del peso al palato, con incertezza esplicita.", evidence: [{ excerpt: "Full-bodied with bright acidity", source_url: "https://producer.example/testamatta-2018", publisher: "Produttore" }] } } };
  await page.route("**/api/v1/taste-profile/admin/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    expect(path).not.toContain("research-runs");
    if (path.endsWith("/refine")) {
      researched = true;
      return route.fulfill({ json: refined });
    }
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON().validated === true;
      return route.fulfill({ json: refined });
    }
    const matching = [researched ? refined : original, { ...original, identity_id: "protected", name: "Profilo validato", validated: true }];
    const profiles = url.searchParams.get("search") === "Testamatta" ? matching
      : url.searchParams.get("offset") === "30" ? [{ ...original, identity_id: "last", name: "Vino oltre i primi trenta" }]
      : [...matching, ...Array.from({ length: 29 }, (_, i) => ({ ...original, identity_id: `wine-${i}`, name: `Vino ${i}` }))];
    return route.fulfill({ json: path.endsWith("/summary") ? { wines_with_profile: 31 } : path.endsWith("/profiles") ? profiles : [] });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sensory-refinement-test");
  await page.getByText("Profili vino (30)", { exact: true }).click();
  await page.getByRole("button", { name: "Successivi", exact: true }).click();
  await expect(page.getByText(/Vino oltre i primi trenta/)).toBeVisible();
  await expect(page.getByText("Pagina 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Successivi", exact: true })).toBeDisabled();
  await page.getByLabel("Cerca vino, produttore o annata").fill("Testamatta");
  await page.getByLabel("Cerca vino, produttore o annata").press("Enter");
  await expect(page.getByText("Pagina 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Profili vino (2)", { exact: true })).toBeVisible();
  const buttons = page.getByRole("button", { name: "Approfondisci con Astra", exact: true });
  await expect(buttons.nth(1)).toBeDisabled();
  await buttons.first().click();
  await expect(page.getByRole("status")).toContainText("gpt-6-astra");
  await page.getByText(/Corpo · Stima da ricerca/).click();
  await expect(page.getByText("Intervallo interpretativo, non una misura di accuratezza.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Produttore/ })).toHaveAttribute("href", "https://producer.example/testamatta-2018");
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    for (const button of await buttons.all()) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    if (width === 390) await page.screenshot({ path: testInfo.outputPath("astra-profile-mobile.png"), fullPage: true });
  }
  await page.getByLabel("Validato", { exact: true }).check();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  expect(saved).toBeTruthy();
});

test("AI actions send opt-in and show single-wine errors", async ({ page }) => {
  await page.route("**/sensory-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {default: Panel} = await import('/src/components/AdminSensoryProfilesPanel.tsx');
      await import('/src/styles.css');
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Panel, {locale:'it'}));
    </script></body></html>`,
  }));
  let single = false;
  let batch = false;
  let approved = false;
  await page.route("**/api/v1/taste-profile/admin/**", async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.endsWith("/summary")) body = { wines_with_profile: 0, wines_without_profile: 1 };
    else if (url.pathname.endsWith("/regenerate")) {
      single = url.searchParams.get("allow_ai") === "true";
      await route.fulfill({ status: 503, json: { detail: "AI temporaneamente non disponibile" } });
      return;
    } else if (url.pathname.endsWith("/approve-pending")) {
      approved = true;
      body = { approved: 1 };
    } else if (url.pathname.endsWith("/enrich-missing")) {
      batch = route.request().postDataJSON().allow_ai === true;
      body = { processed: 1, resolved: 1, ai_generated: 1, skipped: 0 };
    } else if (url.pathname.endsWith("/profiles")) body = [{ identity_id: "test", name: "Amarone Classico", producer: "Villa Verona", vintage: "2019", source: "missing", confidence: 0, validated: false, dimensions: {}, generation_status: "pending" }];
    await route.fulfill({ json: body });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sensory-test");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Approva tutti da validare" }).click();
  await expect(page.getByText("Approvazione completata", { exact: true })).toBeVisible();
  expect(approved).toBe(true);
  await page.getByText("Profili vino (1)", { exact: true }).click();
  await page.getByRole("button", { name: "Genera profilo con AI", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("AI temporaneamente non disponibile");
  expect(single).toBe(true);
  await page.getByRole("button", { name: "Genera mancanti con AI" }).click();
  await expect(page.getByText("Generazione completata", { exact: true })).toBeVisible();
  expect(batch).toBe(true);
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
