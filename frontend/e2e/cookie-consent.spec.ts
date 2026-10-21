import { expect, test, type Page } from "@playwright/test";

// The Google tag itself is only in the production build (see vite.config.ts); here
// the consent signals the banner sends to it are checked through window.dataLayer.
const consentUpdates = (page: Page) => page.evaluate(() => (window.dataLayer || [])
  .map((item) => Array.from(item as ArrayLike<unknown>))
  .filter((args) => args[0] === "consent" && args[1] === "update")
  .map((args) => args[2] as Record<string, string>));

async function openPublicPage(page: Page) {
  await page.route("**/api/v1/session", (route) => route.fulfill({ json: { authenticated: false } }));
  await page.route("**/api/v1/public-config", (route) => route.fulfill({ json: { free_tier_label_limit: 15 } }));
  await page.route("https://www.googletagmanager.com/**", (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
}

test("consent mode starts denied and marketing consent grants ads storage", async ({ page }) => {
  await openPublicPage(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const banner = page.getByRole("dialog", { name: "Le tue preferenze cookie" });
  await expect(banner).toBeVisible();
  const defaults = await page.evaluate(() => (window.dataLayer || [])
    .map((item) => Array.from(item as ArrayLike<unknown>))
    .find((args) => args[0] === "consent" && args[1] === "default")?.[2]);
  expect(defaults).toMatchObject({ ad_storage: "denied", analytics_storage: "denied", ad_user_data: "denied" });
  expect(await consentUpdates(page)).toEqual([]);
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
  expect((await consentUpdates(page)).at(-1)).toMatchObject({ ad_storage: "granted", ad_user_data: "granted", analytics_storage: "denied" });
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
  expect((await consentUpdates(page)).at(-1)).toMatchObject({ ad_storage: "denied" });
});

test("usage statistics consent grants analytics storage and is kept", async ({ page }) => {
  await openPublicPage(page);
  // A choice saved before analytics was offered is asked again.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("vinaris.cookie-consent", JSON.stringify({ marketing: false, updatedAt: "2026-01-01T00:00:00Z" }));
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const banner = page.getByRole("dialog", { name: "Le tue preferenze cookie" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Personalizza" }).click();
  await banner.getByRole("checkbox", { name: "Statistiche di utilizzo" }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await banner.getByRole("button", { name: "Salva preferenze" }).click();
  expect((await consentUpdates(page)).at(-1)).toMatchObject({ analytics_storage: "granted", ad_storage: "denied" });

  // After a reload the banner stays closed and the stored choice is applied again.
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Le tue preferenze cookie" })).toHaveCount(0);
  expect((await consentUpdates(page)).at(-1)).toMatchObject({ analytics_storage: "granted", ad_storage: "denied" });
});
