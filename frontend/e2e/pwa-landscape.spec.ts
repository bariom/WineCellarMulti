import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

test.use({ hasTouch: true, isMobile: true, screen: { width: 390, height: 844 } });

test("installed web app allows landscape and keeps primary navigation usable", async ({ page, request }, testInfo) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect((await manifestResponse.json()).orientation).toBe("any");

  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], false, memberships, [wine], session);
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navigazione principale" })).toBeVisible();

  for (const viewport of [{ width: 844, height: 390 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(viewport);
    const nav = page.getByRole("navigation", { name: "Navigazione principale" });
    await expect(nav.getByRole("button", { name: "Cantina" })).toBeVisible();
    await expect(page.locator(".desktop-topbar-search")).toBeHidden();
    const bounds = (await nav.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-landscape-${viewport.width}.png`) });

    await nav.getByRole("button", { name: "Cantina" }).click();
    await expect(page.getByRole("heading", { name: /Cantina/i }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`cellar-landscape-${viewport.width}.png`) });
    await nav.getByRole("button", { name: "Home" }).click();
  }
});
