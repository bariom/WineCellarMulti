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

test("the value dashboard separates the bottles awaiting delivery and the en primeur capital", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine, primeur], { ...session, dashboard_focus: "value" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const split = page.getByRole("group", { name: "Valore per disponibilità" });
  await expect(split).toContainText("In cantina");
  await expect(split).toContainText("4 bottiglie");
  await expect(split).toContainText("In arrivo");
  await expect(split).toContainText("6 bottiglie");
  const capital = split.locator(".portfolio-value-primeur");
  await expect(capital).toContainText("Capitale en primeur in arrivo");
  await expect(capital.locator("dd").nth(0)).toHaveText(/540/);
  await expect(capital.locator("dd").nth(1)).toHaveText(/660/);
  await expect(capital.locator("dd").nth(2)).toHaveText(/^\+.*120.*\+22\.2%$/);
  // My shares: the whole wine already in the cellar, half of the en primeur purchase.
  const mine = page.getByRole("group", { name: "Le mie quote" });
  await expect(mine.getByRole("heading", { name: "Le mie quote" })).toBeVisible();
  await expect(mine).toContainText("4 bottiglie");
  await expect(mine).toContainText("3 bottiglie");
  const myCapital = mine.locator(".portfolio-value-primeur");
  await expect(myCapital.locator("dd").nth(0)).toHaveText(/270/);
  await expect(myCapital.locator("dd").nth(1)).toHaveText(/330/);
  await expect(myCapital.locator("dd").nth(2)).toHaveText(/^\+.*60.*\+22\.2%$/);
  const sections = page.locator(".portfolio-value-split-sections");
  // The headline value is the user's own (192 + 330); the overall one includes the friend's half.
  const headline = page.locator(".portfolio-value-explorer .card-heading");
  await expect(headline.locator("h2")).toHaveText(/522/);
  await expect(headline.locator(".portfolio-value-overall")).toHaveText(/Complessivo con i comproprietari: .*852.* · 10 bottiglie/);
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await sections.scrollIntoViewIfNeeded();
    const box = (await sections.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await sections.screenshot({ path: testInfo.outputPath(`value-split-${width}.png`) });
    await headline.screenshot({ path: testInfo.outputPath(`value-headline-${width}.png`) });
  }
});

test("the value dashboard shows no split when every bottle is in the cellar", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, dashboard_focus: "value" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".portfolio-value-explorer")).toBeVisible();
  await expect(page.locator(".portfolio-value-split")).toHaveCount(0);
});

test("the shares section stays hidden when nothing is co-owned", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine, { ...primeur, owners: [] }], { ...session, dashboard_focus: "value" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("group", { name: "Valore per disponibilità" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Le mie quote" })).toHaveCount(0);
  await expect(page.locator(".portfolio-value-overall")).toHaveCount(0);
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
