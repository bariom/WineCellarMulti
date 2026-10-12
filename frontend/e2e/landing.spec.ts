import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/session", route => route.fulfill({ json: { authenticated: false } }));
  await page.route("**/api/v1/public-config", route => route.fulfill({ json: { free_tier_label_limit: 23 } }));
  await page.addInitScript(() => localStorage.setItem("vinaris.cookie-consent", JSON.stringify({ marketing: false, updatedAt: "2026-09-23T00:00:00Z" })));
});

for (const locale of ["it", "en"] as const) {
  test(`${locale}: news timeline, navigation and registration work across viewports`, async ({ page }, testInfo) => {
    await page.goto(`/?lang=${locale}`);
    const news = page.getByRole("region", { name: locale === "it" ? "La tua passione cresce. Vinaris, anche." : "Your passion grows. So does Vinaris." });
    const articles = news.getByRole("article");
    await expect(articles).toHaveCount(2);
    await expect(articles.nth(0).getByRole("heading")).toHaveText(locale === "it" ? "Dallo scontrino alla cantina. In pochi gesti." : "From receipt to cellar. In a few simple steps.");
    await expect(articles.nth(1).getByRole("heading")).toHaveText(locale === "it" ? "Il vino finisce. La serata resta." : "The wine is finished. The evening stays.");
    await expect(articles.nth(0)).toContainText(locale === "it" ? "Verifica etichette, annate, quantità e prezzi" : "Review labels, vintages, quantities and prices");
    await expect(news.locator("time")).toHaveCount(2);
    for (const width of [360, 390, 430, 1200, 1440]) {
      await page.setViewportSize({ width, height: width >= 1200 ? 1000 : 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width < 1161) await page.getByRole("button", { name: locale === "it" ? "Apri menu" : "Open menu" }).click();
      const link = page.getByRole("link", { name: locale === "it" ? "Novità" : "What’s new", exact: true });
      await expect(link).toBeVisible();
      if (width >= 1200) {
        const brand = (await page.locator("header").getByRole("link", { name: "Vinaris", exact: true }).boundingBox())!;
        const nav = (await page.locator("header").getByRole("navigation").boundingBox())!;
        expect(nav.x).toBeGreaterThanOrEqual(brand.x + brand.width);
      }
      await link.click();
      await expect(page).toHaveURL(/#news$/);
      const first = (await articles.nth(0).boundingBox())!;
      const second = (await articles.nth(1).boundingBox())!;
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
      for (const article of await articles.all()) {
        const box = (await article.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        const label = (await article.locator(".marketing-news-label").boundingBox())!;
        const title = (await article.getByRole("heading").boundingBox())!;
        expect(title.y).toBeGreaterThanOrEqual(label.y + label.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await news.screenshot({ path: testInfo.outputPath(`news-${locale}-${width}.png`) });
    }
    await news.getByRole("button", { name: locale === "it" ? "Inizia con Vinaris" : "Get started with Vinaris" }).click();
    await expect(page.getByRole("textbox", { name: locale === "it" ? "Conferma password" : "Confirm password", exact: true })).toBeVisible();
  });

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
    const dashboard = page.getByRole("region", { name: locale === "it" ? "La tua cantina, a modo tuo." : "Your cellar. Your way." });
    const dashboardDemo = dashboard.getByRole("button", { name: locale === "it" ? "Provala nella demo" : "Try it in the demo" });
    for (const width of [360, 390, 430, 1200, 1440]) {
      await page.setViewportSize({ width, height: width >= 1200 ? 1000 : 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width < 1161) await page.getByRole("button", { name: locale === "it" ? "Apri menu" : "Open menu" }).click();
      await page.getByRole("link", { name: locale === "it" ? "La tua dashboard" : "Your dashboard", exact: true }).click();
      await expect(page).toHaveURL(/#dashboard$/);
      await expect(dashboard.getByRole("listitem")).toHaveCount(3);
      const preview = dashboard.getByRole("figure");
      const heading = (await dashboard.getByRole("heading", { level: 2 }).boundingBox())!;
      const previewBox = (await preview.boundingBox())!;
      if (width >= 1200) expect(previewBox.x).toBeGreaterThan(heading.x + heading.width);
      else {
        const note = (await dashboard.getByText(/Le modifiche durano|Changes last/).boundingBox())!;
        expect(previewBox.y).toBeGreaterThan(note.y + note.height);
      }
      const cards = await preview.getByRole("article").all();
      const boxes = await Promise.all(cards.map(card => card.boundingBox()));
      for (const box of boxes) {
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) {
        await dashboard.screenshot({ path: testInfo.outputPath(`dashboard-${locale}-${width}.png`) });
        await page.screenshot({ path: testInfo.outputPath(`full-landing-${locale}-${width}.png`), fullPage: true });
      }
    }
    // Both entry points share loading feedback; the new section opens the demo.
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/v1/auth/demo?**", async route => {
      await pending;
      await route.fulfill({ status: 503, json: { detail: "Demo temporarily unavailable" } });
    });
    const request = page.waitForRequest("**/api/v1/auth/demo?**");
    await dashboardDemo.click();
    expect((await request).method()).toBe("POST");
    await expect(hero.getByRole("button", { name: /Apertura|Opening/ })).toBeDisabled();
    await expect(dashboard.getByRole("button", { name: /Apertura|Opening/ })).toBeDisabled();
    release();
    await expect(demo).toBeEnabled();
    await expect(dashboardDemo).toBeEnabled();
    await hero.getByRole("button", { name: locale === "it" ? /Crea la tua cantina/ : /Build your cellar/ }).click();
    await expect(page.getByRole("textbox", { name: locale === "it" ? "Conferma password" : "Confirm password", exact: true })).toBeVisible();
  });
}
