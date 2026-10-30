import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

const wines = [
  { ...wine, id: "wine-batch-1", name: "Chateau Cos d'Estournel", vintage: "2025", price: "100", current_value: null, currency: "CHF" },
  { ...wine, id: "wine-batch-2", name: "Chateau Phelan Segur", vintage: "2025", price: "40", current_value: null, currency: "CHF" },
  { ...wine, id: "wine-batch-3", name: "Château Pontet-Canet", vintage: "2025", price: "75", current_value: null, currency: "CHF" },
];

async function setup(page: Page, batch = wines, holdAll = false) {
  await mockApi(page, [], true, memberships, batch, { ...session, locale: "it", has_active_entitlement: true, is_free_tier: false, theme_preference: "light" });
  await page.addInitScript(({ wines, holdAll }) => {
    const previous = window.fetch;
    const audit: unknown[] = [{ id: "old-entry", entity_type: "wine", entity_id: "wine-batch-1", feature: "ai_value", model: "gpt-5.4", outcome: "success", summary: "", sources: [], estimated_cost_usd: "0.5", created_at: "2026-01-01T00:00:00Z" }];
    const prices: Record<string, number> = { "wine-batch-1": 112, "wine-batch-2": 44 };
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      if (url.pathname === "/api/v1/ai/audit") return Response.json(audit);
      if (url.pathname === "/api/v1/ai/settings" && !init?.method) {
        const response = await previous(input, init);
        return Response.json({ ...await response.json(), value_model: "gpt-5.4" });
      }
      const match = url.pathname.match(/^\/api\/v1\/ai\/wines\/([^/]+)\/value$/);
      if (!match) return previous(input, init);
      const id = match[1];
      // The second wine waits until the test has looked at the report mid-run.
      if (id === "wine-batch-2" || holdAll) while (!(window as unknown as { releaseSecond?: boolean }).releaseSecond) await new Promise((resolve) => setTimeout(resolve, 50));
      audit.unshift({
        id: `entry-${id}`, entity_type: "wine", entity_id: id, feature: "ai_value", model: "gpt-5.4", outcome: "success", summary: "",
        sources: prices[id] ? [{ kind: "market_source", merchant: "Enoteca Test", country: "CH", currency: "CHF", price: prices[id], url: "https://example.com/wine" }] : [],
        estimated_cost_usd: "0.0125", created_at: new Date().toISOString(),
      });
      if (!prices[id]) return Response.json({ detail: "No verified live market price sources found" }, { status: 404 });
      const original = wines.find((item) => item.id === id)!;
      return Response.json({ ...original, current_value: String(prices[id]) });
    };
  }, { wines: batch, holdAll });
}

async function openDataQuality(page: Page) {
  await page.goto("/");
  await page.locator(".dashboard-analysis-switcher > summary").click();
  await page.getByRole("tab", { name: "Qualità dati", exact: true }).click();
  return page.locator(".dq-check").filter({ hasText: "Valore" }).first();
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`the value batch reports each wine as it arrives at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setup(page);
    const check = await openDataQuality(page);
    await check.getByRole("button", { name: /Completa con AI \(3\)/ }).click();

    const report = page.getByRole("dialog", { name: "Valore" });
    await expect(report).toBeVisible();
    const rows = report.locator(".batch-ai-report-rows > li");
    // The wines run side by side: the quick ones are readable while the slow one is still running.
    await expect(rows.nth(0)).toHaveClass(/is-done/);
    await expect(rows.nth(0)).toContainText("CHF 112");
    await expect(rows.nth(0)).toContainText("+12.0% sul prezzo d'acquisto");
    await expect(rows.nth(1)).toHaveClass(/is-running/);
    await expect(rows.nth(2)).toHaveClass(/is-no_result/);
    await expect(report.getByRole("status")).toContainText("2/3");
    await expect(report.getByRole("status")).toContainText("Sto elaborando Chateau Phelan Segur");
    // Only this run's audit entries count toward the cost.
    await expect(report.locator(".batch-ai-report-stats")).toContainText("$0.0250");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`batch-report-running-${viewport.width}.png`) });

    // The same report as for a single wine opens on top, with its sources.
    await rows.nth(0).getByRole("button", { name: "Dettagli" }).click();
    await expect(page.locator(".market-modal-card")).toContainText("Enoteca Test");
    await page.locator(".market-modal-card").getByRole("button", { name: "Chiudi" }).click();

    // Folded into a chip, the app stays usable and the chip tracks the run.
    await report.getByRole("button", { name: "Riduci" }).click();
    await expect(report).toHaveCount(0);
    const chip = page.getByRole("button", { name: /Mostra il resoconto: Valore, 2 di 3/ });
    await expect(chip).toBeVisible();
    await page.evaluate(() => { (window as unknown as { releaseSecond: boolean }).releaseSecond = true; });
    await expect(page.getByRole("button", { name: /Mostra il resoconto: Valore, 3 di 3/ })).toBeVisible();
    await page.getByRole("button", { name: /Mostra il resoconto/ }).click();

    await expect(report.getByText("Arricchimento AI completato")).toBeVisible();
    await expect(rows.nth(1)).toContainText("CHF 44");
    await expect(rows.nth(2)).toHaveClass(/is-no_result/);
    await expect(rows.nth(2)).toContainText("Nessun prezzo verificato");
    await expect(report.locator(".batch-ai-report-stats")).toContainText("$0.0375");
    await page.screenshot({ path: test.info().outputPath(`batch-report-done-${viewport.width}.png`) });
    await report.getByRole("button", { name: "Fatto" }).click();
    await expect(report).toHaveCount(0);
  });
}

test("the batch runs three wines at a time and stops after those in progress", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const five = [
    ...wines,
    { ...wine, id: "wine-batch-4", name: "Chateau Lynch-Bages", vintage: "2025", price: "90", current_value: null, currency: "CHF" },
    { ...wine, id: "wine-batch-5", name: "Chateau Talbot", vintage: "2025", price: "50", current_value: null, currency: "CHF" },
  ];
  await setup(page, five, true);
  const check = await openDataQuality(page);
  await check.getByRole("button", { name: /Completa con AI \(5\)/ }).click();
  const report = page.getByRole("dialog", { name: "Valore" });
  const rows = report.locator(".batch-ai-report-rows > li");
  for (const index of [0, 1, 2]) await expect(rows.nth(index)).toHaveClass(/is-running/);
  for (const index of [3, 4]) await expect(rows.nth(index)).toHaveClass(/is-pending/);
  await expect(report.getByRole("status")).toContainText("Sto elaborando 3 vini insieme");
  await report.getByRole("button", { name: "Interrompi" }).click();
  await expect(report).toContainText("Mi fermo dopo i vini in corso");
  await page.evaluate(() => { (window as unknown as { releaseSecond: boolean }).releaseSecond = true; });
  await expect(report.getByText("Arricchimento AI interrotto")).toBeVisible();
  for (const index of [3, 4]) await expect(rows.nth(index)).toHaveClass(/is-pending/);
});
