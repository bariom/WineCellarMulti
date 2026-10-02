import { expect, test, type Page } from "@playwright/test";
import { mockApi, openRecordTasting, wine, tastingArchive, memberships, session } from "./fixtures/app";

async function picture(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2200; canvas.height = 1200;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#567565"; context.fillRect(0, 0, 2200, 1200);
    context.fillStyle = "#ead9aa"; context.fillRect(700, 180, 800, 840);
    context.fillStyle = "#71334a"; context.fillRect(800, 500, 600, 420);
    return canvas.toDataURL("image/png").split(",")[1];
  });
}

for (const origin of ["cellar", "external"] as const) {
  test(`record ${origin} tasting with a compact memory photo`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page);
    await page.goto("/");
    const bytes = Buffer.from(await picture(page), "base64");
    await openRecordTasting(page);
    const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
    await dialog.getByRole("button", { name: origin === "cellar" ? /Dalla mia cantina/ : /Un altro vino/ }).click();
    if (origin === "cellar") await dialog.getByRole("button", { name: /Nebbiolo di Test/ }).click();
    else await dialog.getByLabel("Nome del vino", { exact: true }).fill("Una serata insieme");
    const memory = dialog.getByRole("region", { name: "Foto ricordo", exact: true });
    await memory.getByLabel("Scegli foto ricordo", { exact: true }).setInputFiles({ name: "ricordo.png", mimeType: "image/png", buffer: bytes });
    const preview = memory.getByRole("img", { name: "Foto ricordo della bevuta" });
    await expect(preview).toBeVisible();
    const processed = await preview.evaluate((image: HTMLImageElement) => ({
      width: image.naturalWidth, height: image.naturalHeight, src: image.src,
    }));
    expect(processed.width).toBe(1280);
    expect(processed.height).toBeLessThan(1280);
    expect(Buffer.from(processed.src.split(",")[1], "base64").length).toBeLessThanOrEqual(200_000);
    await memory.getByLabel("Scegli foto ricordo", { exact: true }).setInputFiles({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("bad") });
    await expect(memory.getByRole("alert")).toBeVisible();
    await expect(preview).toHaveAttribute("src", processed.src);
    await memory.getByRole("button", { name: "Rimuovi foto" }).click();
    await expect(preview).toHaveCount(0);
    await memory.getByLabel("Scatta foto ricordo", { exact: true }).setInputFiles({ name: "ricordo.png", mimeType: "image/png", buffer: bytes });
    await expect(preview).toBeVisible();
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await memory.scrollIntoViewIfNeeded();
      const box = (await memory.boundingBox())!;
      for (const element of [preview, ...await memory.getByRole("button").all()]) {
        const bounds = (await element.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(box.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width);
        // Dialog positioning can introduce floating-point fractions below one hundredth of a pixel.
        if (element !== preview) expect(Math.round(bounds.height * 100) / 100).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await memory.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("memory-photo-viewport.png") });
    await memory.screenshot({ path: testInfo.outputPath("memory-photo-review.png") });
    if (origin === "external") await expect(memory).toHaveScreenshot("memory-photo-compact.png");
    await page.evaluate(({ origin, fixture }) => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        if (init?.method === "POST" && String(input).endsWith(origin === "cellar" ? "/consume" : "/wishlist/tastings")) {
          (window as any).memoryTastingPayload = JSON.parse(String(init.body));
          return new Response(JSON.stringify(origin === "cellar" ? { ...fixture, quantity: 3 } : { id: "memory-tasting" }), { headers: { "Content-Type": "application/json" } });
        }
        return original(input, init);
      };
    }, { origin, fixture: wine });
    await dialog.getByRole("button", { name: "Salva bevuta" }).click();
    await expect(dialog.getByText("Bevuta salvata nello Storico", { exact: true })).toBeVisible();
    const payload = await page.evaluate(() => (window as any).memoryTastingPayload);
    expect(String(payload.memory_photo)).toMatch(/^data:image\/jpeg;base64,/);
    expect(payload).not.toHaveProperty("memory_photo_processing");
  });
}

