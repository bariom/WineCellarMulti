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
    candidates: [], missing_fields: ["grapes_text"] },
  { name: "Etna Rosso", producer: "Benanti", vintage: "2022", wine_type: "Red", region: "", appellation: "Etna DOC", country: "",
    confidence: "medium", image_index: 0, x: 0.45, y: 0.467, width: 0.1, height: 0.189, bottle_top: 0.067, bottle_bottom: 0.867, whole_bottle: true,
    status: "new", entry: null, candidates: [], missing_fields: [] },
  { name: "Barolo Brunata", producer: "Cantina Rossi", vintage: "2019", wine_type: "", region: "", appellation: "", country: "",
    confidence: "low", image_index: 0, x: 0.75, y: 0.467, width: 0.1, height: 0.189, bottle_top: 0, bottle_bottom: 0, whole_bottle: false,
    status: "uncertain", entry: null,
    candidates: [{ id: "a", name: "Barolo Brunate", producer: "Cantina Rossi", region: "", appellation: "", type: "", format: "" }, { id: "b", name: "Barolo Bussia", producer: "Cantina Rossi", region: "", appellation: "", type: "", format: "" }],
    missing_fields: [] },
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
            result: { bottles, photo_count: 1, unread_sections: 0, model: "gpt-6-luna", estimated_cost_usd: "0.004120" } });
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
