import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, tastingArchive, wine } from "./fixtures/app";

for (const locale of ["it", "en"] as const) {
  test(`Polaroid widget: ${locale} selection, layout, paging and return from details`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await mockApi(page, [], false, memberships, [wine], { ...session, locale, dashboard_focus: "personal", personal_dashboard_widgets: [] });
    await page.addInitScript(archive => {
      const original = window.fetch;
      const entries = Array.from({ length: 7 }, (_, i) => ({ ...archive.items[0], tasting_id: `polaroid-${i}`, occasion: `Aperitivo a San Quirico d'Orcia ${i + 1}`, memory_photo_url: "/images/home-tasting-v1.jpg" }));
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
    await expect(widget.locator(".memory-polaroid")).toHaveCount(6);
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await widget.scrollIntoViewIfNeeded();
      const surface = widget.locator(".memory-table-surface");
      const area = (await surface.boundingBox())!;
      expect(area.x).toBeGreaterThanOrEqual(0);
      expect(area.x + area.width).toBeLessThanOrEqual(width);
      for (const card of await widget.locator(".memory-polaroid").all()) {
        expect(await card.locator(".memory-polaroid-caption").evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await widget.screenshot({ path: testInfo.outputPath(`polaroids-${locale}-${width}.png`) });
      if (width === 390 && it) await expect(surface).toHaveScreenshot("polaroids-widget-compact.png", { animations: "disabled" });
    }
    await widget.getByRole("button", { name: it ? "Successivi" : "Next", exact: true }).click();
    const card = widget.getByRole("button", { name: /San Quirico d'Orcia 7/ });
    await expect(card).toBeVisible();
    await card.focus();
    await page.keyboard.press("ArrowRight");
    const position = await card.getAttribute("style");
    await page.keyboard.press("Enter");
    const detail = page.getByRole("dialog", { name: it ? "Momenti" : "Moments", exact: true });
    await expect(detail.getByRole("heading", { name: "Aperitivo a San Quirico d'Orcia 7", exact: true })).toBeVisible();
    await detail.getByRole("button", { name: it ? "Chiudi" : "Close", exact: true }).click();
    await expect(card).toBeFocused();
    await expect(card).toHaveAttribute("style", position!);
    await expect(widget.getByRole("navigation")).toContainText("7–7 / 7");
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
