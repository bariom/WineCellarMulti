import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

test.describe("tablet layout preference", () => {
  test.use({ viewport: { width: 820, height: 1180 }, screen: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

  for (const locale of ["it", "en"] as const) {
    test(`${locale}: can request desktop layout and return to tablet layout`, async ({ page }, testInfo) => {
      const it = locale === "it";
      await mockApi(page, [], false, memberships, [wine], { ...session, locale });
      await page.goto("/");
      await expect(page.getByRole("navigation", { name: it ? "Navigazione principale" : "Main navigation" })).toBeVisible();
      await expect(page.locator(".tablet-layout-bar")).toHaveCount(0);
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      if (it) await page.screenshot({ path: testInfo.outputPath("tablet-menu-it.png") });
      if (it) {
        await page.getByRole("button", { name: "Richiedi modalità desktop" }).click();
      } else {
        await page.getByRole("button", { name: "Settings", exact: true }).click();
        await page.getByRole("combobox", { name: /Tablet display/ }).selectOption("desktop");
        await page.reload();
      }
      await expect(page.locator(".view-tabs-navigation")).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeGreaterThanOrEqual(1100);
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /width=1280/);
      await page.screenshot({ path: testInfo.outputPath(`tablet-desktop-${locale}.png`), fullPage: true });
      await page.reload();
      await expect(page.locator(".view-tabs-navigation")).toBeVisible();
      const settingsButton = page.getByRole("button", { name: it ? "Impostazioni" : "Settings", exact: true });
      const search = (await page.locator(".desktop-topbar-search").boundingBox())!;
      const settings = (await settingsButton.boundingBox())!;
      expect(search.x + search.width).toBeLessThanOrEqual(settings.x);
      expect(settings.x + settings.width).toBeLessThanOrEqual(820);
      await settingsButton.click();
      await page.getByRole("combobox", { name: it ? "Visualizzazione su tablet" : "Tablet display" }).selectOption("tablet");
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /width=device-width/);
      await page.locator(".settings-exit-button").click();
      await expect(page.getByRole("navigation", { name: it ? "Navigazione principale" : "Main navigation" })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("navigation", { name: it ? "Navigazione principale" : "Main navigation" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("does not offer tablet layout controls", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.locator(".tablet-layout-bar")).toHaveCount(0);
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(page.getByRole("button", { name: "Richiedi modalità desktop" })).toHaveCount(0);
    await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Visualizzazione su tablet" })).toHaveCount(0);
  });
});

test.describe("iPad user agent without touch emulation", () => {
  test.use({
    viewport: { width: 834, height: 1210 },
    screen: { width: 834, height: 1210 },
    hasTouch: false,
    isMobile: true,
    userAgent: "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  });

  test("keeps the tablet page clear and offers desktop mode in the menu", async ({ page }, testInfo) => {
    await mockApi(page);
    await page.goto("/");
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBe(0);
    await expect(page.locator(".tablet-layout-bar")).toHaveCount(0);
    const header = (await page.locator(".topbar").boundingBox())!;
    expect(header.y).toBeLessThan(35);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("ipad-pro-834-tablet-option.png") });
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Richiedi modalità desktop" }).click();
    await expect(page.locator(".view-tabs-navigation")).toBeVisible();
    await expect(page.getByRole("button", { name: "Impostazioni", exact: true })).toBeVisible();
  });
});

test.describe("tablet insights menu", () => {
  test.use({ viewport: { width: 800, height: 1280 }, screen: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });

  for (const viewport of [{ width: 800, height: 1280 }, { width: 820, height: 1180 }, { width: 1024, height: 768 }]) {
    test(`insights remain visible and selectable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await mockApi(page);
      await page.goto("/");
      const navigation = page.locator(".dashboard-focus-navigation");
      const insights = navigation.locator(".dashboard-analysis-switcher");
      await insights.locator("summary").click();
      const options = insights.getByRole("tablist", { name: "Approfondimenti" });
      await expect(options).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`tablet-insights-${viewport.width}.png`), animations: "disabled" });
      const menu = (await options.boundingBox())!;
      const container = (await navigation.boundingBox())!;
      expect(menu.y + menu.height).toBeLessThanOrEqual(container.y + container.height + 1);
      expect(menu.x).toBeGreaterThanOrEqual(0);
      expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
      await options.getByRole("tab", { name: "Valore", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Valore", exact: true }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }
});
