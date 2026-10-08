import { test, expect } from "@playwright/test";

test("Guided review requires selection and acknowledgement and supports stale reload and undo", async ({ page }, testInfo) => {
  await page.route("**/workflow-test", route => route.fulfill({ contentType: "text/html", body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const {default: React} = await import('/node_modules/.vite/deps/react.js');
    const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
    const {default: Panel} = await import('/src/components/SensoryReviewWorkflow.tsx');
    await import('/src/styles.css');
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Panel, {identityId:'wine',locale:'it'}));
    </script></body></html>` }));
  let saved = false;
  let stale = true;
  const trait = (dimension: string, value: number, status = "described") => ({ dimension, current_value: value, status, numerical_validation: "not_validated", rationale: "Descrizione qualitativa da valutare.", evidence: [{ source_url: "https://example.com/wine", publisher: "Produttore", summary: "Acidità vivace", note_date: null }] });
  const response = () => ({ identity_id: "wine", revision: saved ? "b".repeat(64) : "a".repeat(64), policy: "curated_review_v1", previously_approved: !saved, undo_history_id: saved ? "history" : null, choices: [
    { trait: trait("acidity", saved ? .55 : .2), action: saved ? "recorded" : "adjust", proposed_value: .55, lower: .55, upper: .85, advice: "Valore fuori intervallo: valuta la proposta." },
    { trait: trait("fruit", .672), action: "retain", proposed_value: .672, lower: null, upper: null, advice: "Mantieni e collega le prove." },
    { trait: trait("body", .644, "conflicting"), action: "blocked", proposed_value: .644, lower: null, upper: null, advice: "Fonti discordanti: approfondisci." },
  ] });
  await page.route("**/api/v1/taste-profile/admin/references/profiles/wine/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/apply")) {
      expect(route.request().postDataJSON()).toEqual({ revision: "a".repeat(64), dimensions: ["acidity"], acknowledged: true });
      if (stale) { stale = false; return route.fulfill({ status: 409, json: { detail: "Stale" } }); }
      saved = true;
      return route.fulfill({ json: { proposal: response(), history_id: "history" } });
    }
    if (path.endsWith("/undo/history")) {
      expect(route.request().postDataJSON()).toEqual({ revision: "b".repeat(64) });
      saved = false;
    }
    return route.fulfill({ json: response() });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workflow-test");
  await page.getByRole("button", { name: "Prepara proposta gratuita" }).click();
  const apply = page.getByRole("button", { name: "Applica selezione" });
  await expect(apply).toBeDisabled();
  const acid = page.getByRole("checkbox", { name: "Approva correzione proposta: Acidità" });
  const ack = page.getByRole("checkbox", { name: /Ho esaminato le prove/ });
  await acid.check();
  await expect(apply).toBeDisabled();
  await ack.check();
  await expect(page.getByText("1 caratteristiche selezionate: 1 valori cambiano", { exact: false })).toBeVisible();
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const box = await apply.boundingBox();
    const confirmation = await ack.boundingBox();
    expect(confirmation!.y + confirmation!.height).toBeLessThanOrEqual(box!.y);
  }
  await page.screenshot({ path: testInfo.outputPath("workflow-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("workflow-mobile.png"), fullPage: true });
  await apply.click();
  await expect(page.getByRole("alert")).toContainText("Ricarica la proposta");
  await expect(apply).toBeDisabled();
  await page.getByRole("button", { name: "Ricarica proposta" }).click();
  await acid.check(); await ack.check(); await apply.click();
  await expect(page.getByRole("status")).toContainText("Prove collegate");
  await page.getByRole("button", { name: "Annulla ultima applicazione" }).click();
  await expect(page.getByRole("alert")).toContainText("Versione precedente ripristinata");
  expect(saved).toBe(false);
});
