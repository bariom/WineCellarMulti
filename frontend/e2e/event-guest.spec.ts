import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

async function expectInsideViewport(page: Page, selector: string) {
  const width = page.viewportSize()!.width;
  for (const element of await page.locator(selector).all()) {
    const box = await element.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

/*
 * A guest scans the event QR code: no account, the event on the masthead, only
 * the event's AI features, and one way to keep tonight as their own account.
 */

const guestSession = {
  ...session,
  user_display_name: "Ospite",
  user_email: "event-1@visitor.vinaris.app",
  active_household_name: "The Market · Lugano",
  membership_role: "owner",
  has_active_entitlement: false,
  is_free_tier: true,
  event: {
    id: "event-1",
    slug: "market-2026",
    name: "The Market",
    place: "Lugano",
    locale: "it",
    features: ["restaurant_wine_list"],
    landing: "pairing-restaurant",
    visitor_until: "2999-01-01T00:00:00Z",
  },
};

async function mockEvent(page: Page) {
  await mockApi(page, [], true, memberships, [], guestSession);
  await page.addInitScript((fixture) => {
    const mocked = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const path = new URL(requestUrl, window.location.origin).pathname;
      if (path.endsWith("/events/market-2026/enter")) {
        window.sessionStorage.setItem("vinaris-test-event-entered", new URL(requestUrl, window.location.origin).search || "yes");
        return new Response(JSON.stringify(fixture), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (path.endsWith("/events/claim")) {
        window.sessionStorage.setItem("vinaris-test-event-claim", String(init?.body || ""));
        return new Response(JSON.stringify({ authenticated: false, pending_email_verification: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return mocked(input, init);
    };
  }, guestSession);
}

for (const width of [390, 1440]) {
  test(`the QR code lands a guest on the event's sommelier at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await mockEvent(page);
    await page.goto("/e/market-2026");

    // No locale on the request: the guest speaks the event's language.
    await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("vinaris-test-event-entered"))).toBe("yes");
    await expect(page).toHaveURL(/\/$/);
    const masthead = page.locator(".topbar-brand");
    await expect(masthead.locator(".eyebrow")).toHaveText("Vinaris at The Market · Lugano");
    await expect(masthead.getByRole("heading", { level: 1 })).toHaveText("Sommelier AI per gli ospiti");
    await expect(page.locator(".topbar-settings-button")).toHaveCount(0);
    // Landing: the event's welcome page, with only the feature on offer.
    await expect(page.getByRole("heading", { name: "Il sommelier AI è al tuo tavolo." })).toBeVisible();
    const cards = page.locator(".event-welcome-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Scegli dalla carta dei vini");
    await page.screenshot({ path: testInfo.outputPath(`event-welcome-${width}.png`), fullPage: true });
    if (width === 390) await expect(page).toHaveScreenshot("events-welcome-compact.png");
    await cards.first().click();
    // Straight to the wine-list scan, the taste profile left aside, no other path on offer.
    await expect(page.getByRole("button", { name: "Analizza carta vini" })).toBeVisible();
    await expect(page.getByLabel("Non usare il mio profilo gusto")).toBeChecked();
    await expect(page.getByRole("button", { name: "Cambia percorso" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "A casa" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Proposta senza carta" })).toHaveCount(0);
    // Nothing of the cellar app: only the sommelier and the way to stay.
    await expect(page.getByRole("button", { name: /^Cantina/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Wishlist" })).toHaveCount(0);
    // No guide either: tonight explains itself.
    await expect(page.getByRole("button", { name: "Guida" })).toHaveCount(0);
    if (width === 390) {
      await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Guida" })).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`event-guest-${width}.png`) });

    await page.getByRole("button", { name: width === 1440 ? "Tieni questa serata" : "Tieni la serata" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Tieni questa serata" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Il tuo nome").fill("Anna");
    await dialog.getByLabel("E-mail").fill("anna@example.test");
    await dialog.getByLabel("Password").fill("strong-password-9");
    for (const consent of await dialog.locator("input[type=checkbox]").all()) await consent.check();
    await page.screenshot({ path: testInfo.outputPath(`event-claim-${width}.png`) });
    await dialog.getByRole("button", { name: "Crea il mio account" }).click();
    await expect(page.getByText("Account creato: controlla la tua email")).toBeVisible();
    const claim = JSON.parse(await page.evaluate(() => window.sessionStorage.getItem("vinaris-test-event-claim") || "{}"));
    expect(claim.email).toBe("anna@example.test");
    expect(claim.display_name).toBe("Anna");
    expect(claim.privacy_policy_accepted).toBe(true);
  });
}

test("the welcome page returns from a feature and lists every feature the event offers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], true, memberships, [], { ...guestSession, event: { ...guestSession.event, features: ["restaurant_wine_list", "dish_pairing", "bottle_photo"] } });
  await page.addInitScript((fixture) => {
    const mocked = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (new URL(requestUrl, window.location.origin).pathname.endsWith("/events/market-2026/enter")) return new Response(JSON.stringify(fixture), { status: 200, headers: { "Content-Type": "application/json" } });
      return mocked(input, init);
    };
  }, { ...guestSession, event: { ...guestSession.event, features: ["restaurant_wine_list", "dish_pairing", "bottle_photo"] } });
  await page.goto("/e/market-2026");
  const cards = page.locator(".event-welcome-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2)).toContainText("Riconosci le bottiglie");
  await cards.nth(1).click();
  // The dish path, with the way back to the list but never "at home".
  await expect(page.getByText("Proposta senza carta").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cambia percorso" })).toBeVisible();
  await page.getByRole("button", { name: "Cambia percorso" }).click();
  await expect(page.getByRole("button", { name: "Analizza una carta vini" })).toBeVisible();
  await expect(page.getByRole("button", { name: "A casa" })).toHaveCount(0);
  await page.getByRole("button", { name: "Stasera" }).first().click();
  await expect(page.getByRole("heading", { name: "Il sommelier AI è al tuo tavolo." })).toBeVisible();
});

for (const width of [390, 1440]) test(`the demo is one tap away and the guest can come back to tonight at ${width}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
  await mockEvent(page);
  await page.addInitScript((fixture) => {
    const mocked = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const path = new URL(requestUrl, window.location.origin).pathname;
      if (path.endsWith("/auth/demo")) {
        window.sessionStorage.setItem("vinaris-test-demo-entered", "yes");
        const eventReturn = { slug: fixture.event.slug, name: fixture.event.name, place: fixture.event.place };
        return new Response(JSON.stringify({ ...fixture, event: null, event_return: eventReturn, is_demo: true, membership_role: "viewer", active_household_name: "Vinaris Demo · Collector Cellar" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (path.endsWith("/events/return")) {
        window.sessionStorage.setItem("vinaris-test-event-returned", "yes");
        return new Response(JSON.stringify(fixture), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return mocked(input, init);
    };
  }, guestSession);
  await page.goto("/e/market-2026");
  await page.getByRole("button", { name: "Esplora la demo" }).click();
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("vinaris-test-demo-entered"))).toBe("yes");
  await expect(page.getByText("Demo · sola lettura")).toBeVisible();
  // The cellar name keeps its width: the way back never squeezes the top bar.
  const title = page.locator(".topbar-brand h1");
  await expect(title).toHaveText("Vinaris Demo · Collector Cellar");
  expect((await title.boundingBox())!.width).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`demo-return-${width}.png`) });
  await page.getByRole("button", { name: /Torna alla serata/ }).click();
  // The same guest comes back, through the server's memory of them, not a new QR entry.
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("vinaris-test-event-returned"))).toBe("yes");
  await expect(page.getByRole("heading", { name: "Il sommelier AI è al tuo tavolo." })).toBeVisible();
  await expect(page.locator(".topbar-brand .eyebrow")).toHaveText("Vinaris at The Market · Lugano");
});

test("a hard refresh keeps the guest on the welcome page, not a cellar dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The session cookie survives the reload; the address is "/" again, not /e/<slug>.
  await mockApi(page, [], true, memberships, [], guestSession);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Il sommelier AI è al tuo tavolo." })).toBeVisible();
  await expect(page.locator(".topbar-brand .eyebrow")).toHaveText("Vinaris at The Market · Lugano");
  await expect(page.getByRole("button", { name: "Focus collezionista" })).toHaveCount(0);
  await expect(page.getByText("La bottiglia del giorno")).toHaveCount(0);
});

test("the bottles photographed tonight are listed on the welcome page, with the way to keep them", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [wine], { ...guestSession, event: { ...guestSession.event, features: ["bottle_photo"] } });
  await page.addInitScript(() => window.sessionStorage.setItem("vinaris-test-sensory", JSON.stringify({
    generation_status: "available", source: "hybrid", confidence: 0.7,
    dimensions: { body: 0.7, acidity: 0.8, tannin: 0.75, sweetness: 0.05, aromatic_intensity: 0.6, fruit: 0.55, wood: 0.4, spice: 0.35, minerality: 0.5 },
  })));
  await page.goto("/");
  const bottles = page.locator(".event-welcome-bottles");
  await expect(bottles.getByRole("heading", { name: "Le bottiglie di stasera" })).toBeVisible();
  await expect(bottles.getByText("Nebbiolo di Test")).toBeVisible();
  await expect(bottles.getByText("4 bottiglie")).toBeVisible();
  await expect(bottles.getByText(/poi vengono eliminate/)).toBeVisible();
  await expect(bottles.getByRole("button", { name: "Rimuovi Nebbiolo di Test" })).toBeVisible();
  // No horizontal overflow on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("tonight-bottles-390.png"), fullPage: true });

  // Each bottle opens a page made for tonight: no stock, sales or cellar actions.
  await bottles.getByRole("button", { name: "Dettaglio di Nebbiolo di Test" }).click();
  const sheet = page.getByRole("dialog", { name: "Nebbiolo di Test" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Quando berlo" })).toBeVisible();
  await expect(sheet.getByText("Ideale fino al 2028")).toBeVisible();
  // No price: at a venue the market value would reveal the restaurant's markup.
  await expect(sheet.getByRole("heading", { name: "Quanto vale" })).toHaveCount(0);
  await expect(sheet.getByText(/CHF/)).toHaveCount(0);
  await expect(sheet.getByRole("heading", { name: "Uvaggio" })).toBeVisible();
  await expect(sheet.getByText("Nebbiolo", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Profilo di test")).toBeVisible();
  await expect(sheet.getByRole("region", { name: "Impronta sensoriale" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Registra bevuta" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Completa con AI" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("tonight-wine-390.png") });
  await sheet.getByRole("button", { name: "Chiudi" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Le bottiglie di stasera" })).toBeVisible();
  await bottles.getByRole("button", { name: "Tieni le bottiglie: crea il mio account" }).click();
  await expect(page.getByText(/Le 4 bottiglie fotografate stasera restano nella tua cantina/)).toBeVisible();
});

test("Wine Pulse, when the event offers it, opens the news and keeps Tonight one tap away", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [], { ...guestSession, event: { ...guestSession.event, features: ["restaurant_wine_list", "wine_pulse"] } });
  await page.goto("/");
  const cards = page.locator(".event-welcome-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1)).toContainText("Wine Pulse: le notizie del vino");
  await cards.nth(1).click();
  await expect(page.getByRole("heading", { name: /Wine Pulse/ }).first()).toBeVisible();
  // No cellar navigation appears for the guest; "Tonight" brings them back.
  await expect(page.getByRole("button", { name: /^Cantina/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Stasera" }).first().click();
  await expect(page.getByRole("heading", { name: "Il sommelier AI è al tuo tavolo." })).toBeVisible();
});

test("a bottle with missing data can be completed with AI from its page", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bare = { ...wine, ai_notes: "", drink_from: null, drink_peak_from: null, drink_peak_to: null, drink_to: null, drink_window_notes: "", current_value: null, grapes: [] };
  await mockApi(page, [], true, memberships, [bare], { ...guestSession, event: { ...guestSession.event, features: ["bottle_photo"] } });
  await page.addInitScript((completed) => {
    const mocked = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (new URL(requestUrl, window.location.origin).pathname.endsWith(`/ai/wines/${completed.id}/all`)) {
        window.sessionStorage.setItem("vinaris-test-completed", String(init?.body || ""));
        return new Response(JSON.stringify(completed), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return mocked(input, init);
    };
  }, wine);
  await page.goto("/");
  await page.getByRole("button", { name: "Dettaglio di Nebbiolo di Test" }).click();
  const sheet = page.getByRole("dialog", { name: "Nebbiolo di Test" });
  await expect(sheet.getByText("Finestra di beva non ancora stimata.")).toBeVisible();
  await expect(sheet.getByText("Uvaggio non ancora verificato.")).toBeVisible();
  await sheet.getByRole("button", { name: "Completa con AI" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("vinaris-test-completed") || "{}").locale)).toBe("it");
  await expect(sheet.getByText("Ideale fino al 2028")).toBeVisible();
  await expect(sheet.getByText(/CHF/)).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Completa con AI" })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("tonight-wine-1440.png") });
});

// Events-only visual review and structural regressions: the real app with deterministic data.
for (const width of [360, 390, 430]) test(`editorial Events keeps long identities and controls readable at ${width}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : 844 });
  const longWine = { ...wine, name: "Riserva della Tenuta delle Colline di San Giovanni — Selezione speciale della serata", producer: "Azienda Agricola delle Colline di San Giovanni", ai_notes: "", grapes: [], drink_from: null, drink_to: null };
  const features = ["restaurant_wine_list", "dish_pairing", "bottle_photo", "assistant", "buying_advice", "wine_pulse"];
  await mockApi(page, [], true, memberships, [longWine], { ...guestSession, event: { ...guestSession.event, name: "Una serata di degustazione alla Tenuta delle Colline", place: "San Giovanni sul Lago", features } });
  await page.addInitScript(() => {
    const previous = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
      if (path.endsWith("/all")) {
        await new Promise<void>((resolve) => window.addEventListener("release-event-ai", () => resolve(), { once: true }));
        return new Response(JSON.stringify({ detail: "Il servizio non è disponibile. Riprova tra poco." }), { status: 503, headers: { "Content-Type": "application/json" } });
      }
      if (path.endsWith("/events/claim")) return new Response(JSON.stringify({ detail: "Questo indirizzo e-mail è già registrato." }), { status: 409, headers: { "Content-Type": "application/json" } });
      return previous(input, init);
    };
  });
  await page.goto("/");
  await expect(page.locator(".event-welcome-card")).toHaveCount(6);
  await expectInsideViewport(page, ".event-welcome-hero, .event-welcome-card, .event-welcome-bottles");
  const cards = await page.locator(".event-welcome-card").all();
  for (let i = 1; i < cards.length; i++) {
    const previous = (await cards[i - 1].boundingBox())!;
    const next = (await cards[i].boundingBox())!;
    expect(next.y).toBeGreaterThanOrEqual(previous.y + previous.height);
  }
  const name = page.locator(".event-welcome-bottle-text strong");
  expect(await name.evaluate((element) => element.scrollHeight <= element.clientHeight && getComputedStyle(element).whiteSpace !== "nowrap")).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`events-menu-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: `Dettaglio di ${longWine.name}` }).click();
  const sheet = page.getByRole("dialog", { name: longWine.name });
  await expect(sheet).toBeVisible();
  const title = (await sheet.getByRole("heading", { name: longWine.name }).boundingBox())!;
  const close = (await sheet.getByRole("button", { name: "Chiudi", exact: true }).boundingBox())!;
  expect(close.width).toBeGreaterThanOrEqual(44);
  expect(close.height).toBeGreaterThanOrEqual(44);
  expect(title.y).toBeGreaterThanOrEqual(close.y + close.height);
  await expectInsideViewport(page, ".event-wine-identity, .event-wine-close, .event-wine-footer button");
  await sheet.screenshot({ path: testInfo.outputPath(`events-wine-long-${width}.png`) });
  await sheet.getByRole("button", { name: "Completa con AI" }).click();
  await expect(sheet.getByText("Il sommelier cerca i dati del vino…", { exact: true })).toBeVisible();
  await sheet.screenshot({ path: testInfo.outputPath(`events-wine-loading-${width}.png`) });
  await page.evaluate(() => window.dispatchEvent(new Event("release-event-ai")));
  await expect(sheet.getByRole("alert")).toContainText("Il servizio non è disponibile");
  await sheet.getByRole("alert").scrollIntoViewIfNeeded();
  await sheet.screenshot({ path: testInfo.outputPath(`events-wine-error-${width}.png`) });
  await sheet.getByRole("button", { name: "Chiudi", exact: true }).click();
  await page.getByRole("button", { name: "Tieni le bottiglie: crea il mio account" }).click();
  const claim = page.getByRole("dialog", { name: "Tieni questa serata" });
  await claim.getByLabel("Il tuo nome").fill("Anna");
  await claim.getByLabel("E-mail", { exact: true }).fill("anna@example.test");
  await claim.getByLabel("Password").fill("strong-password-9");
  for (const consent of await claim.locator('input[type="checkbox"]').all()) await consent.check();
  await claim.getByRole("button", { name: "Crea il mio account" }).click();
  await expect(claim.getByRole("alert")).toContainText("già registrato");
  const alertBox = (await claim.getByRole("alert").boundingBox())!;
  const actionsBox = (await claim.locator(".form-actions").boundingBox())!;
  expect(alertBox.y + alertBox.height).toBeLessThanOrEqual(actionsBox.y);
  await expectInsideViewport(page, ".event-claim-dialog input, .event-claim-dialog .form-actions button");
  await claim.getByRole("alert").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`events-claim-error-${width}.png`) });
  await claim.evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath(`events-claim-header-${width}.png`) });
});
