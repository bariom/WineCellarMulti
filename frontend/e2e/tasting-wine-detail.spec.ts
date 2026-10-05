import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, tastingArchive, wine } from "./fixtures/app";

for (const [width, locale] of [[390, "it"], [1440, "en"]] as const) {
  test(`${locale}: wine details open directly from tasting history at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const linked = { ...tastingArchive.items[0], source: "cellar" };
    const unlinked = { ...linked, tasting_id: "external-unlinked", wine_id: "missing-wine", wine_name: "Vino esterno", source: "external_tasting" };
    await mockApi(page, [], false, memberships, [wine], { ...session, locale }, [], undefined, { ...tastingArchive, items: [linked, unlinked], total: 2 });
    await page.goto("/");
    if (width === 390) await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: locale === "it" ? "Storico" : "History", exact: true }).click();

    const history = page.locator(".history-workspace");
    const linkedEntry = history.locator(".tasting-archive-entry").filter({ hasText: wine.name });
    const unlinkedEntry = history.locator(".tasting-archive-entry").filter({ hasText: "Vino esterno" });
    const link = linkedEntry.getByRole("button", { name: locale === "it" ? "Scheda vino" : "Wine details" });
    await expect(link).toBeVisible();
    await expect(unlinkedEntry.getByRole("button", { name: /Scheda vino|Wine details/ })).toHaveCount(0);
    const head = (await linkedEntry.locator(".tasting-archive-head").boundingBox())!;
    const action = (await link.boundingBox())!;
    expect(action.y).toBeGreaterThanOrEqual(head.y + head.height);
    expect(action.x + action.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await link.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`tasting-wine-link-${width}.png`) });

    await link.click();
    const detail = page.getByRole("dialog", { name: new RegExp(wine.name) });
    await expect(detail).toBeVisible();
    await expect(detail.locator(".wine-detail")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`tasting-wine-detail-${width}.png`) });
    await expect(linkedEntry).not.toHaveAttribute("open", "");
    await detail.getByRole("button", { name: locale === "it" ? "Chiudi" : "Close" }).click();
    await expect(detail).toHaveCount(0);
    await expect(linkedEntry).toBeVisible();
  });
}
