import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

test("the search finds features as well as wines on desktop", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], true, memberships, [wine], { ...session, wine_shelf_scan_available: true });
  await page.goto("/");
  const search = page.locator(".desktop-topbar-search");
  await search.getByRole("textbox").fill("scaffale");
  const features = search.getByRole("region", { name: "Funzioni" });
  await expect(features.getByRole("button", { name: /^Scaffale AI/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("feature-search-1440.png") });
  await features.getByRole("button", { name: /^Scaffale AI/ }).click();
  // The shelf scanner opens on its tab, and the search is left empty.
  await expect(page.locator(".buying-place-switch button").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(search.getByRole("textbox")).toHaveValue("");
  await expect(features).toHaveCount(0);

  // A wine name keeps the usual cellar search, without feature noise.
  await search.getByRole("textbox").fill(wine.name);
  await expect(search.getByRole("region", { name: "Funzioni" })).toHaveCount(0);
  await expect(page.locator(`[data-wine-row-id="${wine.id}"]`)).toBeVisible();
});

test("the phone search finds settings by what they do", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu di navigazione" }).getByRole("button", { name: "Cerca", exact: true }).click();
  const search = page.locator(".mobile-topbar-search");
  await search.getByRole("textbox").fill("esporta");
  const option = search.getByRole("region", { name: "Funzioni" }).getByRole("button", { name: /^Esporta o importa/ });
  await expect(option).toBeVisible();
  const box = (await option.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("feature-search-390.png") });
  await option.click();
  await expect(page.locator(".settings-workspace")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Dati", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("the feature shortcuts can be reached and opened with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.goto("/");
  const field = page.locator(".desktop-topbar-search").getByRole("textbox");
  await field.fill("diario");
  await field.press("ArrowDown");
  const shortcuts = page.locator(".desktop-topbar-search").getByRole("region", { name: "Funzioni" }).getByRole("button");
  await expect(shortcuts.first()).toBeFocused();
  // Up from the first shortcut goes back to the field.
  await page.keyboard.press("ArrowUp");
  await expect(field).toBeFocused();
  await field.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "Bottiglie bevute", exact: true })).toHaveAttribute("aria-selected", "true");
});
