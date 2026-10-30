import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

/*
 * The administration of QR events: the code dressed as Vinaris, and an event
 * that can be paused for a while or deleted for good.
 */

const adminSession = { ...session, is_app_admin: true };

const event = {
  id: "event-1",
  slug: "market-2026",
  url: "https://vinaris.app/e/market-2026",
  qr_url: "/api/v1/admin/events/event-1/qr.svg",
  name: "The Market",
  place: "Lugano",
  locale: "it",
  is_active: true,
  starts_at: null,
  ends_at: null,
  features: ["restaurant_wine_list", "wine_pulse"],
  landing: "pairing-restaurant",
  credit_per_visitor_usd: "0.50",
  budget_usd: "0",
  max_visitors_per_day: 200,
  session_hours: 6,
  created_at: "2026-10-28T10:00:00Z",
  stats: { visitor_count: 12, active_visitors: 3, conversions: 2, granted_usd: "6.00", spent_usd: "1.20" },
};

for (const width of [390, 1440]) test(`an event can be deleted, after a confirmation that says what is lost at ${width}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width < 1100 ? 844 : 1000 });
  await mockApi(page, [], true, memberships, [wine], adminSession);
  // Images use the browser network, not the mocked window.fetch below.
  await page.route("**/api/v1/admin/events/event-1/qr.svg", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><path fill="#14372d" d="M10 10h30v30H10zM60 10h30v30H60zM10 60h30v30H10zM50 50h10v20H50zM70 60h20v10H70zM60 80h30v10H60z"/><path fill="white" d="M16 16h18v18H16zM66 16h18v18H66zM16 66h18v18H16z"/></svg>',
  }));
  await page.addInitScript((fixture) => {
    const previous = window.fetch;
    let events = [fixture];
    window.fetch = async (input, init) => {
      const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
      if (path === "/api/v1/admin/events") return Response.json(events);
      if (path.endsWith("/qr.svg")) return new Response("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'/>", { headers: { "Content-Type": "image/svg+xml" } });
      if (path === "/api/v1/admin/events/event-1" && init?.method === "DELETE") {
        sessionStorage.setItem("vinaris-test-event-deleted", "yes");
        events = [];
        return new Response(null, { status: 204 });
      }
      // The rest of the Operations page, as in operations.spec.ts.
      if (path.includes("/admin/operations/") || path.includes("/taste-profile/admin/") || path.endsWith("/wine-pulse/status")) {
        const business = Object.fromEntries("users_total users_approved users_enabled households_total wines_total bottles_total bottles_in_cellar tastings_total tastings_30d wishlist_items_total ai_requests_30d ai_successes_30d wine_name_searches_30d wine_photos_total label_recognitions_30d label_recognition_successes_30d coownership_active".split(" ").map((key) => [key, 24]));
        Object.assign(business, { users_blocked: 0, bottles_to_collect: 0, bottles_in_future_deliveries: 0, wine_name_search_cost_30d_usd: 1.2, coownership_pending: 0, household_inventory: [] });
        let body: unknown = [];
        if (path.endsWith("/overview")) body = { collected_at: "2026-10-08T10:00:00Z", business, application: { interactive_p50_duration_ms: 48, interactive_p95_duration_ms: 126, interactive_requests_recent: 420, slow_requests_recent: 0, interactive_slowest_recent: [] }, openai: { available: true, current_month_usd: 18.5, previous_period_usd: 12, change_percent: 54 } };
        else if (path.endsWith("/ai-pricing")) body = { price_book: { example: { input: "1", output: "4" } }, ai_pack_markup_percent: "15", free_tier_ai_pack_markup_percent: "100", updated_at: null };
        else if (path.endsWith("/vineyards")) body = { located: 12, pending: 0, not_found: 0, filtered: 0, candidates: [], precision_counts: { vineyard: 4, manual: 2, estate: 3, locality: 2, appellation: 1 } };
        else if (path.endsWith("/wine-pulse/status")) body = { published: 12, latest_run: { status: "completed", stats: { new: 3 }, completed_at: "2026-10-08T08:00:00Z" }, sources: [], next_cycle: null };
        else if (path.endsWith("/summary")) body = { wines_with_profile: 12, wines_without_profile: 0 };
        return Response.json(body);
      }
      return previous(input, init);
    };
  }, event);
  await page.goto("/");
  if (width < 1100) {
    await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Impostazioni", exact: true }).click();
  } else await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  await page.locator(".settings-tabs").getByRole("tab", { name: "Operatività", exact: true }).click();
  const card = page.locator(".admin-event");
  await expect(card).toContainText("Vinaris at The Market · Lugano");
  await expect(card).toContainText("Wine Pulse");
  await expect(card.getByRole("button", { name: "Metti in pausa" })).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await card.screenshot({ path: testInfo.outputPath(`admin-event-${width}.png`) });
  const panel = page.locator(".admin-events");
  await panel.getByRole("button", { name: "Nuovo evento", exact: true }).click();
  await expect(panel.getByLabel("Nome (es. The Market)")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await panel.locator("form").screenshot({ path: testInfo.outputPath(`admin-event-form-${width}.png`) });
  await panel.locator("form").getByRole("button", { name: "Annulla", exact: true }).click();

  // First a refusal: nothing happens.
  const messages: string[] = [];
  page.once("dialog", (dialog) => { messages.push(dialog.message()); void dialog.dismiss(); });
  await card.getByRole("button", { name: "Elimina" }).click();
  await expect(card).toBeVisible();
  expect(messages[0]).toContain("i 3 ospiti ora in visita perdono la serata");
  expect(messages[0]).toContain("Metti in pausa");

  page.once("dialog", (dialog) => void dialog.accept());
  await card.getByRole("button", { name: "Elimina" }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("vinaris-test-event-deleted"))).toBe("yes");
  await expect(page.getByText("Evento eliminato.")).toBeVisible();
  await expect(page.locator(".admin-event")).toHaveCount(0);
});
