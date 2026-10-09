import { expect, test, type Locator } from "@playwright/test";
import { memberships, mockApi, session, tastingArchive, wine } from "./fixtures/app";
import { readFileSync } from "node:fs";

for (const width of [390, 1440]) {
  test(`Polaroid thumbnails defer the full photo until opening details at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const photoUrl = "/api/v1/wines/tasting-photos/cellar/memory-1?v=photo-version";
    await mockApi(page, [], false, memberships, [wine], {
      ...session, dashboard_focus: "personal", personal_dashboard_widgets: [{ id: "polaroids", width: "full" }],
    }, [], undefined, { ...tastingArchive, total: 1, items: [{ ...tastingArchive.items[0], memory_photo_url: photoUrl }] });
    const photos: string[] = [];
    await page.route("**/api/v1/wines/tasting-photos/**", async route => {
      photos.push(route.request().url());
      await route.fulfill({ contentType: "image/jpeg", body: readFileSync("public/images/home-tasting-v1.jpg") });
    });
    await page.goto("/");
    const widget = page.locator('[data-widget-id="polaroids"]');
    const card = widget.locator(".memory-polaroid");
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator("img")).toHaveAttribute("src", `${photoUrl}&size=thumbnail`);
    await expect.poll(() => card.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.every(url => new URL(url).searchParams.get("size") === "thumbnail")).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`polaroid-thumbnails-${width}.png`) });
    await card.press("Enter");
    const book = page.getByRole("dialog", { name: "Momenti", exact: true });
    await expect(book.getByRole("img", { name: `Ricordo: ${wine.name}`, exact: true })).toHaveAttribute("src", photoUrl);
    await expect.poll(() => photos.some(url => !new URL(url).searchParams.has("size"))).toBe(true);
    await book.getByRole("button", { name: "Chiudi", exact: true }).click();
    await expect(card.locator("img")).toHaveAttribute("src", `${photoUrl}&size=thumbnail`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

async function expectReadablePagination(button: Locator) {
  await expect(button).toBeVisible();
  const contrast = await button.evaluate(element => {
    const style = getComputedStyle(element);
    const luminance = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(channel => {
      const scaled = channel / 255;
      return scaled <= .04045 ? scaled / 12.92 : ((scaled + .055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const text = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return { ratio: (Math.max(text, background) + .05) / (Math.min(text, background) + .05), background: style.backgroundColor };
  });
  expect(contrast.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
}

for (const locale of ["it", "en"] as const) {
  test(`Polaroid widget: ${locale} selection, layout, paging and return from details`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await mockApi(page, [], false, memberships, [wine], { ...session, locale, theme_preference: it ? "light" : "private-cellar", dashboard_focus: "personal", personal_dashboard_widgets: [] });
    await page.addInitScript(archive => {
      const original = window.fetch;
      const entries = Array.from({ length: 21 }, (_, i) => ({ ...archive.items[0], tasting_id: `polaroid-${i}`, occasion: `Aperitivo a San Quirico d'Orcia ${i + 1}`, memory_photo_url: "/images/home-tasting-v1.jpg" }));
      window.fetch = async (input, init) => {
        const url = new URL(String(input), location.href);
        if (url.pathname.includes("/wines/tasting-archive") && url.searchParams.has("photos_only")) {
          const offset = Number(url.searchParams.get("offset") || 0);
          const limit = Number(url.searchParams.get("limit") || 1);
          return Response.json({ ...archive, items: entries.slice(offset, offset + limit), total: entries.length, offset, limit });
        }
        return original(input, init);
      };
    }, tastingArchive);
    await page.goto("/");
    await expect(page.locator(".home-moments-entry")).toHaveCount(0);
    await page.getByRole("button", { name: it ? "Personalizza" : "Customize", exact: true }).click();
    await page.getByRole("checkbox", { name: /^Polaroid/ }).check();
    await page.getByLabel(it ? "Larghezza: Polaroid" : "Width: Polaroids", { exact: true }).selectOption("half");
    await page.mouse.move(0, 0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: it ? "Salva dashboard" : "Save dashboard", exact: true }).click();
    await page.reload();
    const widget = page.locator('[data-widget-id="polaroids"]');
    await expect(widget).toHaveClass(/personal-widget-half/);
    await expect(widget.locator(".memory-polaroid")).toHaveCount(20);
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await widget.scrollIntoViewIfNeeded();
      const surface = widget.locator(".memory-table-surface");
      const area = (await surface.boundingBox())!;
      expect(area.x).toBeGreaterThanOrEqual(0);
      expect(area.x + area.width).toBeLessThanOrEqual(width);
      expect(area.height).toBe(470);
      for (const card of await widget.locator(".memory-polaroid").all()) {
        expect(await card.locator(".memory-polaroid-caption").evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await widget.screenshot({ path: testInfo.outputPath(`polaroids-${locale}-${width}.png`) });
      if (width === 390 && it) await expect(surface).toHaveScreenshot("polaroids-widget-compact.png", { animations: "disabled" });
    }
    const next = widget.getByRole("button", { name: it ? "Successivi" : "Next", exact: true });
    await expect(widget.getByRole("navigation")).toContainText("1–20 / 21");
    await expectReadablePagination(next);
    await next.click();
    const card = widget.getByRole("button", { name: /San Quirico d'Orcia 21/ });
    await expect(card).toBeVisible();
    await card.focus();
    await page.keyboard.press("ArrowRight");
    const position = await card.getAttribute("style");
    await page.keyboard.press("Enter");
    const detail = page.getByRole("dialog", { name: it ? "Momenti" : "Moments", exact: true });
    await expect(detail.getByRole("heading", { name: "Aperitivo a San Quirico d'Orcia 21", exact: true })).toBeVisible();
    await detail.getByRole("button", { name: it ? "Chiudi" : "Close", exact: true }).click();
    await expect(card).toBeFocused();
    await expect(card).toHaveAttribute("style", position!);
    await expect(widget.getByRole("navigation")).toContainText("21–21 / 21");
    // Loading the album stylesheet must not make widget pagination transparent.
    await page.setViewportSize({ width: 390, height: 844 });
    const previous = widget.getByRole("button", { name: it ? "Precedenti" : "Previous", exact: true });
    await previous.scrollIntoViewIfNeeded();
    await expectReadablePagination(previous);
    await widget.getByRole("navigation").screenshot({ path: testInfo.outputPath(`polaroids-pagination-${locale}.png`) });
    await previous.click();
    await expect(widget.locator(".memory-polaroid")).toHaveCount(20);
  });
}

test("Polaroid widget handles empty albums and retries errors", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "personal", personal_dashboard_widgets: [{ id: "polaroids", width: "full" }] });
  await page.addInitScript(archive => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).includes("photos_only=true")) return sessionStorage.getItem("polaroids-retry")
        ? Response.json({ ...archive, items: [], total: 0 }) : new Response("Unavailable", { status: 503 });
      return original(input, init);
    };
  }, tastingArchive);
  await page.goto("/");
  const widget = page.locator('[data-widget-id="polaroids"]');
  await expect(widget.getByRole("alert")).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("polaroids-retry", "1"));
  await widget.getByRole("button", { name: "Riprova", exact: true }).click();
  await expect(widget.getByRole("status")).toContainText("Nessun ricordo trovato");
});
