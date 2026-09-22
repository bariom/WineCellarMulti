import { expect, test, type Page, type Route } from "@playwright/test";
import { featuredValue } from "../src/domain/featuredValue";

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

const memberships = [{ membership_id: "membership-e2e", household_id: "household-e2e", household_name: "Cantina E2E", role: "owner", operating_mode: "private" }];
const merchants = [
  { id: "merchant-e2e-1", name: "Enoteca Test" },
  { id: "merchant-e2e-2", name: "Vini della Riserva" },
];

const tastingArchive = {
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

const tasteProfileCollection = {
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

const multiCellarMemberships = [
  ...memberships,
  { membership_id: "membership-e2e-2", household_id: "household-e2e-2", household_name: "Riserva E2E", role: "owner", operating_mode: "private" },
];

const intelligenceSnapshot = {
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

const intelligencePlan = {
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

const previousIntelligencePlan = {
  ...intelligencePlan,
  recommendations: [{ ...intelligencePlan.recommendations[0], action: "monitor", recommended_purpose: null, quantity: 2 }],
  stale: false,
  stale_reasons: [],
  generated_at: "2026-08-10T12:00:00Z",
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockApi(
  page: Page,
  strategyAllocations: unknown[] = [],
  aiEnabled = false,
  cellarMemberships = memberships,
  fixtureWines = [wine],
  fixtureSession = session,
  fixturePendingCatalog: unknown[] = [],
  fixtureNotificationCenter: unknown = { items: [], counts: { total: 0, unread: 0, actionable: 0, attention: 0, actions: 0, updates: 0, system: 0 }, offset: 0, next_offset: null, has_more: false },
) {
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
      if (path.endsWith("/session")) body = fixtureSession;
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
  }, { fixtureWine: wine, fixtureWines, fixtureSession, fixturePendingCatalog, fixtureNotificationCenter, fixtureStrategyAllocations: strategyAllocations, fixtureIntelligenceSnapshot: intelligenceSnapshot, fixtureIntelligencePlan: intelligencePlan, fixturePreviousIntelligencePlan: previousIntelligencePlan, fixtureAiEnabled: aiEnabled, fixtureCellarMemberships: cellarMemberships, fixtureMerchants: merchants, fixtureTastingArchive: tastingArchive, tasteProfileCollection });
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
    if (path.includes("/taste-profile/wines/")) return fulfillJson(route, { score: 0.86, confidence: 0.3, matching_traits: ["body", "tannin"], conflicting_traits: [] });
    if (path.includes("/wines/tasting-archive")) return fulfillJson(route, tastingArchive);
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

async function openWineDetail(page: Page, strategyAllocations: unknown[] = []) {
  await mockApi(page, strategyAllocations);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  const wineRow = page.locator('[data-wine-row-id="wine-e2e-1"] article');
  await expect(wineRow).toBeVisible();
  await expect(wineRow.getByLabel("Affinità personale: 5 su 6")).toBeVisible();
  await wineRow.click();
  await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
}

async function openRecordTasting(page: Page) {
  await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Registra bevuta", exact: true }).click();
}

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
  test(`tasting navigation belongs in the menu at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page, [], false, memberships, [wine], { ...session, theme_preference: viewport.width === 360 || viewport.width === 430 ? "private-cellar" : "light" });
    await page.goto("/");
    await expect(page.locator(".record-tasting-entry")).toHaveCount(0);
    const mobile = viewport.width < 900;
    if (mobile) {
      await expect(page.getByRole("button", { name: "Registra bevuta", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Menu", exact: true }).click();
    }
    const navigation = mobile ? page.getByRole("dialog", { name: "Menu di navigazione" }) : page.locator(".view-tabs-navigation");
    const action = navigation.getByRole("button", { name: "Registra bevuta", exact: true });
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("aria-haspopup", "dialog");
    const [history, tasting] = await Promise.all([
      navigation.getByRole("button", { name: "Storico", exact: true }).boundingBox(),
      action.boundingBox(),
    ]);
    expect(history!.y + history!.height).toBeLessThanOrEqual(tasting!.y);
    expect(tasting!.height).toBeGreaterThanOrEqual(44);
    expect(tasting!.x).toBeGreaterThanOrEqual(0);
    expect(tasting!.x + tasting!.width).toBeLessThanOrEqual(viewport.width);
    expect(tasting!.y + tasting!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/tasting-menu-${viewport.width}.png` });
    await action.click();
    if (mobile) await expect(navigation).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Registra bevuta" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: mobile ? "Menu" : "Registra bevuta", exact: true })).toBeFocused();
  });
}

