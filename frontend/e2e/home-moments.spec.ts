import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

for (const [width, height, locale] of [[360, 800, "it"], [390, 844, "it"], [430, 932, "it"], [1440, 900, "it"], [390, 844, "en"]] as const) {
  test(`Home invites users to record and browse moments at ${width}px in ${locale}`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width, height });
    await mockApi(page, [], false, memberships, [wine], { ...session, locale, dashboard_focus: "daily" });
    await page.goto("/");
    await expect(page.locator(".dashboard-focus-navigation")).toBeVisible({ timeout: 15_000 });
    const entry = page.getByRole("region", { name: it ? "Momenti" : "Moments", exact: true });
    await expect(entry.getByRole("heading", { name: it ? "Momenti" : "Moments", exact: true })).toBeVisible();
    await entry.scrollIntoViewIfNeeded();
    const record = entry.getByRole("button", { name: it ? "Registra una bevuta" : "Record a tasting", exact: true });
    const browse = entry.getByRole("button", { name: it ? "Sfoglia i ricordi" : "Browse memories", exact: true });
    const bounds = (await entry.boundingBox())!;
    const copy = (await entry.getByRole("heading").boundingBox())!;
    for (const button of [record, browse]) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x >= copy.x + copy.width || box.y >= copy.y + copy.height).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-moments-${width}-${locale}.png`) });
    if (width === 390 && it) await expect(entry).toHaveScreenshot("home-moments-compact.png", { animations: "disabled" });
    await record.click();
    const tasting = page.getByRole("dialog");
    await expect(tasting.getByRole("button", { name: it ? /Dalla mia cantina/ : /From my cellar/ })).toBeVisible();
    await expect(tasting.getByRole("button", { name: it ? /Un altro vino/ : /Another wine/ })).toBeVisible();
    await tasting.getByRole("button", { name: it ? "Chiudi" : "Close", exact: true }).click();
    await expect(record).toBeFocused();
    await browse.click();
    const book = page.getByRole("dialog", { name: it ? "Momenti" : "Moments", exact: true });
    await expect(book.getByRole("heading", { name: it ? "I miei ricordi" : "My memories", exact: true })).toBeVisible();
    await book.getByRole("button", { name: it ? "Chiudi" : "Close", exact: true }).click();
    await expect(browse).toBeFocused();
    // Other dashboards do not show the daily invitation.
    await page.getByRole("tab", { name: it ? "La mia dashboard" : "My dashboard", exact: true }).click();
    await expect(entry).toHaveCount(0);
  });
}

test("read-only members can browse Home moments without a recording action", async ({ page }) => {
  await mockApi(page, [], false, [{ ...memberships[0], role: "viewer" }], [wine], { ...session, membership_role: "viewer", dashboard_focus: "daily" });
  await page.goto("/");
  const entry = page.getByRole("region", { name: "Momenti", exact: true });
  await expect(entry.getByRole("button", { name: "Registra una bevuta", exact: true })).toHaveCount(0);
  await entry.getByRole("button", { name: "Sfoglia i ricordi", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Momenti", exact: true })).toBeVisible();
});
