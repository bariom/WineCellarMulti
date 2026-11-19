import { expect, test } from "@playwright/test";
import { mockApi, wine } from "./fixtures/app";

// Measured on a Galaxy Z Fold: cover screen 360x802, inner screen 752x782.
const COVER = { width: 360, height: 802 };
const INNER = { width: 752, height: 782 };
const wines = Array.from({ length: 9 }, (_, index) => ({
  ...wine,
  id: index ? `wine-e2e-${index + 1}` : wine.id,
  name: index ? `Vino di prova ${index + 1}` : wine.name,
}));

async function openCellar(page: import("@playwright/test").Page) {
  await mockApi(page, [], false, undefined, wines);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await expect(page.locator('[data-wine-row-id="wine-e2e-1"] article.wine-row')).toBeVisible();
}

const noSidewaysScroll = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("an unfolded phone shows the wine detail beside the list", async ({ page }, testInfo) => {
  await page.setViewportSize(INNER);
  await openCellar(page);
  const listWidthBefore = (await page.locator('[data-wine-row-id="wine-e2e-1"] article.wine-row').boundingBox())!.width;
  await page.locator('[data-wine-row-id="wine-e2e-1"] article.wine-row').click();
  const panel = page.locator(".mobile-inline-detail");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("aria-modal", "false");
  const half = INNER.width / 2;
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.x).toBeGreaterThanOrEqual(half - 1);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(INNER.width + 1);
  // The list stays usable in the left half, with the bottom bar under it.
  const row = (await page.locator('[data-wine-row-id="wine-e2e-1"] article.wine-row').boundingBox())!;
  expect(row.x + row.width).toBeLessThanOrEqual(half + 1);
  const bar = (await page.locator(".mobile-bottom-navigation").boundingBox())!;
  expect(bar.x + bar.width).toBeLessThanOrEqual(half + 1);
  expect(await noSidewaysScroll(page)).toBe(true);
  for (const label of ["Registra bevuta", "Registra vendita"]) {
    await expect(panel.getByRole("button", { name: label, exact: true })).toHaveCount(1);
  }
  await page.screenshot({ path: testInfo.outputPath("fold-split.png") });

  // Another wine is one tap away: no need to close the detail first.
  const second = page.locator('[data-wine-row-id="wine-e2e-2"] article.wine-row');
  await second.scrollIntoViewIfNeeded();
  await second.click();
  await expect(panel.getByRole("heading", { name: "Vino di prova 2", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("fold-split-second.png") });

  await panel.getByRole("button", { name: "Chiudi", exact: true }).first().click();
  await expect(panel).toHaveCount(0);
  const listWidthAfter = (await page.locator('[data-wine-row-id="wine-e2e-1"] article.wine-row').boundingBox())!.width;
  expect(Math.abs(listWidthAfter - listWidthBefore)).toBeLessThanOrEqual(1);
});

test("closing and reopening the phone keeps the same wine open", async ({ page }, testInfo) => {
  await page.setViewportSize(COVER);
  await openCellar(page);
  await page.locator('[data-wine-row-id="wine-e2e-1"] article.wine-row').click();
  const panel = page.locator(".mobile-inline-detail");
  await expect(panel).toHaveAttribute("aria-modal", "true");
  expect((await panel.boundingBox())!.width).toBeGreaterThanOrEqual(COVER.width - 1);

  await page.setViewportSize(INNER);
  await expect(panel).toHaveAttribute("aria-modal", "false");
  await expect(panel.getByRole("heading", { name: wine.name, exact: true })).toBeVisible();
  expect((await panel.boundingBox())!.x).toBeGreaterThanOrEqual(INNER.width / 2 - 1);
  expect(await noSidewaysScroll(page)).toBe(true);

  await page.setViewportSize(COVER);
  await expect(panel).toHaveAttribute("aria-modal", "true");
  await expect(panel.getByRole("heading", { name: wine.name, exact: true })).toBeVisible();
  expect((await panel.boundingBox())!.x).toBeLessThanOrEqual(1);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("fold-cover.png") });
});
