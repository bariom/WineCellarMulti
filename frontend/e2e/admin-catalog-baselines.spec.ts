import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

test("an app administrator widens the taste baselines of the catalog and refreshes the profiles", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page, [], false, memberships, [wine], { ...session, locale: "it", is_app_admin: true });
  await page.addInitScript(() => {
    const original = window.fetch;
    const dimensions = { body: 0.6, acidity: 0.74, tannin: 0.62, sweetness: 0.05, aromatic_intensity: 0.7, fruit: 0.66, wood: 0.3, spice: 0.5, minerality: 0.72 };
    const proposal = (id: string, entity_type: string, entity_key: string, wines: number) => ({ id, entity_type, entity_key, dimensions, confidence: 0.6, wines });
    const job = { id: "job-1", status: "done", stop_reason: "finished", total: 3, done: 3, created: 2, unknown: 1, failed: 0, cost_usd: "0.006", budget_usd: "2", error: "", started_at: "2026-11-17T10:00:00Z" };
    let missing = [
      { entity_type: "appellation", label: "Etna DOC", wines: 14 },
      { entity_type: "grape", label: "Nerello Cappuccio di Lunga Denominazione", wines: 9 },
      { entity_type: "grape", label: "Carricante", wines: 6 },
    ];
    let proposals = [] as ReturnType<typeof proposal>[];
    let specific = 310;
    let started = false;
    const state = () => ({ entries: 1227, specific, generic: 1227 - specific - 17, without: 17, missing_count: missing.length, missing, proposal_count: proposals.length, proposals, job: started ? job : null });
    window.fetch = async (input, init) => {
      const path = new URL(String(input), location.href).pathname;
      if (path.includes("/catalog-baselines")) {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        const changes = [
          { name: "Etna Rosso Contrada Lunga dal Nome Esteso", producer: "Vigne Nuove", vintage: "2019", before: { ...dimensions, body: 0.52, tannin: 0.4, minerality: 0.3 }, after: dimensions, source_before: "metadata", source_after: "hybrid", confidence_before: 0.35, confidence_after: 0.58 },
          { name: "Rovo Alto", producer: "Terre Alte", vintage: "2021", before: { ...dimensions, acidity: 0.6 }, after: dimensions, source_before: "grape", source_after: "hybrid", confidence_before: 0.5, confidence_after: 0.6 },
        ];
        if (path.endsWith("/recalculation")) return Response.json({ checked: 240, updated: 38, changes });
        if (path.endsWith("/recalculate")) return Response.json({ checked: 240, updated: 38, changes });
        if (path.endsWith("/approve") || path.endsWith("/discard")) {
          sessionStorage.setItem(path.endsWith("/approve") ? "baselines-approve" : "baselines-discard", JSON.stringify(body));
          proposals = proposals.filter((item) => !body.ids.includes(item.id));
          if (path.endsWith("/approve")) specific += 14;
        } else if (init?.method === "POST") {
          sessionStorage.setItem("baselines-start", JSON.stringify(body));
          started = true;
          missing = [];
          proposals = [proposal("b1", "appellation", "etna doc", 14), proposal("b2", "grape", "carricante", 6)];
          return Response.json(state(), { status: 202 });
        }
        return Response.json(state());
      }
      if (path.includes("/catalog-expansion")) return Response.json({ pending_count: 0, pending: [], job: null });
      if (path.endsWith("/catalog-completion")) return Response.json({ incomplete_count: 0, not_found_count: 0, job: null });
      if (path.endsWith("/admin/operations/overview")) return Response.json(null);
      if (path.endsWith("/admin/operations/vineyards")) return Response.json({ located: 0, pending: 0, not_found: 0, filtered: 0, candidates: [], precision_counts: {} });
      if (path.endsWith("/admin/operations/ai-pricing")) return Response.json({ price_book: {}, ai_pack_markup_percent: "15", free_tier_ai_pack_markup_percent: "100", updated_at: null });
      if (path.endsWith("/wine-pulse/status")) return Response.json({ published: 0, latest_run: null, sources: [], next_cycle: null });
      if (path.endsWith("/taste-profile/admin/summary")) return Response.json({ wines_with_profile: 0, wines_without_profile: 1 });
      if (path.endsWith("/wines/catalog/admin")) return Response.json([]);
      return original(input, init);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  await page.getByRole("tab", { name: "Operatività", exact: true }).click();
  await page.getByRole("button", { name: /Catalogo vini/ }).click();
  await page.getByText("Cerca e gestisci le schede", { exact: true }).click();
  const panel = page.getByRole("region", { name: "Profili gustativi del catalogo" });
  await expect(panel).toContainText("310 con profilo da denominazione o vitigni");
  await expect(panel).toContainText("900 solo dal tipo di vino");
  await expect(panel).toContainText("17 senza profilo");
  await expect(panel.getByLabel("Tetto di spesa (USD)")).toHaveValue("5");
  await panel.getByText("3 denominazioni e vitigni senza riferimento").click();
  await expect(panel).toContainText("denominazione · 14 vini");
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await panel.screenshot({ path: testInfo.outputPath(`catalog-baselines-missing-${width}.png`) });
  }
  await panel.getByLabel("Riferimenti per lotto").fill("3");
  await panel.getByLabel("Tetto di spesa (USD)").fill("2");
  page.once("dialog", dialog => dialog.accept());
  await panel.getByRole("button", { name: "Proponi i riferimenti con AI" }).click();
  await expect(panel.getByRole("status").first()).toContainText("Lotto completato. 3 di 3 esaminati · 2 proposti · 1 non riconosciuti · costo $0.006 su $2.00.");
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("baselines-start") || "{}"))).toEqual({ limit: 3, budget_usd: 2 });
  await expect(panel).toContainText("2 riferimenti proposti da attivare");
  await expect(panel).toContainText("Ogni denominazione e vitigno del catalogo ha un riferimento o una proposta.");
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await panel.screenshot({ path: testInfo.outputPath(`catalog-baselines-proposals-${width}.png`) });
  }
  await panel.getByRole("button", { name: "Scarta carricante" }).click();
  await expect(panel).toContainText("1 riferimenti proposti da attivare");
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("baselines-discard") || "{}"))).toEqual({ ids: ["b2"] });
  page.once("dialog", dialog => dialog.accept());
  await panel.getByRole("button", { name: "Attiva tutti (1)" }).click();
  await expect(panel).not.toContainText("riferimenti proposti da attivare");
  await expect(panel).toContainText("324 con profilo da denominazione o vitigni");
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("baselines-approve") || "{}"))).toEqual({ ids: ["b1"] });
  // Existing profiles are compared before anything is saved.
  await panel.getByRole("button", { name: "Confronta prima e dopo" }).click();
  const comparison = panel.getByRole("group", { name: "Confronto dei profili" });
  await expect(comparison).toContainText("38 profili cambierebbero su 240 stimati. Qui i 2 che cambiano di più.");
  await expect(comparison).toContainText("Vigne Nuove · affidabilità 35 → 58");
  await expect(comparison.getByRole("listitem").first().getByRole("term")).toHaveText(["Corpo", "Tannino", "Mineralità"]);
  await expect(comparison.getByRole("listitem").first()).toContainText("52 → 60");
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await comparison.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await comparison.screenshot({ path: testInfo.outputPath(`catalog-baselines-comparison-${width}.png`) });
  }
  page.once("dialog", dialog => dialog.accept());
  await panel.getByRole("button", { name: "Aggiorna 38 profili" }).click();
  await expect(comparison).toHaveCount(0);
  await expect(panel).toContainText("38 profili aggiornati su 240 stimati.");
});
