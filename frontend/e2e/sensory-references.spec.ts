import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(new URL("../../backend/app/services/sensory_reference_seed.json", import.meta.url), "utf8"));

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
