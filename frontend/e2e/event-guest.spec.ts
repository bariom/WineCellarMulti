import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session } from "./fixtures/app";

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

test("the demo is one tap away and the guest can come back to tonight", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockEvent(page);
  await page.addInitScript((fixture) => {
    const mocked = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const path = new URL(requestUrl, window.location.origin).pathname;
      if (path.endsWith("/auth/demo")) {
        window.sessionStorage.setItem("vinaris-test-demo-entered", "yes");
        const eventReturn = { slug: fixture.event.slug, name: fixture.event.name, place: fixture.event.place };
        return new Response(JSON.stringify({ ...fixture, event: null, event_return: eventReturn, is_demo: true, membership_role: "viewer", active_household_name: "Cantina demo" }), { status: 200, headers: { "Content-Type": "application/json" } });
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
  await page.getByRole("button", { name: "Torna alla serata" }).click();
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
