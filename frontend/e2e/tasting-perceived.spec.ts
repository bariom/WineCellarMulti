import { expect, test } from "@playwright/test";
import { memberships, mockApi, openRecordTasting, session, tastingArchive, wine } from "./fixtures/app";

test("a tasting records how the wine felt with optional sliders", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // The dark Private Cellar theme, where the gold bars must still read clearly.
  await mockApi(page, [], false, memberships, [wine], { ...session, theme_preference: "private-cellar" });
  await page.goto("/");
  await openRecordTasting(page);
  const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
  await dialog.getByRole("button", { name: /Un altro vino/ }).click();
  await dialog.getByLabel("Nome del vino", { exact: true }).fill("Vino da amici");
  const traits = dialog.getByRole("group", { name: /Com’era in bocca/ });
  await expect(traits.getByRole("slider")).toHaveCount(4);
  // Untouched sliders say so and record nothing.
  await expect(traits.getByRole("slider", { name: "Corpo" })).toHaveAttribute("aria-valuetext", "Non indicato");
  // A tap in the middle of an empty bar records the middle value.
  await traits.getByRole("slider", { name: "Corpo" }).click();
  await expect(traits.getByRole("slider", { name: "Corpo" })).toHaveAttribute("aria-valuetext", "Medio");
  await traits.getByRole("slider", { name: "Corpo" }).press("ArrowRight");
  await expect(traits).toContainText("Pieno");
  await traits.getByRole("slider", { name: "Dolcezza" }).focus();
  await traits.getByRole("slider", { name: "Dolcezza" }).press("Home");
  await traits.getByRole("slider", { name: "Tannino" }).click();
  await traits.getByRole("button", { name: "Togli tannino" }).click();
  await expect(traits.getByRole("slider", { name: "Tannino" })).toHaveAttribute("aria-valuetext", "Non indicato");
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await traits.scrollIntoViewIfNeeded();
    const bounds = (await dialog.boundingBox())!;
    for (const slider of await traits.getByRole("slider").all()) {
      const box = (await slider.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(28);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await traits.screenshot({ path: testInfo.outputPath(`perceived-sliders-${width}.png`) });
  }
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (init?.method === "POST" && String(input).endsWith("/wishlist/tastings")) {
        (window as any).tastingPayload = JSON.parse(String(init.body));
        return Response.json({ id: "tasting-new" }, { status: 201 });
      }
      return original(input, init);
    };
  });
  await dialog.getByRole("button", { name: "Salva bevuta" }).click();
  await expect(dialog.getByText("Bevuta salvata nel Diario", { exact: true })).toBeVisible();
  const payload = await page.evaluate(() => (window as any).tastingPayload);
  expect(payload.tasting_perceived).toEqual({ body: 4, sweetness: 1 });
});

test("a white wine does not ask about tannin", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], false, memberships, [{ ...wine, type: "White" }]);
  await page.goto("/");
  await page.evaluate(white => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (!init?.method && new URL(String(input), location.href).pathname.endsWith("/wines/wine-e2e-1")) return Response.json(white);
      return original(input, init);
    };
  }, { ...wine, type: "White" });
  await openRecordTasting(page);
  const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
  await dialog.getByRole("button", { name: /Dalla mia cantina/ }).click();
  await dialog.getByRole("button", { name: /Nebbiolo di Test/ }).click();
  const traits = dialog.getByRole("group", { name: /Com’era in bocca/ });
  await expect(traits.getByRole("slider")).toHaveCount(3);
  await expect(traits.getByRole("slider", { name: "Tannino" })).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`the traits of a past tasting are shown and edited in the Diary at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const external = { ...tastingArchive.items[0], source: "external_tasting", tasting_id: "external-edit",
      wine_id: "external-edit", wine_name: "Rosso degli amici", wine_type: "Red", perceived: { body: 2, acidity: 4 } };
    await mockApi(page, [], false, memberships, [wine], session, [], undefined, { ...tastingArchive, items: [external], total: 1 });
    await page.goto("/");
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        if (init?.method === "PATCH" && String(input).endsWith("/wishlist/tastings/external-edit")) {
          (window as any).editPayload = JSON.parse(String(init.body));
          return Response.json({});
        }
        return original(input, init);
      };
    });
    if (width === 390) await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Diario", exact: true }).click();
    const entry = page.locator(".tasting-archive-entry").filter({ hasText: "Rosso degli amici" });
    await entry.locator("summary").click();
    await expect(entry).toContainText("Corpo: Leggero · Acidità: Fresca");
    await entry.getByRole("button", { name: "Modifica", exact: true }).click();
    const traits = entry.getByRole("group", { name: /Com’era in bocca/ });
    await expect(traits.getByRole("slider", { name: "Corpo" })).toHaveAttribute("aria-valuetext", "Leggero");
    await expect(traits.getByRole("slider", { name: "Tannino" })).toHaveAttribute("aria-valuetext", "Non indicato");
    await traits.getByRole("slider", { name: "Corpo" }).press("ArrowRight");
    await traits.getByRole("button", { name: "Togli acidità" }).click();
    await traits.getByRole("slider", { name: "Tannino" }).focus();
    await traits.getByRole("slider", { name: "Tannino" }).press("End");
    await traits.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await traits.screenshot({ path: testInfo.outputPath(`perceived-diary-editor-${width}.png`) });
    await entry.getByRole("button", { name: "Salva modifiche", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).editPayload?.tasting_perceived)).toEqual({ body: 3, tannin: 5 });
  });
}
