import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

// Six bottles bought en primeur, paid 90 and now worth 110 each, still to be delivered,
// half of them owned by a friend.
const primeur = {
  ...wine,
  id: "wine-primeur",
  name: "Pichon Baron",
  vintage: "2024",
  quantity: 6,
  price: "90.00",
  current_value: "110.00",
  status: "Ordered",
  en_primeur: true,
  owners: [
    { name: "E2E User", email: "e2e@example.test", share_pct: 50 },
    { name: "Amico", email: "friend@example.test", share_pct: 50 },
  ],
};

test("the value page shows where the value sits, on the user's shares or overall", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine, primeur], { ...session, dashboard_focus: "value" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // The headline is the user's own (192 + 330); the overall one includes the friend's half.
  const headline = page.locator(".hero-panel .hero-kpi").first();
  await expect(headline.locator(":scope > strong")).toHaveText(/522/);
  await expect(headline).toContainText(/con i comproprietari .*852/);
  const where = page.getByRole("region", { name: "Dove si trova il valore" });
  const cards = where.locator(".value-where-cards");
  const capital = where.locator(".value-primeur");
  // My shares by default: the whole wine already in the cellar, half of the en primeur purchase.
  await expect(where.getByRole("button", { name: "Mie quote" })).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toContainText("4 bottiglie");
  await expect(cards).toContainText("3 bottiglie");
  await expect(capital).toContainText("Capitale en primeur in arrivo");
  await expect(capital.locator(".value-primeur-body strong").nth(0)).toHaveText(/270/);
  await expect(capital.locator(".value-primeur-body strong").nth(1)).toHaveText(/330/);
  await expect(capital.locator(".value-primeur-body b")).toHaveText(/^\+.*60.*\+22\.2%$/);
  // Overall: the friend's bottles join in.
  await where.getByRole("button", { name: "Complessivo" }).click();
  await expect(cards).toContainText("6 bottiglie");
  await expect(capital.locator(".value-primeur-body strong").nth(0)).toHaveText(/540/);
  await expect(capital.locator(".value-primeur-body strong").nth(1)).toHaveText(/660/);
  await expect(capital.locator(".value-primeur-body b")).toHaveText(/^\+.*120.*\+22\.2%$/);
  // The value by type counts the user's shares: both wines are red, 192 + 330.
  const composition = page.getByRole("region", { name: "Come si compone" });
  await expect(composition).toContainText(/522/);
  await expect(composition).not.toContainText(/852/);
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const section of [where, composition]) {
      await section.scrollIntoViewIfNeeded();
      const box = (await section.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`value-page-${width}.png`), fullPage: true, animations: "disabled" });
  }
});

test("the composition switches between type, region and producer", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine, primeur], { ...session, dashboard_focus: "value" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const composition = page.getByRole("region", { name: "Come si compone" });
  await composition.getByRole("tab", { name: "Produttore" }).click();
  await expect(composition.locator(".value-ranking li")).toHaveCount(1);
  await expect(composition.locator(".value-ranking")).toContainText("Cantina Vinaris");
  await composition.getByRole("tab", { name: "Regione" }).click();
  await composition.locator(".value-ranking button").first().click();
  await expect(page.locator(".value-composition")).toHaveCount(0);
  await expect(page.getByText("“Piemonte”")).toBeVisible();
});

test("the value page has no basis switch when nothing is co-owned", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine, { ...primeur, owners: [] }], { ...session, dashboard_focus: "value" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const where = page.getByRole("region", { name: "Dove si trova il valore" });
  await expect(where).toBeVisible();
  await expect(where.getByRole("button", { name: "Complessivo" })).toHaveCount(0);
  await expect(page.locator(".hero-panel .hero-kpi").first()).not.toContainText("comproprietari");
});

test("the wine editor saves the en primeur flag", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine, primeur]);
  // Keep the body of the wine update sent by the editor.
  await page.addInitScript(() => {
    const mocked = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (init?.method === "PATCH" && url.includes("/api/v1/wines/wine-primeur")) sessionStorage.setItem("en-primeur-update", String(init.body));
      return mocked(input, init);
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator('[data-wine-row-id="wine-primeur"] article').click();
  await expect(page.getByText("En primeur", { exact: true }).first()).toBeAttached();
  await page.getByRole("button", { name: "Modifica", exact: true }).last().click();
  await page.locator('[data-wine-editor-section="stock"] .wine-editor-disclosure-toggle').click();
  const flag = page.getByRole("checkbox", { name: "Acquisto en primeur" });
  await expect(flag).toBeChecked();
  await flag.uncheck();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await flag.scrollIntoViewIfNeeded();
    const box = (await page.locator(".wine-en-primeur-toggle").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`) });
  }
  await page.getByRole("button", { name: "Salva modifiche", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("en-primeur-update") || "{}").en_primeur)).toBe(false);
});
