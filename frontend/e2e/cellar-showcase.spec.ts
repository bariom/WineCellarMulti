import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";
const bottle = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='80' height='160'><rect x='17' y='22' width='46' height='128' rx='12' fill='#1f2a1c'/></svg>")}`;
const wines = [["Krug Grande Cuvée", "Sparkling", true, "265"], ["Château Cos d'Estournel", "Red", false, "197"], ["Dom Pérignon", "Sparkling", true, "189"], ["Meursault", "White", false, "120"]].map(([name, type, photo, value], index) => ({
  ...wine, id: `wine-e2e-${index + 1}`, name, type, current_value: value, quantity: 2,
  photo_thumbnail_url: photo ? bottle : "", photo_detail_url: photo ? bottle : "",
}));
for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`showcase cards keep one height and whole drawn glasses at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await mockApi(page, [], false, memberships, wines as never, session);
    await page.goto("/");
    await page.getByRole("tab", { name: /Focus collezionista/ }).first().click();
    const showcase = page.locator(".cellar-showcase");
    await expect(showcase).toBeVisible();
    await showcase.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const cards = await showcase.locator(".cellar-showcase-card").all();
    const heights = new Set<number>();
    for (const card of cards.slice(0, 2)) {
      const box = (await card.boundingBox())!;
      heights.add(Math.round(box.height));
      const art = (await card.locator(".cellar-showcase-stage").boundingBox())!;
      expect(art.y).toBeGreaterThanOrEqual(box.y);
      expect(art.y + art.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
    }
    expect(heights.size).toBe(1);
    // The drawn glass must fit whole inside its frame, foot included.
    const frame = (await showcase.locator(".cellar-showcase-bottle--drawn").first().boundingBox())!;
    const glass = (await showcase.locator(".cellar-showcase-bottle--drawn svg").first().boundingBox())!;
    expect(glass.y).toBeGreaterThanOrEqual(frame.y - 0.5);
    expect(glass.y + glass.height).toBeLessThanOrEqual(frame.y + frame.height + 0.5);
    expect(glass.height).toBeGreaterThan(100);
    await showcase.screenshot({ path: testInfo.outputPath(`mixed-${width}.png`) });
  });
}
