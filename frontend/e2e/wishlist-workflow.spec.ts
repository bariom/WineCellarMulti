import { expect, test, type Page } from "@playwright/test";
import { mockApi, session, memberships, wine, snapshotChrome } from "./fixtures/app";

async function openWishlist(page: Page, width: number, empty = false, readOnly = false, english = false) {
  await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
  await mockApi(page, [], true, memberships, [wine], { ...session, membership_role: readOnly ? "viewer" : "owner", locale: english ? "en" : "it" });
  await page.addInitScript(({ empty }) => {
    const original = window.fetch.bind(window);
    const item = { id: "wish-1", household_id: "household-e2e", wishlist_list_id: "list-1", name: "Barolo da scoprire", producer: "Produttore Test", vintage: "2020", format: "0.75 L", type: "Red", region: "Piemonte", appellation: "Barolo", target_price: "50", offer_price: "45", investment_amount: null, ai_market_price: "", ai_market_price_currency: "CHF", currency: "CHF", merchant: "Enoteca", priority: "High", purpose: "Drink", status: "Wishlist", notes: "", ai_context_note: "", ai_strategy: "", ai_purpose_advice: "" };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url, location.origin);
      if (init?.method === "POST" && url.pathname.includes("/wishlist")) {
        const writes = JSON.parse(sessionStorage.getItem("wishlist-writes") || "[]");
        sessionStorage.setItem("wishlist-writes", JSON.stringify([...writes, { path: url.pathname, body: JSON.parse(String(init.body || "{}")) }]));
        return new Response(JSON.stringify({ ...item, wine_id: "wine-e2e-1" }));
      }
      if (url.pathname === "/api/v1/wishlist/lists") return new Response(JSON.stringify([{ id: "list-1", household_id: "household-e2e", name: "Da scoprire", item_count: empty ? 0 : 1, description: "", portfolio_strategy: null }]));
      if (url.pathname === "/api/v1/wishlist") return new Response(JSON.stringify(empty ? [] : [item]));
      return original(input, init);
    };
  }, { empty });
  await page.goto("/");
  if (width < 1100) await page.getByRole("navigation", { name: english ? "Main navigation" : "Navigazione principale" }).getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: /^Wishlist/ }).first().click();
}

for (const width of [360, 390, 430, 1440]) {
  test(`wishlist guided choices and purchase flow ${width}`, async ({ page }, testInfo) => {
    await openWishlist(page, width);
    const overview = page.getByRole("region", { name: "La tua wishlist" });
    await expect(overview.getByRole("heading", { name: "Vini da scoprire e da scegliere" })).toBeVisible();
    await expect(overview.getByRole("button", { name: "Crea lista", exact: true })).toBeHidden();
    const actions = overview.locator(".wishlist-start-actions > button");
    let previousBottom = 0;
    for (const action of await actions.all()) {
      const box = (await action.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(44);
      if (width < 1100) expect(box.y).toBeGreaterThanOrEqual(previousBottom);
      previousBottom = box.y + box.height;
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator(".wishlist-portfolio-panel")).toHaveCount(0);
    const prices = (await page.locator(".wishlist-row > .wishlist-price-block").boundingBox())!;
    const controls = (await page.locator(".wishlist-row-actions").boundingBox())!;
    expect(controls.y).toBeGreaterThanOrEqual(prices.y + prices.height);
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({ path: testInfo.outputPath("wishlist-overview.png"), fullPage: true });
    if (width === 390) {
      await snapshotChrome(page, false);
      await expect(overview).toHaveScreenshot("wishlist-overview-compact.png", { animations: "disabled" });
      await snapshotChrome(page, true);
    }
    await overview.getByRole("button", { name: /Valuta un’offerta/ }).click();
    const form = page.locator(".wishlist-editor-form");
    await expect(form.getByText(/Inserisci il vino, l’annata e il prezzo offerto/)).toBeVisible();
    await form.getByRole("button", { name: "Annulla", exact: true }).click();
    await overview.getByRole("button", { name: /Salva un vino/ }).click();
    await expect(form.getByText(/Salva un vino da ricordare o provare/)).toBeVisible();
    await form.getByRole("button", { name: "Annulla", exact: true }).click();
    await overview.getByRole("button", { name: /Pianifica gli acquisti/ }).click();
    await expect(page.getByLabel("Considera il mio profilo di gusto").filter({ visible: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("wishlist-writes"))).toBeNull();
    const row = page.locator(".wishlist-row");
    await row.getByRole("button", { name: "Registra acquisto", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Barolo da scoprire" });
    await expect(dialog.getByText(/quante bottiglie acquistate/)).toBeVisible();
    await dialog.getByRole("spinbutton").fill("2");
    await dialog.getByRole("button", { name: "Aggiungi in cantina", exact: true }).click();
    const writes = await page.evaluate(() => JSON.parse(sessionStorage.getItem("wishlist-writes") || "[]"));
    expect(writes).toEqual([{ path: "/api/v1/wishlist/wish-1/convert", body: { quantity: 2 } }]);
  });
}

test("wishlist explains the empty state and read-only access in English", async ({ page }) => {
  await openWishlist(page, 390, true, true, true);
  const overview = page.getByRole("region", { name: "Your wishlist" });
  await expect(overview.getByRole("button", { name: /Save a wine/ })).toBeDisabled();
  await expect(overview.getByRole("button", { name: /Evaluate an offer/ })).toBeDisabled();
  await expect(overview.getByRole("button", { name: /Plan your purchases/ })).toBeDisabled();
});

test("wishlist tasting records experience without purchasing stock", async ({ page }, testInfo) => {
  await openWishlist(page, 390);
  await page.locator(".wishlist-row").getByRole("heading", { name: /Barolo da scoprire/ }).click();
  const detail = page.getByRole("dialog", { name: "Barolo da scoprire" });
  await expect(detail.getByRole("button", { name: "Analizza offerta", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Consiglio su questo vino", exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Ho assaggiato", exact: true }).click();
  await detail.getByLabel("Occasione", { exact: true }).fill("Cena con amici");
  await page.screenshot({ path: testInfo.outputPath("wishlist-tasting.png"), fullPage: true });
  await detail.getByRole("button", { name: "Salva degustazione", exact: true }).click();
  const writes = await page.evaluate(() => JSON.parse(sessionStorage.getItem("wishlist-writes") || "[]"));
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe("/api/v1/wishlist/wish-1/tastings");
  expect(writes[0].body.tasting_occasion).toBe("Cena con amici");
});
