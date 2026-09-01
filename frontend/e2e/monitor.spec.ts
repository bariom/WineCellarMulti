import { expect, test } from "@playwright/test";

test("shows actionable monitoring priorities without horizontal overflow", async ({ page }) => {
  const now = new Date().toISOString();
  const overview = {
    collected_at: now,
    system: {
      host: { cpu_percent: 24, memory: { percent: 58 }, disk: { percent: 67 } },
      network: { tcp_established: 11, tcp_time_wait: 2, tcp_total: 13 },
      conntrack: { count: 12, max: 1000 },
    },
    application: {
      requests_total: 214,
      errors_total: 0,
      average_duration_ms: 89,
      interactive_window_seconds: 60,
      interactive_requests_recent: 19,
      interactive_p50_duration_ms: 61,
      interactive_p95_duration_ms: 142,
      slow_requests_recent: 1,
      uptime_seconds: 172800,
    },
    business: {
      users_total: 15,
      users_approved: 14,
      users_blocked: 0,
      users_enabled: 14,
      households_total: 11,
      household_inventory: [],
      wines_total: 142,
      bottles_total: 388,
      bottles_in_cellar: 310,
      bottles_to_collect: 18,
      bottles_in_future_deliveries: 60,
      tastings_total: 91,
      tastings_30d: 8,
      wishlist_items_total: 10,
      ai_requests_30d: 46,
      ai_successes_30d: 45,
      wine_name_searches_30d: 11,
      wine_name_search_cost_30d_usd: 0.32,
      wine_photos_total: 112,
      label_recognitions_30d: 7,
      label_recognition_successes_30d: 7,
      coownership_active: 0,
      coownership_pending: 0,
      wine_pulse: {
        enabled: true,
        ai_enabled: true,
        published: 24,
        active_sources: 4,
        healthy_sources: 3,
        failed_sources: 1,
        last_status: "completed_with_errors",
        last_started_at: now,
        last_completed_at: now,
        last_error: "Una fonte non ha risposto.",
        last_run: { fetched: 12, new: 3, ai_processed: 3, ai_errors: 0, published: 2, source_errors: 1 },
      },
    },
    openai: { available: true, current_month_usd: 4.2, previous_period_usd: 3.1, change_percent: 35, period_start: now, collected_at: now },
    active_alerts: [],
    history_retention_days: 7,
  };

  await page.addInitScript(() => {
    window.localStorage.setItem("vinaris.monitor.device-token", "monitor-test-token");
  });
  await page.route("**/api/v1/admin/operations/**", async (route) => {
    const url = route.request().url();
    if (url.includes("collect-now")) return route.fulfill({ status: 204 });
    if (url.includes("overview")) return route.fulfill({ json: overview });
    if (url.includes("history")) return route.fulfill({
      json: {
        hours: 6,
        samples: [overview, overview].map((sample, index) => ({
          ...sample,
          collected_at: new Date(Date.now() - (1 - index) * 3600000).toISOString(),
        })),
      },
    });
    if (url.includes("demo-activity")) {
      return route.fulfill({ json: { total_visits: 12, visits_24h: 2, visits_7d: 8, last_visit_at: now } });
    }
    return route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/monitor");

  const priorities = page.getByLabel("Priorità operative");
  await expect(priorities).toContainText("Cosa controllare ora");
  await expect(priorities).toContainText("Controlla Wine Pulse");
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});
