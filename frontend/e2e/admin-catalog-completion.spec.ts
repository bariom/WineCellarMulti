import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

test("an app administrator completes catalog entries within a spending cap", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page, [], false, memberships, [wine], { ...session, locale: "it", is_app_admin: true });
  await page.addInitScript(() => {
    const original = window.fetch;
    const job = { id: "job-1", status: "running", stop_reason: "", total: 40, done: 10, completed: 8, not_found: 2, failed: 0, cost_usd: "1.20", budget_usd: "10", error: "", started_at: "2026-11-17T10:00:00Z" };
    let state: { incomplete_count: number; not_found_count: number; job: typeof job | null } = { incomplete_count: 1180, not_found_count: 12, job: null };
    window.fetch = async (input, init) => {
      const path = new URL(String(input), location.href).pathname;
      if (path.endsWith("/catalog-completion/cancel")) {
        state = { incomplete_count: 1170, not_found_count: 14, job: { ...job, status: "done", stop_reason: "cancelled" } };
        return Response.json(state);
      }
      if (path.endsWith("/catalog-completion")) {
        if (init?.method === "POST") {
          sessionStorage.setItem("completion-start", String(init.body));
          state = { ...state, job };
          return Response.json(state, { status: 202 });
        }
        return Response.json(state);
      }
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
  const panel = page.getByRole("region", { name: "Completa le schede del catalogo" });
  await expect(panel).toContainText("1180 schede da completare");
  await expect(panel).toContainText("12 già cercate senza esito");
  await expect(panel.getByLabel("Tetto di spesa (USD)")).toHaveValue("25");
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await panel.screenshot({ path: testInfo.outputPath(`catalog-completion-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByLabel("Schede per lotto").fill("40");
  await panel.getByLabel("Tetto di spesa (USD)").fill("10");
  page.once("dialog", dialog => dialog.accept());
  await panel.getByRole("button", { name: "Completa con AI" }).click();
  await expect(panel.getByRole("status")).toContainText("10 di 40 schede esaminate · 8 completate · 2 senza esito · costo $1.20 su $10.00");
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("completion-start") || "{}"))).toEqual({ limit: 40, budget_usd: 10, retry_not_found: false });
  await panel.screenshot({ path: testInfo.outputPath("catalog-completion-running.png") });
  await panel.getByRole("button", { name: "Interrompi" }).click();
  await expect(panel.getByRole("status")).toContainText("Lotto interrotto.");
  await expect(panel).toContainText("1170 schede da completare");
  await expect(panel.getByRole("button", { name: "Completa con AI" })).toBeEnabled();
});
