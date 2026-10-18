import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

// Fixed "today" (2026) so maturity lanes are deterministic.
const FIXED_NOW = new Date("2026-09-22T12:00:00Z");

const history = (entries: Array<[string, string]>) => entries.map(([recorded_at, value]) => ({ recorded_at, value, currency: wine.currency, source: "ai" }));
const make = (id: string, name: string, quantity: number, price: string, value: string, window: [number | null, number | null], peak: [number | null, number | null] = [null, null], extra: Record<string, unknown> = {}) => ({
  ...wine, id, name, producer: "Cantina Test", region: "Piemonte", type: "Red", vintage: "2018", quantity, price, current_value: value,
  order_date: "2023-03-10", ai_value_estimated_at: "2026-09-01T10:00:00Z", drink_from: window[0], drink_to: window[1],
  drink_peak_from: peak[0], drink_peak_to: peak[1], value_history: [], created_at: "2026-09-10T10:00:00Z", ...extra,
});

// Bottles per maturity lane in 2026: overdue 5, closing 4, ready 3, waiting 6, no window 8.
const stock = [
  make("q-increase", "Cannubi", 3, "100", "175", [2024, 2034], [null, null], { value_history: history([["2024-02-01T10:00:00Z", "120"], ["2025-03-01T10:00:00Z", "150"]]) }),
  make("q-waiting", "Brunello", 6, "80", "82", [2026, 2040], [2030, 2036]),
  make("q-closing", "Chablis", 4, "30", "31", [2023, 2026]),
  make("q-overdue", "Franciacorta", 5, "25", "26", [2022, 2025], [null, null], { type: "Sparkling", region: "Lombardia" }),
  make("q-nowindow", "Etna Rosso", 8, "40", "41", [null, null], [null, null], { region: "Sicilia" }),
];

