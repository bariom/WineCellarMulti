import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

for (const width of [390, 1440]) {
  test(`Operations areas preserve tools and separate configuration ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page, [], false, memberships, [wine], { ...session, is_app_admin: true });
    await page.goto("/");
    await page.evaluate(() => {
      const original = window.fetch;
      const business = Object.fromEntries("users_total users_approved users_enabled households_total wines_total bottles_total bottles_in_cellar tastings_total tastings_30d wishlist_items_total ai_requests_30d ai_successes_30d wine_name_searches_30d wine_photos_total label_recognitions_30d label_recognition_successes_30d coownership_active".split(" ").map(key => [key, 24]));
      Object.assign(business, { users_blocked: 0, bottles_to_collect: 0, bottles_in_future_deliveries: 0, wine_name_search_cost_30d_usd: 1.2, coownership_pending: 0, household_inventory: [] });
      let pricing = { price_book: { example: { input: "1", output: "4" } }, ai_pack_markup_percent: "15", free_tier_ai_pack_markup_percent: "100", updated_at: null };
      window.sessionStorage.setItem("operations-writes", "[]");
      window.fetch = async (input, init) => {
        const url = String(input);
        const path = new URL(url, location.origin).pathname;
        if (!path.includes("/admin/operations/") && !path.includes("/taste-profile/admin/") && !path.endsWith("/wine-pulse/status")) return original(input, init);
        if (init?.method && init.method !== "GET") {
          const writes = JSON.parse(sessionStorage.getItem("operations-writes") || "[]");
          writes.push(path);
          sessionStorage.setItem("operations-writes", JSON.stringify(writes));
        }
        let body: unknown = [];
        if (path.endsWith("/overview")) body = { collected_at: "2026-10-08T10:00:00Z", business, application: { interactive_p50_duration_ms: 48, interactive_p95_duration_ms: 126, interactive_requests_recent: 420, slow_requests_recent: 0, interactive_slowest_recent: [] }, openai: { available: true, current_month_usd: 18.5, previous_period_usd: 12, change_percent: 54 } };
        else if (path.endsWith("/ai-pricing")) {
          if (init?.method === "PUT") {
            const payload = JSON.parse(String(init.body));
            pricing = { ...pricing, ai_pack_markup_percent: payload.ai_pack_markup_percent, price_book: JSON.parse(payload.price_book_json) };
          }
          body = pricing;
        } else if (path.endsWith("/vineyards")) body = { located: 12, pending: 0, not_found: 0, filtered: 0, candidates: [], precision_counts: { vineyard: 4, manual: 2, estate: 3, locality: 2, appellation: 1 } };
        else if (path.endsWith("/wine-pulse/status")) body = { published: 12, latest_run: { status: "completed", stats: { new: 3 }, completed_at: "2026-10-08T08:00:00Z" }, sources: [], next_cycle: null };
        else if (path.endsWith("/summary")) body = { wines_with_profile: 12, wines_without_profile: 0 };
        return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
      };
    });
    if (width < 1100) {
      await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
      await page.getByRole("menuitem", { name: "Impostazioni", exact: true }).click();
    } else await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
    await page.getByRole("tab", { name: "Operatività", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Aree operative" });
    await expect(nav).toBeVisible();
    await expect(page.getByRole("heading", { name: "Il quadro generale" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profili sensoriali dei vini" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Crea token", exact: true })).not.toBeVisible();
    await expect(page.getByLabel("JSON listino modelli AI")).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Vini in catalogo da approvare" })).not.toBeVisible();
    for (const size of width === 390 ? [360, 390, 430] : [1440]) {
      await page.setViewportSize({ width: size, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const boxes = await nav.getByRole("button").evaluateAll(elements => elements.map(el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }));
      for (let i = 0; i < boxes.length; i++) {
        const a = boxes[i];
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x + a.width).toBeLessThanOrEqual(size);
        expect(a.height).toBeGreaterThanOrEqual(44);
        for (const b of boxes.slice(i + 1)) expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
      }
      if (size === 390 || size === 1440) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath(`overview-${size}.png`), fullPage: true });
      }
      if (size === 390) await expect(page).toHaveScreenshot("operations-overview-compact.png", { fullPage: true });
    }
    await page.setViewportSize({ width, height: 844 });
    await nav.getByRole("button", { name: /Catalogo vini/ }).click();
    await page.getByText("Nuovi vini da approvare", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Vini in catalogo da approvare" })).toBeVisible();
    await page.getByText("Cerca e gestisci le schede", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cerca entry catalogo" })).toBeVisible();
    await page.getByText("Profili sensoriali", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Mostra anteprima" })).toBeVisible();
    await page.getByText("Vigneti e provenienza", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Cerca tutti", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Il quadro generale" })).not.toBeVisible();
    for (const size of width === 390 ? [360, 390, 430] : [1440]) {
      await page.setViewportSize({ width: size, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`catalog-${width}.png`), fullPage: true });
    await nav.getByRole("button", { name: /Wine Pulse/ }).click();
    await expect(page.getByRole("region", { name: "Vinaris Wine Pulse", exact: true })).toContainText("completed");
    await nav.getByRole("button", { name: /Costi AI/ }).click();
    await page.getByText("Configura listino e margini", { exact: true }).click();
    await page.getByLabel("Margine AI Pack abbonati (%)", { exact: true }).fill("20");
    await nav.getByRole("button", { name: /Dispositivi/ }).click();
    await expect(page.getByRole("button", { name: "Crea token", exact: true })).toBeVisible();
    await nav.getByRole("button", { name: /Costi AI/ }).click();
    await expect(page.getByLabel("Margine AI Pack abbonati (%)", { exact: true })).toHaveValue("20");
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("operations-writes") || "[]"))).toEqual([]);
    await page.getByRole("button", { name: "Salva listino", exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("operations-writes") || "[]").length)).toBe(1);
    await expect(page.getByLabel("Margine AI Pack abbonati (%)", { exact: true })).toHaveValue("20");
    for (const size of width === 390 ? [360, 390, 430] : [1440]) {
      await page.setViewportSize({ width: size, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`costs-${width}.png`), fullPage: true });
  });
}
