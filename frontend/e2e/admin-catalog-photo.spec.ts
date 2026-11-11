import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

/** A synthetic shelf photo: three dark bottles with light labels on a wooden shelf. */
async function shelfPhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#6b4a2b";
    context.fillRect(0, 0, 1200, 900);
    [240, 600, 960].forEach((x, index) => {
      context.fillStyle = "#1d2a1f";
      context.fillRect(x - 70, 160, 140, 620);
      context.fillRect(x - 25, 60, 50, 110);
      context.fillStyle = ["#f1e6c8", "#e9d7b0", "#f7f0de"][index];
      context.fillRect(x - 60, 420, 120, 170);
    });
    return canvas.toDataURL("image/jpeg", 0.9);
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

const BOTTLES = [
  { name: "Soave Classico", producer: "Pieropan", vintage: "2023", wine_type: "White", region: "Veneto", appellation: "Soave Classico DOC", country: "Italia",
    confidence: "high", image_index: 0, x: 0.15, y: 0.467, width: 0.1, height: 0.189, bottle_top: 0.067, bottle_bottom: 0.867, whole_bottle: true,
    status: "known", entry: { id: "soave", name: "Soave Classico", producer: "Pieropan", region: "Veneto", appellation: "Soave Classico DOC", type: "White", format: "", is_active: true },
    candidates: [], missing_fields: ["grapes_text"], photo: { ok: false, issue: "small", has_library_photo: false }, details: null, saved: false, photo_saved: false },
  { name: "Etna Rosso", producer: "Benanti", vintage: "2022", wine_type: "Red", region: "", appellation: "Etna DOC", country: "",
    confidence: "medium", image_index: 0, x: 0.45, y: 0.467, width: 0.1, height: 0.189, bottle_top: 0.067, bottle_bottom: 0.867, whole_bottle: true,
    status: "new", entry: null, candidates: [], missing_fields: [], photo: { ok: true, issue: "", has_library_photo: false }, details: null, saved: false, photo_saved: false },
  { name: "Barolo Brunata", producer: "Cantina Rossi", vintage: "2019", wine_type: "", region: "", appellation: "", country: "",
    confidence: "low", image_index: 0, x: 0.75, y: 0.467, width: 0.1, height: 0.189, bottle_top: 0, bottle_bottom: 0, whole_bottle: false,
    status: "uncertain", entry: null,
    candidates: [{ id: "a", name: "Barolo Brunate", producer: "Cantina Rossi", region: "", appellation: "", type: "", format: "" }, { id: "b", name: "Barolo Bussia", producer: "Cantina Rossi", region: "", appellation: "", type: "", format: "" }],
    missing_fields: [], photo: { ok: false, issue: "uncertain", has_library_photo: false }, details: null, saved: false, photo_saved: false },
];

