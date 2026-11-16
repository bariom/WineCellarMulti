import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

// Six bottles, half of them a friend's.
const shared = {
  ...wine,
  id: "wine-shared",
  name: "Barolo Condiviso",
  quantity: 6,
  current_value: "60.00",
  owners: [
    { name: "E2E User", email: "e2e@example.test", share_pct: 50 },
    { name: "Amico", email: "friend@example.test", share_pct: 50 },
  ],
};

const movement = (id: string, wineId: string, name: string, type: string, quantity: number, occurred_on: string, note = "") => ({
  id, wine_id: wineId, wine_name: name, wine_producer: "Cantina Vinaris", wine_vintage: "2019", lot_id: null, sale_id: null,
  movement_type: type, quantity_delta: -quantity, unit_cost: "42.00", total_cost: String(42 * quantity), currency: "CHF",
  occurred_on, supplier: "", reference: "", note, created_at: `${occurred_on}T10:00:00Z`,
});

const recent = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);

/** Answer the movement list with `items` and keep the body of every movement posted. */
async function stockMovements(page: Page, items: unknown[]) {
  await page.addInitScript((list) => {
    const mocked = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/v1/inventory/movements")) {
        if (init?.method === "POST") {
          const posted = JSON.parse(sessionStorage.getItem("posted-movements") || "[]");
          sessionStorage.setItem("posted-movements", JSON.stringify([...posted, JSON.parse(String(init.body))]));
          return Promise.resolve(Response.json([], { status: 201 }));
        }
        return Promise.resolve(Response.json(list));
      }
      return mocked(input, init);
    };
  }, items);
}

const posted = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("posted-movements") || "[]"));

async function openWine(page: Page, wineId: string) {
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator(`[data-wine-row-id="${wineId}"] article`).click();
  await page.getByRole("button", { name: "Altra uscita", exact: true }).click();
}

test("the wine detail records a bottle given away, broken or faulty", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine]);
  await stockMovements(page, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  // Drink and sale stay the only two main actions, once each.
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator(`[data-wine-row-id="${wine.id}"] article`).click();
  await expect(page.getByRole("button", { name: "Registra bevuta", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Registra vendita", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Altra uscita", exact: true }).click();
  const panel = page.locator(".other-exit-panel:visible");
  await expect(panel).toBeVisible();
  // Without co-owners there is nobody to take bottles away.
  await expect(panel.getByRole("radio", { name: "Ritirata dal comproprietario" })).toHaveCount(0);
  await panel.getByRole("radio", { name: "Difettosa" }).check();
  await expect(panel).toContainText("Tappo, ossidata");
  await panel.getByLabel("Nota").fill("Sapeva di tappo");
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    const box = (await panel.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await panel.screenshot({ path: testInfo.outputPath(`other-exit-${width}.png`) });
  }
  await panel.getByRole("button", { name: "Registra uscita" }).click();
  await expect(panel.getByRole("status")).toContainText("registrata come «difettosa»");
  expect(await posted(page)).toEqual([expect.objectContaining({ wine_id: wine.id, movement_type: "defective", quantity: 1, note: "Sapeva di tappo", co_owner_email: "" })]);
});

test("a co-owner takes their bottles, at most their share", async ({ page }) => {
  await mockApi(page, [], false, memberships, [shared]);
  await stockMovements(page, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openWine(page, shared.id);
  const panel = page.locator(".other-exit-panel:visible");
  await panel.getByRole("radio", { name: "Ritirata dal comproprietario" }).check();
  await expect(panel).toContainText("Amico può ritirare al massimo 3 bottiglie");
  await expect(panel.getByRole("spinbutton", { name: "Bottiglie" })).toHaveAttribute("max", "3");
  await panel.getByRole("spinbutton", { name: "Bottiglie" }).fill("3");
  await panel.getByRole("button", { name: "Registra uscita" }).click();
  await expect(panel.getByRole("status")).toBeVisible();
  expect(await posted(page)).toEqual([expect.objectContaining({ movement_type: "co_owner_withdrawal", quantity: 3, co_owner_email: "friend@example.test", co_owner_name: "Amico" })]);
});

test("the diary lists the exits and the value page counts the losses", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine, shared], { ...session, dashboard_focus: "value" });
  await stockMovements(page, [
    movement("m1", wine.id, wine.name, "breakage", 1, recent, "Caduta dallo scaffale"),
    movement("m2", shared.id, shared.name, "defective", 2, recent),
    movement("m3", wine.id, wine.name, "complimentary", 1, recent, "Per Marco"),
    movement("m4", wine.id, wine.name, "consumption", 1, recent),
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  // Losses: one broken bottle at 48 (all mine) and two faulty at 60, half mine: 48 + 60.
  const losses = page.locator(".value-losses");
  await expect(losses).toContainText("Perdite negli ultimi 12 mesi");
  await expect(losses).toContainText(/108/);
  await expect(losses).toContainText("3 bottiglie rotte o difettose");
  await losses.click();
  const exits = page.getByRole("region", { name: "Uscite" });
  await expect(page.getByRole("tab", { name: "Uscite" })).toHaveAttribute("aria-selected", "true");
  await expect(exits.locator(".diary-exits-list li")).toHaveCount(3);
  await expect(exits).toContainText("Per Marco");
  await expect(exits).not.toContainText("Bevuta");
  await exits.getByRole("button", { name: /^Rotta/ }).click();
  await expect(exits.locator(".diary-exits-list li")).toHaveCount(1);
  await expect(exits).toContainText("Caduta dallo scaffale");
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await exits.screenshot({ path: testInfo.outputPath(`diary-exits-${width}.png`) });
  }
});

test("a wine received as a gift has no purchase price", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator(`[data-wine-row-id="${wine.id}"] article`).click();
  await page.getByRole("button", { name: "Modifica", exact: true }).last().click();
  await page.locator('[data-wine-editor-section="value"] .wine-editor-disclosure-toggle').click();
  const gift = page.getByRole("checkbox", { name: "Ricevuta in regalo" });
  await gift.scrollIntoViewIfNeeded();
  const price = page.getByRole("spinbutton", { name: "Prezzo acquisto" });
  await expect(gift).not.toBeChecked();
  await gift.check();
  await expect(price).toHaveValue("0.01");
  await expect(price).toBeDisabled();
  await gift.uncheck();
  await expect(price).toHaveValue("");
  await expect(price).toBeEnabled();
});
