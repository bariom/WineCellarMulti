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

async function mockApi(page: Page, strategyAllocations: unknown[] = [], aiEnabled = false) {
  await page.addInitScript(({ fixtureWine, fixtureSession, fixtureStrategyAllocations, fixtureIntelligenceSnapshot, fixtureIntelligencePlan, fixturePreviousIntelligencePlan, fixtureAiEnabled }) => {
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
      else if (path.includes("/intelligence/wines/")) body = fixtureStrategyAllocations;
      else if (path.includes("/storage/allocations")) body = [];
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
      else if (path.includes("ai/settings")) body = { provider_mode: fixtureAiEnabled ? "auto" : "application", has_openai_api_key: false, can_use_app_credits: fixtureAiEnabled, ai_notes_model: "", drink_window_model: "", value_model: "", grape_model: "", score_model: "", wishlist_model: "", model_advisor_enabled: false, pairing_preferences: "", pairing_candidate_limit: 5 };
      else if (path.includes("public-config")) body = {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }, { fixtureWine: wine, fixtureSession: session, fixtureStrategyAllocations: strategyAllocations, fixtureIntelligenceSnapshot: intelligenceSnapshot, fixtureIntelligencePlan: intelligencePlan, fixturePreviousIntelligencePlan: previousIntelligencePlan, fixtureAiEnabled: aiEnabled });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname;
    if (path.endsWith("/session")) return fulfillJson(route, session);
    if (path.endsWith("/intelligence/cellar")) return fulfillJson(route, intelligenceSnapshot);
    if (path.endsWith("/ai/cellar-intelligence/latest")) return fulfillJson(route, intelligencePlan);
    if (path.endsWith("/ai/cellar-intelligence/history")) return fulfillJson(route, [intelligencePlan, previousIntelligencePlan]);
    if (path.endsWith("/intelligence/preferences")) return fulfillJson(route, intelligenceSnapshot.preferences);
    if (path.endsWith("/intelligence/allocations/bulk")) return fulfillJson(route, { changed_wines: 1, assigned_bottles: 4, purpose: "maturation" });
    if (path.includes("/intelligence/wines/")) return fulfillJson(route, strategyAllocations);
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

async function openWineDetail(page: Page, strategyAllocations: unknown[] = []) {
  await mockApi(page, strategyAllocations);
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

  test("shows the AI animation while generating a cellar plan", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], true);
    await page.addInitScript((fixturePlan) => {
      const currentFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        if (url.pathname === "/api/v1/ai/cellar-intelligence" && init?.method === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 300));
          return new Response(JSON.stringify(fixturePlan), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return currentFetch(input, init);
      };
    }, intelligencePlan);
    await page.goto("/");
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();

    await page.getByRole("button", { name: "Analizza la cantina con AI", exact: true }).click();
    const overlay = page.locator(".ai-generation-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay.getByText("Piano della cantina", { exact: true })).toBeVisible();
    await expect(overlay.getByText("Sto analizzando l'intera cantina: obiettivi delle bottiglie, finestre di beva, valori e qualità dei dati.", { exact: true })).toBeVisible();
    await expect(overlay).toBeHidden();
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
    const strategyCounter = strategyToggle.getByText("1 / 4", { exact: true });
    const auditToggle = editor.getByRole("button", { name: /Audit AI/ });
    const auditCounter = auditToggle.getByText("0", { exact: true });
    await expect(strategyCounter).toBeVisible();
    await expect(auditCounter).toBeVisible();
    for (const [toggle, counter] of [[strategyToggle, strategyCounter], [auditToggle, auditCounter]]) {
      const toggleBox = (await toggle.boundingBox())!;
      const counterBox = (await counter.boundingBox())!;
      expect(counterBox.x).toBeGreaterThan(toggleBox.x + toggleBox.width * 0.7);
    }

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

  test("matches the compact visual baseline", async ({ page }) => {
    await openWineDetail(page);
    await expect(page).toHaveScreenshot("wine-detail-compact.png", { fullPage: true });
  });
});
