import { expect, test, type Page, type Route } from "@playwright/test";

const wine = {
  id: "wine-e2e-1",
  details_loaded: true,
  shared_data_features: [],
  shared_data_updated_at: null,
  household_id: "household-e2e",
  name: "Nebbiolo di Test",
  producer: "Cantina Vinaris",
  vintage: "2019",
  quantity: 4,
  storage_allocations: [],
  currency: "CHF",
  price: "42.00",
  sale_price: "55.00",
  glass_price: null,
  pour_size_ml: 100,
  reorder_threshold: 2,
  reorder_enabled: true,
  commercial_status: "active",
  open_bottle_ml: 0,
  current_value: "48.00",
  value_not_found: false,
  status: "in_cellar",
  format: "750ml",
  type: "red",
  region: "Piemonte",
  appellation: "Langhe",
  merchant: "Enoteca Test",
  order_date: null,
  expected_delivery: null,
  owner_share_pct: "100",
  notes: "Nota di test",
  ai_notes: "Profilo di test",
  drink_from: 2024,
  drink_peak_from: 2026,
  drink_peak_to: 2028,
  drink_to: 2032,
  drink_window_notes: "Finestra stabile per la verifica E2E.",
  ai_value_notes: "Valore verificato.",
  ai_value_estimated_at: null,
  rating: 0,
  owners: [],
  tags: [],
  grapes: [{ name: "Nebbiolo", percentage_from: 100, percentage_to: 100 }],
  grapes_source_url: "",
  grapes_source_title: "",
  grapes_verified_at: null,
  grapes_not_applicable: false,
  scores: [],
  scores_not_applicable: false,
  vineyard_name: "Vigna Test",
  vineyard_locality: "Barolo",
  vineyard_country: "Italia",
  vineyard_latitude: 44.6102,
  vineyard_longitude: 7.9446,
  vineyard_precision: "estate",
  vineyard_source_url: "",
  vineyard_source_title: "",
  vineyard_notes: "Origine di test.",
  vineyard_verified_at: null,
  vineyard_not_found: false,
  photo_thumbnail_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='160' viewBox='0 0 80 160'%3E%3Crect x='26' y='8' width='28' height='18' rx='3' fill='%23754a24'/%3E%3Crect x='17' y='22' width='46' height='128' rx='12' fill='%2343372d'/%3E%3Crect x='21' y='64' width='38' height='48' fill='%23ede1bf'/%3E%3C/svg%3E",
  photo_detail_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='160' viewBox='0 0 80 160'%3E%3Crect x='26' y='8' width='28' height='18' rx='3' fill='%23754a24'/%3E%3Crect x='17' y='22' width='46' height='128' rx='12' fill='%2343372d'/%3E%3Crect x='21' y='64' width='38' height='48' fill='%23ede1bf'/%3E%3C/svg%3E",
  created_at: "2026-01-01T00:00:00Z",
  tasting_history: [],
  value_history: [],
};

