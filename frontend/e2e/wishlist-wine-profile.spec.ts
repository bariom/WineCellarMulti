import { expect, test, type Page } from "@playwright/test";
import { mockApi, session, memberships, wine } from "./fixtures/app";

const item = {
  id: "wish-1", household_id: "household-e2e", wishlist_list_id: "list-1", name: "Barolo Cannubi", producer: "Brezza", vintage: "2019",
  format: "0.75 L", type: "Red", region: "Piemonte", appellation: "Barolo DOCG", country: "Italia", wine_zone: "Langhe",
  grapes: [{ name: "Nebbiolo", percentage_from: 100, percentage_to: 100 }],
  grapes_source_url: "https://example.com/brezza-cannubi", grapes_source_title: "Brezza – Cannubi",
  ai_notes: "Barolo di Cannubi: floreale, austero, con tannini fini e lunga capacità di invecchiamento.",
  target_price: "70", offer_price: "64", investment_amount: null, ai_market_price: "", ai_market_price_currency: "CHF", currency: "CHF",
  merchant: "Enoteca", priority: "High", purpose: "Cellar", status: "Wishlist", notes: "", ai_context_note: "", ai_strategy: "", ai_purpose_advice: "",
};

async function openWishlist(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
  await mockApi(page, [], true, memberships, [wine], { ...session, membership_role: "owner", locale: "it" });
  await page.addInitScript((item) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url, location.origin);
      if (url.pathname === "/api/v1/taste-profile/wishlist/wish-1/sensory") {
        return new Response(JSON.stringify({ dimensions: { body: 0.75, acidity: 0.7, tannin: 0.9, sweetness: 0.05, aromatic_intensity: 0.7, fruit: 0.6, wood: 0.4, spice: 0.5, minerality: 0.5 }, source: "grape", confidence: 0.6, validated: false, generation_status: "available", estimated: true }));
      }
      if (url.pathname.startsWith("/api/v1/wishlist") && (init?.method === "PATCH" || init?.method === "POST") && !url.pathname.includes("/lists")) {
        sessionStorage.setItem("wishlist-saved", String(init.body || "{}"));
        return new Response(JSON.stringify(item));
      }
      if (url.pathname === "/api/v1/wishlist/lists") return new Response(JSON.stringify([{ id: "list-1", household_id: "household-e2e", name: "Da scoprire", item_count: 1, description: "", portfolio_strategy: null }]));
      if (url.pathname === "/api/v1/wishlist") return new Response(JSON.stringify([item]));
      return original(input, init);
    };
  }, item);
  await page.goto("/");
  if (width < 1100) await page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: /^Wishlist/ }).first().click();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

for (const width of [360, 390, 430]) {
  test(`wishlist wine card shows grapes, origin, description and sensory signature at ${width}px`, async ({ page }, testInfo) => {
    await openWishlist(page, width);
    await page.locator(".wishlist-row").getByRole("heading", { name: /Barolo Cannubi/ }).click();
    const detail = page.getByRole("dialog", { name: "Barolo Cannubi" });
    const profile = detail.getByRole("region", { name: "Profilo del vino" });
    await expect(profile.getByText("Nebbiolo 100%", { exact: true })).toBeVisible();
    await expect(profile.getByRole("link", { name: /Fonte verificata: Brezza/ })).toHaveAttribute("href", "https://example.com/brezza-cannubi");
    await expect(profile.getByText("Langhe", { exact: true })).toBeVisible();
    await expect(profile.getByText(/floreale, austero/)).toBeVisible();
    await expect(detail.getByRole("button", { name: "Uve", exact: true })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Note AI", exact: true })).toBeVisible();
    const signature = detail.getByRole("region", { name: "Impronta sensoriale" });
    await expect(signature.getByText("Stima indicativa dai vitigni", { exact: false })).toBeVisible();
    await expect(signature.getByText("9 / 10", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await profile.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`wishlist-profile-${width}.png`) });
    await signature.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`wishlist-sensory-${width}.png`) });
  });
}

test("wishlist form edits the blend and the origin and saves them", async ({ page }, testInfo) => {
  await openWishlist(page, 390);
  await page.locator(".wishlist-row").getByRole("button", { name: "Modifica", exact: true }).click();
  const form = page.locator(".wishlist-editor-form");
  await expect(form.getByRole("textbox", { name: "Zona vitivinicola" })).toHaveValue("Langhe");
  await expect(form.getByRole("textbox", { name: "Uva", exact: true }).first()).toHaveValue("Nebbiolo");
  await form.getByRole("button", { name: "Aggiungi vitigno" }).click();
  await form.getByRole("textbox", { name: "Uva", exact: true }).nth(1).fill("Barbera");
  await form.getByRole("spinbutton", { name: "Da %", exact: true }).first().fill("90");
  await form.getByRole("spinbutton", { name: "A %", exact: true }).first().fill("90");
  await form.getByRole("spinbutton", { name: "Da %", exact: true }).nth(1).fill("10");
  await form.getByRole("textbox", { name: "Paese" }).fill("Italia");
  const grapes = form.locator(".wishlist-grapes-editor");
  await grapes.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("wishlist-grapes-form-390.png") });
  await form.getByRole("button", { name: "Salva modifiche", exact: true }).click();
  await expect(form).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("wishlist-saved") || "null"));
  expect(saved.grapes).toEqual([
    { name: "Nebbiolo", percentage_from: 90, percentage_to: 90 },
    { name: "Barbera", percentage_from: 10 },
  ]);
  expect(saved.country).toBe("Italia");
  expect(saved.wine_zone).toBe("Langhe");
  expect(saved).not.toHaveProperty("grapes_source_url");
});
