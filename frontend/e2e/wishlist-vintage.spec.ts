import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures/app";

for (const width of [360, 390, 430, 1440]) {
  test(`wishlist vintage reminder remains usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await mockApi(page);
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url, location.origin);
        if (url.pathname === "/api/v1/wishlist/lists") {
          return new Response(JSON.stringify([{ id: "list-1", household_id: "household-1", name: "Wishlist", description: "", item_count: 0, portfolio_strategy: null }]), { status: 200 });
        }
        if (url.pathname === "/api/v1/wishlist" && init?.method === "POST") {
          sessionStorage.setItem("wishlist-saved", String(init.body));
          return new Response("{}", { status: 200 });
        }
        return originalFetch(input, init);
      };
    });
    await page.goto("/");
    if (width < 1100) {
      await page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Menu", exact: true }).click();
    }
    await page.getByRole("button", { name: /^Wishlist/ }).first().click();
    await page.getByRole("button", { name: "Aggiungi a wishlist", exact: true }).first().click();
    const form = page.locator(".wishlist-editor-form");
    const vintage = form.getByRole("textbox", { name: "Annata", exact: true });
    const reminder = form.getByRole("status").filter({ hasText: "Se conosci l’annata" });
    await expect(reminder).toBeVisible();
    await expect(vintage).toHaveAccessibleDescription(/serve per cercare il profilo gustativo/);
    await reminder.scrollIntoViewIfNeeded();
    const bounds = (await reminder.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("wishlist-vintage.png") });

    await vintage.fill("2022");
    await expect(reminder).toHaveCount(0);
    await vintage.fill("");
    await expect(reminder).toBeVisible();
    for (const value of ["NV", "MV"]) {
      await form.getByRole("button", { name: value, exact: true }).click();
      await expect(vintage).toHaveValue(value);
      await expect(reminder).toHaveCount(0);
    }
    await vintage.fill("   ");
    await expect(reminder).toBeVisible();
    await form.getByRole("textbox", { name: "Nome", exact: true }).fill("Vino senza annata nota");
    await form.getByRole("button", { name: "Aggiungi vino", exact: true }).click();
    await expect(form).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("wishlist-saved") || "null"));
    expect(saved.name).toBe("Vino senza annata nota");
    expect(saved.vintage).toBe("");
  });
}