const session = {
  authenticated: true,
  user_display_name: "E2E User",
  user_email: "e2e@example.test",
  active_household_id: "household-e2e",
  active_household_name: "Cantina E2E",
  active_household_mode: "private",
  restaurant_mode_available: false,
  membership_role: "owner",
  is_app_admin: false,
  is_demo: false,
  pending_approval: false,
  pending_email_verification: false,
  requires_legal_acceptance: false,
  legal_document_version: "2026-01",
  locale: "it",
  theme_preference: "light",
  dashboard_focus: "balanced",
  daily_wine_budget_chf: null,
  can_use_label_recognition: false,
  can_manage_wine_photos: true,
  cellar_ai_assistant_available: false,
  is_free_tier: false,
  free_tier_label_limit: 15,
  can_use_personal_openai_key: false,
  has_active_entitlement: true,
  entitlement_valid_until: null,
  entitlement_days_remaining: null,
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockApi(page: Page) {
  await page.addInitScript(({ fixtureWine, fixtureSession }) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(requestUrl, window.location.origin);
      if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
      const path = url.pathname;
      let body: unknown = [];
      if (path.endsWith("/session")) body = fixtureSession;
      else if (path.includes("/intelligence/wines/") || path.includes("/storage/allocations")) body = [];
      else if (path.includes("/share-offer") || path.includes("/co-ownership-agreements") || path.includes("/recipients")) body = [];
      else if (path.endsWith("/wines")) body = [fixtureWine];
      else if (path.includes("/wines/wine-e2e-1")) body = fixtureWine;
      else if (path.includes("/wine-pulse")) body = { items: [], total: 0, offset: 0, limit: 3, has_more: false };
      else if (path.includes("value-history/portfolio") || path.includes("wishlist/lists") || path.includes("operational-action-snoozes")) body = [];
      else if (path.includes("regional-gap-settings")) body = { targets: [], last_ai_suggestion: null };
      else if (path.includes("notifications")) body = { items: [], counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 }, offset: 0, next_offset: null, has_more: false };
      else if (path.includes("billing")) body = { is_free_tier: false, has_active_entitlement: true, entitlement_valid_until: null, entitlement_days_remaining: null, ai_credit_balance_usd: "0" };
      else if (path.includes("household/memberships")) body = [{ membership_id: "membership-e2e", household_id: "household-e2e", household_name: "Cantina E2E", role: "owner", operating_mode: "private" }];
      else if (path.includes("audit") || path.includes("tags") || path.includes("agreements") || path.includes("share-offers") || path.includes("share-offer") || path.includes("invites") || path.includes("recipients")) body = [];
      else if (path.includes("ai/settings")) body = { provider_mode: "application", ai_notes_model: "", drink_window_model: "", value_model: "", grape_model: "", score_model: "", wishlist_model: "", model_advisor_enabled: false, pairing_preferences: "", pairing_candidate_limit: 5 };
      else if (path.includes("public-config")) body = {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }, { fixtureWine: wine, fixtureSession: session });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname;
    if (path.endsWith("/session")) return fulfillJson(route, session);
    if (path.includes("/intelligence/wines/")) return fulfillJson(route, []);
    if (path.includes("/storage/allocations")) return fulfillJson(route, []);
    if (path.endsWith("/wines")) return fulfillJson(route, [wine]);
    if (path.includes("/wines/wine-e2e-1")) return fulfillJson(route, wine);
    if (path.includes("/wine-pulse")) return fulfillJson(route, { items: [], total: 0, offset: 0, limit: 3, has_more: false });
    if (path.includes("value-history/portfolio")) return fulfillJson(route, []);
    if (path.includes("wishlist/lists")) return fulfillJson(route, []);
    if (path.includes("notifications")) return fulfillJson(route, { items: [], counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 }, offset: 0, next_offset: null, has_more: false });
    if (path.includes("regional-gap-settings")) return fulfillJson(route, { targets: [], last_ai_suggestion: null });
    if (path.includes("operational-action-snoozes")) return fulfillJson(route, []);
    if (path.includes("billing")) return fulfillJson(route, { is_free_tier: false, has_active_entitlement: true, entitlement_valid_until: null, entitlement_days_remaining: null, ai_credit_balance_usd: "0" });
    if (path.includes("household/memberships")) return fulfillJson(route, [{ membership_id: "membership-e2e", household_id: "household-e2e", household_name: "Cantina E2E", role: "owner", operating_mode: "private" }]);
    if (path.includes("audit") || path.includes("tags") || path.includes("agreements") || path.includes("share-offers") || path.includes("share-offer") || path.includes("invites") || path.includes("recipients")) return fulfillJson(route, []);
    if (route.request().method() === "GET") return fulfillJson(route, []);
    return fulfillJson(route, route.request().method() === "PATCH" ? wine : {});
  });
  await page.route("https://{a,b,c}.tile.openstreetmap.org/**", (route) => route.fulfill({ status: 204, body: "" }));
}

async function openWineDetail(page: Page) {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  const wineRow = page.locator('[data-wine-row-id="wine-e2e-1"] article');
  await expect(wineRow).toBeVisible();
  await wineRow.click();
  await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
}

test.describe("Wine Detail compact/mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("renders functional hierarchy without horizontal overflow", async ({ page }) => {
    await openWineDetail(page);
    const detail = page.locator(".wine-detail:visible").first();
    await expect(detail.getByRole("heading", { name: "Nebbiolo di Test" })).toBeVisible();
    await expect(detail.getByText("Stato", { exact: true }).first()).toBeVisible();
    await expect(detail.getByText("Quantità", { exact: true }).first()).toBeVisible();
    await expect(detail.getByRole("heading", { name: "Finestra degustazione" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Registra bevuta", exact: true })).toHaveCount(1);
    await expect(detail.getByRole("button", { name: "Registra vendita", exact: true })).toHaveCount(1);

    const metrics = detail.locator(".detail-hero-metrics");
    const drinkingWindow = detail.locator(".detail-hero-window");
    const photoAction = detail.getByRole("button", { name: "Sostituisci foto", exact: true });
    const origin = detail.getByRole("button", { name: /Origine/ });
    await expect(photoAction).toBeVisible();
    await expect(origin).toBeVisible();
    const metricsBox = (await metrics.boundingBox())!;
    const photoActionBox = (await photoAction.boundingBox())!;
    const originBox = (await origin.boundingBox())!;
    expect(photoActionBox.y + photoActionBox.height).toBeLessThanOrEqual(metricsBox.y);
    expect(originBox.y + originBox.height).toBeLessThanOrEqual(metricsBox.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(detail.locator(".detail-market-block")).not.toHaveAttribute("open", "");
    await expect(detail.locator(".ai-audit-detail")).not.toHaveAttribute("open", "");
  });

  test("keeps the desktop detail smoke path available", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWineDetail(page);
    await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nebbiolo di Test", exact: true }).first()).toBeVisible();
  });

  test("keeps the mobile layout free of horizontal overflow at supported widths", async ({ page }) => {
    for (const viewport of [{ width: 360, height: 800 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      await openWineDetail(page);
      await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });

  test("matches the compact visual baseline", async ({ page }) => {
    await openWineDetail(page);
    await expect(page).toHaveScreenshot("wine-detail-compact.png", { fullPage: true });
  });
});
