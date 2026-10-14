import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

async function openPurchase(page: Page, locale: "it" | "en" = "it", empty = false, access: "included" | "credits" | "blocked" | "admin" | "legacy-admin" | "legacy-included" = "included") {
  const it = locale === "it";
  const admin = access === "admin" || access === "legacy-admin";
  await mockApi(page, [], true, memberships, [wine], { ...session, locale, is_app_admin: admin, has_active_entitlement: access === "included" || access === "legacy-included", is_free_tier: !admin && access !== "included" && access !== "legacy-included", can_use_label_recognition: false, theme_preference: it ? "light" : "private-cellar" });
  await page.addInitScript(({ wine, empty, access }) => {
    const previous = window.fetch;
    let received = false;
    let pending = false;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      if (url.pathname.endsWith("/ai/settings")) {
        const response = await previous(input, init);
        if (access.startsWith("legacy-")) return Response.json({ ...await response.json(), can_use_included_wine_search: access === "legacy-included", can_use_app_credits: false, has_openai_api_key: false });
        return Response.json({ ...await response.json(), can_use_purchase_import: access === "included" || access === "credits", purchase_import_included: access === "included", can_use_app_credits: access === "credits", has_openai_api_key: false, provider_mode: access === "included" ? "user_key" : "credits" });
      }
      if (!url.pathname.startsWith("/api/v1/imports/purchases")) return previous(input, init);
      if (url.pathname.endsWith("/photo-suggestions")) {
        if (sessionStorage.getItem("receipt-photo-fail")) return Response.json({ detail: "Unavailable" }, { status: 503 });
        return Response.json(url.searchParams.get("name") === wine.name && url.searchParams.get("producer") === wine.producer ? JSON.parse(sessionStorage.getItem("receipt-photos") || "[]") : []);
      }
      if (url.pathname.endsWith("/pending")) return Response.json(pending ? [{ id: "purchase-1", supplier: "Enoteca delle Colline", reference: "INV-42", bottles: 4, expected_delivery: "2026-10-20" }] : []);
      if (url.pathname.endsWith("/preview")) {
        if (sessionStorage.getItem("receipt-fail") === "true") return Response.json({ detail: "Unavailable" }, { status: 503 });
        const data = init?.body as FormData;
        sessionStorage.setItem("receipt-upload", JSON.stringify({ locale: data.get("locale"), file: (data.get("document") as File).name }));
        return Response.json({ id: "purchase-1", status: received || pending ? "received" : "draft", estimated_cost_usd: access === "included" ? "0" : "0.021", extraction: {
          supplier: "Enoteca delle Colline", reference: "INV-42", order_date: "2026-10-09", currency: "CHF", document_total: "126.00", additional_costs: "0",
          rows: empty ? [] : [{ name: wine.name, producer: wine.producer, vintage: wine.vintage, format: "0.75L", quantity: 3, unit_price: "42.00", line_total: "126.00", warnings: ["Verifica il formato della bottiglia."] }], warnings: empty ? ["Nessun vino leggibile"] : [],
        }, matches: empty ? [] : [[{ id: wine.id, name: wine.name, producer: wine.producer, vintage: wine.vintage, format: wine.format, currency: wine.currency, has_photo: !!sessionStorage.getItem("receipt-existing-photo") }]] });
      }
      if (url.pathname.endsWith("/confirm")) {
        const payload = JSON.parse(String(init?.body));
        const calls = JSON.parse(sessionStorage.getItem("receipt-confirmations") || "[]");
        calls.push(payload); sessionStorage.setItem("receipt-confirmations", JSON.stringify(calls));
        pending = payload.delivery === "pending"; received = !pending;
        return Response.json({ id: "purchase-1", status: pending ? "pending" : "received", bottles: payload.rows.reduce((sum: number, row: { quantity: number }) => sum + row.quantity, 0), wine_ids: [wine.id], unavailable_photo_wine_ids: sessionStorage.getItem("receipt-photo-unavailable") ? [wine.id] : [] });
      }
      if (url.pathname.endsWith("/receive")) {
        pending = false; received = true;
        return Response.json({ id: "purchase-1", status: "received", bottles: 4, wine_ids: [wine.id] });
      }
      return Response.json({ detail: "Unexpected route" }, { status: 404 });
    };
  }, { wine, empty, access });
  await page.goto("/");
  if ((page.viewportSize()?.width || 0) >= 1000) {
    await page.getByRole("button", { name: it ? /^Cantina \(/ : /^Cellar \(/ }).click();
    await page.getByRole("button", { name: it ? "Aggiungi vino" : "Add wine", exact: true }).click();
  } else await page.getByRole("button", { name: it ? "Aggiungi un vino" : "Add a wine", exact: true }).click();
  await page.getByRole("button", { name: it ? "Aggiungi un acquisto da ricevuta o fattura" : "Add a purchase from receipt or invoice", exact: true }).click();
  return page.getByRole("dialog", { name: it ? "Aggiungi un acquisto" : "Add a purchase", exact: true });
}

async function receipt(page: Page, tall = false, mimeType = "image/png") {
  const base64 = await page.evaluate(({ tall, mimeType }) => {
    const canvas = document.createElement("canvas"); canvas.width = 560; canvas.height = tall ? 1800 : 750;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#faf8f2"; context.fillRect(0, 0, 560, canvas.height);
    context.fillStyle = "#263d33"; context.font = "26px Georgia";
    context.fillText("ENOTECA DELLE COLLINE", 42, 76);
    context.font = "18px monospace";
    ["FATTURA INV-42", "09.10.2026", "", "Cantina Vinaris", "Nebbiolo di Test 2019", "3 x 0.75 L      CHF 42.00", "", "TOTALE        CHF 126.00", "", "Grazie per il vostro acquisto"].forEach((line, i) => context.fillText(line, 42, 132 + i * 38));
    return canvas.toDataURL(mimeType).split(",")[1];
  }, { tall, mimeType });
  return { name: mimeType === "image/jpeg" ? "receipt.jpg" : "receipt.png", mimeType, buffer: Buffer.from(base64, "base64") };
}

test.describe("receipt on touch screens", () => {
  test.use({ isMobile: true, hasTouch: true });
  test("mobile receipt document expansion keeps the dialog and scroll position stable", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const dialog = await openPurchase(page);
    await dialog.locator('input[type="file"]').first().setInputFiles(await receipt(page, true, "image/jpeg"));
    await dialog.getByRole("button", { name: "Analizza acquisto", exact: true }).click();
    const image = dialog.getByRole("img", { name: "Ricevuta originale", exact: true });
    for (const [width, height] of [[360, 800], [390, 844], [430, 932]]) {
      await page.setViewportSize({ width, height });
      const toggle = dialog.getByRole("button", { name: "Mostra documento", exact: true });
      await toggle.scrollIntoViewIfNeeded();
      const before = await dialog.evaluate(el => ({ top: el.scrollTop, y: el.getBoundingClientRect().y, height: el.getBoundingClientRect().height }));
      await toggle.tap();
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalHeight === 1800)).toBe(true);
      const frames = await dialog.evaluate(async el => {
        const samples: { top: number; y: number; height: number }[] = [];
        for (let i = 0; i < 40; i++) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          const box = el.getBoundingClientRect();
          samples.push({ top: el.scrollTop, y: box.y, height: box.height });
        }
        return samples;
      });
      for (const frame of frames) {
        expect(Math.abs(frame.top - before.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(frame.y - before.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(frame.height - before.height)).toBeLessThanOrEqual(1);
      }
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath("receipt-document-expanded-390.png") });
      await dialog.getByRole("button", { name: "Nascondi documento", exact: true }).tap();
      await expect(image).toBeHidden();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(image).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Verifica l’acquisto", exact: true })).toBeVisible();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("receipt-document-desktop-1440.png") });
    expect(errors).toEqual([]);
  });
});

