import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mockApi, openRecordTasting, tastingArchive, wine } from "./fixtures/app";
import { memoryMonthBounds, parseMemoryMonth } from "../src/domain/memoryPeriod";

async function openBook(page: Page, mode: "photos" | "empty" | "error" = "photos", bottlePhoto = "", memoryPhoto = "/images/home-tasting-v1.jpg") {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  await page.evaluate(({ archive, mode, bottlePhoto, memoryPhoto }) => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("photos_only=true")) {
        (window as any).bookRequests = ((window as any).bookRequests || 0) + 1;
        if (mode === "error" && !(window as any).allowBookRetry) return new Response("Unavailable", { status: 503 });
        const params = new URL(url, location.href).searchParams;
        const offset = Number(params.get("offset") || 0);
        const query = (params.get("q") || "").trim().toLowerCase();
        (window as any).bookSearchRequests = [...((window as any).bookSearchRequests || []), { query, offset }];
        const memories = (window as any).bookMemories ?? (mode === "empty" ? [] : [0, 1].map(index => ({ ...archive.items[0], tasting_id: `memory-${index}`, wine_name: index === 0 ? "Un brindisi in Toscana" : "Una sera sul lago", occasion: "", wine_photo_thumbnail_url: index === 0 ? bottlePhoto : "", memory_photo_url: memoryPhoto, memory_photo_location: index === 0 ? { latitude: 43.77, longitude: 11.25 } : null })));
        const from = params.get("from_date") || "";
        const to = params.get("to_date") || "";
        (window as any).bookPeriodRequests = [...((window as any).bookPeriodRequests || []), { from, to, query, offset }];
        if ([from, to].some(date => date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return new Response("Invalid date", { status: 422 });
        const matches = memories.filter((item: typeof archive.items[number]) => (!from || item.consumed_at >= from) && (!to || item.consumed_at <= to) && [item.wine_name, item.wine_producer, item.wine_vintage, item.note, item.companions, item.pairing, item.occasion].join(" ").toLowerCase().includes(query));
        const limit = Number(params.get("limit") || 1);
        return new Response(JSON.stringify({ ...archive, offset, limit, total: matches.length, items: matches.slice(offset, offset + limit) }), { headers: { "Content-Type": "application/json" } });
      }
      return original(input, init);
    };
  }, { archive: tastingArchive, mode, bottlePhoto, memoryPhoto });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Storico", exact: true }).click();
  await page.getByRole("button", { name: "Momenti · Sfoglia i ricordi", exact: true }).click();
  return page.getByRole("dialog", { name: "Momenti", exact: true });
}

test("polaroid captions fit medium and long titles without clipping or covering dates", async ({ page }, testInfo) => {
  const book = await openBook(page);
  const titles = ["Cena", "Aperitivo a San Quirico d'Orcia", "Una degustazione speciale con gli amici nella cantina di famiglia", "Una serata indimenticabile alla scoperta delle grandi annate, tra racconti dei produttori, piatti della tradizione e brindisi con tutti gli amici"];
  await page.evaluate(({ archive, titles }) => {
    (window as any).bookMemories = titles.map((occasion, i) => ({ ...archive.items[0], tasting_id: `caption-${i}`, occasion, memory_photo_url: "/images/home-tasting-v1.jpg" }));
  }, { archive: tastingArchive, titles });
  await book.getByRole("button", { name: "Polaroid", exact: true }).click();
  await expect(book.locator(".memory-polaroid")).toHaveCount(titles.length);
  const fontSizes: number[] = [];
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const title of titles) {
      const card = book.getByRole("button", { name: `Apri degustazione: ${title}`, exact: true });
      await card.focus();
      await page.keyboard.press("ArrowRight"); // Bring each overlapping photo forward for review.
      await expect.poll(() => card.evaluate(element => {
        const caption = element.querySelector<HTMLSpanElement>(".memory-polaroid-caption")!;
        const date = element.querySelector("time")!;
        return caption.scrollHeight <= caption.clientHeight && caption.scrollWidth <= caption.clientWidth
          && caption.offsetTop + caption.scrollHeight <= date.offsetTop;
      })).toBe(true);
      const font = await card.locator(".memory-polaroid-caption").evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      expect(font).toBeGreaterThanOrEqual(11);
      if (title === titles[1]) fontSizes.push(font);
      if ([390, 1440].includes(viewport.width) && title === titles[1]) await card.screenshot({ path: testInfo.outputPath(`caption-${viewport.width}-review.png`) });
    }
    expect(await book.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  expect(fontSizes[3]).toBeGreaterThan(fontSizes[0]);
  await page.keyboard.press("Enter");
  await expect(book.getByRole("heading", { name: titles[3], exact: true })).toBeVisible();
  await book.getByRole("button", { name: "Torna alle Polaroid" }).click();
  await expect(book.locator(".memory-polaroid")).toHaveCount(4);
});