test("record tasting saves an external wine and preserves failures for retry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  await openRecordTasting(page);
  const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
  await dialog.getByRole("button", { name: /Un altro vino/ }).click();
  await dialog.getByLabel("Nome del vino", { exact: true }).fill("Vino da amici");
  await dialog.getByLabel("Produttore", { exact: true }).fill("Cantina Test");
  await dialog.getByLabel("Un ricordo di questo vino").fill("Cena insieme");
  await expect(dialog.locator("details")).not.toHaveAttribute("open", "");
  await page.evaluate(() => {
    const original = window.fetch;
    let attempts = 0;
    (window as any).tastingWrites = [];
    window.fetch = async (input, init) => {
      if (init?.method === "POST") {
        (window as any).tastingWrites.push({ url: String(input), payload: JSON.parse(String(init.body)) });
        if (String(input).endsWith("/wishlist/tastings")) {
          attempts++;
          return new Response(JSON.stringify(attempts === 1 ? { detail: "Salvataggio non disponibile" } : { id: "tasting-new" }), { status: attempts === 1 ? 503 : 201, headers: { "Content-Type": "application/json" } });
        }
      }
      return original(input, init);
    };
  });
  await dialog.getByRole("button", { name: "Salva bevuta" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Nome del vino", { exact: true })).toHaveValue("Vino da amici");
  await dialog.getByRole("button", { name: "Salva bevuta" }).click();
  await expect(dialog.getByText("Bevuta salvata nello Storico", { exact: true })).toBeVisible();
  const writes = await page.evaluate(() => (window as any).tastingWrites);
  expect(writes).toHaveLength(2);
  expect(writes.every((write: any) => write.url.endsWith("/wishlist/tastings"))).toBe(true);
  expect(writes[1].payload).toMatchObject({ name: "Vino da amici", producer: "Cantina Test", note: "Cena insieme", tasting_rating: 0 });
  await dialog.getByRole("button", { name: "Aggiungi alla wishlist" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('input[value="Vino da amici"]')).toBeVisible();
});

test("record tasting cellar flow consumes the chosen bottle", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await openRecordTasting(page);
  const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
  await dialog.getByRole("button", { name: /Dalla mia cantina/ }).click();
  await dialog.getByRole("button", { name: /Nebbiolo di Test/ }).click();
  await expect(dialog.getByText("Verrà scalata una bottiglia dalla cantina.")).toBeVisible();
  await page.evaluate(fixture => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (init?.method === "POST" && String(input).endsWith("/consume")) {
        (window as any).consumedUrl = String(input);
        return new Response(JSON.stringify({ ...fixture, quantity: 3 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return original(input, init);
    };
  }, wine);
  await dialog.getByRole("button", { name: "Salva bevuta" }).click();
  await expect(dialog.getByText("Bevuta salvata nello Storico", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).consumedUrl)).toContain("/wines/wine-e2e-1/consume");
  await expect(dialog.getByRole("button", { name: "Aggiungi alla wishlist" })).toHaveCount(0);
});

test("record tasting reuses wishlist search and confirms photo suggestions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [wine], { ...session, can_use_label_recognition: true });
  await page.goto("/");
  await openRecordTasting(page);
  await page.evaluate(() => {
    const original = window.fetch;
    let scans = 0;
    const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/wishlist/lists")) return json([{ id: "assaggi", name: "Assaggi" }]);
      if (url.includes("/wishlist?")) return json([{ id: "known-wine", wishlist_list_id: "assaggi", name: "Barolo noto", producer: "Produttore", vintage: "2020", format: "", type: "Red", region: "Piemonte", appellation: "Barolo" }]);
      if (url.includes("/catalog?")) return json([]);
      if (url.endsWith("/recognize-bottle")) {
        scans++;
        return json({ recognition_id: "scan", status: scans === 1 ? "not_recognized" : "ambiguous", wine_name: "Barolo foto", producer: "Produttore foto", vintage: "2021", estate: "", cuvee: "", appellation: "Barolo", region: "Piemonte", wine_type: "Red", country: "Italia", alternative_candidates: [], estimated_cost_usd: "0.001", label_text: [], matches: [], needs_user_confirmation: true, recognition_notes: [], provider: "luna" });
      }
      if (url.endsWith("/wishlist/tastings") && init?.method === "POST") { (window as any).photoTasting = JSON.parse(String(init.body)); return json({ id: "saved" }); }
      return original(input, init);
    };
  });
  const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
  await dialog.getByRole("button", { name: /Un altro vino/ }).click();
  await dialog.getByLabel("Cerca un vino").fill("Barolo");
  await dialog.getByRole("button", { name: /Barolo noto/ }).click();
  await expect(dialog.getByLabel("Nome del vino", { exact: true })).toHaveValue("Barolo noto");
  const file = { name: "label.png", mimeType: "image/png", buffer: Buffer.from("test photo") };
  await dialog.getByLabel("Foto etichetta", { exact: true }).setInputFiles(file);
  await expect(dialog.getByRole("alert")).toContainText("Etichetta non riconosciuta");
  await expect(dialog.getByLabel("Nome del vino", { exact: true })).toHaveValue("Barolo noto");
  await dialog.getByLabel("Foto etichetta", { exact: true }).setInputFiles(file);
  await expect(dialog.getByLabel("Nome del vino", { exact: true })).toHaveValue("Barolo foto");
  await expect(dialog.getByText("Controlla e conferma i dati qui sotto.")).toBeVisible();
  await page.screenshot({ path: "test-results/record-tasting-photo.png" });
  await dialog.getByLabel("Nome del vino", { exact: true }).fill("Barolo confermato");
  await dialog.getByRole("button", { name: "Salva bevuta" }).click();
  await expect(dialog.getByText("Bevuta salvata nello Storico", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).photoTasting)).toMatchObject({ name: "Barolo confermato", vintage: "2021" });
  expect(await page.evaluate(() => (window as any).photoTasting.wishlist_item_id)).toBeUndefined();
});

test("record tasting is available from History with origin filters", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Storico/ }).first().click();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).includes("/tasting-archive?")) (window as any).archiveUrl = String(input);
      return original(input, init);
    };
  });
  await page.getByLabel("Provenienza della bevuta").selectOption("external");
  await expect.poll(() => page.evaluate(() => (window as any).archiveUrl)).toContain("origin=external");
  await openRecordTasting(page);
  await expect(page.getByRole("dialog", { name: "Registra bevuta" })).toBeVisible();
});

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 900 }]) {
  test(`record tasting responsive layout ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page);
    await page.goto("/");
    await openRecordTasting(page);
    const dialog = page.getByRole("dialog", { name: "Registra bevuta" });
    const cellar = await dialog.getByRole("button", { name: /Dalla mia cantina/ }).boundingBox();
    const external = await dialog.getByRole("button", { name: /Un altro vino/ }).boundingBox();
    expect(cellar!.y + cellar!.height).toBeLessThanOrEqual(external!.y);
    if (viewport.width === 390) {
      await page.mouse.move(0, 0);
      await page.screenshot({ path: "test-results/record-tasting-choice.png" });
      await expect(dialog).toHaveScreenshot("record-tasting-choice-mobile.png");
    }
    await dialog.getByRole("button", { name: /Un altro vino/ }).click();
    await dialog.getByLabel("Nome del vino", { exact: true }).fill("Barolo Riserva");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const input of await dialog.locator('input:not([hidden]), select, textarea').all()) {
      const box = await input.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    if (viewport.width === 390) await page.screenshot({ path: "test-results/record-tasting-form.png" });
    await dialog.getByRole("button", { name: "Salva bevuta" }).scrollIntoViewIfNeeded();
    const save = await dialog.getByRole("button", { name: "Salva bevuta" }).boundingBox();
    expect(save!.y + save!.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width === 390) await page.screenshot({ path: "test-results/record-tasting-form-bottom.png" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: viewport.width < 900 ? "Menu" : "Registra bevuta", exact: true })).toBeFocused();
  });
}

test("shows contextual KPIs for every dashboard insight", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");

  const hero = page.locator(".hero-panel");
  const insightSwitcher = page.locator(".dashboard-analysis-switcher");
  const insights = [
    { focus: "Valore", labels: ["Valore totale", "Rendimento vs acquisto", "Valore medio bottiglia"] },
    { focus: "Finestra degustazione", labels: ["Pronti da bere", "In attesa della finestra ideale", "Finestra scaduta"] },
    { focus: "Timeline", labels: ["Consegne future", "Prossimi 30 giorni", "Prossima consegna"] },
    { focus: "Qualità dati", labels: ["Completezza dati", "Dati incompleti", "Campi da completare"] },
  ];

  for (const insight of insights) {
    await insightSwitcher.locator("summary").click();
    await insightSwitcher.getByRole("tab", { name: insight.focus, exact: true }).click();
    await expect(hero.getByRole("heading", { name: insight.focus, exact: true })).toBeVisible();
    for (const label of insight.labels) await expect(hero.getByText(label, { exact: true })).toBeVisible();
    await expect(hero.getByText("Le mie bottiglie", { exact: true })).toHaveCount(0);
    const kpiCards = await hero.locator(".hero-kpi").all();
    const kpiBoxes = (await Promise.all(kpiCards.map((card) => card.boundingBox()))).filter((box) => box !== null);
    expect(kpiBoxes).toHaveLength(3);
    kpiBoxes.forEach((box, index) => {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(391);
      if (index > 0) expect(kpiBoxes[index - 1].y + kpiBoxes[index - 1].height).toBeLessThanOrEqual(box.y);
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await insightSwitcher.locator("summary").click();
  await insightSwitcher.getByRole("tab", { name: "Valore", exact: true }).click();
  const desktopCards = await hero.locator(".hero-kpi").all();
  const desktopBoxes = (await Promise.all(desktopCards.map((card) => card.boundingBox()))).filter((box) => box !== null);
  expect(desktopBoxes).toHaveLength(3);
  desktopBoxes.forEach((box, index) => {
    expect(box.x + box.width).toBeLessThanOrEqual(1441);
    if (index > 0) expect(desktopBoxes[index - 1].x + desktopBoxes[index - 1].width).toBeLessThanOrEqual(box.x);
  });
});

for (const withCellarReminders of [false, true]) {
  test(`app admin sees pending catalog wines ${withCellarReminders ? "alongside cellar reminders" : "without cellar reminders"}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
    const pendingCatalogEntry = {
      id: "catalog-pending-e2e",
      name: "Nuovo Vino Test",
      producer: "Tenuta E2E",
      region: "Ticino",
      appellation: "Ticino DOC",
      type: "Red",
      format: "Bottle (750ml)",
      country: "Svizzera",
      grapes_text: "Merlot",
      source: "confirmed_recognition",
      is_active: false,
    };
    await mockApi(
      page,
      [],
      false,
      memberships,
      withCellarReminders ? [wine] : [],
      { ...session, is_app_admin: true },
      [pendingCatalogEntry],
    );

    await page.goto("/");

    const notifications = page.getByRole("button", { name: "Notifiche", exact: true });
    // The badge includes live cellar reminders as well as catalog approvals.
    await expect(notifications.locator("strong")).toHaveText(withCellarReminders ? "4" : "1");
    await notifications.click();
    const reminders = page.getByRole("region", { name: "Promemoria operativi" });
    await expect(reminders.getByRole("button", { name: /1 Vini in catalogo da approvare/ })).toBeVisible();
    await expect(reminders.getByRole("button", { name: "Rimanda di 14 giorni" })).toHaveCount(withCellarReminders ? 3 : 0);
    if (withCellarReminders) {
      await expect(reminders.getByRole("button", { name: /Da bere ora/ })).toBeVisible();
      await expect(reminders.getByRole("button", { name: /Valori da aggiornare/ })).toBeVisible();
      await expect(reminders.getByRole("button", { name: /Punteggi mancanti/ })).toBeVisible();
    }
  });
}

