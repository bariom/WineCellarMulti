import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/session", route => route.fulfill({ json: { authenticated: false } }));
  await page.route("**/api/v1/public-config", route => route.fulfill({ json: { free_tier_label_limit: 23 } }));
  await page.addInitScript(() => localStorage.setItem("vinaris.cookie-consent", JSON.stringify({ marketing: false, updatedAt: "2026-09-23T00:00:00Z" })));
});

for (const locale of ["it", "en"] as const) {
  test(`${locale}: demo and real screenshots stay usable on mobile and desktop`, async ({ page }, testInfo) => {
    await page.goto(`/?lang=${locale}`);
    const hero = page.getByRole("region", { name: locale === "it" ? "Quale vino apri stasera?" : "Know what to drink. Know what to keep." });
    const demo = hero.getByRole("button", { name: locale === "it" ? "Prova la cantina demo" : "Try the demo cellar" });
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await expect(demo).toBeVisible();
      const headingBox = await hero.getByRole("heading").boundingBox();
      const buttonBox = await demo.boundingBox();
      expect(buttonBox!.y).toBeGreaterThan(headingBox!.y + headingBox!.height);
      expect(buttonBox!.y + buttonBox!.height).toBeLessThan(viewport.height);
      expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
      expect(buttonBox!.x).toBeGreaterThanOrEqual(0);
      expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const screenshot = hero.getByRole("img");
      await expect.poll(() => screenshot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      expect(await screenshot.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain(`demo-drink-${viewport.width <= 600 ? "mobile" : "desktop"}-${locale}.png`);
      const imageBox = await screenshot.boundingBox();
      expect(imageBox!.x).toBeGreaterThanOrEqual(0);
      expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(viewport.width);
      if (viewport.width === 390 || viewport.width === 1440) {
        await page.screenshot({ path: testInfo.outputPath(`landing-${locale}-${viewport.width}.png`) });
      }
    }
    await expect(hero.getByText(/23/)).toBeVisible();
    const collectorPreview = page.getByRole("img", { name: locale === "it" ? "Dashboard mobile reale della cantina demo Vinaris" : "Real mobile dashboard of the Vinaris demo cellar" });
    // The founder section must use the current 390 × 844 mobile capture.
    await expect.poll(() => collectorPreview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([390, 844]);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.locator('#product').screenshot({ path: testInfo.outputPath(`founder-${locale}-${width}.png`) });
    }
    const knowledge = page.getByRole("region", { name: locale === "it" ? "Cantina vino digitale per collezionisti e sommelier" : "Digital wine cellar for collectors and sommeliers" });
    const regionsMap = knowledge.getByRole("img");
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await regionsMap.scrollIntoViewIfNeeded();
      await expect.poll(() => regionsMap.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(regionsMap).toHaveAttribute("src", `/landing/demo-regions-${locale}.png`);
      const mapBox = (await regionsMap.boundingBox())!;
      const textBox = (await knowledge.getByRole("heading", { level: 2 }).boundingBox())!;
      expect(mapBox.x).toBeGreaterThanOrEqual(0);
      expect(mapBox.x + mapBox.width).toBeLessThanOrEqual(width);
      if (width === 1440) expect(mapBox.x).toBeGreaterThan(textBox.x + textBox.width);
      else expect(mapBox.y).toBeGreaterThan(textBox.y + textBox.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await knowledge.screenshot({ path: testInfo.outputPath(`regions-${locale}-${width}.png`) });
    }
    // Delay the demo response to verify immediate feedback and prevent repeated requests.
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/v1/auth/demo?**", async route => {
      await pending;
      await route.fulfill({ status: 503, json: { detail: "Demo temporarily unavailable" } });
    });
    const request = page.waitForRequest("**/api/v1/auth/demo?**");
    await demo.click();
    expect((await request).method()).toBe("POST");
    await expect(hero.getByRole("button", { name: /Apertura|Opening/ })).toBeDisabled();
    release();
    await expect(demo).toBeEnabled();
    await hero.getByRole("button", { name: locale === "it" ? /Crea la tua cantina/ : /Build your cellar/ }).click();
    await expect(page.getByRole("textbox", { name: locale === "it" ? "Conferma password" : "Confirm password", exact: true })).toBeVisible();
  });
}