test("polaroid table supports dragging, tasting details and returning to the same arrangement", async ({ page }, testInfo) => {
  const book = await openBook(page);
  await book.getByRole("button", { name: "Polaroid", exact: true }).click();
  const table = book.getByRole("region", { name: "Polaroid" });
  const card = table.getByRole("button", { name: "Apri degustazione: Una sera sul lago", exact: true });
  await expect(card).toBeVisible();
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    const fullscreen = (await book.boundingBox())!;
    expect(fullscreen.x).toBe(0);
    expect(fullscreen.y).toBe(0);
    expect(fullscreen.width).toBe(viewport.width);
    expect(fullscreen.height).toBe(viewport.height);
    const surface = table.locator(".memory-table-surface");
    const area = (await surface.boundingBox())!;
    expect(area.height).toBeGreaterThanOrEqual(viewport.height * (viewport.width >= 900 ? .75 : .65));
    const close = (await book.getByRole("button", { name: "Chiudi", exact: true }).boundingBox())!;
    const title = (await book.getByRole("heading", { name: "I miei ricordi", exact: true }).boundingBox())!;
    expect(title.x + title.width).toBeLessThanOrEqual(close.x);
    expect((await book.getByRole("search").boundingBox())!.y).toBeGreaterThanOrEqual(title.y + title.height);
    expect(await book.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    for (const polaroid of await table.locator(".memory-polaroid").all()) {
      const box = (await polaroid.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(area.x);
      expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
      expect(box.y).toBeGreaterThanOrEqual(area.y);
      expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
    }
    expect(await book.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if ([390, 1440].includes(viewport.width)) await page.screenshot({ path: testInfo.outputPath(`polaroid-table-${viewport.width}-review.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(book).toHaveScreenshot("moments-polaroid-table-compact.png");
  const before = (await card.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + 60);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 - 35, before.y + 160, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await card.boundingBox())!.y).toBeGreaterThan(before.y + 80);
  const arrangement = await card.evaluate(element => ({ left: element.style.left, top: element.style.top }));
  await expect(book.getByRole("button", { name: "Torna alle Polaroid" })).toHaveCount(0);
  await page.waitForTimeout(400); // Drag gestures must not accidentally activate double-click.
  await card.dblclick();
  await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  await expect(book.locator(".memory-book-tasting-details")).toContainText("5 / 6");
  await expect(book.locator(".memory-book-tasting-details")).toContainText("Brasato");
  await page.screenshot({ path: testInfo.outputPath("polaroid-tasting-detail-review.png") });
  await expect(table).toBeHidden();
  await book.getByRole("button", { name: "Torna alle Polaroid", exact: true }).click();
  await expect(card).toBeVisible();
  expect(await card.evaluate(element => ({ left: element.style.left, top: element.style.top }))).toEqual(arrangement);
  await card.focus();
  await page.keyboard.press("ArrowLeft");
  expect(await card.evaluate(element => element.style.left)).not.toEqual(arrangement.left);
  await page.keyboard.press("Enter");
  await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  await book.getByRole("button", { name: "Torna alle Polaroid" }).click();
  await card.focus();
  for (let i = 0; i < 20; i++) { await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowLeft"); }
  const edge = (await card.boundingBox())!;
  const surfaceBounds = (await table.locator(".memory-table-surface").boundingBox())!;
  expect(edge.x).toBeGreaterThanOrEqual(surfaceBounds.x);
  expect(edge.y).toBeGreaterThanOrEqual(surfaceBounds.y);
  expect(edge.x + edge.width).toBeLessThanOrEqual(surfaceBounds.x + surfaceBounds.width);
  expect(edge.y + edge.height).toBeLessThanOrEqual(surfaceBounds.y + surfaceBounds.height);
  await book.getByRole("searchbox").fill("Toscana");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(table.locator(".memory-polaroid")).toHaveCount(1);
  await expect(table).toContainText("Un brindisi in Toscana");
  await book.getByRole("searchbox").fill("nessun risultato");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(table).toContainText("Nessun ricordo trovato");
});

test.describe("touch polaroids", () => {
  test.use({ hasTouch: true });
  test("double tap opens a tasting and returns to the table", async ({ page }) => {
    const book = await openBook(page);
    await book.getByRole("button", { name: "Polaroid", exact: true }).tap();
    const card = book.getByRole("button", { name: "Apri degustazione: Una sera sul lago" });
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    const x = box.x + box.width / 2; const y = box.y + 50;
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 25, y: y + 90 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => (await card.boundingBox())!.y).toBeGreaterThan(box.y + 70);
    await expect(book.getByRole("button", { name: "Torna alle Polaroid" })).toHaveCount(0);
    await card.tap();
    await card.tap();
    await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
    await book.getByRole("button", { name: "Torna alle Polaroid" }).tap();
    await expect(card).toBeVisible();
  });
});

test("polaroid table paginates, preserves filters and retries errors", async ({ page }) => {
  const book = await openBook(page);
  await page.evaluate(archive => {
    (window as any).bookMemories = Array.from({ length: 23 }, (_, i) => ({ ...archive.items[0], tasting_id: `table-${i}`, wine_name: `Vino ${i}`, occasion: "", memory_photo_url: "/images/home-tasting-v1.jpg" }));
  }, tastingArchive);
  await book.getByRole("button", { name: "Polaroid", exact: true }).click();
  const table = book.getByRole("region", { name: "Polaroid" });
  await expect(table.locator(".memory-polaroid")).toHaveCount(20);
  await table.getByRole("button", { name: "Successivi", exact: true }).click();
  await expect(table.locator(".memory-polaroid")).toHaveCount(3);
  await expect(table.getByRole("button", { name: "Successivi" })).toBeDisabled();
  await table.getByRole("button", { name: "Apri degustazione: Vino 22", exact: true }).dblclick();
  await expect(book.getByRole("heading", { name: "Vino 22", exact: true })).toBeVisible();
  await book.getByRole("button", { name: "Torna alle Polaroid" }).click();
  await expect(table.locator(".memory-polaroid")).toHaveCount(3);
  await book.getByRole("searchbox").fill("Vino 5");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(table.locator(".memory-polaroid")).toHaveCount(1);
  await expect(table).toContainText("Vino 5");
  await book.getByRole("button", { name: "Chiudi", exact: true }).click();
  await openBook(page, "error");
  await book.getByRole("button", { name: "Polaroid", exact: true }).click();
  await expect(table.getByRole("alert")).toBeVisible();
  await page.evaluate(() => { (window as any).allowBookRetry = true; });
  await table.getByRole("button", { name: "Riprova" }).click();
  await expect(table.locator(".memory-polaroid")).toHaveCount(2);
});

test("memory album and polaroids follow the selected theme", async ({ page }, testInfo) => {
  const book = await openBook(page);
  await book.getByRole("button", { name: "Polaroid", exact: true }).click();
  await expect(book.locator(".memory-polaroid")).toHaveCount(2);
  for (const theme of ["light", "dark", "private-cellar", "sepia", "burgundy", "champagne"]) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    await expect.poll(async () => book.evaluate(element => {
      const probe = document.createElement("span");
      probe.style.color = "var(--text)"; probe.style.backgroundColor = "var(--surface-raised)";
      element.append(probe);
      const expected = getComputedStyle(probe);
      const actual = getComputedStyle(element.querySelector(".memory-polaroid")!);
      const result = { text: actual.color, paper: actual.backgroundColor, expectedText: expected.color, expectedPaper: expected.backgroundColor };
      probe.remove(); return result.text === result.expectedText && result.paper === result.expectedPaper;
    })).toBe(true);
    if (["dark", "private-cellar"].includes(theme)) await page.screenshot({ path: testInfo.outputPath(`polaroids-${theme}-review.png`) });
  }
});

test("browse memories, optionally open the map, and keep layouts inside the viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/tile\.openstreetmap\.org/, route => route.fulfill({ status: 204, body: "" }));
  const book = await openBook(page);
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await expect(book.getByRole("button", { name: "Ricordo precedente" })).toBeDisabled();
  await expect(book.getByRole("region", { name: "Luogo della foto" })).toHaveCount(0);
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const bounds = (await book.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await book.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const albumTitle = (await book.getByRole("heading", { name: "I miei ricordi", exact: true }).boundingBox())!;
    const close = (await book.getByRole("button", { name: "Chiudi", exact: true }).boundingBox())!;
    const search = (await book.getByRole("search").boundingBox())!;
    expect(albumTitle.x + albumTitle.width).toBeLessThanOrEqual(close.x);
    expect(albumTitle.y + albumTitle.height).toBeLessThanOrEqual(search.y);
    const image = (await book.getByRole("img", { name: "Ricordo: Un brindisi in Toscana", exact: true }).boundingBox())!;
    expect(search.y + search.height).toBeLessThanOrEqual(image.y);
    const title = (await book.getByRole("heading", { name: "Un brindisi in Toscana" }).boundingBox())!;
    expect(image.y + image.height).toBeLessThanOrEqual(title.y);
    const hint = (await book.locator(".memory-book-photo-hint").boundingBox())!;
    expect(hint.x).toBeGreaterThanOrEqual(image.x);
    expect(hint.x + hint.width).toBeLessThanOrEqual(image.x + image.width);
    expect(hint.y).toBeGreaterThanOrEqual(image.y);
    expect(hint.y + hint.height).toBeLessThanOrEqual(image.y + image.height);
    const controls = await book.getByRole("button").all();
    for (const control of controls) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 1440) await page.screenshot({ path: testInfo.outputPath("moments-desktop-review.png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await book.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath("moments-compact-review.png") });
  await expect(book).toHaveScreenshot("moments-compact.png");
  await book.getByRole("button", { name: "Mostra luogo sulla mappa" }).click();
  await expect(book.getByRole("region", { name: "Luogo della foto" })).toBeVisible();
  await expect(book.getByText("43.77000, 11.25000")).toBeVisible();
  await book.getByRole("button", { name: "Nascondi mappa" }).click();
  await book.getByRole("button", { name: "Ricordo successivo" }).click();
  await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  await expect(book.getByRole("button", { name: "Mostra luogo sulla mappa" })).toHaveCount(0);
  await expect(book.getByRole("button", { name: "Ricordo successivo" })).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(book).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Momenti · Sfoglia i ricordi", exact: true })).toBeFocused();
});

test("portrait memories keep search, captions and navigation visible without vertical scrolling", async ({ page }, testInfo) => {
  const photo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="720"><rect width="400" height="720" fill="#a5b4aa"/><path d="M110 80h180l-25 290h-130Z" fill="#eee6cf"/><path d="M200 370v250m-80 20h160" stroke="#fffaf5" stroke-width="12"/></svg>')}`;
  const bottle = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240"><path d="M64 12h32v58c0 12 20 24 20 42v104H44V112c0-18 20-30 20-42Z" fill="#304a38"/><path d="M44 132h72v62H44Z" fill="#faf1df"/></svg>')}`;
  const book = await openBook(page, "photos", bottle, photo);
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await expect.poll(() => book.getByRole("img", { name: "Ricordo: Un brindisi in Toscana", exact: true }).evaluate((image: HTMLImageElement) => image.naturalHeight)).toBe(720);
  const portrait = book.getByRole("img", { name: "Ricordo: Un brindisi in Toscana", exact: true });
  await expect(portrait).toHaveCSS("object-fit", "cover");
  expect(await portrait.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(250);

  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }, { width: 777, height: 918 }]) {
    await page.setViewportSize(viewport);
    for (const filtered of [false, true]) {
      if (filtered) {
        await book.getByRole("searchbox", { name: "Cerca nei ricordi" }).fill("Amici");
        await book.getByRole("button", { name: "Cerca", exact: true }).click();
        await expect(book.getByRole("search").getByRole("status")).toHaveText("2 ricordi trovati");
      }
      const vertical = await book.evaluate(element => ({ scroll: element.scrollHeight, client: element.clientHeight }));
      expect(vertical.scroll, `${viewport.width}px, filtered=${filtered}, client=${vertical.client}`).toBeLessThanOrEqual(vertical.client);
      expect(await book.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const navigation = (await book.getByRole("navigation", { name: "Sfoglia ricordi" }).boundingBox())!;
      const memory = (await book.locator(".memory-book-page").boundingBox())!;
      expect(navigation.y).toBeGreaterThanOrEqual(memory.y + memory.height);
      expect(navigation.y + navigation.height).toBeLessThanOrEqual(viewport.height);
      if (!filtered && [390, 777].includes(viewport.width)) await page.screenshot({ path: testInfo.outputPath(`portrait-memory-${viewport.width}-review.png`) });
      if (filtered) {
        await book.getByRole("button", { name: "Mostra tutti i ricordi" }).click();
        await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(book).toHaveScreenshot("moments-portrait-compact.png");
  await book.getByRole("button", { name: "Polaroid", exact: true }).click();
  const polaroid = book.getByRole("button", { name: "Apri degustazione: Un brindisi in Toscana", exact: true });
  await polaroid.focus();
  await page.keyboard.press("Enter");
  const back = book.getByRole("button", { name: "Torna alle Polaroid" });
  await expect(back).toBeVisible();
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await book.evaluate(element => { element.scrollTop = 0; });
    const photo = (await portrait.boundingBox())!;
    const frame = (await book.getByRole("button", { name: "Apri foto ricordo" }).boundingBox())!;
    expect(photo.width).toBe(frame.width);
    expect(photo.height).toBe(frame.height);
    expect(photo.y).toBeGreaterThanOrEqual((await back.boundingBox())!.y + (await back.boundingBox())!.height);
    await expect(portrait).toHaveCSS("object-fit", "cover");
    await expect(book.locator(".memory-book-tasting-details")).toContainText("Brasato");
    expect(await book.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (viewport.width >= 650) expect((await book.getByLabel("Periodo", { exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(130);
    if ([390, 1440].includes(viewport.width)) await page.screenshot({ path: testInfo.outputPath(`portrait-tasting-detail-${viewport.width}-review.png`) });
  }
  await back.click();
  await expect(polaroid).toBeVisible();
});

test("enlarge a memory photo and return to the same filtered memory", async ({ page }, testInfo) => {
  const photo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="720"><rect width="400" height="720" fill="#a5b4aa"/><path d="M110 80h180l-25 290h-130Z" fill="#eee6cf"/><path d="M200 370v250m-80 20h160" stroke="#fffaf5" stroke-width="12"/></svg>')}`;
  const book = await openBook(page, "photos", "", photo);
  await book.getByRole("searchbox").fill("Amici");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(book.getByRole("search").getByRole("status")).toHaveText("2 ricordi trovati");
  await book.getByRole("button", { name: "Ricordo successivo" }).click();
  await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  const opener = book.getByRole("button", { name: "Apri foto ricordo" });
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const preview = (await opener.boundingBox())!;
    await opener.click();
    const viewer = page.getByRole("dialog", { name: "Foto ricordo", exact: true });
    await expect(viewer.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
    const image = viewer.getByRole("img");
    await expect(image).toHaveAttribute("src", photo);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalHeight)).toBe(720);
    const bounds = (await viewer.boundingBox())!;
    const enlarged = (await image.boundingBox())!;
    const heading = (await viewer.locator(".tasting-memory-viewer-heading").boundingBox())!;
    expect(enlarged.height).toBeGreaterThan(preview.height);
    expect(enlarged.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    expect(enlarged.x).toBeGreaterThanOrEqual(bounds.x);
    expect(enlarged.x + enlarged.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(enlarged.y + enlarged.height).toBeLessThanOrEqual(viewport.height);
    expect(await viewer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if ([390, 1440].includes(viewport.width)) await page.screenshot({ path: testInfo.outputPath(`enlarged-memory-${viewport.width}-review.png`) });
    await page.keyboard.press("ArrowLeft");
    await viewer.getByRole("button", { name: "Chiudi" }).click();
    await expect(viewer).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
    await expect(book.getByRole("navigation")).toContainText("2 / 2");
    await expect(book.getByRole("searchbox")).toHaveValue("Amici");
    await page.keyboard.press("Enter");
    await expect(viewer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(book).toBeVisible();
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  }
});

test("memory period accepts a typed month in browsers without a native month picker", async ({ page }, testInfo) => {
  await page.route(/tile\.openstreetmap\.org/, route => route.fulfill({ status: 204, body: "" }));
  const book = await openBook(page);
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  const year = await page.evaluate(() => new Date().getFullYear());
  await page.evaluate(({ archive, year }) => {
    (window as any).bookMemories = ["10-03", "10-31", "11-01"].map((date, index) => ({
      ...archive.items[0], tasting_id: `typed-period-${index}`, consumed_at: `${year}-${date}`,
      wine_name: `Cena ${index}`, occasion: "", memory_photo_url: "/images/home-tasting-v1.jpg",
      memory_photo_location: { latitude: 43.77, longitude: 11.25 },
    }));
  }, { archive: tastingArchive, year });
  const period = book.getByLabel("Periodo", { exact: true });
  // Firefox and other browsers without month support render this as a text field.
  await period.evaluate(input => input.setAttribute("type", "text"));
  await period.fill("ottobre");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(book.getByRole("heading", { name: "Cena 0" })).toBeVisible();
  await expect(book.getByRole("search").getByRole("status")).toHaveText("2 ricordi trovati");
  expect(await page.evaluate(() => (window as any).bookPeriodRequests.at(-1))).toEqual({ from: `${year}-10-01`, to: `${year}-10-31`, query: "", offset: 0 });
  await expect(period).toHaveValue(`ottobre ${year}`);
  await book.getByRole("button", { name: "Mappa dei ricordi", exact: true }).click();
  const atlas = book.getByRole("region", { name: "Mappa dei ricordi", exact: true });
  await expect(atlas.getByRole("status")).toHaveText("2 di 2 ricordi con posizione");
  await period.fill("novembre");
  await expect(atlas.getByRole("status")).toHaveText("1 di 1 ricordi con posizione");
  await period.fill("ottobre");
  await expect(atlas.getByRole("status")).toHaveText("2 di 2 ricordi con posizione");
  await book.getByRole("button", { name: "Sfoglia le foto", exact: true }).click();
  await book.getByRole("button", { name: "Ricordo successivo" }).click();
  await expect(book.getByRole("heading", { name: "Cena 1" })).toBeVisible();
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await book.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const input = (await period.boundingBox())!;
    const toggle = (await book.getByRole("button", { name: "Mappa dei ricordi", exact: true }).boundingBox())!;
    expect(input.x + input.width).toBeLessThanOrEqual(toggle.x);
    if (viewport.width === 390) await page.screenshot({ path: testInfo.outputPath("typed-october-review.png") });
  }
  await period.fill("ottobre 2025");
  await expect(book.getByRole("heading", { name: "Nessun ricordo trovato" })).toBeVisible();
  await period.fill("febbraio 2028");
  await expect.poll(() => page.evaluate(() => (window as any).bookPeriodRequests.at(-1).to)).toBe("2028-02-29");
  const requests = await page.evaluate(() => (window as any).bookRequests);
  await period.fill("ottob");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  expect(await period.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  expect(await page.evaluate(() => (window as any).bookRequests)).toBe(requests);
  await expect(book.getByRole("alert")).toHaveCount(0);
  await period.fill("");
  await expect(book.getByRole("heading", { name: "Cena 0" })).toBeVisible();
});

test("memory period validates localized months and calendar boundaries", () => {
  expect(parseMemoryMonth("  OTTOBRE  ", "it", 2026)).toBe("2026-10");
  expect(parseMemoryMonth("ottobre 2025", "it", 2026)).toBe("2025-10");
  expect(parseMemoryMonth("October", "en", 2026)).toBe("2026-10");
  expect(parseMemoryMonth("February 2028", "en", 2026)).toBe("2028-02");
  expect(parseMemoryMonth("2026-10", "it", 2026)).toBe("2026-10");
  for (const value of ["ottob", "2026-13", "2026-00", "0000-10", "ottobre 0000", "ottobre 10000", "2026-10-03"]) {
    expect(parseMemoryMonth(value, "it", 2026), value).toBeNull();
    expect(memoryMonthBounds(value), value).toBeNull();
  }
  expect(memoryMonthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  expect(memoryMonthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  expect(memoryMonthBounds("1900-02")?.to).toBe("1900-02-28");
  expect(memoryMonthBounds("2000-02")?.to).toBe("2000-02-29");
});

test("changing the memory period applies immediately in photos and map", async ({ page }) => {
  const book = await openBook(page);
  await page.route(/tile\.openstreetmap\.org/, route => route.fulfill({ status: 204, body: "" }));
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await page.evaluate(archive => {
    (window as any).bookMemories = ["2026-08-01", "2026-08-31", "2026-09-01"].map((date, index) => ({
      ...archive.items[0], tasting_id: `period-${index}`, consumed_at: date,
      wine_name: `Brindisi ${index}`, occasion: "", memory_photo_url: "/images/home-tasting-v1.jpg",
      memory_photo_location: { latitude: 43.77, longitude: 11.25 },
    }));
  }, tastingArchive);
  await book.getByRole("searchbox").fill("Brindisi");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(book.getByRole("search").getByRole("status")).toHaveText("3 ricordi trovati");
  await book.getByRole("button", { name: "Ricordo successivo" }).click();
  await expect(book.getByRole("navigation")).toContainText("2 / 3");
  await book.getByLabel("Periodo", { exact: true }).fill("2026-08");
  await expect(book.getByRole("search").getByRole("status")).toHaveText("2 ricordi trovati");
  await expect(book.getByRole("navigation")).toContainText("1 / 2");
  expect(await page.evaluate(() => (window as any).bookPeriodRequests.at(-1))).toEqual({ from: "2026-08-01", to: "2026-08-31", query: "brindisi", offset: 0 });
  await book.getByRole("button", { name: "Ricordo successivo" }).click();
  await expect(book.getByRole("heading", { name: "Brindisi 1" })).toBeVisible();
  await book.getByRole("button", { name: "Mappa dei ricordi", exact: true }).click();
  const atlas = book.getByRole("region", { name: "Mappa dei ricordi", exact: true });
  await expect(atlas.getByRole("status")).toHaveText("2 di 2 ricordi con posizione");
  await book.getByLabel("Periodo", { exact: true }).fill("2026-09");
  await expect(atlas.getByRole("status")).toHaveText("1 di 1 ricordi con posizione");
  await book.getByRole("button", { name: "Sfoglia le foto", exact: true }).click();
  await expect(book.getByRole("heading", { name: "Brindisi 2" })).toBeVisible();
  await expect(book.getByRole("navigation")).toContainText("1 / 1");
  await book.getByLabel("Periodo", { exact: true }).fill("");
  await expect(book.getByRole("search").getByRole("status")).toHaveText("3 ricordi trovati");
  await expect(book.getByRole("searchbox")).toHaveValue("Brindisi");
  expect(await page.evaluate(() => (window as any).bookPeriodRequests.at(-1))).toEqual({ from: "", to: "", query: "brindisi", offset: 0 });
});

test("filter memories by month with text search and reset paging", async ({ page }, testInfo) => {
  const book = await openBook(page);
  await book.getByRole("button", { name: "Ricordo successivo" }).click();
  await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  await book.getByLabel("Periodo", { exact: true }).fill("2026-08");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(book.getByRole("search").getByRole("status")).toHaveText("2 ricordi trovati");
  await expect(book.getByRole("navigation")).toContainText("1 / 2");
  expect(await page.evaluate(() => (window as any).bookPeriodRequests.at(-1))).toEqual({ from: "2026-08-01", to: "2026-08-31", query: "", offset: 0 });
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const input = (await book.getByLabel("Periodo", { exact: true }).boundingBox())!;
    const label = (await book.locator('label[for="memory-book-month"]').boundingBox())!;
    const toggle = (await book.getByRole("button", { name: "Mappa dei ricordi", exact: true }).boundingBox())!;
    expect(label.x + label.width).toBeLessThanOrEqual(input.x);
    expect(input.x + input.width).toBeLessThanOrEqual(toggle.x);
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(viewport.width);
    expect(toggle.height).toBeGreaterThanOrEqual(44);
    expect(input.x + input.width).toBeLessThanOrEqual(viewport.width);
    expect(await book.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if ([390, 1440].includes(viewport.width)) await page.screenshot({ path: testInfo.outputPath(`memory-period-${viewport.width}-review.png`) });
  }
  await book.getByRole("searchbox").fill("lago");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(book.getByRole("search").getByRole("status")).toHaveText("1 ricordo trovato");
  await book.getByLabel("Periodo", { exact: true }).fill("2026-10");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(book.getByRole("heading", { name: "Nessun ricordo trovato" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).bookPeriodRequests.at(-1))).toEqual({ from: "2026-10-01", to: "2026-10-31", query: "lago", offset: 0 });
  await book.getByLabel("Periodo", { exact: true }).fill("2028-02");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).bookPeriodRequests.at(-1).to)).toBe("2028-02-29");
  await book.getByRole("button", { name: "Mostra tutti i ricordi" }).click();
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await expect(book.getByLabel("Periodo", { exact: true })).toHaveValue("");
  await expect(book.getByRole("searchbox")).toHaveValue("");
});

test("world map groups nearby photos, previews them and opens memories beyond the first archive page", async ({ page }, testInfo) => {
  const book = await openBook(page);
  await page.route(/tile\.openstreetmap\.org/, route => route.fulfill({ contentType: "image/png", body: readFileSync("e2e/fixtures/maps/world.png") }));
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await page.evaluate(archive => {
    (window as any).bookMemories = Array.from({ length: 203 }, (_, index) => ({
      ...archive.items[0], tasting_id: `world-${index}`, occasion: "",
      wine_name: index === 0 ? "Brindisi in Toscana" : index === 1 ? "Cena a Parigi" : index === 202 ? "New York" : `Ricordo ${index}`,
      memory_photo_url: "/images/home-tasting-v1.jpg",
      memory_photo_location: index === 0 ? { latitude: 43.77, longitude: 11.25 } : index === 1 ? { latitude: 48.85, longitude: 2.35 } : index === 202 ? { latitude: 40.71, longitude: -74 } : index === 3 ? { latitude: 95, longitude: 0 } : null,
    }));
  }, tastingArchive);
  await book.getByLabel("Periodo", { exact: true }).fill("2026-08");
  await book.getByRole("searchbox").fill("Amici");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(book.getByRole("search").getByRole("status")).toHaveText("203 ricordi trovati");
  await book.getByRole("button", { name: "Mappa dei ricordi", exact: true }).click();
  const atlas = book.getByRole("region", { name: "Mappa dei ricordi", exact: true });
  await expect(atlas.getByRole("status")).toHaveText("3 di 203 ricordi con posizione");
  const europe = atlas.getByRole("button", { name: "2 ricordi in questa zona" });
  await expect(europe).toBeVisible();
  await europe.focus();
  await page.keyboard.press("Enter");
  const previews = atlas.getByRole("region", { name: "Ricordi in questa zona" });
  await expect(previews.getByRole("button")).toHaveCount(2);
  await expect(previews.getByRole("img", { name: "Ricordo: Cena a Parigi" })).toBeVisible();
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const map = (await atlas.locator(".memory-atlas-map").boundingBox())!;
    const strip = (await previews.boundingBox())!;
    expect(strip.y).toBeGreaterThanOrEqual(map.y + map.height);
    expect(strip.y + strip.height).toBeLessThanOrEqual(viewport.height);
    expect(await book.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const thumbnail = (await previews.getByRole("img").first().boundingBox())!;
    const title = (await previews.getByText("Brindisi in Toscana", { exact: true }).boundingBox())!;
    expect(thumbnail.y + thumbnail.height).toBeLessThanOrEqual(title.y);
    if ([390, 1440].includes(viewport.width)) await page.screenshot({ path: testInfo.outputPath(`world-map-${viewport.width}-review.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(book).toHaveScreenshot("moments-map-compact.png");
  const navigation = () => (window as any).bookPeriodRequests.at(-1).offset;
  const offset = await page.evaluate(navigation);
  await europe.focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(navigation)).toBe(offset);
  await atlas.getByRole("button", { name: "1 ricordo in questa zona" }).click();
  await expect(previews.getByRole("button", { name: "Apri ricordo: New York" })).toBeVisible();
  await previews.getByRole("button", { name: "Apri ricordo: New York" }).click();
  await expect(book.getByRole("heading", { name: "New York" })).toBeVisible();
  await expect(book.getByRole("navigation", { name: "Sfoglia ricordi" })).toContainText("203 / 203");
  await expect(book.getByRole("searchbox")).toHaveValue("Amici");
  await expect(book.getByLabel("Periodo", { exact: true })).toHaveValue("2026-08");
  await expect(atlas).toHaveCount(0);
  await book.getByRole("button", { name: "Mappa dei ricordi", exact: true }).click();
  await expect(atlas.getByRole("status")).toHaveText("3 di 203 ricordi con posizione");
  for (let step = 0; step < 3; step++) {
    await atlas.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => atlas.locator(`img[src*=".tile.openstreetmap.org/${step + 1}/"]`).count()).toBeGreaterThan(0);
    await expect(atlas.locator(".leaflet-map-pane")).not.toHaveClass(/\bleaflet-zoom-anim\b/);
  }
  await expect(atlas.getByRole("button", { name: "2 ricordi in questa zona" })).toHaveCount(0);
  await expect(atlas.getByRole("button", { name: "1 ricordo in questa zona" })).toHaveCount(3);
});

test("memory map handles missing locations, filters without matches and retries a failed request", async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org/, route => route.fulfill({ status: 204, body: "" }));
  const book = await openBook(page);
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await book.getByRole("button", { name: "Mappa dei ricordi", exact: true }).click();
  const atlas = book.getByRole("region", { name: "Mappa dei ricordi", exact: true });
  await expect(atlas.getByRole("status")).toHaveText("1 di 2 ricordi con posizione");
  await book.getByRole("searchbox").fill("lago");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(atlas.getByRole("status")).toHaveText("0 di 1 ricordi con posizione");
  await expect(atlas.getByText(/Nessuna foto con posizione/)).toBeVisible();
  await book.getByLabel("Periodo", { exact: true }).fill("2026-10");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(atlas.getByRole("status")).toHaveText("0 di 0 ricordi con posizione");
  await book.getByRole("button", { name: "Mostra tutti i ricordi" }).click();
  await expect(atlas.getByRole("status")).toHaveText("1 di 2 ricordi con posizione");
  await book.getByRole("button", { name: "Sfoglia le foto" }).click();
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await page.evaluate(() => {
    const previous = window.fetch;
    window.fetch = async (input, init) => String(input).includes("limit=200") && !(window as any).allowMapRetry
      ? new Response("Unavailable", { status: 503 }) : previous(input, init);
  });
  await book.getByRole("button", { name: "Mappa dei ricordi", exact: true }).click();
  await expect(atlas.getByRole("alert")).toContainText("Impossibile caricare");
  await page.evaluate(() => { (window as any).allowMapRetry = true; });
  await atlas.getByRole("button", { name: "Riprova" }).click();
  await expect(atlas.getByRole("status")).toHaveText("1 di 2 ricordi con posizione");
});

test("empty book explains how to add a memory", async ({ page }) => {
  const empty = await openBook(page, "empty");
  await expect(empty.getByRole("heading", { name: "Il tuo libro aspetta il primo ricordo" })).toBeVisible();
  await empty.getByRole("button", { name: "Chiudi" }).click();
});

test("search memories by wine or companions, paginate matches, and clear an empty search", async ({ page }, testInfo) => {
  const book = await openBook(page);
  await book.getByRole("button", { name: "Ricordo successivo" }).click();
  await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  const search = book.getByRole("searchbox", { name: "Cerca nei ricordi" });
  await search.fill("lago");
  await search.press("ArrowLeft");
  await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  await search.press("Enter");
  await expect(book.getByRole("search").getByRole("status")).toHaveText("1 ricordo trovato");
  await expect(book.getByRole("navigation", { name: "Sfoglia ricordi" })).toContainText("1 / 1");
  await expect(search).toBeFocused();
  await expect(book.getByRole("button", { name: "Ricordo successivo" })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).bookSearchRequests.at(-1))).toEqual({ query: "lago", offset: 0 });

  await search.fill("  Amici  ");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(book.getByRole("search").getByRole("status")).toHaveText("2 ricordi trovati");
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await book.getByRole("button", { name: "Ricordo successivo" }).click();
  await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).bookSearchRequests.at(-1))).toEqual({ query: "amici", offset: 1 });

  await search.fill("nessuna corrispondenza");
  await search.press("Enter");
  await expect(book.getByRole("heading", { name: "Nessun ricordo trovato" })).toBeVisible();
  await expect(book.getByRole("search").getByRole("status")).toHaveText("0 ricordi trovati");
  await expect(book.getByRole("navigation", { name: "Sfoglia ricordi" })).toHaveCount(0);
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    const input = (await search.boundingBox())!;
    const submit = (await book.getByRole("button", { name: "Cerca", exact: true }).boundingBox())!;
    expect(input.x + input.width).toBeLessThanOrEqual(submit.x);
    expect(submit.x + submit.width).toBeLessThanOrEqual(viewport.width);
    expect(input.height).toBeGreaterThanOrEqual(44);
    expect(submit.height).toBeGreaterThanOrEqual(44);
    expect(await book.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (viewport.width === 390) await page.screenshot({ path: testInfo.outputPath("memory-search-empty-390.png") });
  }
  await book.getByRole("button", { name: "Mostra tutti i ricordi" }).click();
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await expect(search).toHaveValue("");
  await expect(book.getByRole("navigation", { name: "Sfoglia ricordi" })).toContainText("1 / 2");
  expect(await page.evaluate(() => (window as any).bookSearchRequests.at(-1))).toEqual({ query: "", offset: 0 });
});

test("catalog bottle photo sits beside the wine identity without obscuring the memory", async ({ page }, testInfo) => {
  const bottleSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240" viewBox="0 0 160 240"><path d="M64 12h32v58c0 12 20 24 20 42v104c0 10-6 14-16 14H60c-10 0-16-4-16-14V112c0-18 20-30 20-42Z" fill="#304a38"/><path d="M64 12h32v28H64Z" fill="#69283d"/><path d="M44 132h72v62H44Z" fill="#faf1df"/><text x="80" y="158" text-anchor="middle" fill="#69283d" font-family="serif" font-size="12">VINARIS</text><text x="80" y="176" text-anchor="middle" fill="#69283d" font-family="serif" font-size="10">2019</text></svg>';
  const book = await openBook(page, "photos", `data:image/svg+xml,${encodeURIComponent(bottleSvg)}`);
  const bottle = book.getByRole("img", { name: "Bottiglia: Un brindisi in Toscana", exact: true });
  await expect(bottle).toBeVisible();
  await expect.poll(() => bottle.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    const image = (await bottle.boundingBox())!;
    const text = (await book.locator(".memory-book-wine-text").boundingBox())!;
    const memory = (await book.getByRole("img", { name: "Ricordo: Un brindisi in Toscana", exact: true }).boundingBox())!;
    const note = (await book.locator(".memory-book-note").boundingBox())!;
    expect(text.x + text.width).toBeLessThanOrEqual(image.x);
    expect(memory.y + memory.height).toBeLessThanOrEqual(image.y);
    expect(Math.max(text.y + text.height, image.y + image.height)).toBeLessThanOrEqual(note.y);
    expect(image.x + image.width).toBeLessThanOrEqual(viewport.width);
    expect(await book.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if ([390, 1440].includes(viewport.width)) await page.screenshot({ path: testInfo.outputPath(`moments-bottle-${viewport.width}-review.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await book.evaluate(element => { element.scrollTop = 0; });
  await expect(book).toHaveScreenshot("moments-bottle-compact.png");
  await book.getByRole("button", { name: "Ricordo successivo" }).click();
  await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  await expect(book.getByRole("img", { name: /^Bottiglia:/ })).toHaveCount(0);
  await book.getByRole("button", { name: "Ricordo precedente" }).click();
  await expect(bottle).toBeVisible();
});

test("unavailable bottle photo leaves a readable memory without a broken image", async ({ page }) => {
  await page.route("**/missing-bottle.png", route => route.fulfill({ status: 404 }));
  const book = await openBook(page, "photos", "/missing-bottle.png");
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await expect(book.getByRole("img", { name: /^Bottiglia:/ })).toHaveCount(0);
  await expect(book.locator(".memory-book-identity")).not.toHaveClass(/has-bottle-photo/);
});

test("retry after a failed book request", async ({ page }) => {
  const book = await openBook(page, "error");
  await expect(book.getByRole("alert")).toBeVisible();
  await page.evaluate(() => { (window as any).allowBookRetry = true; });
  await book.getByRole("button", { name: "Riprova" }).click();
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
});

for (const origin of ["cellar", "external"] as const) {
  test(`GPS metadata survives ${origin} photo compression and submission`, async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await openRecordTasting(page);
    const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
    await dialog.getByRole("button", { name: origin === "cellar" ? /Dalla mia cantina/ : /Un altro vino/ }).click();
    if (origin === "cellar") await dialog.getByRole("button", { name: /Nebbiolo di Test/ }).click();
    else await dialog.getByLabel("Nome del vino", { exact: true }).fill("Ricordo GPS");
    await dialog.getByLabel("Scegli foto ricordo", { exact: true }).setInputFiles({ name: "gps.jpg", mimeType: "image/jpeg", buffer: readFileSync("e2e/fixtures/memory-gps.jpg") });
    await expect(dialog.getByText("Posizione della foto inclusa nel ricordo. Potrai mostrarla sulla mappa.")).toBeVisible();
    const result = await dialog.getByRole("img", { name: "Foto ricordo della bevuta" }).evaluate(async (element: HTMLImageElement) => {
      const { photoLocation } = await import(/* @vite-ignore */ "/src/domain/photoLocation.ts");
      const blob = await (await fetch(element.src)).blob();
      return photoLocation(new File([blob], "compressed.jpg"));
    });
    expect(result.latitude).toBeCloseTo(43.77, 7);
    expect(result.longitude).toBeCloseTo(11.25, 7);
    await page.evaluate(({ origin, fixture }) => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        if (init?.method === "POST" && String(input).endsWith(origin === "cellar" ? "/consume" : "/wishlist/tastings")) {
          (window as any).gpsPayload = JSON.parse(String(init.body));
          return new Response(JSON.stringify(origin === "cellar" ? fixture : { id: "gps" }), { headers: { "Content-Type": "application/json" } });
        }
        return original(input, init);
      };
    }, { origin, fixture: wine });
    await dialog.getByRole("button", { name: "Salva bevuta" }).click();
    await expect(dialog.getByText("Bevuta salvata nello Storico", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).gpsPayload.memory_photo)).toMatch(/^data:image\/jpeg;base64,/);
  });
}
