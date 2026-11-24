import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

// A case bought by three: the wine detail draws who owns how much, not only a list of numbers.
const shared = {
  ...wine,
  id: "wine-shared-case",
  name: "Sassicaia",
  quantity: 6,
  owners: [
    { name: "Luca Marini", email: "luca@example.test", share_pct: 30 },
    { name: "E2E User", email: "e2e@example.test", share_pct: 50 },
    { name: "Sara Rossi", email: "sara@example.test", share_pct: 20 },
  ],
};

// Only this cellar's share is known: the rest belongs to owners outside Vinaris.
const partial = { ...wine, id: "wine-partial", name: "Barolo a metà", quantity: 4, owners: [], owner_share_pct: "60.00" };

async function openHistory(page: Page, wineId: string) {
  await page.getByRole("button", { name: /^(Cantina|Cellar)/ }).first().click();
  await page.locator(`[data-wine-row-id="${wineId}"] article`).click();
  const history = page.locator("details.wine-detail-group--history:visible");
  await history.locator(":scope > summary").click();
  const chart = history.locator(".ownership-chart");
  await expect(chart).toBeVisible();
  return chart;
}

for (const [locale, theme, width, height] of [["it", "dark", 390, 844], ["en", "light", 1440, 900]] as const) {
  test(`a shared wine shows each owner's share as a bar, with bottles (${locale}, ${theme}, ${width})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await mockApi(page, [], false, memberships, [shared, partial], { ...session, locale, theme_preference: theme });
    await page.goto("/");
    const chart = await openHistory(page, shared.id);
    const it = locale === "it";
    await expect(chart).toContainText(it ? "Quote di proprietà" : "Ownership shares");
    await expect(chart).toContainText(it ? "6 bottiglie · 3 proprietari" : "6 bottles · 3 owners");
    // The reader comes first and is named as such; then the others by share as entered.
    const people = chart.getByRole("listitem");
    await expect(people).toHaveCount(3);
    await expect(people.nth(0)).toContainText(it ? "Tu · E2E User" : "You · E2E User");
    await expect(people.nth(0)).toContainText(it ? "3 bottiglie" : "3 bottles");
    await expect(people.nth(0)).toContainText("50%");
    await expect(people.nth(1)).toContainText("Luca Marini");
    await expect(people.nth(1)).toContainText(it ? "1,8 bottiglie" : "1.8 bottles");
    await expect(people.nth(2)).toContainText("20%");
    // The bar reads out the split for screen readers and is split in proportion.
    const bar = chart.getByRole("img");
    await expect(bar).toHaveAttribute("aria-label", it ? "Tu 50%, Luca Marini 30%, Sara Rossi 20%" : "You 50%, Luca Marini 30%, Sara Rossi 20%");
    await page.waitForTimeout(800);
    const widths = await bar.locator("i").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
    expect(widths).toHaveLength(3);
    expect(widths[0] / widths[2]).toBeGreaterThan(2.2);
    expect(widths[0] / widths[2]).toBeLessThan(2.8);
    const box = (await chart.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await chart.scrollIntoViewIfNeeded();
    await chart.screenshot({ path: testInfo.outputPath(`ownership-${locale}-${theme}-${width}.png`) });
  });
}

test("a wine with only this cellar's share shows the rest as other owners", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], false, memberships, [shared, partial], { ...session, locale: "it" });
  await page.goto("/");
  const chart = await openHistory(page, partial.id);
  const people = chart.getByRole("listitem");
  await expect(people).toHaveCount(2);
  await expect(people.nth(0)).toContainText("Questa cantina");
  await expect(people.nth(0)).toContainText("2,4 bottiglie");
  await expect(people.nth(0)).toContainText("60%");
  await expect(people.nth(1)).toContainText("Altri proprietari");
  await expect(people.nth(1)).toContainText("40%");
  await chart.screenshot({ path: testInfo.outputPath("ownership-partial.png") });
});
