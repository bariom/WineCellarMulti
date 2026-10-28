import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

async function openSettings(page: Page, width: number) {
  if (width < 1100) {
    await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Impostazioni", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  }
  return page.getByRole("group", { name: "Tema", exact: true });
}

test("a retired theme shows as the closest curated one until the user picks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], false, memberships, [wine], { ...session, theme_preference: "midnight-ledger" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cave-privee");
  await expect(page.locator("html")).toHaveAttribute("data-theme-tone", "dark");
  const picker = await openSettings(page, 1440);
  await expect(picker.getByRole("radio", { name: "Cave Privée", exact: true })).toBeChecked();
  await expect(picker).toContainText("Il tema che usavi è stato ritirato");
});

for (const width of [360, 390, 430, 1440]) {
  test(`theme picker offers the base row and four signature themes at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 1440 ? 900 : 932 });
    await mockApi(page, [], false, memberships, [wine], { ...session, theme_preference: "system" });
    await page.goto("/");
    const picker = await openSettings(page, width);
    await expect(picker.getByRole("radio")).toHaveCount(8);
    await expect(picker.getByRole("radio", { name: "Sistema", exact: true })).toBeChecked();
    for (const name of ["Atelier del collezionista", "Pietra & Vigna", "Maison Champagne", "Cave Privée", "Cantina privata"]) {
      await expect(picker.getByRole("radio", { name, exact: true })).toBeAttached();
    }
    await picker.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const cards = await picker.locator(".theme-picker-card").all();
    for (const card of cards) {
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await picker.locator(".theme-picker-card", { hasText: "Maison Champagne" }).click();
    // The fixture stores every PATCH /auth/preferences body here.
    await expect.poll(() => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("vinaris-test-preferences") || "{}").theme_preference)).toBe("maison-champagne");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "maison-champagne");
    await expect(picker.getByRole("radio", { name: "Maison Champagne", exact: true })).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath(`theme-picker-${width}.png`) });

    await picker.getByRole("radio", { name: "Scuro", exact: true }).check({ force: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
}
