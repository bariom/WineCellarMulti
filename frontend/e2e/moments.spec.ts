import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mockApi, openRecordTasting, tastingArchive, wine } from "./fixtures/app";

async function openBook(page: Page, mode: "photos" | "empty" | "error" = "photos") {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  await page.evaluate(({ archive, mode }) => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("photos_only=true")) {
        (window as any).bookRequests = ((window as any).bookRequests || 0) + 1;
        if (mode === "error" && !(window as any).allowBookRetry) return new Response("Unavailable", { status: 503 });
        const offset = Number(new URL(url, location.href).searchParams.get("offset") || 0);
        const items = mode === "empty" ? [] : [{ ...archive.items[0], tasting_id: `memory-${offset}`, wine_name: offset === 0 ? "Un brindisi in Toscana" : "Una sera sul lago", occasion: "", memory_photo_url: "/images/home-tasting-v1.jpg", memory_photo_location: offset === 0 ? { latitude: 43.77, longitude: 11.25 } : null }];
        return new Response(JSON.stringify({ ...archive, offset, limit: 1, total: mode === "empty" ? 0 : 2, items }), { headers: { "Content-Type": "application/json" } });
      }
      return original(input, init);
    };
  }, { archive: tastingArchive, mode });
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
    const image = (await book.getByRole("img").boundingBox())!;
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
