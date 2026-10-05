import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mockApi, openRecordTasting, tastingArchive, wine } from "./fixtures/app";

async function openBook(page: Page, mode: "photos" | "empty" | "error" = "photos", bottlePhoto = "") {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  await page.evaluate(({ archive, mode, bottlePhoto }) => {
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
        const memories = mode === "empty" ? [] : [0, 1].map(index => ({ ...archive.items[0], tasting_id: `memory-${index}`, wine_name: index === 0 ? "Un brindisi in Toscana" : "Una sera sul lago", occasion: "", wine_photo_thumbnail_url: index === 0 ? bottlePhoto : "", memory_photo_url: "/images/home-tasting-v1.jpg", memory_photo_location: index === 0 ? { latitude: 43.77, longitude: 11.25 } : null }));
        const matches = memories.filter(item => [item.wine_name, item.wine_producer, item.wine_vintage, item.note, item.companions, item.pairing, item.occasion].join(" ").toLowerCase().includes(query));
        return new Response(JSON.stringify({ ...archive, offset, limit: 1, total: matches.length, items: matches.slice(offset, offset + 1) }), { headers: { "Content-Type": "application/json" } });
      }
      return original(input, init);
    };
  }, { archive: tastingArchive, mode, bottlePhoto });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Storico", exact: true }).click();
  await page.getByRole("button", { name: "Momenti · Sfoglia i ricordi", exact: true }).click();
  return page.getByRole("dialog", { name: "Momenti", exact: true });
}

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
    const image = (await book.getByRole("img", { name: "Ricordo: Un brindisi in Toscana", exact: true }).boundingBox())!;
    const title = (await book.getByRole("heading", { name: "Un brindisi in Toscana" }).boundingBox())!;
    expect(image.y + image.height).toBeLessThanOrEqual(title.y);
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
  await expect(book.getByRole("status")).toHaveText("1 ricordo trovato");
  await expect(book.getByRole("navigation", { name: "Sfoglia ricordi" })).toContainText("1 / 1");
  await expect(search).toBeFocused();
  await expect(book.getByRole("button", { name: "Ricordo successivo" })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).bookSearchRequests.at(-1))).toEqual({ query: "lago", offset: 0 });

  await search.fill("  Amici  ");
  await book.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(book.getByRole("status")).toHaveText("2 ricordi trovati");
  await expect(book.getByRole("heading", { name: "Un brindisi in Toscana" })).toBeVisible();
  await book.getByRole("button", { name: "Ricordo successivo" }).click();
  await expect(book.getByRole("heading", { name: "Una sera sul lago" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).bookSearchRequests.at(-1))).toEqual({ query: "amici", offset: 1 });

  await search.fill("nessuna corrispondenza");
  await search.press("Enter");
  await expect(book.getByRole("heading", { name: "Nessun ricordo trovato" })).toBeVisible();
  await expect(book.getByRole("status")).toHaveText("0 ricordi trovati");
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
