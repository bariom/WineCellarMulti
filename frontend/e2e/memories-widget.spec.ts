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
    await expect(widget.getByRole("button", { name: it ? "Ricordo precedente" : "Previous memory" })).toBeDisabled();
    await expect(widget.getByRole("button", { name: it ? "Ricordo successivo" : "Next memory" })).toBeDisabled();
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
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: [] });
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

test("memories widget: shared card format and inline browsing with retry", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: [{ id: "memories", width: "half" }, { id: "news", width: "half" }] });
  await page.addInitScript(archive => {
    const original = window.fetch;
    (window as any).memoryOffsets = [];
    window.fetch = async (input, init) => {
      if (String(input).includes("photos_only=true")) {
        const offset = Number(new URL(String(input), location.href).searchParams.get("offset") || 0);
        (window as any).memoryOffsets.push(offset);
        if (offset === 1 && (window as any).failNextMemory) return new Response("Unavailable", { status: 503 });
        const entry = { ...archive.items[0], tasting_id: `memory-${offset}`, occasion: offset === 0 ? "Cena con amici" : "Una sera sul lago", companions: offset === 0 ? "Anna e Marco" : "Sheila", note: "Una serata da ricordare.", memory_photo_url: "/images/home-tasting-v1.jpg" };
        return Response.json({ ...archive, items: [entry], total: 2, offset, limit: 1 });
      }
      return original(input, init);
    };
  }, tastingArchive);
  await page.goto("/");
  const widget = page.locator('[data-widget-id="memories"]');
  const previous = widget.getByRole("button", { name: "Ricordo precedente" });
  const next = widget.getByRole("button", { name: "Ricordo successivo" });
  await expect(widget).toContainText("Cena con amici");
  await expect(previous).toBeDisabled();
  await page.evaluate(() => { (window as any).failNextMemory = true; });
  await next.click();
  await expect(widget.getByRole("alert")).toBeVisible();
  await page.evaluate(() => { (window as any).failNextMemory = false; });
  await widget.getByRole("button", { name: "Riprova" }).click();
  await expect(widget).toContainText("Una sera sul lago");
  await expect(widget.getByRole("navigation")).toContainText("2 / 2");
  await expect(next).toBeDisabled();
  await widget.getByRole("button", { name: "Sfoglia i ricordi", exact: true }).click();
  const album = page.getByRole("dialog", { name: "Momenti", exact: true });
  await expect(album.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  await album.getByRole("button", { name: "Chiudi", exact: true }).click();
  await previous.focus();
  await page.keyboard.press("Enter");
  await expect(widget).toContainText("Cena con amici");
  expect(await page.evaluate(() => (window as any).memoryOffsets)).toContain(1);
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await next.scrollIntoViewIfNeeded();
    const nav = (await widget.getByRole("navigation").boundingBox())!;
    const footer = (await widget.locator("footer").boundingBox())!;
    expect(nav.y + nav.height).toBeLessThanOrEqual(footer.y);
    for (const control of [previous, next]) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 1440) {
      const cards = page.locator(".personal-widget .dashboard-summary");
      const styles = await cards.evaluateAll(elements => elements.map(element => { const style = getComputedStyle(element); return [style.borderRadius, style.padding, style.backgroundImage, element.getBoundingClientRect().height]; }));
      expect(styles[0]).toEqual(styles[1]);
      await page.locator(".personal-widget-grid").screenshot({ path: testInfo.outputPath("memories-matching-cards.png") });
    }
    if (width === 390) await page.screenshot({ path: testInfo.outputPath("memories-inline-mobile.png") });
  }
});
