import { expect, test } from "@playwright/test";
import { mockApi, session, memberships, wine, tastingArchive } from "./fixtures/app";

for (const locale of ["it", "en"] as const) {
  test(`memories widget: ${locale} album, layout and saved selection`, async ({ page }, testInfo) => {
    const it = locale === "it";
    const title = it ? "I miei ricordi" : "My memories";
    await mockApi(page, [], false, memberships, [wine], { ...session, locale, dashboard_focus: "personal", personal_dashboard_widgets: [] }, [], undefined, {
      ...tastingArchive, total: 1, items: [{ ...tastingArchive.items[0], occasion: "Cena con amici", companions: "Anna e Marco", note: "Una serata da ricordare.", memory_photo_url: "/images/home-tasting-v1.jpg" }],
    });
    await page.goto(`/?lang=${locale}`);
    await page.getByRole("button", { name: it ? "Personalizza" : "Customize", exact: true }).click();
    await page.getByRole("checkbox", { name: new RegExp(`^${title}`) }).check();
    await page.getByRole("button", { name: it ? "Salva dashboard" : "Save dashboard", exact: true }).click();
    await page.reload();
    const widget = page.locator('[data-widget-id="memories"]');
    await expect(widget.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(widget).toContainText("Cena con amici");
    await expect(widget).toContainText("Anna e Marco");
    const photo = widget.getByRole("img");
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await widget.scrollIntoViewIfNeeded();
      const image = (await photo.boundingBox())!;
      const caption = (await widget.getByRole("heading", { name: "Cena con amici" }).boundingBox())!;
      expect(caption.y).toBeGreaterThanOrEqual(image.y + image.height);
      const button = (await widget.getByRole("button", { name: it ? "Sfoglia i ricordi" : "Browse memories" }).boundingBox())!;
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.x).toBeGreaterThanOrEqual(0);
      expect(button.x + button.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await widget.screenshot({ path: testInfo.outputPath(`memories-${locale}-${width}.png`) });
      if (width === 390) {
        await widget.getByRole("button", { name: it ? "Sfoglia i ricordi" : "Browse memories" }).click();
        const mobileAlbum = page.getByRole("dialog", { name: it ? "Momenti" : "Moments", exact: true });
        await expect(mobileAlbum.getByRole("heading", { name: "Cena con amici" })).toBeVisible();
        await mobileAlbum.getByRole("button", { name: it ? "Chiudi" : "Close", exact: true }).click();
        await page.screenshot({ path: testInfo.outputPath(`memories-footer-${locale}.png`) });
      }
    }
    await widget.getByRole("button", { name: it ? "Sfoglia i ricordi" : "Browse memories" }).click();
    const album = page.getByRole("dialog", { name: it ? "Momenti" : "Moments", exact: true });
    await expect(album.getByRole("heading", { name: "Cena con amici" })).toBeVisible();
    await album.getByRole("button", { name: it ? "Chiudi" : "Close", exact: true }).click();
    await expect(album).toHaveCount(0);
  });
}

test("memories widget: empty album, failed request retry and unavailable photo", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, is_demo: true, dashboard_focus: "personal", personal_dashboard_widgets: [] });
  await page.goto("/");
  await page.evaluate((archive) => {
    const original = window.fetch;
    (window as any).memoryMode = "error";
    window.fetch = async (input, init) => {
      if (String(input).includes("photos_only=true")) {
        if ((window as any).memoryMode === "error") return new Response("Unavailable", { status: 503 });
        if ((window as any).memoryMode === "empty") return Response.json({ ...archive, items: [], total: 0 });
        return Response.json({ ...archive, items: [{ ...archive.items[0], memory_photo_url: "/missing-memory.jpg", occasion: "Ricordo senza foto" }], total: 1 });
      }
      return original(input, init);
    };
  }, tastingArchive);
  await page.route("**/missing-memory.jpg", route => route.fulfill({ status: 404 }));
  await page.getByRole("button", { name: "Personalizza", exact: true }).click();
  await page.getByRole("checkbox", { name: /^I miei ricordi/ }).check();
  await page.getByRole("button", { name: "Salva dashboard", exact: true }).click();
  const widget = page.locator('[data-widget-id="memories"]');
  await expect(widget.getByRole("alert")).toContainText("Impossibile caricare");
  await page.evaluate(() => { (window as any).memoryMode = "empty"; });
  await widget.getByRole("button", { name: "Riprova" }).click();
  await expect(widget).toContainText("Il tuo album aspetta");
  await page.evaluate(() => { (window as any).memoryMode = "photo"; });
  await page.getByRole("button", { name: "Personalizza", exact: true }).click();
  await page.getByRole("checkbox", { name: /^I miei ricordi/ }).uncheck();
  await page.getByRole("checkbox", { name: /^I miei ricordi/ }).check();
  await page.getByRole("button", { name: "Salva dashboard", exact: true }).click();
  await expect(widget).toContainText("La foto non è disponibile, il ricordo resta.");
  await expect(widget).toContainText("Ricordo senza foto");
});