for (const locale of ["it", "en"] as const) {
  test(`purchase reference photo selection is optional, responsive and saved (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await openPurchase(page, locale);
    const file = await receipt(page);
    await page.route("**/reference-photo-*.png", route => route.fulfill({ contentType: "image/png", body: file.buffer }));
    await page.evaluate(() => sessionStorage.setItem("receipt-photos", JSON.stringify([
      { id: "photo-1", thumbnail_url: "/reference-photo-1.png" },
      { id: "photo-2", thumbnail_url: "/reference-photo-2.png" },
    ])));
    await dialog.locator('input[type="file"]').first().setInputFiles(file);
    await dialog.getByRole("button", { name: it ? "Analizza acquisto" : "Analyze purchase", exact: true }).click();
    const photos = dialog.getByRole("region", { name: it ? "Fotografie disponibili" : "Available photos" });
    await expect(photos).toBeVisible();
    await expect(photos.getByRole("button", { name: it ? "Senza foto" : "No photo", exact: true })).toHaveAttribute("aria-pressed", "true");
    await photos.getByRole("button", { name: it ? "Usa fotografia 2" : "Use photo 2", exact: true }).click();
    await expect(photos.getByRole("button", { name: it ? "Usa fotografia 2" : "Use photo 2", exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await photos.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      const bounds = (await photos.boundingBox())!;
      const buttons = await photos.getByRole("button").all();
      const boxes = await Promise.all(buttons.map(button => button.boundingBox()));
      for (const box of boxes) {
        expect(box!.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      for (let i = 1; i < boxes.length; i++) {
        const a = boxes[i - 1]!, b = boxes[i]!;
        expect(a.x + a.width <= b.x || a.y + a.height <= b.y || b.x + b.width <= a.x || b.y + b.height <= a.y).toBe(true);
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`purchase-photos-${locale}-${width}.png`) });
      if (width === 390 && it) await expect(photos).toHaveScreenshot("purchase-reference-photos-compact.png", { animations: "disabled" });
    }
    // Changing identity invalidates the selected photo and hides stale suggestions.
    const producer = dialog.getByLabel(it ? "Produttore" : "Producer", { exact: true });
    await producer.fill("Other producer");
    await expect(photos).toHaveCount(0);
    await producer.fill(wine.producer);
    await expect(photos).toBeVisible();
    await expect(photos.getByRole("button", { name: it ? "Senza foto" : "No photo", exact: true })).toHaveAttribute("aria-pressed", "true");
    await photos.getByRole("button", { name: it ? "Usa fotografia 1" : "Use photo 1", exact: true }).click();
    await dialog.getByLabel(it ? "Ho verificato vini, annate, bottiglie, prezzi e stato della consegna." : "I have checked wines, vintages, bottles, prices and delivery status.").check();
    await dialog.getByRole("button", { name: it ? "Conferma acquisto in cantina" : "Confirm purchase in cellar", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: it ? "Acquisto aggiunto alla cantina" : "Purchase added to your cellar" })).toBeVisible();
    const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("receipt-confirmations") || "[]"));
    expect(calls[0].rows[0].photo_library_id).toBe("photo-1");
  });
}

test("purchase photo failure is nonblocking and existing photos are preserved", async ({ page }) => {
  const dialog = await openPurchase(page, "en");
  await page.evaluate(() => {
    sessionStorage.setItem("receipt-photo-fail", "true");
    sessionStorage.setItem("receipt-existing-photo", "true");
  });
  await dialog.locator('input[type="file"]').first().setInputFiles(await receipt(page));
  await dialog.getByRole("button", { name: "Analyze purchase", exact: true }).click();
  await expect(dialog.getByText("Photos unavailable. You can continue without a photo.", { exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem("receipt-photo-fail"));
  await dialog.getByRole("button", { name: "Retry photos", exact: true }).click();
  await expect(dialog.getByText("Photos unavailable. You can continue without a photo.", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Cellar record", { exact: true }).selectOption(wine.id);
  await expect(dialog.getByText("The existing record’s photo will be kept.", { exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("receipt-photo-unavailable", "true"));
  await dialog.getByLabel("I have checked wines, vintages, bottles, prices and delivery status.").check();
  await dialog.getByRole("button", { name: "Confirm purchase in cellar", exact: true }).click();
  await expect(dialog.getByText("Your purchase was saved, but some selected photos were no longer available. You can add them from the wine detail view.", { exact: true })).toBeVisible();
  const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("receipt-confirmations") || "[]"));
  expect(calls[0].rows[0].photo_library_id).toBeNull();
});

for (const locale of ["it", "en"] as const) {
  test(`purchase image preview zoom stays contained and resets (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 1440, height: 900 });
    const dialog = await openPurchase(page, locale);
    await dialog.locator('input[type="file"]').first().setInputFiles(await receipt(page, true));
    await dialog.getByRole("button", { name: it ? "Analizza acquisto" : "Analyze purchase", exact: true }).click();
    const image = dialog.getByRole("img", { name: it ? "Ricevuta originale" : "Original receipt", exact: true });
    const zoom = dialog.getByRole("group", { name: it ? "Zoom documento" : "Document zoom", exact: true });
    const viewport = dialog.getByRole("region", { name: it ? "Anteprima documento scorrevole" : "Scrollable document preview", exact: true });
    const increase = zoom.getByRole("button", { name: it ? "Aumenta zoom" : "Zoom in", exact: true });
    const decrease = zoom.getByRole("button", { name: it ? "Riduci zoom" : "Zoom out", exact: true });
    const fit = zoom.getByRole("button", { name: it ? "Adatta" : "Fit", exact: true });
    for (const width of [1440, 1024, 360, 390, 430]) {
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
      if (width === 360) await dialog.getByRole("button", { name: it ? "Mostra documento" : "Show document", exact: true }).click();
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalHeight === 1800)).toBe(true);
      await expect(decrease).toBeDisabled();
      await expect(fit).toBeDisabled();
      const initial = (await image.boundingBox())!;
      for (let step = 0; step < 8; step++) await increase.click();
      await expect(zoom.getByText("300%", { exact: true })).toBeVisible();
      await expect(increase).toBeDisabled();
      const enlarged = (await image.boundingBox())!;
      expect(enlarged.width).toBeCloseTo(initial.width * 3, 0);
      expect(enlarged.height / enlarged.width).toBeCloseTo(1800 / 560, 2);
      expect(await viewport.evaluate(el => el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight)).toBe(true);
      await viewport.focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowDown");
      await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      const frame = (await dialog.boundingBox())!;
      const previewBox = (await viewport.boundingBox())!;
      expect(previewBox.x).toBeGreaterThanOrEqual(frame.x);
      expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(frame.x + frame.width);
      const toolbar = (await zoom.boundingBox())!;
      expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(previewBox.y);
      if (width >= 1024) {
        const review = (await dialog.locator("form").boundingBox())!;
        expect(previewBox.x + previewBox.width).toBeLessThan(review.x);
        expect(previewBox.y + previewBox.height).toBeLessThan(frame.y + frame.height);
      } else {
        for (const button of await zoom.getByRole("button").all()) {
          const box = (await button.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
      expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      if (width === 390 || width === 1440) {
        await zoom.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`purchase-image-zoom-${locale}-${width}.png`) });
      }
      await decrease.click();
      await expect(zoom.getByText("275%", { exact: true })).toBeVisible();
      await fit.click();
      await expect(zoom.getByText("100%", { exact: true })).toBeVisible();
      await expect.poll(() => viewport.evaluate(el => [el.scrollLeft, el.scrollTop])).toEqual([0, 0]);
    }
    await increase.click();
    await dialog.locator('input[type="file"]').first().setInputFiles({ ...await receipt(page), name: "another-receipt.png" });
    await dialog.getByRole("button", { name: it ? "Analizza acquisto" : "Analyze purchase", exact: true }).click();
    await expect(zoom.getByText("100%", { exact: true })).toBeVisible();
    await expect(dialog.getByText(`${it ? "Immagine" : "Image"} · another-receipt.png`, { exact: true })).toBeVisible();
  });

  test(`purchase receipt review, responsive layout and bulk confirmation (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await openPurchase(page, locale);
    await dialog.locator('input[type="file"]').first().setInputFiles(await receipt(page));
    await dialog.getByRole("button", { name: it ? "Analizza acquisto" : "Analyze purchase", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: it ? "Verifica l’acquisto" : "Review your purchase" })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("receipt-confirmations"))).toBeNull();
    await expect(dialog.getByLabel(it ? "Produttore" : "Producer", { exact: true })).toHaveValue(wine.producer);
    await dialog.getByLabel(it ? "Scheda in cantina" : "Cellar record", { exact: true }).selectOption(wine.id);
    await dialog.getByLabel(it ? "Bottiglie" : "Bottles", { exact: true }).fill("4");
    await expect(dialog.getByRole("button", { name: it ? "Conferma acquisto in cantina" : "Confirm purchase in cellar", exact: true })).toBeDisabled();
    for (const width of [360, 390, 430, 1024, 1200, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      const geometry = await dialog.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const inputs = [...element.querySelectorAll("input, select, button")].filter(el => el.getBoundingClientRect().width > 0);
        return { left: rect.left, right: rect.right, width: innerWidth, overflow: element.scrollWidth > element.clientWidth,
          contained: inputs.every(el => { const r = el.getBoundingClientRect(); return r.left >= rect.left && r.right <= rect.right; }),
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(geometry.width);
      expect(geometry.overflow).toBe(false); expect(geometry.pageOverflow).toBe(false); expect(geometry.contained).toBe(true);
      await dialog.evaluate(el => el.scrollTop = 0);
      if (width >= 1024) {
        const preview = await dialog.getByRole("complementary").boundingBox();
        const review = await dialog.locator("form").boundingBox();
        const frame = await dialog.boundingBox();
        expect(Math.abs(preview!.width - review!.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(preview!.y - review!.y)).toBeLessThanOrEqual(1);
        expect(preview!.x + preview!.width).toBeLessThan(review!.x);
        expect(preview!.y - frame!.y).toBeLessThan(260);
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`purchase-review-${locale}-${width}.png`) });
      if (width === 390 && it) {
        await dialog.getByRole("button", { name: "Mostra documento", exact: true }).click();
        await expect(dialog.getByRole("img", { name: "Ricevuta originale", exact: true })).toBeVisible();
        await dialog.getByRole("button", { name: "Nascondi documento", exact: true }).click();
        const row = dialog.getByRole("group", { name: "Vino 1", exact: true });
        await row.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("purchase-row-it-390.png") });
        await dialog.evaluate(el => el.scrollTop = 0);
        await expect(dialog).toHaveScreenshot("purchase-import-compact.png", { animations: "disabled" });
      }
    }
    await dialog.getByLabel(it ? "Il totale non coincide con il documento. Ho verificato e accetto la differenza." : "The total differs from the document. I have checked and accept the difference.").check();
    await dialog.getByLabel(it ? "Ho verificato vini, annate, bottiglie, prezzi e stato della consegna." : "I have checked wines, vintages, bottles, prices and delivery status.").check();
    await dialog.getByRole("button", { name: it ? "Conferma acquisto in cantina" : "Confirm purchase in cellar", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: it ? "Acquisto aggiunto alla cantina" : "Purchase added to your cellar" })).toBeVisible();
    const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("receipt-confirmations") || "[]"));
    expect(calls).toHaveLength(1); expect(calls[0].rows[0]).toMatchObject({ quantity: 4, unit_price: "42.00", existing_wine_id: wine.id, format: wine.format });
    expect(calls[0].accept_total_difference).toBe(true); expect(calls[0].reviewed).toBe(true);
    await dialog.getByRole("button", { name: it ? "Chiudi" : "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test("purchase receipt retry, unknown data, pending delivery and duplicate prevention", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openPurchase(page, "it", true);
  await page.evaluate(() => sessionStorage.setItem("receipt-fail", "true"));
  await dialog.locator('input[type="file"]').first().setInputFiles(await receipt(page));
  await dialog.getByRole("button", { name: "Analizza acquisto", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem("receipt-fail"));
  await dialog.getByRole("button", { name: "Analizza acquisto", exact: true }).click();
  await expect(dialog.getByText("Nessun vino riconosciuto.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Aggiungi riga", exact: true }).click();
  await dialog.getByLabel("Nome vino", { exact: true }).fill("Barolo");
  await dialog.getByLabel("Produttore", { exact: true }).fill("Produttore");
  await dialog.getByLabel("Formato", { exact: true }).fill("0.75L");
  await dialog.getByLabel("Bottiglie", { exact: true }).fill("4");
  await dialog.getByLabel("Prezzo a bottiglia", { exact: true }).fill("31.50");
  await dialog.getByLabel("Consegna", { exact: true }).selectOption("pending");
  await dialog.getByLabel("Consegna prevista", { exact: true }).fill("2026-10-20");
  await dialog.getByLabel("Ho verificato vini, annate, bottiglie, prezzi e stato della consegna.").check();
  await dialog.getByRole("button", { name: "Registra acquisto in attesa", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Acquisto registrato, in attesa di consegna" })).toBeVisible();
  await dialog.getByRole("button", { name: "Registra ricezione completa", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Acquisto aggiunto alla cantina" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Registra ricezione completa", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Nuovo acquisto", exact: true }).click();
  await dialog.locator('input[type="file"]').first().setInputFiles(await receipt(page));
  await dialog.getByRole("button", { name: "Analizza acquisto", exact: true }).click();
  await expect(dialog.getByText("Questo documento è già stato importato.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Conferma acquisto in cantina", exact: true })).toHaveCount(0);
});

test("purchase PDF upload provides original document preview on desktop", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Reproduce the production server's MIME mapping for raw .mjs assets.
  // Run against a built preview to exercise Vite's emitted worker URL as well.
  await page.route(/\/assets\/pdf\.worker[^/]*\.mjs(?:\?|$)/, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-type": "application/octet-stream" } });
  });
  const dialog = await openPurchase(page);
  let pdf = "%PDF-1.4\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length 61 >>\nstream\nBT /F1 14 Tf 25 350 Td (INVOICE INV-42 - CHF 126.00) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 7 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length 47 >>\nstream\nBT /F1 14 Tf 25 350 Td (PAYMENT SLIP) Tj ET\nendstream",
  ];
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  await dialog.locator('input[type="file"]').first().setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) });
  await dialog.getByRole("button", { name: "Analizza acquisto", exact: true }).click();
  await expect(dialog.getByText("PDF · invoice.pdf", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Apri PDF originale", exact: true })).toHaveAttribute("href", /^blob:/);
  await expect(dialog.getByRole("link", { name: "Apri PDF originale", exact: true })).toHaveAttribute("target", "_blank");
  await expect(dialog.getByRole("heading", { name: "Verifica l’acquisto", exact: true })).toBeVisible();
  const canvas = dialog.getByRole("img", { name: "Anteprima PDF, pagina 1", exact: true });
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    return [...pixels].some((value, index) => index % 4 !== 3 && value < 128);
  })).toBe(true);
  const left = await canvas.boundingBox();
  const right = await dialog.getByRole("heading", { name: "Verifica l’acquisto", exact: true }).boundingBox();
  expect(left!.x + left!.width).toBeLessThan(right!.x);
  const zoom = dialog.getByRole("group", { name: "Zoom documento", exact: true });
  await expect(zoom.getByRole("button", { name: "Riduci zoom", exact: true })).toBeDisabled();
  for (let step = 0; step < 8; step++) await zoom.getByRole("button", { name: "Aumenta zoom", exact: true }).click();
  await expect(zoom.getByText("300%", { exact: true })).toBeVisible();
  await expect(zoom.getByRole("button", { name: "Aumenta zoom", exact: true })).toBeDisabled();
  await expect(canvas).toBeVisible();
  expect((await canvas.boundingBox())!.width).toBeCloseTo(left!.width * 3, 0);
  await dialog.getByRole("button", { name: "Pagina successiva", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Anteprima PDF, pagina 2", exact: true })).toBeVisible();
  await expect(dialog.getByText("Pagina 2 / 2", { exact: true })).toBeVisible();
  await expect(zoom.getByText("300%", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Pagina successiva", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Pagina precedente", exact: true }).click();
  await expect(canvas).toBeVisible();
  await zoom.getByRole("button", { name: "Adatta", exact: true }).click();
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("receipt-upload") || "{}").file)).toBe("invoice.pdf");
  await dialog.evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: testInfo.outputPath("purchase-pdf-desktop.png") });
  for (const size of [{ width: 1440, height: 900 }, { width: 1200, height: 700 }, { width: 1024, height: 600 }]) {
    await page.setViewportSize(size);
    await zoom.getByRole("button", { name: "Aumenta zoom", exact: true }).click();
    await expect(canvas).toBeVisible();
    const preview = dialog.getByRole("region", { name: "Anteprima documento scorrevole", exact: true });
    const toolbar = dialog.locator(".purchase-pdf-toolbar");
    expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(36);
    const filename = await toolbar.getByText("PDF · invoice.pdf", { exact: true }).boundingBox();
    const zoomBox = await zoom.boundingBox();
    expect(filename!.x + filename!.width).toBeLessThanOrEqual(zoomBox!.x);
    const pages = dialog.getByRole("navigation", { name: "Pagine del documento", exact: true });
    const original = dialog.getByRole("link", { name: "Apri PDF originale", exact: true });
    for (const element of [zoom, preview, pages, original]) {
      await expect(element).toBeInViewport({ ratio: 1 });
      const box = await element.boundingBox();
      const frame = await dialog.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(frame!.y);
      expect(box!.y + box!.height).toBeLessThan(frame!.y + frame!.height);
    }
    expect((await preview.boundingBox())!.height).toBeGreaterThan(80);
    await dialog.locator("form").evaluate(el => el.scrollTop = el.scrollHeight);
    await expect(pages).toBeInViewport({ ratio: 1 });
    await expect(original).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath(`purchase-pdf-contained-${size.width}-${size.height}.png`) });
    await zoom.getByRole("button", { name: "Adatta", exact: true }).click();
    await expect(canvas).toBeVisible();
    await dialog.locator("form").evaluate(el => el.scrollTop = 0);
  }
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    if (width === 360) await dialog.getByRole("button", { name: "Mostra documento", exact: true }).click();
    await expect(canvas).toBeVisible();
    await zoom.getByRole("button", { name: "Aumenta zoom", exact: true }).click();
    await expect(canvas).toBeVisible();
    const viewport = dialog.getByRole("region", { name: "Anteprima documento scorrevole", exact: true });
    expect(await viewport.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await viewport.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    const controls = await zoom.evaluate(el => [...el.querySelectorAll("button")].map(button => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    }));
    for (const control of controls) {
      expect(control.left).toBeGreaterThanOrEqual(0);
      expect(control.right).toBeLessThanOrEqual(width);
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }
    expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    if (width === 390) {
      await zoom.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("purchase-pdf-mobile.png") });
    }
    await zoom.getByRole("button", { name: "Riduci zoom", exact: true }).click();
    await expect(zoom.getByText("100%", { exact: true })).toBeVisible();
    await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBe(0);
  }
});

test("purchase free plan requires AI Pack", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openPurchase(page, "it", false, "blocked");
  await expect(dialog.getByRole("button", { name: "Analizza acquisto", exact: true })).toBeDisabled();
  const activation = dialog.getByRole("region", { name: "Attiva l’importazione con AI", exact: true });
  await expect(activation).toBeVisible();
  await expect(activation.getByRole("button", { name: "Scopri abbonamenti e AI Pack", exact: true })).toBeVisible();
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await dialog.evaluate(el => el.scrollTop = 0);
    const notice = await activation.boundingBox();
    const upload = await dialog.locator('input[type="file"]').first().boundingBox();
    expect(notice!.y + notice!.height).toBeLessThan(upload!.y);
    expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`purchase-activation-${width}.png`) });
  }
  await activation.getByRole("button", { name: "Scopri abbonamenti e AI Pack", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Acquista abbonamento mensile", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Abbonamento e AI Pack", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Abbonamento e AI Pack", exact: true })).toBeInViewport({ ratio: 1 });
});

for (const access of ["admin", "legacy-admin", "legacy-included"] as const) {
  test(`purchase analysis available without AI Pack (${access})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await openPurchase(page, "it", false, access);
    await expect(dialog.getByRole("heading", { name: "Attiva l’importazione con AI", exact: true })).toHaveCount(0);
    if (access !== "legacy-included") await expect(dialog.getByText("Accesso amministratore", { exact: false })).toBeVisible();
    await dialog.locator('input[type="file"]').first().setInputFiles(await receipt(page));
    await expect(dialog.getByRole("button", { name: "Analizza acquisto", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Analizza acquisto", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Verifica l’acquisto", exact: true })).toBeVisible();
    if (access === "admin") {
      await dialog.evaluate(el => el.scrollTop = 0);
      await page.screenshot({ path: testInfo.outputPath("purchase-admin-390.png") });
    }
  });
}

test("purchase free plan with AI Pack shows its charge", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openPurchase(page, "it", false, "credits");
  await dialog.locator('input[type="file"]').first().setInputFiles(await receipt(page));
  await expect(dialog.getByRole("button", { name: "Analizza acquisto", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Analizza acquisto", exact: true }).click();
  await expect(dialog.getByText("Stima AI · addebito AI Pack USD 0.021000", { exact: true })).toBeVisible();
});

test("purchase PDF preview failure keeps original and review accessible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const dialog = await openPurchase(page);
  await dialog.locator('input[type="file"]').first().setInputFiles({ name: "unsupported.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-invalid") });
  await dialog.getByRole("button", { name: "Analizza acquisto", exact: true }).click();
  await expect(dialog.getByText("Anteprima non disponibile.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Apri PDF originale", exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Verifica l’acquisto", exact: true })).toBeVisible();
});
