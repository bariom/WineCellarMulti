import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, tastingArchive, wine } from "./fixtures/app";

for (const locale of ["it", "en"] as const) {
  test(`${locale}: wines without a color stay visible in archived wines`, async ({ page }, testInfo) => {
    const it = locale === "it";
    const leVigne = { ...wine, id: "sandrones-le-vigne", name: "Le Vigne", producer: "Sandrone", vintage: "2017", region: "Piemonte", type: "", quantity: 0, tasting_history: [] };
    const other = { ...wine, id: "fortified-archive", name: "Vino fortificato", type: "Fortified", quantity: 0, tasting_history: [] };
    const available = { ...wine, id: "available-wine", name: "Ancora in cantina", quantity: 2, tasting_history: [] };
    const archive = { ...tastingArchive, items: [{ ...tastingArchive.items[0], tasting_id: "le-vigne-tasting", wine_id: leVigne.id, wine_name: leVigne.name, wine_producer: leVigne.producer, wine_vintage: leVigne.vintage, wine_type: "", wine_region: "Piemonte" }], total: 1 };
    await mockApi(page, [], false, memberships, [leVigne, other, available], { ...session, locale }, [], undefined, archive);
    await page.goto("/");
    if (await page.getByRole("button", { name: "Menu", exact: true }).isVisible()) await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: it ? "Storico" : "History", exact: true }).click();
    const history = page.locator(".history-workspace");
    await expect(history.locator(".tasting-archive-entry")).toContainText("Le Vigne");
    await expect(history.locator(".tasting-archive-entry")).toContainText(it ? "Colore non specificato" : "Wine color unspecified");
    await history.getByRole("tab", { name: it ? "Vini archiviati" : "Archived wines" }).click();
    const unknownGroup = history.locator(".wine-tone-group").filter({ hasText: it ? "Colore non specificato" : "Unspecified wine color" });
    await expect(unknownGroup.getByRole("button", { name: /Colore non specificato|Unspecified wine color/ })).toHaveAttribute("aria-expanded", "true");
    await expect(unknownGroup.locator('[data-wine-row-id="sandrones-le-vigne"]')).toBeVisible();
    await expect(unknownGroup.locator('[data-wine-row-id="sandrones-le-vigne"] .wine-status-badge')).toHaveCount(0);
    await expect(unknownGroup.locator(".wine-tone-group-summary")).not.toContainText(it ? "bottiglia" : "bottle");
    await expect(history.locator('[data-wine-row-id="available-wine"]')).toHaveCount(0);
    await expect(history.locator(".archive-wines-explainer")).toContainText(it ? "giacenza zero" : "zero bottles");
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      const wineRow = (await unknownGroup.locator('[data-wine-row-id="sandrones-le-vigne"]').boundingBox())!;
      expect(wineRow.x).toBeGreaterThanOrEqual(0);
      expect(wineRow.x + wineRow.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await history.screenshot({ path: testInfo.outputPath(`archived-unknown-color-${locale}-${width}.png`) });
    }
    await history.getByRole("button", { name: it ? "Regione" : "Region", exact: true }).click();
    const regionGroup = history.locator(".wine-tone-group").filter({ hasText: "Piemonte" });
    await regionGroup.getByRole("button", { name: /Piemonte/ }).click();
    await expect(regionGroup.locator('[data-wine-row-id="sandrones-le-vigne"]')).toBeVisible();
  });
}