test("a wine marked To Collect immediately appears in notifications", async ({ page }) => {
  await mockApi(page, [], false, memberships, [{ ...wine, status: "To Collect" }]);
  await page.goto("/");

  const notifications = page.getByRole("button", { name: "Notifiche", exact: true });
  await expect(notifications.locator("strong")).toBeVisible();
});

test("separates archivable notifications from operational reminders", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const notificationCenter = {
    items: [{
      id: "notification-e2e-1",
      source: "notification",
      kind: "value_updated",
      category: "update",
      state: "unread",
      title: "Valore aggiornato",
      message: "La stima di mercato è stata aggiornata.",
      action_url: null,
      action_kind: "open",
      resource_id: null,
      actor_label: null,
      metadata: {},
      created_at: "2026-09-12T10:00:00Z",
      read_at: null,
      archived_at: null,
    }],
    counts: { total: 1, unread: 1, actionable: 0, attention: 1, actions: 0, updates: 1, system: 0 },
    offset: 0,
    next_offset: null,
    has_more: false,
  };
  await mockApi(page, [], false, memberships, [{ ...wine, status: "To Collect" }], session, [], notificationCenter);
  await page.goto("/");

  await page.getByRole("button", { name: "Notifiche", exact: true }).click();
  await expect(page.getByLabel(/elementi da controllare/)).toBeVisible();

  const notificationSection = page.getByRole("region", { name: "Notifiche" });
  await expect(notificationSection.getByText("Messaggi ed eventi: puoi segnarli come letti o archiviarli.")).toBeVisible();
  await expect(notificationSection.getByRole("button", { name: "Segna letta" })).toBeVisible();
  await expect(notificationSection.getByRole("button", { name: "Archivia" })).toBeVisible();

  const reminderSection = page.getByRole("region", { name: "Promemoria operativi" });
  await expect(reminderSection.getByText(/Derivano dallo stato della cantina/)).toBeVisible();
  await expect(reminderSection.getByText("Non è una notifica da archiviare").first()).toBeVisible();
  await expect(reminderSection.getByRole("button", { name: "Rimanda di 14 giorni" }).first()).toBeVisible();
  await expect(reminderSection.getByRole("button", { name: "Archivia" })).toHaveCount(0);

  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    const [notificationBox, reminderBox] = await Promise.all([notificationSection.boundingBox(), reminderSection.boundingBox()]);
    expect(notificationBox).not.toBeNull();
    expect(reminderBox).not.toBeNull();
    expect(notificationBox!.y + notificationBox!.height).toBeLessThanOrEqual(reminderBox!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("opens the buying sommelier from desktop and mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.goto("/");

  const primaryNavigation = [
    page.getByRole("button", { name: "Home", exact: true }),
    page.getByRole("button", { name: /^Cantina/ }).first(),
    page.getByRole("button", { name: /^Wishlist/ }).first(),
    page.getByRole("button", { name: "Storico", exact: true }),
    page.locator(".view-tabs-ai-group > summary"),
  ];
  const primaryNavigationBoxes = await Promise.all(primaryNavigation.map((item) => item.boundingBox()));
  primaryNavigationBoxes.forEach((box, index) => {
    expect(box).not.toBeNull();
    if (index > 0) expect(box!.y).toBeGreaterThan(primaryNavigationBoxes[index - 1]!.y);
  });

  await page.locator(".view-tabs-ai-group > summary").click();
  await page.getByRole("button", { name: "Sommelier acquisti", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sommelier acquisti", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.locator(".mobile-navigation-ai-group > summary").click();
  await page.getByRole("button", { name: "Sommelier acquisti", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sommelier acquisti", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("groups untracked wine regions under Other origins in the regional radar", async ({ page }) => {
  const maipoWine = {
    ...wine,
    id: "wine-e2e-maipo",
    name: "Mussonet Gran Reserva",
    producer: "Haras de Pirque",
    vintage: "2023",
    region: "Maipo Valley",
    appellation: "Valle del Maipo",
    current_value: "22.00",
    price: "22.00",
    quantity: 2,
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], false, memberships, [wine, maipoWine]);
  await page.goto("/");

  const radar = page.locator(".regional-gap-card");
  await expect(radar.getByText("Altre origini", { exact: true })).toBeVisible();
  await expect(radar.getByText(/Le regioni fuori dagli assi tracciati/)).toBeVisible();
});

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

test.describe("Wine Detail compact/mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("renders functional hierarchy without horizontal overflow", async ({ page }) => {
    await openWineDetail(page);
    const detail = page.locator(".wine-detail:visible").first();
    await expect(detail.getByRole("heading", { name: "Nebbiolo di Test" })).toBeVisible();
    await expect(detail.getByText("Nota di gusto", { exact: true })).toBeVisible();
    await expect(detail.getByText("86% in sintonia con i tuoi gusti", { exact: true })).toBeVisible();
    await expect(detail.getByLabel("Affinità personale: 5 su 6")).toBeVisible();
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

  test("opens a wine detail from tasting history on mobile", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Storico", exact: true }).click();
    await page.getByText("Nebbiolo di Test", { exact: true }).first().click();
    await page.getByRole("button", { name: "Apri vino", exact: true }).click();

    const detailDialog = page.getByRole("dialog", { name: "Nebbiolo di Test" });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.locator(".wine-detail").getByRole("heading", { name: "Nebbiolo di Test" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("renders My Taste without compact overflow", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator(".dashboard-analysis-switcher > summary").click();
    await page.getByRole("tab", { name: "Il mio gusto", exact: true }).click();
    await expect(page.locator(".taste-profile-panel").getByRole("heading", { name: "Il mio gusto", exact: true })).toBeVisible();
    await expect(page.getByText("Regioni preferite", { exact: true })).toBeVisible();
    await expect(page.locator(".taste-profile-panel").getByText("vini distinti", { exact: false })).toBeVisible();
    await page.getByText("Come Vinaris ha costruito questo profilo", { exact: true }).click();
    await expect(page.getByText(/Vinaris usa solo le degustazioni che hai registrato tu/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("keeps the desktop detail smoke path available", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWineDetail(page);
    await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nebbiolo di Test", exact: true }).first()).toBeVisible();
    const expandDetail = page.getByRole("button", { name: "Espandi dettaglio vino", exact: true }).first();
    await expect(expandDetail).toBeVisible();
    await expandDetail.click();
    await expect(page.locator(".wine-detail-modal")).toBeVisible();
  });

  test("includes cellar purpose in data quality", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await page.locator(".dashboard-analysis-switcher > summary").click();
    await page.getByRole("tab", { name: "Qualità dati", exact: true }).click();

    const qualityCard = page.getByRole("heading", { name: "Obiettivo cantina", exact: true }).locator("..").locator("..").locator("..");
    await expect(qualityCard.getByText("Obiettivo cantina mancante", { exact: true })).toBeVisible();
    await expect(qualityCard.getByRole("button", { name: "Assegna", exact: true })).toBeVisible();
  });

  test("explains Intelligence modes in a responsive help dialog", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Piano cantina", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Come usare Intelligence", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Come usare Intelligence" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Equilibrata", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Cosa bere", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Maturazione", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Investimento", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("makes the first AI plan value clear on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.addInitScript(() => {
      const currentFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        if (url.pathname === "/api/v1/ai/cellar-intelligence/latest") {
          return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.pathname === "/api/v1/ai/cellar-intelligence/history") {
          return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return currentFetch(input, init);
      };
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();
    await page.setViewportSize({ width: 390, height: 844 });

    await expect(page.getByRole("heading", { name: "Trasforma i segnali della cantina in un ordine d’azione" })).toBeVisible();
    await expect(page.getByText("bottiglie ancora da decidere", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("shows Intelligence confidence, history, simulation, goals and group actions", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();

    await expect(page.getByText("Il piano riflette dati precedenti", { exact: true })).toBeVisible();
    await expect(page.getByText("Affidabilità 68%", { exact: true })).toBeVisible();
    await expect(page.getByText("DAL PIANO PRECEDENTE", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Simula", exact: true }).click();
    const simulation = page.getByRole("dialog", { name: /Nebbiolo di Test/ });
    await expect(simulation.getByText("BERE ORA", { exact: true })).toBeVisible();
    await expect(simulation.getByText("ATTENDERE", { exact: true })).toBeVisible();
    await expect(simulation.getByText("PROPOSTA INTELLIGENCE", { exact: true })).toBeVisible();
    await expect(simulation.getByText(/Perdita potenziale prudenziale/)).toBeVisible();
    await simulation.getByRole("button", { name: "Chiudi simulazione", exact: true }).click();

    await page.getByText("Imposta la strategia della cantina", { exact: true }).click();
    await expect(page.getByText("Bottiglie da bere all’anno", { exact: true })).toBeVisible();
    await page.getByText("Seleziona e gestisci più vini", { exact: true }).click();
    await expect(page.getByLabel("Filtra per produttore")).toBeVisible();
    await expect(page.getByLabel("Filtra per regione")).toBeVisible();
    await expect(page.getByLabel("Filtra per tipologia")).toBeVisible();
  });

  test("moves a selected group between cellar purposes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], true);
    await page.goto("/");
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();
    await page.getByText("Seleziona e gestisci più vini", { exact: true }).click();
    await page.getByRole("button", { name: "Seleziona visibili", exact: true }).click();
    const moveAction = page.locator(".intelligence-group-action-move");
    await moveAction.getByLabel("Nuovo obiettivo per le assegnate").selectOption("drink");
    await moveAction.getByRole("button", { name: "Sposta assegnate", exact: true }).click();
    await expect(page.getByText("4 bottiglie di 1 vini spostate a Bere.", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("shows the AI animation while generating a cellar plan", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], true);
    await page.addInitScript((fixturePlan) => {
      const currentFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        if (url.pathname === "/api/v1/ai/cellar-intelligence" && init?.method === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return new Response(JSON.stringify(fixturePlan), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return currentFetch(input, init);
      };
    }, intelligencePlan);
    await page.goto("/");
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();

    await page.getByRole("button", { name: "Crea piano AI", exact: true }).click();
    const overlay = page.locator(".ai-generation-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay.getByText("Piano della cantina", { exact: true })).toBeVisible();
    await expect(overlay.getByText("Sto analizzando l'intera cantina: obiettivi delle bottiglie, finestre di beva, valori e qualità dei dati.", { exact: true })).toBeVisible();
    await expect(overlay).toBeHidden();
  });

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

  test("keeps the mobile layout free of horizontal overflow at supported widths", async ({ page }) => {
    for (const viewport of [{ width: 360, height: 800 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      await openWineDetail(page);
      await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });

  test("keeps iPad navigation coherent and within the viewport", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 834, height: 1210 });
    await mockApi(page, [], false, multiCellarMemberships);
    await page.goto("/");

    const cellarSwitch = page.getByLabel("Cambia cantina");
    const notifications = page.getByRole("button", { name: "Notifiche", exact: true });
    const accountMenu = page.getByRole("button", { name: "Apri menu account", exact: true });
    await expect(cellarSwitch).toBeVisible();
    await expect(notifications).toBeVisible();
    await expect(accountMenu).toBeVisible();
    await expect(page.locator(".view-tabs")).toBeHidden();
    await expect(page.locator(".desktop-topbar-search")).toBeHidden();
    const bottomNavigation = page.getByRole("navigation", { name: "Navigazione principale" });
    const addWine = bottomNavigation.getByRole("button", { name: "Aggiungi un vino", exact: true });
    await expect(bottomNavigation).toBeVisible();
    await expect(addWine).toBeVisible();
    const insights = page.locator(".dashboard-analysis-switcher");
    await insights.locator("summary").click();
    await expect(insights).toHaveAttribute("open", "");
    const insightOptions = insights.getByRole("tab");
    await expect(insightOptions.first()).toBeVisible();
    const [summaryBox, optionBox] = await Promise.all([
      insights.locator("summary").boundingBox(),
      insightOptions.first().boundingBox(),
    ]);
    expect(optionBox!.y).toBeGreaterThanOrEqual(summaryBox!.y + summaryBox!.height);
    await insights.getByRole("tab", { name: "Qualità dati", exact: true }).click();
    const dataGrid = page.locator(".data-dashboard-carousel .dashboard-grid");
    const firstDataCard = dataGrid.locator("> .dashboard-card").first();
    await expect(firstDataCard).toBeVisible();
    const dataCardBox = (await firstDataCard.boundingBox())!;
    expect(dataCardBox.width).toBeGreaterThan(620);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const [cellarBox, notificationsBox, accountBox] = await Promise.all([
      cellarSwitch.boundingBox(),
      notifications.boundingBox(),
      accountMenu.boundingBox(),
    ]);
    expect(cellarBox).not.toBeNull();
    expect(notificationsBox).not.toBeNull();
    expect(accountBox).not.toBeNull();
    expect(cellarBox!.width).toBeLessThanOrEqual(40);
    expect(Math.abs(cellarBox!.y - notificationsBox!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(notificationsBox!.y - accountBox!.y)).toBeLessThanOrEqual(2);
    expect(accountBox!.x + accountBox!.width).toBeLessThanOrEqual(834);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await bottomNavigation.getByRole("button", { name: "Cantina", exact: true }).click();
    const tabletWineRow = page.locator('[data-wine-row-id="wine-e2e-1"] article');
    await expect(tabletWineRow).toBeVisible();
    await tabletWineRow.click();
    const tabletWineDetail = page.getByRole("dialog", { name: "Nebbiolo di Test" });
    await expect(tabletWineDetail).toBeVisible();
    await expect(tabletWineDetail.getByRole("button", { name: "Chiudi", exact: true })).toBeVisible();
    await tabletWineDetail.getByRole("button", { name: "Chiudi", exact: true }).click();
    await expect(tabletWineDetail).toBeHidden();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Storico", exact: true }).click();
    const historyList = page.locator(".content-workspace .wine-list");
    await expect(historyList).toBeVisible();
    await expect(page.locator(".content-workspace .wine-side-panel")).toBeHidden();
    expect((await historyList.boundingBox())!.width).toBeGreaterThan(700);
    await page.screenshot({ path: testInfo.outputPath("tablet-topbar.png") });
  });

  test("presents the personal taste profile as a responsive editorial portrait", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockApi(page);
    await page.goto("/");
    const insights = page.locator(".dashboard-analysis-switcher");
    await insights.locator("summary").click();
    await insights.getByRole("tab", { name: "Il mio gusto", exact: true }).click();

    const profile = page.locator(".taste-profile-panel--insight");
    await expect(page.locator(".home-dashboard > .hero-panel")).toHaveCount(0);
    await expect(profile.getByRole("heading", { name: "Il mio gusto", exact: true })).toBeVisible();
    await expect(profile.getByText("Il tuo gusto cerca freschezza, intensità aromatica e frutto.", { exact: true })).toBeVisible();
    await expect(profile.getByRole("heading", { name: "Il carattere del tuo gusto" })).toBeVisible();
    await expect(profile.getByRole("heading", { name: "Le origini che cerchi" })).toBeVisible();
    await expect(profile.getByRole("heading", { name: "Come cambia il tuo gusto" })).toBeVisible();
    const redSignature = profile.locator(".taste-profile-category").filter({ hasText: /^Rossi/ });
    const whiteSignature = profile.locator(".taste-profile-category").filter({ hasText: /^Bianchi/ });
    await expect(redSignature).toHaveAttribute("open", "");
    await whiteSignature.locator("summary").click();
    await expect(whiteSignature).toHaveAttribute("open", "");
    await expect(redSignature).not.toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      await expect(profile).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const heroBox = await profile.locator(".taste-profile-premium-hero").boundingBox();
      expect(heroBox).not.toBeNull();
      expect(heroBox!.x).toBeGreaterThanOrEqual(0);
      expect(heroBox!.x + heroBox!.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  test("matches the compact visual baseline", async ({ page }) => {
    await openWineDetail(page);
    await expect(page).toHaveScreenshot("wine-detail-compact.png", { fullPage: true });
  });
});

test("collector overview has consistent counts, currency coverage and actionable priorities", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
  const stock = [
    wine,
    { ...wine, id: "old", name: "Riserva storica", quantity: 12, drink_from: 2015, drink_peak_from: 2017, drink_peak_to: 2019, drink_to: 2020 },
    { ...wine, id: "closing", name: "Finestra 2026", quantity: 3, drink_to: 2026, drink_peak_to: 2026, current_value: "", price: "20" },
    { ...wine, id: "collect", name: "Ritiro in enoteca", quantity: 6, status: "to_collect", current_value: "", price: "", drink_from: null, drink_to: null },
    { ...wine, id: "euro", name: "Collezione europea", quantity: 2, currency: "EUR", current_value: "50", price: "40", status: "ordered" },
    { ...wine, id: "empty", quantity: 0 },
  ];
  await mockApi(page, [], false, memberships, stock, { ...session, dashboard_focus: "collector" });
  await page.goto("/");
  const overview = page.getByRole("region", { name: "Panoramica collezionista" });
  await expect(overview).toContainText("27 bottiglie · 5 vini");
  const coverage = overview.locator("article").filter({ has: page.getByRole("heading", { name: "Copertura valutazioni", exact: true }) });
  await expect(coverage).toContainText("67%");
  await expect(overview.locator("article").filter({ has: page.getByRole("heading", { name: "Disponibilità", exact: true }) }).locator(".collector-number")).toContainText("19");
  const value = overview.locator("article").filter({ has: page.getByRole("heading", { name: "Valore della collezione", exact: true }) });
  await expect(value).toContainText("828");
  await expect(value).toContainText("100");
  await expect(value).toContainText("EUR");
  await expect(value).toContainText("CHF");
  await expect(value.locator(".collector-currency-and")).toHaveCount(1);
  await expect(value).toContainText("Valore delle posizioni, raggruppato per valuta");
  const currencyLabels = value.locator(".collector-currency-total strong small");
  const chfLabel = (await currencyLabels.nth(0).boundingBox())!;
  const eurLabel = (await currencyLabels.nth(1).boundingBox())!;
  expect(Math.abs(chfLabel.x - eurLabel.x)).toBeLessThan(1);
  const priorities = page.getByRole("region", { name: "Da seguire adesso" });
  await expect(priorities).toContainText("12 bottiglie · 1 vino");
  await expect(priorities).toContainText("3 bottiglie · 1 vino");
  await expect(priorities).toContainText("6 bottiglie · 1 vino");
  await priorities.locator("summary").filter({ hasText: "Vini da verificare" }).click();
  await expect(priorities.getByRole("button", { name: /Riserva storica/ })).toBeVisible();
  await expect(page.locator(".collector-explore")).not.toHaveAttribute("open", "");
  // A missing purchase date must not create a synthetic time series.
  await expect(page.locator(".key-position-card").getByText("Acquisto → valore attuale / bott.").first()).toBeVisible();
  await overview.getByText("Vedi disponibilità", { exact: true }).click();
  const available = overview.locator("summary").filter({ hasText: /^In cantina/ });
  await available.click();
  await overview.getByRole("button", { name: /Nebbiolo di Test/ }).first().click();
  await expect(page.locator(".wine-detail:visible").first()).toContainText(wine.name);
});

for (const width of [360, 390, 430, 1440]) {
  test(`collector responsive layout ${width}`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : width === 1440 ? 1000 : 844 });
    const galleryWines = Array.from({ length: 5 }, (_, index) => ({ ...wine, id: index ? `gallery-${index}` : wine.id, name: index ? `Riserva della collezione ${index}` : wine.name }));
    await mockApi(page, [], false, memberships, galleryWines, { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    if (width < 900) {
      const tabs = page.getByRole("tablist", { name: "Dashboard collezionista" });
      const mobile = page.locator(".collector-mobile-photos");
      await expect(tabs.getByRole("tab", { name: "Vini", exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(mobile.getByRole("heading", { name: "In primo piano" })).toBeVisible();
      await expect(page.locator(".collector-overview")).toBeHidden();
      await expect(page.locator(".collector-wine-stage")).toBeHidden();
      async function checkRails() {
        for (const rail of await mobile.getByRole("list").all()) {
          const before = (await rail.boundingBox())!;
          const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
          const cards = rail.getByRole("listitem");
          for (const card of await cards.all()) {
            const box = (await card.boundingBox())!;
            expect(box.height).toBe((await cards.first().boundingBox())!.height);
            const photo = (await card.locator(".key-position-bottle-visual").boundingBox())!;
            const title = (await card.locator("strong").boundingBox())!;
            expect(photo.height).toBeGreaterThanOrEqual(150);
            expect(photo.y + photo.height).toBeLessThanOrEqual(title.y);
            const image = (await card.locator("img").boundingBox())!;
            expect(image.y + image.height).toBeLessThanOrEqual(title.y);
            const caption = (await card.locator("small").boundingBox())!;
            expect(caption.y + caption.height).toBeLessThanOrEqual(box.y + box.height);
          }
          await rail.evaluate(element => element.scrollTo({ left: element.scrollWidth, behavior: "instant" }));
          await expect.poll(async () => (await rail.boundingBox())!.height).toBe(before.height);
          expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(pageHeight);
          await rail.evaluate(element => element.scrollTo({ left: 0, behavior: "instant" }));
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      }
      await checkRails();
      await page.screenshot({ path: testInfo.outputPath(`collector-${width}.png`), fullPage: true });
      await tabs.getByRole("tab", { name: "Priorità", exact: true }).click();
      await expect(mobile.getByRole("heading", { name: "Da bere ora" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Da seguire adesso" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Valore della collezione" })).toBeHidden();
      await checkRails();
      await page.screenshot({ path: testInfo.outputPath(`collector-priorities-${width}.png`), fullPage: true });
      await tabs.getByRole("tab", { name: "Collezione", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Valore della collezione" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Da seguire adesso" })).toBeHidden();
      await page.getByText("Composizione del valore", { exact: true }).click();
      await expect(page.getByText("Con valutazione corrente", { exact: false }).first()).toBeVisible();
      await page.getByText("Composizione del valore", { exact: true }).click();
      await page.locator(".collector-composition > summary").click();
      await expect(page.getByRole("heading", { name: "Finestre conosciute" })).toBeVisible();
      const tiles = await page.locator(".collector-tile:visible").all();
      let bottom = -Infinity;
      for (const tile of tiles) {
        const box = (await tile.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(bottom);
        bottom = box.y + box.height;
      }
      await page.locator(".collector-composition > summary").click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`collector-collection-${width}.png`), fullPage: true });
      await page.locator(".collector-explore > summary").click();
      await expect(page.locator(".collector-explore .geographic-map-card")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await tabs.getByRole("tab", { name: "Collezione", exact: true }).focus();
      await page.keyboard.press("Home");
      await expect(tabs.getByRole("tab", { name: "Vini", exact: true })).toBeFocused();
      await expect(tabs.getByRole("tab", { name: "Vini", exact: true })).toHaveAttribute("aria-selected", "true");
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width === 390) await expect(page).toHaveScreenshot("collector-compact.png", { fullPage: true });
      await mobile.getByRole("button", { name: /Nebbiolo di Test/ }).first().click();
      await expect(page.getByRole("dialog")).toContainText("Dati datati insufficienti");
      await page.getByRole("button", { name: "Apri scheda vino", exact: true }).click();
      await expect(page.locator(".wine-detail:visible").first()).toContainText(wine.name);
      return;
    }
    await expect(page.getByRole("heading", { name: "La cantina, a colpo d’occhio" })).toBeVisible();
    const stage = page.getByRole("region", { name: "I vini della tua collezione" });
    await expect(stage.locator(".key-position-card img").first()).toBeVisible();
    await expect(stage.locator(".priority-card img").first()).toBeVisible();
    await expect(stage.locator(".recent-wines-card img").first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`collector-opening-${width}.png`), fullPage: true });
    for (const selector of [".priority-card", ".recent-wines-card"]) {
      const photoBox = await stage.locator(`${selector} .key-position-bottle-visual`).first().boundingBox();
      expect(photoBox!.height).toBeGreaterThanOrEqual(140);
    }
    const arrivals = stage.locator(".recent-wines-card");
    const gallery = arrivals.getByRole("list");
    await expect(gallery.getByRole("listitem")).toHaveCount(5);
    const galleryItems = await gallery.getByRole("listitem").all();
    const firstGalleryBox = await galleryItems[0].boundingBox();
    for (const item of galleryItems) {
      const itemBox = (await item.boundingBox())!;
      expect(itemBox.y).toBe(firstGalleryBox!.y);
      const copyBox = (await item.locator(".dashboard-bottle-copy").boundingBox())!;
      expect(copyBox.y + copyBox.height).toBeLessThanOrEqual(itemBox.y + itemBox.height);
    }
    const arrivalsBox = await arrivals.boundingBox();
    expect(arrivalsBox!.height).toBeLessThan(440);
    if (width === 1440) {
      const readySelection = stage.getByRole("region", { name: "Selezione da bere ora" });
      await expect(readySelection.locator(".collector-ready-wine")).toHaveCount(2);
      const readyTiles = await readySelection.locator(".collector-ready-wine").all();
      const firstReady = (await readyTiles[0].boundingBox())!;
      const secondReady = (await readyTiles[1].boundingBox())!;
      expect(firstReady.x + firstReady.width).toBeLessThanOrEqual(secondReady.x);
      expect(firstReady.y).toBe(secondReady.y);
      await readySelection.getByRole("button", { name: "Vini successivi", exact: true }).click();
      await expect(readySelection.locator(".collector-ready-controls")).toContainText("3–4 / 5");
      await readySelection.getByRole("button", { name: "Vini successivi", exact: true }).click();
      await expect(readySelection.locator(".collector-ready-wine")).toHaveCount(1);
      expect((await readySelection.locator(".collector-ready-wine").boundingBox())!.height).toBeLessThan(200);
      await expect(readySelection.getByRole("button", { name: "Vini successivi", exact: true })).toBeDisabled();
      await readySelection.getByRole("button", { name: "Vini precedenti", exact: true }).click();
      await readySelection.getByRole("button", { name: "Vini precedenti", exact: true }).click();
      await expect(readySelection.locator(".collector-ready-controls")).toContainText("1–2 / 5");
      const featuredBox = (await stage.locator(".key-position-card").boundingBox())!;
      const readyBox = (await stage.locator(".priority-card").boundingBox())!;
      expect(Math.abs(featuredBox.y + featuredBox.height - readyBox.y - readyBox.height)).toBeLessThan(1);
      expect((await arrivals.boundingBox())!.y - featuredBox.y - featuredBox.height).toBeLessThanOrEqual(18);
    }
    const stageBox = await stage.boundingBox();
    const overviewBox = await page.locator(".collector-overview").boundingBox();
    expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(overviewBox!.y);
    const stageCards = await stage.locator(":scope > article").all();
    for (const card of width === 1440 ? stageCards : []) {
      const box = await card.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    const tiles = await page.locator(".collector-tile").all();
    const boxes = await Promise.all(tiles.map(tile => tile.boundingBox()));
    for (const [index, box] of width === 1440 ? boxes.entries() : []) {
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      for (const previous of boxes.slice(0, index)) {
        expect(box!.x >= previous!.x + previous!.width - .5 || previous!.x >= box!.x + box!.width - .5 || box!.y >= previous!.y + previous!.height - .5 || previous!.y >= box!.y + box!.height - .5).toBe(true);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const key = page.locator(".key-position-button").first();
    const photo = await key.locator(".key-position-bottle-visual").boundingBox();
    const title = await key.locator("h2").boundingBox();
    const metrics = await key.locator(".key-position-metrics").boundingBox();
    const bottleImage = (await key.locator("img").boundingBox())!;
    expect(bottleImage.y + bottleImage.height).toBeLessThanOrEqual(metrics!.y);
    expect(photo!.x + photo!.width).toBeLessThanOrEqual(title!.x);
    expect(title!.y + title!.height).toBeLessThanOrEqual(metrics!.y);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`collector-${width}.png`), fullPage: true });
    await page.locator(".collector-explore > summary").click();
    await expect(page.locator(".collector-explore .geographic-map-card")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`collector-expanded-${width}.png`), fullPage: true });
    if (width === 1440) {
      await stage.getByRole("region", { name: "Selezione da bere ora" }).getByRole("button", { name: /Nebbiolo di Test/ }).click();
      await expect(page.locator(".wine-detail:visible").first()).toContainText(wine.name);
    }
  });
}

for (const width of [1024, 1280, 1920]) {
  test(`collector editorial instrument ${width}`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
    await page.setViewportSize({ width, height: 900 });
    const featured = { ...wine, name: "Les Femelottes — Bourgogne Chardonnay", producer: "Domaine Chavy-Chouet", price: "20", current_value: "60", order_date: "2024-01-01", ai_value_estimated_at: "2026-09-01T12:00:00Z", value_history: [
      { id: "mid", value: "40", currency: "CHF", source: "manual", recorded_at: "2025-01-01T12:00:00Z" },
    ] };
    const waiting = { ...wine, id: "waiting", name: "Riserva da attendere", drink_from: 2027, drink_peak_from: 2027, drink_peak_to: 2030, drink_to: 2034 };
    await mockApi(page, [], false, memberships, [featured, waiting], { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    const hero = page.locator(".key-position-button").first();
    await expect(hero.getByRole("heading", { name: featured.name })).toBeVisible();
    await expect(hero.locator(".key-position-trend")).toContainText("200");
    await expect(hero.locator(".key-position-trend-line")).toHaveCSS("stroke-dasharray", "none");
    for (const selector of [".collector-wine-stage > .key-position-card", ".collector-wine-stage > .priority-card"]) {
      const card = (await page.locator(selector).boundingBox())!;
      expect(card.y + card.height).toBeLessThanOrEqual(width === 1024 ? 830 : 900);
    }
    await expect(hero.locator(".collector-maturity")).toContainText("2026–2028");
    const photo = (await hero.locator("img").boundingBox())!;
    const title = (await hero.getByRole("heading").boundingBox())!;
    const metrics = (await hero.locator(".key-position-metrics").boundingBox())!;
    expect(photo.x + photo.width).toBeLessThanOrEqual(title.x);
    expect(photo.y + photo.height).toBeLessThanOrEqual(metrics.y);
    expect(title.y + title.height).toBeLessThanOrEqual(metrics.y);
    const dates = await hero.locator(".collector-maturity-dates > span").all();
    for (const date of dates) {
      expect(await date.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator(".priority-next-list")).toContainText(waiting.name);
    await page.screenshot({ path: testInfo.outputPath(`editorial-${width}.png`), fullPage: true, animations: "disabled" });
    await page.locator(".priority-next-heading button").click();
    await expect(page.locator(`[data-wine-row-id="${waiting.id}"]`)).toBeVisible();
  });
}

for (const scenario of [{ dpr: 1, failed: false }, { dpr: 2, failed: false }, { dpr: 2, failed: true }]) {
  test.describe(`collector responsive photos ${scenario.dpr}x${scenario.failed ? " fallback" : ""}`, () => {
    test.use({ deviceScaleFactor: scenario.dpr });
    test("chooses the appropriate resolution", async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const photoWine = { ...wine, photo_thumbnail_url: "/test-photos/thumbnail.png", photo_detail_url: "/test-photos/detail.png" };
      await mockApi(page, [], false, memberships, [photoWine], { ...session, dashboard_focus: "collector" });
      const requested: string[] = [];
      await page.route("**/test-photos/*", route => {
        const detail = route.request().url().includes("detail");
        requested.push(detail ? "detail" : "thumbnail");
        if (detail && scenario.failed) return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${detail ? 480 : 160}" height="${detail ? 720 : 240}" viewBox="0 0 160 240"><rect x="66" y="15" width="28" height="40" rx="4" fill="#64503b"/><rect x="50" y="48" width="60" height="178" rx="16" fill="#38372a"/><rect x="54" y="112" width="52" height="64" fill="#efe9d6"/></svg>` });
      });
      await page.goto("/");
      const expected = scenario.dpr === 2 && !scenario.failed ? "detail.png" : "thumbnail.png";
      const hero = page.locator(".key-position-button img").first();
      await expect.poll(() => hero.evaluate((img: HTMLImageElement, suffix) => img.complete && img.naturalWidth > 0 && img.currentSrc.endsWith(suffix), expected)).toBe(true);
      const arrivals = page.locator(".recent-wines-card img").first();
      await arrivals.scrollIntoViewIfNeeded();
      await expect.poll(() => arrivals.evaluate((img: HTMLImageElement, suffix) => img.complete && img.naturalWidth > 0 && img.currentSrc.endsWith(suffix), expected)).toBe(true);
      await expect(arrivals).toHaveAttribute("loading", "lazy");
      await expect(arrivals).toHaveAttribute("decoding", "async");
      if (!scenario.failed) expect(requested.every(size => size === (scenario.dpr === 2 ? "detail" : "thumbnail"))).toBe(true);
      else expect(requested).toEqual(expect.arrayContaining(["detail", "thumbnail"]));
      await page.screenshot({ path: testInfo.outputPath("responsive-photos.png"), fullPage: true, animations: "disabled" });
    });
  });
}

for (const failed of [false, true]) {
  test(`collector loads featured history on first visit${failed ? " with unavailable detail" : ""}`, async ({ page }, testInfo) => {
    const detail = { ...wine, details_loaded: true, order_date: "2024-01-01", price: "20", current_value: "60", ai_value_estimated_at: "2026-09-01T00:00:00Z", value_history: [
      { id: "early", value: "70", currency: "CHF", source: "manual", recorded_at: "2025-01-01T00:00:00Z" },
      { id: "later", value: "40", currency: "CHF", source: "manual", recorded_at: "2026-01-01T00:00:00Z" },
    ] };
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], false, memberships, [{ ...detail, details_loaded: false, value_history: [] }], { ...session, dashboard_focus: "collector" });
    await page.addInitScript(({ detail, failed }) => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        if (new URL(url, location.origin).pathname === `/api/v1/wines/${detail.id}`) {
          sessionStorage.setItem("featured-detail-requests", String(Number(sessionStorage.getItem("featured-detail-requests") || 0) + 1));
          await new Promise(resolve => setTimeout(resolve, 500));
          sessionStorage.setItem("featured-detail-result", failed ? "failed" : "loaded");
          return new Response(JSON.stringify(failed ? { detail: "Unavailable" } : detail), { status: failed ? 503 : 200, headers: { "Content-Type": "application/json" } });
        }
        return original(input, init);
      };
    }, { detail, failed });
    await page.goto("/");
    const hero = page.locator(".key-position-button").first();
    await expect(hero).toContainText(detail.name);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("featured-detail-requests"))).toBe("1");
    if (failed) {
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem("featured-detail-result"))).toBe("failed");
      await expect(hero).toContainText("Acquisto → valore attuale");
      await expect(hero.locator(".key-position-trend-line")).toHaveCount(0);
    } else {
      const line = hero.locator(".key-position-trend-line");
      await expect(line).toHaveAttribute("d", /C/);
      const firstPath = await line.getAttribute("d");
      await page.screenshot({ path: testInfo.outputPath("first-visit-history.png"), animations: "disabled" });
      await page.getByRole("button", { name: /^Cantina/ }).first().click();
      await page.getByRole("button", { name: "Home", exact: true }).first().click();
      await expect(line).toHaveAttribute("d", firstPath!);
    }
  });
}

for (const width of [390, 1440]) {
  test(`collector missing photo stays discreet ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await mockApi(page, [], false, memberships, [{ ...wine, photo_thumbnail_url: "", photo_detail_url: "" }], { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    const glasses = page.locator(".home-dashboard-editorial .key-position-wine-illustration:visible");
    await expect(glasses.first()).toBeVisible();
    for (const glass of await glasses.all()) {
      const icon = (await glass.locator("svg").boundingBox())!;
      const container = (await glass.locator("..").boundingBox())!;
      expect(icon.width).toBeLessThanOrEqual(90);
      expect(icon.height).toBe(140);
      expect(icon.y).toBeGreaterThanOrEqual(container.y);
      expect(icon.y + icon.height).toBeLessThanOrEqual(container.y + container.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`fallback-${width}.png`), fullPage: true, animations: "disabled" });
  });
}

test("collector empty state has no misleading percentages", async ({ page }) => {
  await mockApi(page, [], false, memberships, [], { ...session, dashboard_focus: "collector", locale: "en" });
  await page.goto("/");
  const overview = page.getByRole("region", { name: "Collector overview" });
  await expect(overview).toContainText("0 bottles · 0 wines");
  await expect(overview).not.toContainText("NaN");
  await expect(overview).not.toContainText("100%");
  await expect(overview.getByText("—", { exact: true })).toHaveCount(4);
});
test("collector excludes incomplete windows and keeps dated history changes consistent", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00Z"));
  const item = { ...wine, drink_from: 2030, drink_to: 2025, producer: "", current_value: "48", value_history: [
    { id: "a", value: "40", currency: "CHF", source: "manual", recorded_at: "2025-01-01T12:00:00Z" },
    { id: "b", value: "48", currency: "CHF", source: "manual", recorded_at: "2026-01-01T12:00:00Z" },
  ] };
  await mockApi(page, [], false, memberships, [item], { ...session, dashboard_focus: "collector" });
  await page.goto("/");
  const known = page.locator(".collector-tile").filter({ has: page.getByRole("heading", { name: "Finestre conosciute", exact: true }) });
  await expect(known).toContainText("0%");
  await expect(known).toContainText("4 bottiglie · 1 vino");
  const priorities = page.getByRole("region", { name: "Da seguire adesso" });
  await expect(priorities).not.toContainText("4 bottiglie");
  await expect(page.locator(".key-position-trend")).toContainText("20");
  await expect(page.locator(".key-position-trend")).not.toContainText("14.3");
});

for (const width of [360, 390, 430]) {
  test(`collector highlight insight ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : 844 });
    const growth = { ...wine, price: "40", current_value: "60", order_date: "2024-01-01", ai_value_estimated_at: "2026-01-01T12:00:00Z",
      value_history: [{ id: "mid", value: "45", currency: "CHF", source: "manual", recorded_at: "2025-01-01T12:00:00Z" }] };
    const valuable = { ...wine, id: "valuable", name: "Riserva di grande valore della collezione", price: "200", current_value: "180" };
    await mockApi(page, [], false, memberships, [growth, valuable], { ...session, dashboard_focus: "collector" });
    await page.goto("/");
    const rail = page.getByRole("list", { name: "In primo piano", exact: true });
    const card = rail.getByRole("button", { name: /Nebbiolo di Test/ });
    await expect(card).toContainText("+50%");
    await card.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("CHF 40");
    await expect(dialog).toContainText("CHF 60");
    await expect(dialog.getByRole("img", { name: /Andamento del valore/ })).toBeVisible();
    const heading = (await dialog.getByRole("heading", { level: 2 }).boundingBox())!;
    const close = (await dialog.getByRole("button", { name: "Chiudi approfondimento" }).boundingBox())!;
    expect(heading.x + heading.width).toBeLessThanOrEqual(close.x);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const facts = await dialog.locator(".featured-wine-facts > div").all();
    for (const fact of facts) {
      const label = (await fact.locator("dt").boundingBox())!;
      const value = (await fact.locator("dd").first().boundingBox())!;
      expect(label.y + label.height).toBeLessThanOrEqual(value.y);
    }
    await page.screenshot({ path: testInfo.outputPath(`highlight-${width}.png`) });
    if (width === 390) await expect(dialog).toHaveScreenshot("collector-highlight-insight.png");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(card).toBeFocused();
    const valueCard = rail.getByRole("button", { name: /Riserva di grande valore/ });
    await valueCard.scrollIntoViewIfNeeded();
    const offset = await rail.evaluate(el => el.scrollLeft);
    await valueCard.click();
    await expect(dialog).toContainText("Valore della tua quota");
    await expect(dialog).toContainText("CHF 720");
    await expect(dialog.getByRole("img")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`highlight-value-${width}.png`) });
    await dialog.getByRole("button", { name: "Chiudi approfondimento" }).click();
    await expect(valueCard).toBeFocused();
    expect(await rail.evaluate(el => el.scrollLeft)).toBe(offset);
    await card.click();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Apri scheda vino" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Chiudi approfondimento" })).toBeFocused();
    await dialog.getByRole("button", { name: "Apri scheda vino" }).click();
    await expect(page.locator(".wine-detail:visible").first()).toContainText(wine.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("collector highlight comparison handles gifts, currencies, missing dates and invalid values", () => {
  const item = { ...wine, price: "0.01", current_value: "60", value_history: [
    { id: "later", value: "50", currency: "CHF", source: "manual", recorded_at: "2025-01-01" },
    { id: "foreign", value: "1", currency: "EUR", source: "manual", recorded_at: "2023-01-01" },
    { id: "first", value: "40", currency: "CHF", source: "manual", recorded_at: "2024-01-01" },
    { id: "invalid", value: "broken", currency: "CHF", source: "manual", recorded_at: "2022-01-01" },
  ] };
  const evidence = featuredValue(item as unknown as Parameters<typeof featuredValue>[0]);
  expect(evidence.baseline).toBe(40);
  expect(evidence.changePct).toBe(50);
  expect(evidence.fromPurchase).toBe(false);
  expect(evidence.points).toEqual([]);
  const dated = featuredValue({ ...item, ai_value_estimated_at: "2026-01-01" } as unknown as Parameters<typeof featuredValue>[0]);
  expect(dated.points.map(point => point.value)).toEqual([40, 50, 60]);
  expect(featuredValue({ ...item, price: "100" } as unknown as Parameters<typeof featuredValue>[0]).changePct).toBe(-40);
  expect(featuredValue({ ...item, current_value: null, value_history: [] } as unknown as Parameters<typeof featuredValue>[0]).changePct).toBeNull();
});

test("collector declining values have no growth label and insights support English", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], false, memberships, [{ ...wine, price: "100", current_value: "80" }], { ...session, dashboard_focus: "collector", locale: "en" });
  await page.goto("/");
  const card = page.getByRole("list", { name: "Highlights", exact: true }).getByRole("button");
  await expect(card).not.toContainText("Largest price increase");
  await expect(card).toContainText("Value of your share");
  await card.click();
  await expect(page.getByRole("dialog")).toContainText("Your share");
  await page.mouse.click(5, 5);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toBeFocused();
});
