import { expect, test, type Locator, type Page } from "@playwright/test";
import { memberships, mockApi, session, snapshotChrome, tastingArchive, wine } from "../e2e/fixtures/app";

/*
 * Screenshot library for news e-mails (docs/EMAIL_CAMPAIGNS.md). Every shot
 * uses the mocked E2E fixtures, never real customer data. Slugs must match
 * LIBRARY in backend/app/services/email_campaigns.py.
 *
 *   npm run email:library
 */

const OUTPUT = "public/email-library";

// Fictional but plausible data: e-mails reach customers, so no "Test" wording.
const libraryWine = {
  ...wine,
  name: "Barolo Riserva",
  producer: "Cantina del Colle",
  drink_window_notes: "Al meglio tra il 2026 e il 2028, poi una lenta evoluzione.",
};
const libraryArchive = {
  ...tastingArchive,
  items: tastingArchive.items.map((item) => ({ ...item, wine_name: libraryWine.name, wine_producer: libraryWine.producer, note: "Cena con amici: brasato e un Barolo in gran forma." })),
};

const bottle = (glass: string, label: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='80' height='160' viewBox='0 0 80 160'><rect x='26' y='8' width='28' height='18' rx='3' fill='#754a24'/><rect x='17' y='22' width='46' height='128' rx='12' fill='${glass}'/><rect x='21' y='64' width='38' height='48' fill='${label}'/></svg>`)}`;
const regions = ["Piemonte", "Toscana", "Bordeaux", "Champagne", "Borgogna", "Veneto"];
const showcaseWines = [
  { name: "Barolo Riserva", producer: "Cantina del Colle", type: "Red", glass: "#2a1418", label: "#f2e6c8", value: "180" },
  { name: "Brunello di Montalcino", producer: "Poggio Alto", type: "Red", glass: "#331a1c", label: "#e8d6a8", value: "150" },
  { name: "Champagne Brut", producer: "Maison Lefèvre", type: "Sparkling", glass: "#1f2a1c", label: "#d9b45a", value: "95" },
  { name: "Meursault", producer: "Domaine Moreau", type: "White", glass: "#c9b36a", label: "#fff7e0", value: "85" },
  { name: "Amarone", producer: "Tenuta Ca' Rossa", type: "Red", glass: "#2a1012", label: "#c8792e", value: "70" },
  { name: "Chablis", producer: "Domaine Laurent", type: "White", glass: "#d8c88a", label: "#ffffff", value: "40" },
].map((item, index) => ({
  ...libraryWine,
  id: `wine-e2e-${index + 1}`,
  name: item.name,
  producer: item.producer,
  type: item.type,
  region: regions[index],
  quantity: 3 + index,
  current_value: item.value,
  photo_thumbnail_url: bottle(item.glass, item.label),
  photo_detail_url: bottle(item.glass, item.label),
}));

async function save(target: Locator, slug: string, locale: string) {
  await target.page().evaluate(async () => { await document.fonts.ready; });
  await target.page().mouse.move(0, 0);
  // Fixed bars would overlap tall shots; hide them while capturing.
  await snapshotChrome(target.page(), false);
  await target.screenshot({ path: `${OUTPUT}/${slug}-${locale}.jpg`, type: "jpeg", quality: 82, animations: "disabled" });
}

/** At 900 px the app uses its compact layout: these sections open from the menu. */
async function openFromMenu(page: Page, name: string) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function openSettings(page: Page, it: boolean) {
  await page.getByRole("button", { name: it ? "Apri menu account" : "Open account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: it ? "Impostazioni" : "Settings", exact: true }).click();
}

async function open(page: Page, locale: "it" | "en", wines: Array<typeof libraryWine> = [libraryWine], extra: Record<string, unknown> = {}) {
  const { archive, ...sessionExtra } = extra;
  await mockApi(page, [], true, memberships, wines as never, { ...session, locale, ...sessionExtra }, [], undefined, (archive || libraryArchive) as never);
  // The fixture answers a wine's own record with the default test wine: serve ours.
  await page.addInitScript((list) => {
    const previous = window.fetch;
    window.fetch = async (input, init) => {
      const match = new URL(String(input), location.href).pathname.match(/^\/api\/v1\/wines\/([^/]+)$/);
      const found = match && (!init?.method || init.method === "GET") ? list.find((item) => item.id === match[1]) : null;
      return found ? Response.json(found) : previous(input, init);
    };
  }, wines);
  await page.goto("/");
}

for (const locale of ["it", "en"] as const) {
  const it = locale === "it";
  test.describe(`email library ${locale}`, () => {
    // About 1.6x the 536 px an e-mail shows, so text stays sharp and readable.
    test.use({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1.6 });

    test("home showcase and cellar statistics", async ({ page }) => {
      await open(page, locale, showcaseWines);
      await page.getByRole("tab", { name: it ? /Focus collezionista/ : /Collector focus/ }).first().click();
      const showcase = page.locator(".cellar-showcase");
      await expect(showcase).toBeVisible();
      await showcase.scrollIntoViewIfNeeded();
      await save(showcase, "home-showcase", locale);
      await page.getByRole("button", { name: it ? /^Cantina/ : /^Cellar/ }).first().click();
      const stats = page.locator("details.stats-panel-wrapper").first();
      await stats.locator("summary").click();
      await save(stats.locator(".stats-panel"), "cellar-stats", locale);
    });

    test.describe("desktop detail panel", () => {
      // The desktop side panel is about as wide as an e-mail column.
      test.use({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.6 });
      test("wine detail and drinking window", async ({ page }) => {
        await open(page, locale);
        await page.getByRole("button", { name: it ? /^Cantina/ : /^Cellar/ }).first().click();
        await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
        const detail = page.locator(".wine-detail:visible").first();
        await expect(detail).toBeVisible();
        await save(detail.locator(".detail-hero .detail-title"), "wine-detail", locale);
        const window = detail.locator(".detail-hero-window");
        await window.scrollIntoViewIfNeeded();
        await save(window, "drinking-window", locale);
      });
      test("wishlist", async ({ page }) => {
        await mockApi(page, [], true, memberships, [libraryWine] as never, { ...session, locale }, [], undefined, libraryArchive as never);
        await page.addInitScript(() => {
          const previous = window.fetch;
          const item = { id: "wish-1", household_id: "household-e2e", wishlist_list_id: "list-1", name: "Barbaresco Asili", producer: "Cantina del Colle", vintage: "2020", format: "0.75 L", type: "Red", region: "Piemonte", appellation: "Barbaresco", target_price: "70", offer_price: "62", investment_amount: null, ai_market_price: "", ai_market_price_currency: "CHF", currency: "CHF", merchant: "Enoteca del Borgo", priority: "High", purpose: "Drink", status: "Wishlist", notes: "", ai_context_note: "", ai_strategy: "", ai_purpose_advice: "" };
          window.fetch = async (input, init) => {
            const path = new URL(String(input), location.href).pathname;
            if (path === "/api/v1/wishlist/lists") return Response.json([{ id: "list-1", household_id: "household-e2e", name: "Da scoprire", item_count: 1, description: "", portfolio_strategy: null }]);
            if (path === "/api/v1/wishlist") return Response.json([item]);
            return previous(input, init);
          };
        });
        await page.goto("/");
        await page.getByRole("button", { name: /^Wishlist/ }).first().click();
        const list = page.locator(".wine-list").first();
        await expect(list.locator(".wishlist-row").first()).toBeVisible();
        await save(list, "wishlist", locale);
      });
    });

    test("taste profile", async ({ page }) => {
      await open(page, locale);
      await page.locator(".dashboard-analysis-switcher > summary").click();
      await page.getByRole("tab", { name: it ? "Il mio gusto" : "My Taste", exact: true }).click();
      const hero = page.getByRole("region", { name: it ? "Ritratto del gusto" : "Taste portrait", exact: true });
      await expect(hero).toBeVisible();
      await save(hero, "taste-profile", locale);
    });

    test("diary", async ({ page }) => {
      const profile = [
        { wine_type: "Red", currency: "CHF", count: 15, purchase_total: 174.84, comparable_count: 14, comparable_purchase_total: 158.89, market_value_total: 430.02 },
        { wine_type: "Sparkling", currency: "CHF", count: 5, purchase_total: 172, comparable_count: 5, comparable_purchase_total: 172, market_value_total: 277.9 },
        { wine_type: "White", currency: "CHF", count: 13, purchase_total: 260, comparable_count: 9, comparable_purchase_total: 190, market_value_total: 242 },
      ];
      const archive = { ...libraryArchive, total: 56, rated_count: 53, notes_count: 31, latest_consumed_at: "2026-10-24", profile };
      await open(page, locale, [libraryWine], { archive });
      await openFromMenu(page, it ? "Diario" : "Journal");
      const workspace = page.locator(".history-workspace .wine-list");
      await expect(workspace.locator(".tasting-archive-entry").first()).toBeVisible();
      await save(workspace, "diary", locale);
    });

    test("signature themes", async ({ page }) => {
      await open(page, locale, [libraryWine], { theme_preference: "maison-champagne" });
      await openSettings(page, it);
      const picker = page.locator("fieldset.theme-picker");
      await expect(picker).toBeVisible();
      await picker.scrollIntoViewIfNeeded();
      await save(picker, "themes", locale);
    });

    test("restaurant wine list", async ({ page }) => {
      // The scan mock wraps the fixture's fetch, so it is installed after mockApi.
      await mockApi(page, [], true, memberships, [libraryWine] as never, { ...session, locale }, [], undefined, libraryArchive as never);
      await page.addInitScript(() => {
        const previous = window.fetch;
        const chablis = { name: "Chablis Premier Cru", producer: "Domaine Laurent", vintage: "2021", price_text: "Calice 1 dl CHF 14; bottiglia CHF 78", style: "Bianco" };
        const barolo = { name: "Barolo", producer: "Cantina del Colle", vintage: "2018", price_text: "CHF 95", style: "Rosso" };
        window.fetch = async (input, init) => {
          const path = new URL(String(input), location.href).pathname;
          if (path === "/api/v1/ai/restaurant-wine-list/scan" && init?.method === "POST") {
            return Response.json({
              summary: "Carta letta su una pagina.", extracted_text: "", wines: [chablis, barolo], taste_profile_applied: true, model: "test-model", reasoning_effort: "low", estimated_cost_usd: "0.01",
              recommendations: [
                { ...chablis, reason: "Freschezza e sapidità per il pesce.", serving_note: "Servire a 10-12 °C.", taste_affinity: 5 },
                { ...barolo, reason: "Struttura per la carne brasata.", serving_note: "", taste_affinity: 4 },
              ],
            });
          }
          return previous(input, init);
        };
      });
      await page.goto("/");
      await page.getByRole("button", { name: /Sommelier AI|AI Sommelier/ }).filter({ visible: true }).first().click();
      await page.locator(".sommelier-hub").getByRole("button", { name: it ? /^Al ristorante/ : /^At the restaurant/ }).click();
      await page.getByRole("button", { name: it ? /^Analizza una carta vini/ : /^Analy[sz]e a wine list/ }).click();
      await page.locator(".restaurant-wine-list-upload-button input").setInputFiles([{ name: "carta.jpg", mimeType: "image/jpeg", buffer: Buffer.from("jpeg") }]);
      await page.locator(".restaurant-wine-list-form button[type=submit]").click();
      const picks = page.locator(".restaurant-wine-list-recommendations");
      await expect(picks).toBeVisible();
      await save(picks, "restaurant-list", locale);
    });
  });
}
