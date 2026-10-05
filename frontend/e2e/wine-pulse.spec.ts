import { expect, test, type Page } from "@playwright/test";
import { mockApi, session, memberships, wine } from "./fixtures/app";

async function openPulse(page: Page, locale = "it") {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00Z"));
  await mockApi(page, [], false, memberships, [wine], { ...session, locale });
  await page.addInitScript(() => {
    const original = window.fetch;
    (window as any).pulseFail = false;
    (window as any).pulseMoreFail = false;
    window.fetch = async (input, init) => {
      if (!String(input).includes("/wine-pulse?")) return original(input, init);
      const params = new URL(String(input), location.href).searchParams;
      const offset = Number(params.get("offset") || 0);
      if ((window as any).pulseFail || (offset && (window as any).pulseMoreFail)) return new Response("Unavailable", { status: 503 });
      const archive = params.get("view") === "archive";
      const all = [
        { id: "one", headline: "Toscana, una nuova annata da scoprire", category: "regions_vintages", source: "Vigne e territori" },
        { id: "two", headline: "Il mercato dei grandi vini cambia passo", category: "market", source: "Wine Journal" },
        { id: "three", headline: "Le famiglie che custodiscono la vigna", category: "producers", source: "Wine Journal" },
        { id: "four", headline: "Vendemmia e clima: le voci dei produttori", category: "climate_vineyards", source: "Vigne e territori" },
        { id: "five", headline: "Un festival tra i vigneti", category: "events_awards", source: "Wine Journal" },
      ].map(item => ({ ...item, headline: archive ? `Archivio: ${item.headline}` : item.headline, source_url: "https://example.com", article_url: `https://example.com/${item.id}`, published_at: "2026-10-04T09:00:00Z", source_language: "it", original_title: item.headline, summary: "Territori, persone e bottiglie: una prospettiva sul mondo del vino, da approfondire attraverso la voce delle fonti originali.", importance_score: 80, image_url: item.id === "one" ? "/images/home-vineyard-v1.jpg" : null, ai_generated: true }));
      const category = params.get("category");
      const filtered = all.filter(item => !category || item.category === category);
      const items = filtered.slice(offset, offset + 4);
      if (offset && (window as any).pulseSlow) await new Promise(resolve => setTimeout(resolve, 500));
      return Response.json({ items, total: filtered.length, offset, next_offset: offset + items.length < filtered.length ? offset + items.length : null, has_more: offset + items.length < filtered.length, generated_at: "2026-10-05T08:00:00Z" });
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Wine Pulse", exact: true }).click();
  return page.locator(".wine-pulse-view");
}

for (const locale of ["it", "en"]) {
  test(`Wine Pulse ${locale}: full width, reading tools and responsive edition`, async ({ page }, testInfo) => {
    const it = locale === "it";
    const pulse = await openPulse(page, locale);
    await expect(pulse.getByRole("article")).toHaveCount(4);
    for (const width of [360, 390, 430, 1440, 1920]) {
      await page.setViewportSize({ width, height: width >= 1440 ? 1000 : 844 });
      const bounds = (await pulse.boundingBox())!;
      // Match the app canvas, which intentionally caps its width on ultrawide screens.
      const appHeader = (await page.locator(".topbar").boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(appHeader.width - 2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const hero = (await pulse.locator(".wine-pulse-hero").boundingBox())!;
      const controls = (await pulse.locator(".wine-pulse-controls").boundingBox())!;
      expect(hero.y + hero.height).toBeLessThanOrEqual(controls.y);
      const cards = await pulse.getByRole("article").all();
      const boxes = await Promise.all(cards.map(card => card.boundingBox()));
      for (const box of boxes) { expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width); }
      if (width >= 1440) {
        expect(boxes[1]!.x + boxes[1]!.width).toBeLessThan(boxes[2]!.x);
        const index = (await pulse.getByRole("complementary").boundingBox())!;
        expect(index.x).toBeGreaterThan(boxes[0]!.x + boxes[0]!.width);
      }
      if (width === 390 || width === 1440) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath(`pulse-${locale}-${width}.png`), fullPage: true });
        await pulse.locator(".wine-pulse-hero").screenshot({ path: testInfo.outputPath(`pulse-hero-${locale}-${width}.png`) });
        await cards[0].screenshot({ path: testInfo.outputPath(`pulse-cover-${locale}-${width}.png`) });
      }
    }
    const search = pulse.getByRole("searchbox");
    await search.fill("famiglie");
    await expect(pulse.getByRole("article")).toHaveCount(1);
    await pulse.getByRole("button", { name: it ? "Segna come letta" : "Mark as read" }).click();
    await pulse.getByRole("button", { name: it ? "Solo da leggere" : "Unread only" }).click();
    await expect(pulse.getByRole("article")).toHaveCount(0);
    await pulse.getByRole("button", { name: it ? "Azzera i filtri di lettura" : "Clear reading filters" }).click();
    await expect(pulse.getByRole("article")).toHaveCount(4);
    await expect(pulse.getByRole("button", { name: it ? "✓ Letta" : "✓ Read", exact: true })).toHaveAttribute("aria-pressed", "true");
    await pulse.getByRole("navigation").getByRole("link").nth(2).click();
    await expect(page).toHaveURL(/#pulse-story-three$/);
    await expect(pulse.getByRole("article").first().getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
    await pulse.getByLabel(it ? "Argomento" : "Topic", { exact: true }).selectOption("market");
    await expect(pulse.getByRole("article")).toHaveCount(1);
    await pulse.getByRole("tab", { name: it ? "Archivio" : "Archive", exact: true }).click();
    await expect(pulse.getByRole("article")).toContainText("Archivio:");
  });
}

test("Wine Pulse retries feed and pagination errors and discards stale pagination", async ({ page }) => {
  const pulse = await openPulse(page);
  await expect(pulse.getByRole("article")).toHaveCount(4);
  await page.evaluate(() => { (window as any).pulseMoreFail = true; });
  await pulse.getByRole("button", { name: "Carica altre storie" }).click();
  await expect(pulse.getByRole("alert")).toBeVisible();
  await expect(pulse.getByRole("article")).toHaveCount(4);
  await page.evaluate(() => { (window as any).pulseMoreFail = false; (window as any).pulseSlow = true; });
  await pulse.getByRole("button", { name: "Carica altre storie" }).click();
  await pulse.getByLabel("Argomento", { exact: true }).selectOption("market");
  await expect(pulse.getByRole("article")).toHaveCount(1);
  await expect(pulse.getByRole("article")).toContainText("mercato");
  await page.evaluate(() => { (window as any).pulseFail = true; });
  await pulse.getByRole("tab", { name: "Archivio", exact: true }).click();
  await expect(pulse.getByRole("alert")).toBeVisible();
  await page.evaluate(() => { (window as any).pulseFail = false; (window as any).pulseSlow = false; });
  await pulse.getByRole("button", { name: "Riprova", exact: true }).click();
  await expect(pulse.getByRole("article")).toHaveCount(1);
  await pulse.getByLabel("Argomento", { exact: true }).selectOption("all");
  await expect(pulse.getByRole("article")).toHaveCount(4);
  await pulse.getByRole("button", { name: "Carica altre storie" }).click();
  await expect(pulse.getByRole("article")).toHaveCount(5);
  await expect(pulse.getByRole("button", { name: "Carica altre storie" })).toHaveCount(0);
});
