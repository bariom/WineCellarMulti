import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

for (const entry of ["cellar row", "wine detail"] as const) {
  test(`a selected wine from ${entry} skips location even after restaurant pairing`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], true, memberships, [wine], session);
    await page.addInitScript(() => {
      const previous = window.fetch;
      window.fetch = async (input, init) => {
        if (new URL(String(input), location.href).pathname === "/api/v1/ai/settings") {
          const response = await previous(input, init);
          return Response.json({ ...await response.json(), pairing_model: "test-model" });
        }
        if (new URL(String(input), location.href).pathname === "/api/v1/ai/pairing" && init?.method === "POST") {
          sessionStorage.setItem("pairing-request", String(init.body));
          return Response.json({ summary: "Piatti per il vino scelto", model: "test-model", reasoning_effort: "low", cellar_matches: [], market_recommendations: {}, dish_recommendations: [{ name: "Risotto ai funghi", description: "Risotto", why_it_works: "Equilibrio", dietary_note: "" }], estimated_cost_usd: "0" });
        }
        return previous(input, init);
      };
    });
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Abbinamento", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Dove sei?", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Al ristorante/ }).click();
    await expect(page.getByRole("heading", { name: "Come vuoi scegliere il vino?" })).toBeVisible();
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    const row = page.locator(`[data-wine-row-id="${wine.id}"]`);
    if (entry === "wine detail") {
      await row.locator("article").click();
      const detail = page.locator(".wine-detail:visible").first();
      await detail.locator(".wine-ai-tools > summary").click();
      await detail.getByRole("button", { name: "Abbinamento", exact: true }).click();
    } else {
      await row.getByRole("button", { name: "Abbinamento", exact: true }).click();
    }
    const pairing = page.locator(".pairing-card");
    await expect(pairing.getByText("Piatti per questo vino", { exact: true })).toBeVisible();
    await expect(pairing.getByText(wine.name, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dove sei?", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Come vuoi scegliere il vino?" })).toHaveCount(0);
    for (const [width, height] of [[360, 800], [390, 844], [430, 932], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await expect(pairing.getByText("Piatti per questo vino", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath("wine-pairing-compact.png"), fullPage: true });
    }
    await pairing.getByRole("button", { name: "Trova abbinamento", exact: true }).click();
    await expect(pairing.getByText("Risotto ai funghi", { exact: true }).first()).toBeVisible();
    const request = await page.evaluate(() => JSON.parse(sessionStorage.getItem("pairing-request") || "null"));
    expect(request).toMatchObject({ target_wine_id: wine.id, market_only: false, prefer_local_wines: false, local_origin: "" });
    await pairing.getByRole("button", { name: "Scegli un piatto invece", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dove sei?", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^A casa/ }).click();
    await expect(pairing.getByRole("textbox", { name: /Piatto o pietanza/ })).toBeVisible();
  });
}