async function open(page: Page, wines: unknown[], overrides: Record<string, unknown> = {}, url = "/") {
  await page.clock.setFixedTime(FIXED_NOW);
  await mockApi(page, [], false, memberships, wines as never, { ...session, dashboard_focus: "collector", ...overrides });
  await page.goto(url);
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const slides = (page: Page) => page.locator(".cq-slide");
const counter = (page: Page) => page.locator(".cq-today > header span");

for (const [width, height] of [[360, 800], [390, 844], [430, 932], [1440, 1000]]) {
  test(`quadrante composition and order ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page, stock);
    await expect(page.getByRole("heading", { name: "La bottiglia del giorno" })).toBeVisible();
    for (const name of ["Quando berle", "Da seguire adesso", "La collezione in numeri", "Ultimi arrivi"]) await expect(page.getByRole("heading", { name })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    const top = async (name: string) => (await page.getByRole("heading", { name }).boundingBox())!;
    const today = await top("La bottiglia del giorno"), timeline = await top("Quando berle"), follow = await top("Da seguire adesso"), numbers = await top("La collezione in numeri");
    if (width <= 900) {
      // Single column: today, timeline, follow-up, numbers, in that order.
      expect(today.y).toBeLessThan(timeline.y);
      expect(timeline.y).toBeLessThan(follow.y);
      expect(follow.y).toBeLessThan(numbers.y);
    } else {
      // Desktop: bottle card on the left, the other three stacked in the right column.
      expect(timeline.x).toBeGreaterThan(today.x + 300);
      expect(Math.abs(timeline.x - follow.x)).toBeLessThan(2);
      expect(Math.abs(timeline.x - numbers.x)).toBeLessThan(2);
      expect(timeline.y).toBeLessThan(follow.y);
      expect(follow.y).toBeLessThan(numbers.y);
    }
    // The bottle never overlaps the title or leaves its card.
    const stage = (await slides(page).first().locator(".cq-stage").boundingBox())!;
    const bottle = (await slides(page).first().locator(".cq-bottle img").boundingBox())!;
    const title = (await slides(page).first().locator("h3").boundingBox())!;
    expect(bottle.x).toBeGreaterThanOrEqual(stage.x - 1);
    expect(bottle.x + bottle.width).toBeLessThanOrEqual(title.x + 1);
  });
}

test("quadrante keeps the classic layout available and does not repeat maturity", async ({ page }) => {
  await open(page, stock);
  await expect(page.locator(".cq")).toBeVisible();
  await expect(page.locator(".collector-wine-stage")).toHaveCount(0);
  // Maturity lives in the timeline only: no horizon histogram, no maturity scene in the atlas.
  await expect(page.getByText("Orizzonte di beva")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Maturità" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Origini" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Valore" })).toBeVisible();
  const classic = await page.context().newPage();
  await open(classic, stock, {}, "/?classic");
  await expect(classic.locator(".collector-wine-stage")).toBeVisible();
  await expect(classic.locator(".cq")).toHaveCount(0);
});

test("quadrante timeline lanes count only bottles present, per maturity state", async ({ page }) => {
  await open(page, stock);
  const lane = (name: string) => page.locator(".cq-lane").filter({ hasText: name });
  await expect(lane("Oltre la finestra")).toContainText(/5\s*bott\. · 1 vini/);
  await expect(lane("In chiusura quest’anno")).toContainText(/4\s*bott\. · 1 vini/);
  await expect(lane("Pronte da bere")).toContainText(/3\s*bott\. · 1 vini/);
  await expect(lane("Da attendere")).toContainText(/6\s*bott\. · 1 vini/);
  await expect(lane("Senza finestra")).toContainText(/8\s*bott\. · 1 vini/);
  await expect(page.locator(".cq-axis").getByText("Oggi")).toBeVisible();
  // A lane opens onto its wines, and a wine opens its detail.
  await lane("Da attendere").locator("summary").click();
  await lane("Da attendere").getByRole("button", { name: /Brunello/ }).click();
  await expect(page.locator(".wine-detail:visible").first()).toContainText("Brunello");
});

test("quadrante chart follows the reason a bottle is highlighted", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, stock);
  await expect(slides(page).first()).toBeVisible();
  const total = await slides(page).count();
  expect(total).toBeGreaterThanOrEqual(3);
  // First pick is the largest price increase: value trajectory, never a ranking or a maturity dial.
  const first = slides(page).first();
  await expect(first.locator(".cq-trend")).toBeVisible();
  await expect(first.locator(".cq-trend")).toContainText("Come è cambiato il suo valore");
  await expect(first.locator(".cq-trend")).toContainText("+75");
  await expect(first.locator(".cq-why")).toContainText("maggiore incremento percentuale");
  await expect(first.locator(".cq-dial")).toHaveCount(0);
  const kinds = new Set<string>();
  for (let index = 1; index < total; index += 1) {
    const slide = slides(page).nth(index);
    const ranking = await slide.locator(".cq-rank").count();
    const weight = await slide.locator(".cq-share").count();
    const window = await slide.locator(".cq-window").count();
    const taste = await slide.locator(".cq-taste").count();
    expect(ranking + weight + window + taste, `slide ${index + 1} has exactly one non-trend chart`).toBe(1);
    kinds.add(ranking ? "rank" : weight ? "share" : window ? "window" : "taste");
    if (window) {
      // A maturity pick draws its own window, not a value chart.
      await expect(slide.locator(".cq-window figcaption")).toContainText("La sua finestra di consumo");
      await expect(slide.locator(".cq-window .cq-needle")).toHaveCount(1);
    } else if (taste) {
      await expect(slide.locator(".cq-taste figcaption")).toContainText("Il tuo giudizio");
    } else if (ranking) {
      // A ranking marks the current wine and never reuses the ownership sentence.
      await expect(slide.locator(".cq-rank-current")).toHaveCount(1);
      await expect(slide.locator(".cq-why")).not.toContainText("quota di proprietà");
      await expect(slide.locator(".cq-rank figcaption strong")).toContainText(/#\d/);
    } else {
      await expect(slide.locator(".cq-share")).toContainText("Peso sulla collezione");
    }
  }
  expect(kinds.size).toBeGreaterThan(0);
});

test("quadrante highlights up to eight bottles for maturity and personal taste too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const tasted = (count: number, best: number, last: string) => ({ tasting_summary: { count, best_rating: best, last_consumed_at: last } });
  const wines = [
    ...stock,
    make("q-peak", "Barolo", 2, "60", "61", [2024, 2040], [2026, 2034]),
    make("q-favorite", "Sassicaia", 1, "50", "51", [null, null], [null, null], { rating: 5.5 }),
    make("q-tasting", "Amarone", 2, "45", "46", [null, null], [null, null], tasted(3, 5, "2026-05-01")),
    make("q-rediscover", "Taurasi", 2, "20", "21", [null, null], [null, null], { rating: 4, ...tasted(1, 4, "2024-06-01") }),
    make("q-extra-1", "Dolcetto", 2, "10", "11", [null, null]),
    make("q-extra-2", "Grignolino", 2, "9", "10", [null, null]),
  ];
  await open(page, wines);
  await expect(slides(page)).toHaveCount(8);
  await expect(counter(page)).toHaveText("1 / 8");
  const kicker = (id: string) => page.locator(".cq-slide").filter({ has: page.getByRole("heading", { name: id, exact: true }) }).locator(".cq-kicker");
  await expect(kicker("Chablis")).toContainText("Da bere quest’anno");
  await expect(kicker("Barolo")).toContainText("Entra nel picco");
  await expect(kicker("Sassicaia")).toContainText("Tra i tuoi preferiti");
  await expect(kicker("Amarone")).toContainText("Degustazione memorabile");
  await expect(kicker("Taurasi")).toContainText("Da riscoprire");
  const favorite = page.locator(".cq-slide").filter({ has: page.getByRole("heading", { name: "Sassicaia", exact: true }) });
  await expect(favorite.locator(".cq-taste")).toContainText("5.5/6");
  await expect(favorite.locator(".cq-meta")).toContainText("Le tue stelle: 5.5/6");
  const rediscover = page.locator(".cq-slide").filter({ has: page.getByRole("heading", { name: "Taurasi", exact: true }) });
  await expect(rediscover.locator(".cq-why")).toContainText("non apri da oltre un anno");
  await expect(rediscover.locator(".cq-taste")).toContainText("1 degustazione registrata");
  expect(await noOverflow(page)).toBe(true);
});

for (const [width, height] of [[390, 844], [1440, 1000]]) {
  test(`quadrante slides keep bottle and chart in the same place ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page, stock);
    await expect(slides(page).first()).toBeVisible();
    const metrics = await slides(page).evaluateAll(items => items.map(item => {
      const box = item.getBoundingClientRect();
      const bottle = (item.querySelector(".cq-bottle img") as HTMLElement).getBoundingClientRect();
      const context = item.querySelector(".cq-context")!.getBoundingClientRect();
      return { bottleTop: Math.round(bottle.top - box.top), contextTop: Math.round(context.top - box.top), contextHeight: Math.round(context.height) };
    }));
    expect(metrics.length).toBeGreaterThan(1);
    for (const metric of metrics) expect(metric).toEqual(metrics[0]);
    expect(metrics[0].contextHeight).toBeGreaterThanOrEqual(300);
  });
}

