import { expect, type Page, type Route } from "@playwright/test";

// Shared deterministic application data and API mocks; no tests are registered here.

export async function snapshotChrome(page: Page, visible: boolean) {
  await page.locator(".topbar, .mobile-bottom-navigation, .back-to-top-button").evaluateAll((elements, show) => {
    for (const element of elements) {
      if (show) (element as HTMLElement).style.removeProperty("opacity");
      else (element as HTMLElement).style.setProperty("opacity", "0", "important");
    }
  }, visible);
}

export const wine = {
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
  strategy_purposes: [],
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

export const session = {
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

export const memberships = [{ membership_id: "membership-e2e", household_id: "household-e2e", household_name: "Cantina E2E", role: "owner", operating_mode: "private" }];

export const merchants = [
  { id: "merchant-e2e-1", name: "Enoteca Test" },
  { id: "merchant-e2e-2", name: "Vini della Riserva" },
];

export const tastingArchive = {
  total: 1,
  limit: 5,
  offset: 0,
  rated_count: 1,
  notes_count: 1,
  latest_consumed_at: "2026-08-20",
  profile: [],
  items: [{
    tasting_id: "tasting-e2e-1",
    wine_id: wine.id,
    wine_name: wine.name,
    wine_producer: wine.producer,
    wine_vintage: wine.vintage,
    wine_format: wine.format,
    wine_type: wine.type,
    wine_region: wine.region,
    wine_appellation: wine.appellation,
    wine_status: "consumed",
    consumed_at: "2026-08-20",
    note: "Degustazione di test.",
    rating: 5,
    enjoyment: "positive",
    occasion: "Cena",
    pairing: "Brasato",
    companions: "Amici",
    sommelier_feedback: "",
    sommelier_pairing_score: null,
    sommelier_pairing_advice: "",
    sommelier_feedback_cost_usd: null,
    sommelier_feedback_at: null,
    created_at: "2026-08-20T20:00:00Z",
  }],
};

export const tasteProfileCollection = {
  profiles: [
    {
      category: "global",
      dimensions: {
        body: { preference: .70, confidence: .72, samples: 21 },
        acidity: { preference: .75, confidence: .74, samples: 21 },
        tannin: { preference: .63, confidence: .66, samples: 16 },
        sweetness: { preference: .54, confidence: .61, samples: 21 },
        aromatic_intensity: { preference: .74, confidence: .73, samples: 21 },
        fruit: { preference: .72, confidence: .71, samples: 21 },
        wood: { preference: .61, confidence: .64, samples: 18 },
        spice: { preference: .65, confidence: .67, samples: 18 },
        minerality: { preference: .68, confidence: .69, samples: 15 },
      },
      attributes: {
        preferred_countries: [["Italia", .88], ["Francia", .76], ["Svizzera", .61]],
        preferred_regions: [["Toscana", .82], ["Champagne", .78], ["Piemonte", .72], ["Ticino", .62]],
        preferred_appellations: [["Brunello di Montalcino DOCG", .74], ["Champagne Grand Cru", .70], ["Ticino DOC", .62]],
      },
      confidence: .72,
      sample_count: 21,
      tasting_count: 21,
      star_rating_count: 35,
      confidence_level: "probable",
    },
    {
      category: "red",
      dimensions: {
        body: { preference: .77, confidence: .70, samples: 15 },
        acidity: { preference: .71, confidence: .68, samples: 15 },
        tannin: { preference: .73, confidence: .69, samples: 15 },
        aromatic_intensity: { preference: .75, confidence: .70, samples: 15 },
        fruit: { preference: .76, confidence: .69, samples: 15 },
      },
      attributes: {}, confidence: .70, sample_count: 15, confidence_level: "probable",
    },
    {
      category: "white",
      dimensions: {
        body: { preference: .60, confidence: .55, samples: 5 },
        acidity: { preference: .82, confidence: .58, samples: 5 },
        sweetness: { preference: .48, confidence: .51, samples: 5 },
        aromatic_intensity: { preference: .70, confidence: .57, samples: 5 },
        minerality: { preference: .76, confidence: .56, samples: 5 },
      },
      attributes: {}, confidence: .56, sample_count: 5, confidence_level: "emerging",
    },
    {
      category: "rose",
      dimensions: {
        body: { preference: .52, confidence: .38, samples: 3 },
        acidity: { preference: .78, confidence: .40, samples: 3 },
        sweetness: { preference: .50, confidence: .35, samples: 3 },
        aromatic_intensity: { preference: .69, confidence: .39, samples: 3 },
        fruit: { preference: .74, confidence: .40, samples: 3 },
      },
      attributes: {}, confidence: .39, sample_count: 3, confidence_level: "emerging",
    },
  ],
};

export const multiCellarMemberships = [
  ...memberships,
  { membership_id: "membership-e2e-2", household_id: "household-e2e-2", household_name: "Riserva E2E", role: "owner", operating_mode: "private" },
];

export const intelligenceSnapshot = {
  generated_at: "2026-08-21T12:00:00Z",
  fingerprint: "snapshot-current",
  preferences: { annual_drink_target: 24, protected_capital_pct: 50, special_occasion_target: 6, next_special_occasion_date: null, planning_horizon_years: 5, refresh_interval_days: 30 },
  wine_count: 1,
  bottle_count: 4,
  allocated_bottle_count: 0,
  allocation_coverage_pct: 0,
  purpose_totals: { drink: 0, maturation: 0, investment: 0, special_occasion: 0, undecided: 0 },
  drink_now_count: 0,
  maturation_count: 0,
  investment_count: 0,
  undecided_count: 4,
  wines: [{
    wine_id: wine.id,
    name: wine.name,
    photo_thumbnail_url: wine.photo_thumbnail_url,
    producer: wine.producer,
    vintage: wine.vintage,
    region: wine.region,
    type: wine.type,
    quantity: wine.quantity,
    allocated_quantity: 0,
    unallocated_quantity: wine.quantity,
    currency: wine.currency,
    purchase_value: "168.00",
    current_value: "192.00",
    drink_from: wine.drink_from,
    drink_peak_from: wine.drink_peak_from,
    drink_peak_to: wine.drink_peak_to,
    drink_to: wine.drink_to,
    readiness: "ready",
    purposes: {},
    signals: [],
  }],
};

export const intelligencePlan = {
  model: "test-model",
  reasoning_effort: "low",
  overview: "Piano di test per la cantina.",
  immediate_action: "Rivedi Nebbiolo di Test.",
  risk_note: "Controlla i dati mancanti.",
  recommendations: [{ wine_id: wine.id, action: "decide", priority: "high", quantity: 4, reason: "La finestra è aperta.", recommended_purpose: "drink", confidence: "medium", data_quality_score: 68, missing_inputs: ["current_value", "purchase_price"] }],
  applied_recommendation_keys: [],
  input_fingerprint: "snapshot-old",
  stale: true,
  stale_reasons: ["cellar_data_changed"],
  generated_at: "2026-08-20T12:00:00Z",
  estimated_cost_usd: "0.001",
};

export const previousIntelligencePlan = {
  ...intelligencePlan,
  recommendations: [{ ...intelligencePlan.recommendations[0], action: "monitor", recommended_purpose: null, quantity: 2 }],
  stale: false,
  stale_reasons: [],
  generated_at: "2026-08-10T12:00:00Z",
};

export async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

export async function mockApi(
  page: Page,
  strategyAllocations: unknown[] = [],
  aiEnabled = false,
  cellarMemberships = memberships,
  fixtureWines = [wine],
  fixtureSession = session,
  fixturePendingCatalog: unknown[] = [],
  fixtureNotificationCenter: unknown = { items: [], counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 }, offset: 0, next_offset: null, has_more: false },
  fixtureTastingArchive = tastingArchive,
  heroScene: string | null = "vineyard",
) {
  await page.addInitScript(scene => {
    if (scene && !sessionStorage.getItem("vinaris.home-backdrop.v1")) sessionStorage.setItem("vinaris.home-backdrop.v1", scene);
  }, heroScene);
  await page.addInitScript(() => {
    window.localStorage.setItem("vinaris.cookie-consent", JSON.stringify({ marketing: false, updatedAt: "2026-01-01T00:00:00Z" }));
  });
  await page.addInitScript(({ fixtureWine, fixtureWines, fixtureSession, fixturePendingCatalog, fixtureNotificationCenter, fixtureStrategyAllocations, fixtureIntelligenceSnapshot, fixtureIntelligencePlan, fixturePreviousIntelligencePlan, fixtureAiEnabled, fixtureCellarMemberships, fixtureMerchants, fixtureTastingArchive, tasteProfileCollection }) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(requestUrl, window.location.origin);
      if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
      const path = url.pathname;
      let body: unknown = [];
      if (path.endsWith("/session")) body = { ...fixtureSession, ...JSON.parse(window.sessionStorage.getItem("vinaris-test-preferences") || "{}") };
      else if (path.endsWith("/auth/preferences")) {
        if (window.sessionStorage.getItem("vinaris-test-save-error")) return new Response(JSON.stringify({ detail: "Save unavailable" }), { status: 503 });
        const preferences = { ...JSON.parse(window.sessionStorage.getItem("vinaris-test-preferences") || "{}"), ...JSON.parse(String(init?.body || "{}")) };
        window.sessionStorage.setItem("vinaris-test-preferences", JSON.stringify(preferences));
        body = { ...fixtureSession, ...preferences };
      }
      else if (path.endsWith("/intelligence/cellar")) body = fixtureIntelligenceSnapshot;
      else if (path.endsWith("/ai/cellar-intelligence/latest")) body = fixtureIntelligencePlan;
      else if (path.endsWith("/ai/cellar-intelligence/history")) body = [fixtureIntelligencePlan, fixturePreviousIntelligencePlan];
      else if (path.endsWith("/intelligence/allocations/bulk/reassign")) body = { changed_wines: 1, assigned_bottles: 4, purpose: "drink" };
      else if (path.includes("/intelligence/wines/")) body = fixtureStrategyAllocations;
      else if (path.includes("/storage/allocations")) body = [];
      else if (path.endsWith("/merchants")) body = fixtureMerchants;
      else if (path.includes("/share-offer") || path.includes("/co-ownership-agreements") || path.includes("/recipients")) body = [];
      else if (path.endsWith("/taste-profile/wines/matches")) {
        const wineIds = JSON.parse(String(init?.body || "{}"))?.wine_ids || [];
        const batches = JSON.parse(window.sessionStorage.getItem("vinaris-test-taste-batches") || "[]");
        window.sessionStorage.setItem("vinaris-test-taste-batches", JSON.stringify([...batches, wineIds]));
        body = { matches: Object.fromEntries(wineIds.map((wineId: string) => [wineId, { score: 0.86, confidence: 0.3, matching_traits: ["body", "tannin"], conflicting_traits: [] }])) };
      }
      else if (path.endsWith("/sensory")) body = JSON.parse(window.sessionStorage.getItem("vinaris-test-sensory") || "null");
      else if (path.includes("/taste-profile/wines/")) body = { score: 0.86, confidence: 0.3, matching_traits: ["body", "tannin"], conflicting_traits: [] };
      else if (path.includes("/wines/tasting-archive")) body = fixtureTastingArchive;
      else if (path.endsWith("/wines/catalog/pending")) body = fixturePendingCatalog;
      else if (path.endsWith("/wines")) body = fixtureWines;
      else if (path.includes("/wines/wine-e2e-1")) body = fixtureWine;
      else if (path.includes("/wine-pulse")) body = { items: [], total: 0, offset: 0, limit: 3, has_more: false };
      else if (path.includes("value-history/portfolio") || path.includes("wishlist/lists") || path.includes("operational-action-snoozes")) body = [];
      else if (path.includes("regional-gap-settings")) body = { targets: [], last_ai_suggestion: null };
      else if (path.includes("taste-profile/me")) body = tasteProfileCollection;
      else if (path.includes("notifications")) body = fixtureNotificationCenter;
      else if (path.endsWith("/billing/redeem-codes")) body = [];
      else if (path.includes("billing")) body = { is_free_tier: false, has_active_entitlement: true, entitlement_valid_until: null, entitlement_days_remaining: null, ai_credit_balance_usd: "0" };
      else if (path.includes("household/memberships")) body = fixtureCellarMemberships;
      else if (path.includes("audit") || path.includes("tags") || path.includes("agreements") || path.includes("share-offers") || path.includes("share-offer") || path.includes("invites") || path.includes("recipients")) body = [];
      else if (path.includes("ai/settings")) body = { provider_mode: fixtureAiEnabled ? "auto" : "application", has_openai_api_key: false, can_use_app_credits: fixtureAiEnabled, ai_notes_model: "", drink_window_model: "", value_model: "", grape_model: "", score_model: "", wishlist_model: "", model_advisor_enabled: false, pairing_preferences: "", pairing_candidate_limit: 5 };
      else if (path.includes("public-config")) body = {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }, { fixtureWine: wine, fixtureWines, fixtureSession, fixturePendingCatalog, fixtureNotificationCenter, fixtureStrategyAllocations: strategyAllocations, fixtureIntelligenceSnapshot: intelligenceSnapshot, fixtureIntelligencePlan: intelligencePlan, fixturePreviousIntelligencePlan: previousIntelligencePlan, fixtureAiEnabled: aiEnabled, fixtureCellarMemberships: cellarMemberships, fixtureMerchants: merchants, fixtureTastingArchive, tasteProfileCollection });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname;
    if (path.endsWith("/session")) return fulfillJson(route, fixtureSession);
    if (path.endsWith("/intelligence/cellar")) return fulfillJson(route, intelligenceSnapshot);
    if (path.endsWith("/ai/cellar-intelligence/latest")) return fulfillJson(route, intelligencePlan);
    if (path.endsWith("/ai/cellar-intelligence/history")) return fulfillJson(route, [intelligencePlan, previousIntelligencePlan]);
    if (path.endsWith("/intelligence/preferences")) return fulfillJson(route, intelligenceSnapshot.preferences);
    if (path.endsWith("/intelligence/allocations/bulk/reassign")) return fulfillJson(route, { changed_wines: 1, assigned_bottles: 4, purpose: "drink" });
    if (path.endsWith("/intelligence/allocations/bulk")) return fulfillJson(route, { changed_wines: 1, assigned_bottles: 4, purpose: "maturation" });
    if (path.includes("/intelligence/wines/")) return fulfillJson(route, strategyAllocations);
    if (path.includes("/storage/allocations")) return fulfillJson(route, []);
    if (path.endsWith("/merchants")) return fulfillJson(route, merchants);
    if (path.endsWith("/taste-profile/wines/matches")) {
      const wineIds = route.request().postDataJSON()?.wine_ids || [];
      return fulfillJson(route, { matches: Object.fromEntries(wineIds.map((wineId: string) => [wineId, { score: 0.86, confidence: 0.3, matching_traits: ["body", "tannin"], conflicting_traits: [] }])) });
    }
    if (path.endsWith("/sensory")) return fulfillJson(route, null);
    if (path.includes("/taste-profile/wines/")) return fulfillJson(route, { score: 0.86, confidence: 0.3, matching_traits: ["body", "tannin"], conflicting_traits: [] });
    if (path.includes("/wines/tasting-archive")) return fulfillJson(route, fixtureTastingArchive);
    if (path.endsWith("/wines/catalog/pending")) return fulfillJson(route, fixturePendingCatalog);
    if (path.endsWith("/wines")) return fulfillJson(route, fixtureWines);
    if (path.includes("/wines/wine-e2e-1")) return fulfillJson(route, wine);
    if (path.includes("/wine-pulse")) return fulfillJson(route, { items: [], total: 0, offset: 0, limit: 3, has_more: false });
    if (path.includes("value-history/portfolio")) return fulfillJson(route, []);
    if (path.includes("wishlist/lists")) return fulfillJson(route, []);
    if (path.includes("notifications")) return fulfillJson(route, fixtureNotificationCenter);
    if (path.includes("regional-gap-settings")) return fulfillJson(route, { targets: [], last_ai_suggestion: null });
    if (path.includes("taste-profile/me")) return fulfillJson(route, tasteProfileCollection);
    if (path.includes("operational-action-snoozes")) return fulfillJson(route, []);
    if (path.endsWith("/billing/redeem-codes")) return fulfillJson(route, []);
    if (path.includes("billing")) return fulfillJson(route, { is_free_tier: false, has_active_entitlement: true, entitlement_valid_until: null, entitlement_days_remaining: null, ai_credit_balance_usd: "0" });
    if (path.includes("household/memberships")) return fulfillJson(route, cellarMemberships);
    if (path.includes("audit") || path.includes("tags") || path.includes("agreements") || path.includes("share-offers") || path.includes("share-offer") || path.includes("invites") || path.includes("recipients")) return fulfillJson(route, []);
    if (route.request().method() === "GET") return fulfillJson(route, []);
    return fulfillJson(route, route.request().method() === "PATCH" ? wine : {});
  });
  await page.route("https://{a,b,c}.tile.openstreetmap.org/**", (route) => route.fulfill({ status: 204, body: "" }));
}

export async function openWineDetail(page: Page, strategyAllocations: unknown[] = []) {
  await mockApi(page, strategyAllocations);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  const wineRow = page.locator('[data-wine-row-id="wine-e2e-1"] article');
  await expect(wineRow).toBeVisible();
  await expect(wineRow.getByLabel("Affinità personale: 5 su 6")).toBeVisible();
  await wineRow.click();
  await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
}

export async function openRecordTasting(page: Page) {
  await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Registra bevuta", exact: true }).click();
}
