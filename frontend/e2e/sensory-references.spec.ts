import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(new URL("../../backend/app/services/sensory_reference_seed.json", import.meta.url), "utf8"));

test("Single wine evidence review keeps numbers and displays conflict, context and missing evidence", async ({ page }, testInfo) => {
  await page.route("**/wine-review-test", route => route.fulfill({ contentType: "text/html", body: `
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
  const dossier = seed.wines.find((wine: {id: string}) => wine.id === "bibi-graetz-testamatta-2018");
  let requests = 0;
  const profile = { identity_id: "testamatta", name: "Testamatta", producer: "Bibi Graetz", vintage: "2018", dimensions: {body: .64}, validated: true, confidence: .72, source: "hybrid" };
  await page.route("**/api/v1/taste-profile/admin/**", route => {
    expect(route.request().method()).toBe("GET");
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/references/profiles/testamatta/proposal")) {
      return route.fulfill({ json: { identity_id: "testamatta", revision: "a".repeat(64), policy: "curated_review_v1", previously_approved: true, undo_history_id: null,
        choices: Object.entries(dossier.assessments).map(([dimension, assessment]) => ({ trait: { dimension, current_value: .64, ...(assessment as object) }, action: (assessment as {status: string}).status === "described" ? "retain" : "blocked", proposed_value: .64, lower: null, upper: null, advice: "Mantieni il valore e collega le prove, dopo averle esaminate." })) } });
    }
    if (path.endsWith("/references/profiles/testamatta")) {
      requests++;
      if (requests === 1) return route.fulfill({ status: 503, json: { detail: "Unavailable" } });
      const missing = requests > 2;
      const traits = Object.entries(dossier.assessments).map(([dimension, assessment]) => ({ dimension, current_value: dimension === "body" ? .64 : null, numerical_validation: "not_validated", ...(missing ? { status: "no_evidence", rationale: "Nessun riscontro documentato", evidence: [] } : assessment as object) }));
      return route.fulfill({ json: { ...profile, previously_approved: true, dossier: missing ? null : dossier, traits } });
    }
    return route.fulfill({ json: path.endsWith("/summary") ? { research_enabled: false, wines_with_profile: 1 } : path.endsWith("/profiles") ? [profile] : [] });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wine-review-test");
  await page.getByText("Profili vino (1)", { exact: true }).click();
  await page.getByRole("button", { name: "Esamina riscontri", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Impossibile caricare");
  await page.getByRole("button", { name: "Esamina riscontri", exact: true }).click();
  const review = page.getByRole("region", { name: "Revisione documentale", exact: true });
  await review.getByText("Consulta il dossier completo e i limiti delle fonti", { exact: true }).click();
  await expect(review.getByText("Descrizioni discordanti", { exact: true })).toBeVisible();
  await expect(review.getByText("Valore attuale: 0.64", { exact: false })).toBeVisible();
  await expect(review.getByText("Solo contesto: intensità non determinabile", { exact: true })).toHaveCount(3);
  await expect(review.getByRole("link").first()).toHaveAttribute("href", /^https:\/\/www.bibigraetz.com/);
  await review.getByText("Consulta il dossier completo e i limiti delle fonti", { exact: true }).click();
  await review.getByRole("button", { name: "Prepara proposta gratuita" }).click();
  await expect(review.getByRole("button", { name: "Applica selezione" })).toBeDisabled();
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const action = await page.getByRole("button", { name: "Chiudi riscontri" }).boundingBox();
    const content = await review.boundingBox();
    expect(action!.y + action!.height).toBeLessThanOrEqual(content!.y);
  }
  await review.screenshot({ path: testInfo.outputPath("wine-review-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await review.screenshot({ path: testInfo.outputPath("wine-review-mobile.png") });
  await page.getByRole("button", { name: "Chiudi riscontri" }).click();
  await page.getByRole("button", { name: "Esamina riscontri", exact: true }).click();
  await expect(review.getByText("Nessun dossier", { exact: false })).toBeVisible();
  await review.getByText("Consulta il dossier completo e i limiti delle fonti", { exact: true }).click();
  await expect(review.getByText("Nessun riscontro disponibile", { exact: true })).toHaveCount(9);
  await expect(review.getByText("Valore attuale: 0.64", { exact: false })).toBeVisible();
});

test("Documentary references import explicitly and retain historical approvals", async ({ page }, testInfo) => {
  await page.route("**/references-test", route => route.fulfill({ contentType: "text/html", body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const {default: React} = await import('/node_modules/.vite/deps/react.js');
    const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
    const {default: Panel} = await import('/src/components/SensoryReferencesPanel.tsx');
    await import('/src/styles.css');
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Panel, {locale:'it'}));
    </script></body></html>` }));
  let imports = 0;
  let stale = true;
  await page.route("**/api/v1/taste-profile/admin/references", route => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ revision: "a".repeat(64), ids: [seed.wines[0].id] });
      if (stale) { stale = false; return route.fulfill({ status: 409, json: { detail: "Anteprima scaduta" } }); }
      imports++;
    }
    return route.fulfill({ json: { revision: "a".repeat(64), profiles_to_review: 100, previously_approved_profiles: 90, excluded: seed.excluded,
      rows: seed.wines.map((dossier: unknown, i: number) => ({ dossier, status: i === 0 ? (imports ? "imported" : "matched") : i === 1 ? "conflict" : "new", existing_dimensions: i === 0 ? { body: .64 } : {}, previously_approved: i === 0, identity_id: null, review_status: "needs_evidence_review" })) } });
  });
  await page.goto("/references-test");
  await page.getByRole("button", { name: "Carica riferimenti e confronto" }).click();
  await expect(page.getByText("100 profili da rivalidare", { exact: false })).toBeVisible();
  const first = page.getByRole("article").first();
  await first.getByText("Dati, fonti e confronto", { exact: true }).click();
  await expect(first.getByText("Valore attuale: 0.64", { exact: false })).toBeVisible();
  await expect(page.getByRole("article").nth(1).getByRole("checkbox")).toHaveCount(0);
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const title = await first.getByRole("heading", { level: 5 }).boundingBox();
    const select = await first.getByRole("checkbox").boundingBox();
    expect(title!.y + title!.height).toBeLessThanOrEqual(select!.y);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("references-mobile.png"), fullPage: true });
  await first.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Importa selezionati (1)", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Operazione non completata");
  await page.getByRole("button", { name: "Carica riferimenti e confronto" }).click();
  await first.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Importa selezionati (1)", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Dossier importati");
  await expect(first.getByRole("checkbox")).toHaveCount(0);
  await expect(first.getByText("Valore attuale: 0.64", { exact: false })).toBeVisible();
  expect(imports).toBe(1);
});