test("history displays a memory and lets the user remove it", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  const bytes = Buffer.from(await picture(page), "base64");
  await page.route("**/api/v1/wines/tasting-photos/**", route => route.fulfill({ contentType: "image/png", body: bytes }));
  await page.evaluate(({ archive, fixture }) => {
    const original = window.fetch;
    let photoUrl = "/api/v1/wines/tasting-photos/cellar/memory";
    window.fetch = async (input, init) => {
      if (String(input).includes("/tasting-archive?")) return new Response(JSON.stringify({ ...archive, items: archive.items.map(item => ({ ...item, memory_photo_url: photoUrl })) }), { headers: { "Content-Type": "application/json" } });
      if (init?.method === "PATCH" && String(input).includes("/tastings/")) {
        (window as any).memoryTastingPayload = JSON.parse(String(init.body));
        photoUrl = "";
        return new Response(JSON.stringify({ ...fixture, tasting_history: fixture.tasting_history.map(item => ({ ...item, memory_photo_url: "" })) }), { headers: { "Content-Type": "application/json" } });
      }
      return original(input, init);
    };
  }, { archive: tastingArchive, fixture: wine });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Storico", exact: true }).click();
  const entry = page.locator(".tasting-archive-entry").first();
  await entry.locator("summary").first().click();
  await expect(entry.getByRole("img", { name: "Foto ricordo della bevuta" })).toBeVisible();
  await entry.screenshot({ path: testInfo.outputPath("history-photo-review.png") });
  await expect(entry.getByText("Degustazione di test.", { exact: true })).toHaveCount(1);
  const openPhoto = entry.getByRole("button", { name: "Apri foto ricordo" });
  await openPhoto.click();
  const viewer = page.getByRole("dialog", { name: "Foto ricordo", exact: true });
  await expect(viewer.getByRole("heading", { name: "Nebbiolo di Test" })).toBeVisible();
  await expect(viewer.getByRole("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(openPhoto).toBeFocused();
  await entry.getByRole("button", { name: "Modifica", exact: true }).click();
  await expect(entry.getByRole("img", { name: "Foto ricordo della bevuta" })).toBeVisible();
  await entry.getByRole("button", { name: "Rimuovi foto" }).click();
  await entry.getByRole("button", { name: "Salva modifiche", exact: true }).click();
  await expect(entry.getByRole("img", { name: "Foto ricordo della bevuta" })).toHaveCount(0);
  const payload = await page.evaluate(() => (window as any).memoryTastingPayload);
  expect(payload.memory_photo).toBe("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("history-memory-review.png") });
});

for (const theme of ["light", "private-cellar"] as const) {
  test(`memory presentation preserves portraits and landscapes in ${theme}`, async ({ page }, testInfo) => {
    await page.route("**/memory-presentation", route => route.fulfill({
      contentType: "text/html",
      body: `<html data-theme="${theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main style="max-width:720px;margin:0 auto;padding:20px"><div id="root"></div></main><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const {default: React} = await import('/node_modules/.vite/deps/react.js');
        const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
        const {TastingMemoryPhoto} = await import('/src/components/TastingMemoryPhoto.tsx');
        await import('/src/styles.css');
        const portrait = document.createElement('canvas'); portrait.width=600; portrait.height=900;
        const context = portrait.getContext('2d'); context.fillStyle='#567565'; context.fillRect(0,0,600,900);
        context.fillStyle='#ead9aa'; context.fillRect(60,90,480,720);
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null,
          React.createElement(TastingMemoryPhoto, {locale:'it', wineName:'Una serata in terrazza', consumedAt:'2026-10-02', note:'Il primo brindisi, la luce sulle colline. Un momento da ritrovare.', url:'/images/home-white-wine-terrace-v1.jpg'}),
          React.createElement(TastingMemoryPhoto, {locale:'it', wineName:'Un ricordo in verticale', consumedAt:'2026-10-02', url:portrait.toDataURL()})
        ));
      </script></body></html>`,
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/memory-presentation");
    const stories = page.locator(".tasting-memory-story");
    await expect(stories).toHaveCount(2);
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      for (const story of await stories.all()) {
        const image = story.getByRole("img");
        await expect(image).toBeVisible();
        const intrinsic = await image.evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight }));
        const box = (await image.boundingBox())!;
        expect(box.width / box.height).toBeCloseTo(intrinsic.width / intrinsic.height, 2);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        const caption = (await story.locator("figcaption").boundingBox())!;
        expect(caption.y).toBeGreaterThan(box.y + box.height);
      }
      const opener = stories.last().getByRole("button", { name: "Apri foto ricordo" });
      await opener.click();
      const viewer = page.getByRole("dialog", { name: "Foto ricordo", exact: true });
      const close = viewer.getByRole("button", { name: "Chiudi" });
      const img = (await viewer.getByRole("img").boundingBox())!;
      const closeBox = (await close.boundingBox())!;
      expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(img.y);
      expect(img.x).toBeGreaterThanOrEqual(0);
      expect(img.x + img.width).toBeLessThanOrEqual(width);
      await close.click();
      await expect(opener).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await stories.first().screenshot({ path: testInfo.outputPath(`memory-presentation-${theme}-desktop.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath(`memory-presentation-${theme}-390.png`), fullPage: true });
    await expect(stories.first()).toHaveScreenshot(`memory-story-${theme}-compact.png`);
    await stories.first().getByRole("button", { name: "Apri foto ricordo" }).click();
    await page.screenshot({ path: testInfo.outputPath(`memory-viewer-${theme}-390.png`) });
  });
}

test("wine detail integrates the memory and restores its modal after viewing", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const memoryWine = { ...wine, tasting_history: [{ ...tastingArchive.items[0], id: "tasting-e2e-1", enjoyment: "positive" as const, memory_photo_url: "/images/home-white-wine-terrace-v1.jpg" }] };
  await mockApi(page, [], false, memberships, [memoryWine], session);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
  const detail = page.locator(".wine-detail:visible").first();
  await detail.locator("summary").filter({ hasText: "Note e storia" }).click();
  const story = detail.locator(".tasting-memory-story").first();
  await expect(story).toBeVisible();
  await story.scrollIntoViewIfNeeded();
  await story.screenshot({ path: testInfo.outputPath("wine-detail-memory-390.png") });
  const previousOverflow = await page.evaluate(() => document.body.style.overflow);
  const opener = story.getByRole("button", { name: "Apri foto ricordo" });
  await opener.click();
  const viewer = page.getByRole("dialog", { name: "Foto ricordo", exact: true });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("heading", { name: "Nebbiolo di Test", exact: true })).toBeVisible();
  await viewer.getByRole("button", { name: "Chiudi", exact: true }).click();
  await expect(opener).toBeFocused();
  await expect(detail).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(previousOverflow);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
