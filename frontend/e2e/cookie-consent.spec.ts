import { expect, test } from "@playwright/test";

test("blocks Google Ads until marketing consent is granted", async ({ page }) => {
  await page.route("**/api/v1/session", (route) => route.fulfill({ json: { authenticated: false } }));
  await page.route("**/api/v1/public-config", (route) => route.fulfill({ json: { free_tier_label_limit: 15 } }));
  await page.route("https://www.googletagmanager.com/**", (route) => route.fulfill({
    contentType: "application/javascript",
    body: "window.vinarisGoogleAdsLoaded = true;",
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const banner = page.getByRole("dialog", { name: "Le tue preferenze cookie" });
  await expect(banner).toBeVisible();
  await expect(page.locator("#vinaris-google-ads-tag")).toHaveCount(0);
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }

  await banner.getByRole("button", { name: "Personalizza" }).click();
  await banner.getByRole("checkbox", { name: "Marketing e misurazione" }).check();
  await banner.getByRole("button", { name: "Salva preferenze" }).click();

  await expect(page.locator("#vinaris-google-ads-tag")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Cookie" })).toHaveCount(0);
  await page.evaluate(async () => {
    const { reportGoogleAdsCheckoutConversion } = await import("/src/services/googleAds.ts");
    reportGoogleAdsCheckoutConversion("monthly");
    reportGoogleAdsCheckoutConversion("annual");
    reportGoogleAdsCheckoutConversion("ai_credits");
  });
  await expect.poll(() => page.evaluate(() => window.dataLayer
    ?.map((item) => Array.from(item as ArrayLike<unknown>))
    .filter((args) => args[0] === "event" && args[1] === "conversion")
    .map((args) => (args[2] as { value?: number }).value))).toEqual([6, 60, 5]);

  await page.evaluate(() => window.dispatchEvent(new Event("vinaris:open-cookie-settings")));
  await expect(page.getByRole("dialog", { name: "Le tue preferenze cookie" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Marketing e misurazione" }).uncheck();
  await page.getByRole("button", { name: "Salva preferenze" }).click();
  await expect.poll(() => page.evaluate(() => window.dataLayer?.some((item) => {
    const args = Array.from(item as ArrayLike<unknown>);
    return args[0] === "consent" && args[1] === "update"
      && typeof args[2] === "object" && args[2] !== null
      && (args[2] as { ad_storage?: string }).ad_storage === "denied";
  }))).toBe(true);
});
