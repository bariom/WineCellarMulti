import { expect, test } from "@playwright/test";
import { wine, session, memberships, merchants, mockApi, openWineDetail } from "./fixtures/app";

test("batches taste matches for visible cellar rows", async ({ page }) => {
  const secondWine = { ...wine, id: "wine-e2e-2", name: "Barolo E2E" };
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], false, memberships, [wine, secondWine]);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();

  await expect.poll(
    () => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("vinaris-test-taste-batches") || "[]").map((batch: string[]) => [...batch].sort())),
  ).toEqual([["wine-e2e-1", "wine-e2e-2"]]);
});

// Retain the original suite title and viewport for stable test identity.
test.describe("Wine Detail compact/mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows AI feedback immediately before saving a recognized wine for full enrichment", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, [], true, memberships, [wine], { ...session, can_use_label_recognition: true });
    await page.addInitScript(({ fixtureWine, imageSvg }) => {
      window.createImageBitmap = async () => {
        const canvas = document.createElement("canvas") as HTMLCanvasElement & { close: () => void };
        canvas.width = 480;
        canvas.height = 720;
        canvas.getContext("2d")?.fillRect(180, 80, 120, 560);
        canvas.close = () => undefined;
        return canvas as unknown as ImageBitmap;
      };
      const currentFetch = window.fetch.bind(window);
      const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        if (url.pathname === "/api/v1/ai/settings") {
          return jsonResponse({ provider_mode: "auto", has_openai_api_key: false, can_use_app_credits: true, ai_notes_model: "gpt-5-mini", drink_window_model: "gpt-5-mini", value_model: "gpt-5-mini", grape_model: "gpt-5-mini", score_model: "gpt-5-mini", wishlist_model: "gpt-5-mini", model_advisor_enabled: false, model_options: [], pairing_preferences: "", pairing_candidate_limit: 5 });
        }
        if (url.pathname === "/api/v1/wines/photo/warmup") return new Response(null, { status: 204 });
        if (url.pathname === "/api/v1/wines/photo/process") {
          return new Response(imageSvg, { status: 200, headers: { "Content-Type": "image/svg+xml" } });
        }
        if (url.pathname === "/api/v1/wines/catalog/recognize-bottle") {
          return jsonResponse({
            recognition_id: "11111111-1111-4111-8111-111111111111",
            status: "recognized",
            producer: "Cantina Vinaris",
            estate: "",
            wine_name: "Nebbiolo Riconosciuto",
            cuvee: "",
            vintage: "2020",
            appellation: "Langhe DOC",
            region: "Piemonte",
            country: "Italia",
            wine_type: "Red",
            label_text: ["Nebbiolo Riconosciuto", "2020"],
            alternative_candidates: [],
            needs_user_confirmation: true,
            recognition_notes: [],
            provider: "luna",
            matches: [],
            estimated_cost_usd: "0.001",
          });
        }
        if (url.pathname === "/api/v1/wines" && init?.method === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          return jsonResponse({ ...fixtureWine, id: "wine-recognized-e2e", name: "Nebbiolo Riconosciuto", vintage: "2020" });
        }
        if (url.pathname === "/api/v1/wines/catalog/recognition/confirm") {
          return jsonResponse({ catalog_entry_id: null, catalog_status: "pending", sensory_profile_status: "pending", sensory_profile_source: "" });
        }
        if (url.pathname.includes("/api/v1/wines/wine-recognized-e2e/photo")) {
          return jsonResponse({ ...fixtureWine, id: "wine-recognized-e2e" });
        }
        if (url.pathname === "/api/v1/ai/wines/wine-recognized-e2e/all") {
          return jsonResponse({ ...fixtureWine, id: "wine-recognized-e2e", name: "Nebbiolo Riconosciuto", vintage: "2020" });
        }
        return currentFetch(input, init);
      };
    }, {
      fixtureWine: wine,
      imageSvg: "<svg xmlns='http://www.w3.org/2000/svg' width='480' height='720'><rect width='480' height='720' fill='#eee'/><rect x='180' y='80' width='120' height='560' rx='40' fill='#53202f'/></svg>",
    });
    await page.goto("/");

    await page.getByRole("button", { name: "Aggiungi un vino", exact: true }).click();
    const editor = page.locator(".wine-editor-form");
    await editor.getByRole("button", { name: "Aggiungi vino da foto", exact: true }).click();
    const capture = page.getByRole("dialog", { name: "Fotografa bottiglia" });
    await capture.locator('input[type="file"]').setInputFiles({
      name: "wine.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='480' height='720'><rect width='480' height='720' fill='#eee'/><rect x='180' y='80' width='120' height='560' rx='40' fill='#53202f'/></svg>"),
    });
    await capture.getByRole("button", { name: "Usa questa foto", exact: true }).click();
    await expect(editor.getByText("Vino riconosciuto proposto", { exact: true })).toBeVisible();
    await expect(editor.getByText("Come vuoi continuare?", { exact: true })).toBeVisible();
    await expect(editor.getByText(/Scegli se completare la scheda modificabile/)).toBeVisible();

    await editor.getByRole("button", { name: "Salva e analizza tutto", exact: true }).click();
    const overlay = page.locator(".ai-generation-overlay");
    await expect(overlay).toHaveCount(1, { timeout: 250 });
    await expect(overlay).toBeVisible({ timeout: 750 });
    await expect(overlay.getByText("Analisi completa del vino", { exact: true })).toBeVisible();
    await expect(overlay).toBeHidden({ timeout: 5000 });
  });

  test("keeps the expanded wine editor above the cellar list", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWineDetail(page);
    await page.getByRole("button", { name: "Modifica selezionato" }).click();

    const editor = page.locator(".wine-editor-form");
    await expect(editor).toBeVisible();
    await editor.getByRole("button", { name: "Espandi modifica vino" }).click();
    await expect(editor).toHaveClass(/is-expanded/);

    const editorBox = (await editor.boundingBox())!;
    expect(editorBox.width).toBeGreaterThan(1000);
    expect(await page.evaluate(() => {
      const expandedEditor = document.querySelector<HTMLElement>(".wine-editor-form.is-expanded");
      if (!expandedEditor) return false;
      const box = expandedEditor.getBoundingClientRect();
      return document.elementFromPoint(box.left + 20, box.top + 20)?.closest(".wine-editor-form") === expandedEditor;
    })).toBe(true);
  });

  test("offers registered merchants in the wine editor", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWineDetail(page);
    await page.getByRole("button", { name: "Modifica selezionato" }).click();

    const editor = page.locator(".wine-editor-form");
    await editor.getByRole("button", { name: /Prezzi e valore/ }).click();
    const merchantInput = editor.getByLabel("Commerciante");
    await expect(merchantInput).toHaveAttribute("list");
    const options = editor.locator("datalist option");
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveAttribute("value", "Enoteca Test");
    await expect(options.nth(1)).toHaveAttribute("value", "Vini della Riserva");
  });

  test("keeps wine editor sections aligned with the detail view", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWineDetail(page, [{
      id: "strategy-e2e-1",
      wine_id: wine.id,
      stock_lot_id: null,
      purpose: "maturation",
      quantity: 1,
      horizon_year: null,
      note: "",
    }]);
    await page.getByRole("button", { name: "Modifica selezionato" }).click();

    const editor = page.locator(".wine-editor-form");
    await expect(editor).toBeVisible();
    const sectionKeys = ["identity", "value", "profile", "strategy", "stock", "history", "audit"];
    const sectionTitles = [
      "Identità e disponibilità",
      "Prezzi e valore",
      "Profilo e riconoscimenti",
      "Obiettivo in cantina",
      "Giacenza e acquisti",
      "Note e storia",
      "Audit AI",
    ];

    for (const title of sectionTitles) await expect(editor.getByText(title, { exact: true })).toBeVisible();
    for (const [index, key] of sectionKeys.entries()) {
      await expect(editor.locator(`[data-wine-editor-section="${key}"]`).getByText(String(index + 1).padStart(2, "0"), { exact: true }).first()).toBeVisible();
    }
    const positions = await Promise.all(sectionKeys.map(async (key) => {
      const box = await editor.locator(`[data-wine-editor-section="${key}"]`).boundingBox();
      return box?.y ?? -1;
    }));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));

    const strategyToggle = editor.getByRole("button", { name: /Obiettivo in cantina/ });
    const auditToggle = editor.getByRole("button", { name: /Audit AI/ });
    const auditCounter = auditToggle.getByText("0", { exact: true });
    await expect(auditCounter).toBeVisible();
    for (const [toggle, counter] of [[auditToggle, auditCounter]]) {
      const toggleBox = (await toggle.boundingBox())!;
      const counterBox = (await counter.boundingBox())!;
      expect(counterBox.x).toBeGreaterThan(toggleBox.x + toggleBox.width * 0.7);
    }

    await expect(strategyToggle.getByText("– / 4", { exact: true })).toBeVisible();
    await strategyToggle.click();
    await expect(strategyToggle.getByText("1 / 4", { exact: true })).toBeVisible();

    await editor.getByRole("button", { name: /Profilo e riconoscimenti/ }).click();
    await expect(editor.getByRole("heading", { name: "Punteggi" })).toBeVisible();
    await expect(editor.getByText("Tag", { exact: true }).first()).toBeVisible();
    await editor.getByRole("button", { name: /Profilo e riconoscimenti/ }).click();

    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
  });
});