test("quadrante bottle carousel follows swipe-scroll, arrows and opens the wine", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, stock);
  await expect(slides(page).first()).toBeVisible();
  const total = await slides(page).count();
  const rail = page.locator(".cq-rail");
  const scrolled = () => rail.evaluate(element => Math.round(element.scrollLeft / element.clientWidth));
  await expect(counter(page)).toHaveText(`1 / ${total}`);
  const previous = page.getByRole("button", { name: "Proposta precedente" });
  const next = page.getByRole("button", { name: "Proposta successiva" });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(counter(page)).toHaveText(`2 / ${total}`);
  await expect.poll(scrolled).toBe(1);
  // Native scrolling (what a swipe does) drives the counter and the arrows.
  await rail.evaluate(element => element.scrollTo({ left: element.clientWidth * 2, behavior: "auto" }));
  await expect(counter(page)).toHaveText(`3 / ${total}`);
  await previous.click();
  await expect.poll(scrolled).toBe(1);
  await rail.evaluate(element => element.scrollTo({ left: element.clientWidth * (element.children.length - 1), behavior: "auto" }));
  await expect(next).toBeDisabled();
  await rail.evaluate(element => element.scrollTo({ left: 0, behavior: "auto" }));
  await expect(counter(page)).toHaveText(`1 / ${total}`);
  await page.getByRole("button", { name: "Apri la scheda" }).click();
  await expect(page.locator(".wine-detail:visible").first()).toContainText("Cannubi");
});

for (const scheme of ["light", "dark"] as const) {
  test(`quadrante follows the ${scheme} theme instead of forcing its own background`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await open(page, stock, { theme_preference: scheme });
    await expect(page.locator(".cq")).toBeVisible();
    const colors = await page.evaluate(() => {
      const parse = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      return {
        section: getComputedStyle(document.querySelector(".cq")!).backgroundColor,
        panel: parse(getComputedStyle(document.querySelector(".cq-lanes")!).backgroundColor),
        text: parse(getComputedStyle(document.querySelector(".cq h2")!).color),
      };
    });
    expect(colors.section).toBe("rgba(0, 0, 0, 0)");
    if (scheme === "light") { expect(colors.panel[0]).toBeGreaterThan(200); expect(colors.text[0]).toBeLessThan(100); }
    else { expect(colors.panel[0]).toBeLessThan(80); expect(colors.text[0]).toBeGreaterThan(150); }
    expect(await noOverflow(page)).toBe(true);
    await context.close();
  });
}

test("quadrante glass illustration is as large as a bottle photo when a wine has none", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, stock.map(item => ({ ...item, photo_thumbnail_url: "", photo_detail_url: "" })));
  const glass = (await slides(page).first().locator(".cq-bottle svg").first().boundingBox())!;
  expect(glass.width).toBeGreaterThanOrEqual(120);
  expect(glass.height).toBeGreaterThanOrEqual(200);
});

test("quadrante empty cellar shows honest empty states", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page, []);
  await expect(page.locator(".cq")).toBeVisible();
  await expect(page.getByText("Nessun vino in primo piano")).toBeVisible();
  await expect(page.getByText("Nessuna bottiglia presente in cantina.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("quadrante speaks English", async ({ page }) => {
  await open(page, stock, { locale: "en" });
  await expect(page.getByRole("heading", { name: "Bottle of the day" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "When to drink" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Follow up now" })).toBeVisible();
  await expect(slides(page).first().locator(".cq-trend")).toContainText("How its value has changed");
});