for (const locale of ["it", "en"] as const) {
  test(`app admins read shelf labels and see what the catalog lacks (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, [], false, memberships, [wine], { ...session, locale, is_app_admin: true });
    await page.addInitScript((bottles) => {
      const original = window.fetch;
      let polls = 0;
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.href).pathname;
        if (path.endsWith("/admin/operations/overview")) return Response.json(null);
        if (path.endsWith("/admin/operations/vineyards")) return Response.json({ located: 0, pending: 0, not_found: 0, filtered: 0, candidates: [], precision_counts: {} });
        if (path.endsWith("/admin/operations/ai-pricing")) return Response.json({ price_book: {}, ai_pack_markup_percent: "15", free_tier_ai_pack_markup_percent: "100", updated_at: null });
        if (path.endsWith("/wine-pulse/status")) return Response.json({ published: 0, latest_run: null, sources: [], next_cycle: null });
        if (path.endsWith("/taste-profile/admin/summary")) return Response.json({ wines_with_profile: 0, wines_without_profile: 1 });
        const base = { id: "job-1", mode: "shelf", sections_total: 4, error: "", result: null };
        if (path.endsWith("/catalog-photos/scans") && init?.method === "POST") {
          const form = init.body as FormData;
          sessionStorage.setItem("catalog-photo-upload", JSON.stringify({ mode: form.get("mode"), images: form.getAll("images").length }));
          return Response.json({ ...base, status: "running", stage: "reading", sections_done: 0, bottles_found: 0 }, { status: 202 });
        }
        if (path.endsWith("/catalog-photos/scans/job-1")) {
          polls += 1;
          if (polls === 1) return Response.json({ ...base, status: "running", stage: "reading", sections_done: 2, bottles_found: 2 });
          return Response.json({ ...base, status: "done", stage: "done", sections_done: 4, bottles_found: 3,
            result: { bottles, photo_count: 1, unread_sections: 0, model: "gpt-6-luna", estimated_cost_usd: "0.004120", details_cost_usd: "0" } });
        }
        return original(input, init);
      };
    }, BOTTLES);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/");
    const photo = await shelfPhoto(page);
    if (it) await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
    else await page.getByRole("button", { name: "Open account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: it ? "Impostazioni" : "Settings" }).click();
    await page.getByRole("tab", { name: it ? "Operatività" : "Operations", exact: true }).click();
    await page.getByRole("button", { name: it ? /Catalogo vini/ : /Wine catalog/ }).click();
    await page.locator("summary", { hasText: it ? "Arricchisci da foto" : "Enrich from photos" }).click();
    const section = page.getByRole("region", { name: it ? "Arricchisci da foto" : "Enrich from photos", exact: true });
    await expect(section).toBeVisible();
    const read = section.getByRole("button", { name: it ? "Leggi le etichette" : "Read the labels" });
    await expect(read).toBeDisabled();
    await expect(section.getByRole("radio", { name: it ? /Scaffale/ : /Shelf/ })).toHaveAttribute("aria-checked", "true");
    // The camera tile opens the camera on phones; the upload tile opens the gallery.
    await expect(section.locator('input[type="file"][capture="environment"]')).toHaveCount(1);
    await expect(section.locator('input[type="file"][multiple]:not([capture])')).toHaveCount(1);
    await section.locator('input[type="file"][multiple]').setInputFiles({ name: "scaffale.jpg", mimeType: "image/jpeg", buffer: photo });
    await expect(section.getByRole("img", { name: "scaffale.jpg" })).toBeVisible();
    await read.click();
    await expect(section.getByText(it ? "In catalogo" : "In the catalog", { exact: true })).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("catalog-photo-upload") || "null"))).toEqual({ mode: "shelf", images: 1 });

    const items = section.locator(".catalog-photo-list > li");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText(it ? "Manca: vitigni" : "Missing: grapes");
    await expect(items.nth(1)).toContainText(it ? "Nuovo" : "New");
    await expect(items.nth(2)).toContainText(it ? "Forse: Cantina Rossi · Barolo Brunate; Cantina Rossi · Barolo Bussia" : "Maybe: Cantina Rossi · Barolo Brunate; Cantina Rossi · Barolo Bussia");
    await expect(items.nth(2)).toContainText(it ? "Etichetta letta con poca sicurezza" : "Label read with low confidence");
    const summary = section.getByRole("list", { name: it ? "Riepilogo" : "Summary" });
    await expect(summary).toContainText(it ? "1 nuovi" : "1 new");
    await expect(summary).toContainText(it ? "1 da completare" : "1 to complete");
    await expect(summary).toContainText(it ? "1 da controllare" : "1 to check");
    await expect(section.getByText(/\$0\.004/)).toBeVisible();
    // Each result shows its bottle cut from the photo.
    await expect(items.nth(0).locator(".catalog-photo-crop:not(.is-empty)")).toBeVisible();

    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const bounds = (await section.boundingBox())!;
      for (const control of await section.locator("button, .catalog-photo-add, .catalog-photo-list > li").all()) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      }
      if (it) await section.screenshot({ path: testInfo.outputPath(`admin-catalog-photo-${width}.png`) });
    }
    expect(pageErrors).toEqual([]);
  });
}

const DETAILS = {
  found: true, name: "Etna Rosso", producer: "Benanti", appellation: "Etna DOC", region: "Sicilia", country: "Italia",
  wine_type: "Red", grapes: ["Nerello Mascalese", "Nerello Cappuccio"], description: "Rosso dell'Etna da Nerello Mascalese, fresco e minerale.",
  drink_from: 2024, drink_peak_from: 2025, drink_peak_to: 2029, drink_to: 2032, drink_notes: "Da bere nei primi anni.",
  sources: [{ url: "https://www.benanti.it/vini/etna-rosso", title: "Etna Rosso | Benanti" }],
};

for (const locale of ["it", "en"] as const) {
  test(`app admins research, review and save a wine read on a photo (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, [], false, memberships, [wine], { ...session, locale, is_app_admin: true });
    await page.addInitScript(({ bottles, details }) => {
      const original = window.fetch;
      let researched = false;
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.href).pathname;
        if (path.endsWith("/admin/operations/overview")) return Response.json(null);
        if (path.endsWith("/admin/operations/vineyards")) return Response.json({ located: 0, pending: 0, not_found: 0, filtered: 0, candidates: [], precision_counts: {} });
        if (path.endsWith("/admin/operations/ai-pricing")) return Response.json({ price_book: {}, ai_pack_markup_percent: "15", free_tier_ai_pack_markup_percent: "100", updated_at: null });
        if (path.endsWith("/wine-pulse/status")) return Response.json({ published: 0, latest_run: null, sources: [], next_cycle: null });
        if (path.endsWith("/taste-profile/admin/summary")) return Response.json({ wines_with_profile: 0, wines_without_profile: 1 });
        const base = { id: "job-1", mode: "close", sections_total: 1, sections_done: 1, bottles_found: 3, error: "" };
        const result = (withDetails: boolean) => ({
          bottles: withDetails
            ? bottles.map((bottle, index) => (index === 1 ? { ...bottle, details } : index === 0 ? { ...bottle, details: { ...details, found: false, sources: [] } } : bottle))
            : bottles,
          photo_count: 1, unread_sections: 0, model: "gpt-6-luna", estimated_cost_usd: "0.004120", details_cost_usd: withDetails ? "0.031500" : "0",
        });
        if (path.endsWith("/catalog-photos/scans") && init?.method === "POST") {
          return Response.json({ ...base, status: "running", stage: "reading", sections_done: 0, result: null }, { status: 202 });
        }
        if (path.endsWith("/catalog-photos/scans/job-1/details")) {
          sessionStorage.setItem("catalog-photo-details", String(init?.body));
          researched = true;
          return Response.json({ ...base, status: "running", stage: "researching", sections_done: 0, result: null }, { status: 202 });
        }
        if (path.endsWith("/catalog-photos/scans/job-1/bottles/1")) {
          const payload = JSON.parse(String(init?.body));
          sessionStorage.setItem("catalog-photo-save", JSON.stringify(payload));
          const entry = { id: "etna", name: payload.name, producer: payload.producer, region: payload.region, appellation: payload.appellation, type: payload.type, format: "", country: payload.country, grapes_text: payload.grapes_text, is_active: true };
          return Response.json({ bottle: { ...bottles[1], details, status: "known", entry, missing_fields: [], saved: true, photo_saved: true }, photo: "saved" });
        }
        if (path.endsWith("/catalog-photos/scans/job-1")) {
          return Response.json({ ...base, status: "done", stage: "done", result: result(researched) });
        }
        return original(input, init);
      };
    }, { bottles: BOTTLES, details: DETAILS });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/");
    const photo = await shelfPhoto(page);
    await page.getByRole("button", { name: it ? "Apri menu account" : "Open account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: it ? "Impostazioni" : "Settings" }).click();
    await page.getByRole("tab", { name: it ? "Operatività" : "Operations", exact: true }).click();
    await page.getByRole("button", { name: it ? /Catalogo vini/ : /Wine catalog/ }).click();
    await page.locator("summary", { hasText: it ? "Arricchisci da foto" : "Enrich from photos" }).click();
    const section = page.getByRole("region", { name: it ? "Arricchisci da foto" : "Enrich from photos", exact: true });
    await section.locator('input[type="file"][multiple]').setInputFiles({ name: "bottiglie.jpg", mimeType: "image/jpeg", buffer: photo });
    await section.getByRole("button", { name: it ? "Leggi le etichette" : "Read the labels" }).click();
    const items = section.locator(".catalog-photo-list > li");
    await expect(items).toHaveCount(3, { timeout: 10_000 });

    // Readable wines that are new or incomplete are chosen for the research; a doubtful label is not.
    const pick = (index: number) => items.nth(index).getByRole("checkbox", { name: it ? "Cerca i dati" : "Research" });
    await expect(pick(0)).toBeChecked();
    await expect(pick(1)).toBeChecked();
    await expect(pick(2)).not.toBeChecked();
    await expect(items.nth(0)).toContainText(it ? "Foto non salvabile: bottiglia troppo piccola nella foto" : "Photo not kept: bottle too small in the photo");
    await expect(items.nth(1)).toContainText(it ? "Foto adatta all'archivio" : "Photo fit for the library");
    // With nothing chosen the button stays readable and says where to choose.
    await pick(0).uncheck();
    await pick(1).uncheck();
    const empty = section.getByRole("button", { name: it ? "Cerca i dati (0)" : "Research (0)" });
    await expect(empty).toBeDisabled();
    await expect(section.locator(".catalog-photo-research")).toContainText(it ? "Spunta \"Cerca i dati\" sui vini dell'elenco qui sotto." : "Tick \"Research\" on the wines in the list below.");
    expect(await empty.evaluate((button) => getComputedStyle(button).opacity)).toBe("1");
    if (it) await section.locator(".catalog-photo-research").screenshot({ path: testInfo.outputPath("admin-catalog-photo-research-empty.png") });
    await pick(0).check();
    await pick(1).check();
    await section.getByRole("button", { name: it ? "Cerca i dati (2)" : "Research (2)" }).click();
    await expect(items.nth(1)).toContainText(it ? "Dati trovati · 1 fonte" : "Details found · 1 source", { timeout: 10_000 });
    await expect(items.nth(0)).toContainText(it ? "Nessun dato affidabile trovato" : "No reliable details found");
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("catalog-photo-details") || "null"))).toEqual({ bottles: [0, 1] });
    await expect(section.getByText(it ? /ricerca dei dati: \$0\.032/ : /research: \$0\.032/)).toBeVisible();

    // The cutout the library would receive is shown before saving.
    await page.route("**/catalog-photos/scans/job-1/bottles/1/cutout", (route) => route.fulfill({
      status: 200, contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    }));
    await items.nth(1).getByRole("button", { name: it ? "Rivedi e salva" : "Review and save" }).click();
    const form = items.nth(1).getByRole("form", { name: it ? "Scheda da salvare" : "Entry to save" });
    await expect(form.getByRole("img", { name: it ? "Bottiglia scontornata" : "Cut-out bottle" })).toBeVisible();
    await expect(form).toContainText(it ? "Così entrerebbe nell'archivio condiviso." : "This is how it would enter the shared library.");
    await expect(form.getByLabel(it ? "Produttore" : "Producer")).toHaveValue("Benanti");
    await expect(form.getByLabel(it ? "Regione" : "Region")).toHaveValue("Sicilia");
    await expect(form.getByLabel(it ? "Vitigni (separati da virgola)" : "Grapes (comma separated)")).toHaveValue("Nerello Mascalese, Nerello Cappuccio");
    await expect(form.getByLabel(it ? "Tipo" : "Type")).toHaveValue("Red");
    await expect(form.getByLabel(it ? "Fino a" : "Until", { exact: true })).toHaveValue("2032");
    await expect(form.getByRole("link", { name: "Etna Rosso | Benanti" })).toHaveAttribute("href", "https://www.benanti.it/vini/etna-rosso");
    const keepPhoto = form.getByRole("checkbox", { name: it ? "Salva la foto della bottiglia nell'archivio condiviso" : "Save the bottle photo to the shared library" });
    await expect(keepPhoto).toBeChecked();

    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const bounds = (await section.boundingBox())!;
      for (const control of await form.locator("input, select, textarea, button").all()) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      }
      if (it) await items.nth(1).screenshot({ path: testInfo.outputPath(`admin-catalog-photo-editor-${width}.png`) });
    }

    // Years out of order block the save until they are fixed.
    const save = form.getByRole("button", { name: it ? "Salva nel catalogo" : "Save to the catalog" });
    const from = form.getByLabel(it ? "Da" : "From", { exact: true });
    await from.fill("2034");
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(save).toBeDisabled();
    await from.fill("2024");
    await form.getByLabel(it ? "Descrizione" : "Description").fill("Rosso dell'Etna, fresco.");
    await save.click();

    await expect(items.nth(1)).toContainText(it ? "Salvato" : "Saved");
    await expect(items.nth(1)).toContainText(it ? "Foto salvata nell'archivio condiviso." : "Photo saved to the shared library.");
    await expect(section.getByRole("list", { name: it ? "Riepilogo" : "Summary" })).toContainText(it ? "1 salvati" : "1 saved");
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("catalog-photo-save") || "null"))).toMatchObject({
      entry_id: null, name: "Etna Rosso", producer: "Benanti", appellation: "Etna DOC", region: "Sicilia", type: "Red",
      grapes_text: "Nerello Mascalese, Nerello Cappuccio", description: "Rosso dell'Etna, fresco.",
      drink_from: 2024, drink_peak_from: 2025, drink_peak_to: 2029, drink_to: 2032, save_photo: true, replace_photo: false,
    });
    expect(pageErrors).toEqual([]);
  });
}
