import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

test("an app administrator researches an area's producers and approves the proposed wines", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page, [], false, memberships, [wine], { ...session, locale: "it", is_app_admin: true });
  await page.addInitScript(() => {
    const original = window.fetch;
    const proposal = (id: string, name: string, producer: string) => ({ id, name, producer, appellation: "Etna DOC", region: "Sicilia", country: "Italia", type: "Red", grapes_text: "Nerello Mascalese, Nerello Cappuccio", description: "", source_url: "https://example.test/vini" });
    const job = { id: "job-1", status: "done", stage: "done", stop_reason: "finished", producers_total: 2, producers_done: 2, producers_not_found: ["Cantina Ignota"], created: 3, existing: 1, unsupported: 1, cost_usd: "0.42", budget_usd: "5", error: "", started_at: "2026-11-17T10:00:00Z" };
    let pending = [] as ReturnType<typeof proposal>[];
    let started = false;
    const state = () => ({ pending_count: pending.length, pending, job: started ? job : null });
    window.fetch = async (input, init) => {
      const path = new URL(String(input), location.href).pathname;
      if (path.includes("/catalog-expansion")) {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        if (path.endsWith("/approve") || path.endsWith("/discard")) {
          sessionStorage.setItem(path.endsWith("/approve") ? "expansion-approve" : "expansion-discard", JSON.stringify(body));
          pending = pending.filter((item) => !body.ids.includes(item.id));
        } else if (init?.method === "POST") {
          sessionStorage.setItem("expansion-start", JSON.stringify(body));
          started = true;
          pending = [proposal("p1", "Etna Rosso Contrada Lunga dal Nome Esteso", "Vigne Nuove"), proposal("p2", "Etna Bianco", "Vigne Nuove"), proposal("p3", "Rovo Alto", "Terre Alte")];
          return Response.json(state(), { status: 202 });
        }
        return Response.json(state());
      }
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
  const panel = page.getByRole("region", { name: "Aggiungi vini al catalogo" });
  await expect(panel.getByLabel("Paese")).toHaveValue("Italia");
  await expect(panel.getByLabel("Tetto di spesa (USD)")).toHaveValue("25");
  // Without an area there is nothing to search.
  await panel.getByRole("button", { name: "Cerca i vini con AI" }).click();
  await expect(panel.getByRole("alert")).toContainText("Indica una zona");
  await panel.getByLabel("Zona o denominazione").fill("Etna");
  await panel.getByLabel("Produttori da cercare").fill("2");
  await panel.getByLabel("Tetto di spesa (USD)").fill("5");
  page.once("dialog", dialog => dialog.accept());
  await panel.getByRole("button", { name: "Cerca i vini con AI" }).click();
  await expect(panel.getByRole("status")).toContainText("Ricerca completata. 2 di 2 produttori · 3 vini nuovi · 1 già nel catalogo · 1 scartati perché senza fonte · costo $0.42 su $5.00.");
  await expect(panel.getByRole("status")).toContainText("Nessun vino trovato per: Cantina Ignota.");
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("expansion-start") || "{}"))).toEqual({ area: "Etna", country: "Italia", producer_count: 2, budget_usd: 5 });
  await expect(panel).toContainText("3 vini proposti da approvare");
  await panel.getByText("Vigne Nuove", { exact: true }).click();
  await expect(panel).toContainText("Nerello Mascalese, Nerello Cappuccio");
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await panel.screenshot({ path: testInfo.outputPath(`catalog-expansion-${width}.png`) });
  }
  await panel.getByRole("button", { name: "Scarta Etna Bianco" }).click();
  await expect(panel).toContainText("2 vini proposti da approvare");
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("expansion-discard") || "{}"))).toEqual({ ids: ["p2"] });
  page.once("dialog", dialog => dialog.accept());
  await panel.getByRole("button", { name: "Approva tutti (2)" }).click();
  await expect(panel).not.toContainText("vini proposti da approvare");
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("expansion-approve") || "{}"))).toEqual({ ids: ["p1", "p3"] });
  // A list of named producers is sent as written, one per line.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.getByRole("button", { name: "Elenco produttori" }).click();
  await panel.getByLabel("Produttori, uno per riga").fill("Giacomo Conterno\n\n Domaine Leflaive ");
  page.once("dialog", dialog => dialog.accept());
  await panel.getByRole("button", { name: "Cerca i vini con AI" }).click();
  await expect.poll(async () => JSON.parse(await page.evaluate(() => sessionStorage.getItem("expansion-start") || "{}"))).toEqual({ producers: ["Giacomo Conterno", "Domaine Leflaive"], country: "Italia", budget_usd: 5 });
});
