import { expect, test, type Page } from "@playwright/test";

// The static pricing pages (public/pricing, public/it/prezzi) and the sign-up
// deep link they use. No API is needed for the static pages.

const pages = [
  { locale: "en", path: "/pricing/index.html", monthly: "Monthly", annual: "Annual", free: "Free", reserve: "Reserve", annualNote: "you save CHF 12" },
  { locale: "it", path: "/it/prezzi/index.html", monthly: "Mensile", annual: "Annuale", free: "Gratis", reserve: "Riserva", annualNote: "risparmi CHF 12" },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

for (const item of pages) {
  test(`${item.locale}: pricing page shows prices, toggles billing and stays within mobile widths`, async ({ page }, testInfo) => {
    await page.goto(item.path);
    await expect(page).toHaveTitle(/CHF 6/);
    const reserve = page.getByRole("article", { name: item.reserve });
    await expect(reserve.locator(".price-monthly")).toContainText("CHF 6");
    await expect(reserve.locator(".price-annual")).toBeHidden();
    await page.locator(".billing-toggle label", { hasText: item.annual }).click();
    await expect(reserve.locator(".price-annual")).toContainText("CHF 60");
    await expect(reserve.locator(".price-annual")).toContainText(item.annualNote);
    await expect(reserve.locator(".price-monthly")).toBeHidden();
    await expect(page.locator(".plan.is-recommended")).toHaveCount(1);
    await expect(reserve.locator(".price-anchor")).toContainText("Barolo");
    await expect(page.locator(".safety")).toContainText("Stripe");
    await expect(page.locator(".compare table tbody tr")).toHaveCount(8);
    const structured = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    expect(structured["@graph"][0].offers.map((offer: { price: string }) => offer.price)).toEqual(["0", "6", "60"]);
    await expect(page.getByRole("link", { name: item.locale === "it" ? "Crea il tuo account gratis" : "Create your free account" }).first()).toHaveAttribute("href", `/?signup=1&lang=${item.locale}`);
    for (const viewport of [{ width: 360, height: 800 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expectNoHorizontalOverflow(page);
      const boxes = await page.locator(".plan").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
      expect(boxes[0].x + boxes[0].width <= boxes[1].x || boxes[0].y + boxes[0].height <= boxes[1].y).toBe(true);
      for (const label of await page.locator(".billing-toggle label").all()) expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      if ([375, 1440].includes(viewport.width)) await page.screenshot({ path: testInfo.outputPath(`pricing-${item.locale}-${viewport.width}.png`), fullPage: true });
    }
  });
}

test("the sign-up link from the static pages opens the registration form", async ({ page }) => {
  await page.route("**/api/v1/session", (route) => route.fulfill({ json: { authenticated: false } }));
  await page.route("**/api/v1/public-config", (route) => route.fulfill({ json: { free_tier_label_limit: 15 } }));
  await page.addInitScript(() => localStorage.setItem("vinaris.cookie-consent", JSON.stringify({ marketing: false, analytics: false, updatedAt: "2026-09-23T00:00:00Z" })));
  await page.addInitScript(() => localStorage.setItem("vinaris.landing-news", JSON.stringify({ dismissedFor: "9999-12" })));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?signup=1&lang=en");
  await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/\?lang=en$/);
});
