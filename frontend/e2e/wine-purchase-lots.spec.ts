import { expect, test } from "@playwright/test";
import { mockApi, wine, session, memberships } from "./fixtures/app";
test.setTimeout(30000);

for (const mode of ["personal", "restaurant"] as const) {
  test(`wine editor records a separate purchase and preserves stock in ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], false, memberships, [wine], { ...session, active_household_mode: mode });
    await page.addInitScript(fixture => {
      const original = window.fetch.bind(window);
      let currentWine = { ...fixture };
      const lots = [{ id: "lot-one", wine_id: fixture.id, wine_name: fixture.name, acquired_on: "2026-07-01", quantity_received: 4, quantity_remaining: 4, unit_cost: "30", total_remaining_cost: "120", currency: "CHF", supplier: "Primo acquisto", reference: "", note: "", created_at: "2026-07-01" }];
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      window.fetch = async (input, init) => {
        const url = new URL(String(input), location.origin);
        const method = init?.method || "GET";
        if (url.pathname === "/api/v1/inventory/lots") return json(lots);
        if (url.pathname === "/api/v1/inventory/movements" && method === "POST") {
          const payload = JSON.parse(String(init?.body));
          const attempts = JSON.parse(sessionStorage.getItem("lot-attempts") || "[]");
          sessionStorage.setItem("lot-attempts", JSON.stringify([...attempts, payload]));
          if (sessionStorage.getItem("lot-reject")) return json({ detail: "Acquisto non disponibile" }, 503);
          lots.push({ ...lots[0], id: "lot-two", acquired_on: payload.occurred_on, quantity_received: payload.quantity, quantity_remaining: payload.quantity, unit_cost: String(payload.unit_cost), total_remaining_cost: String(payload.quantity * payload.unit_cost), supplier: payload.supplier });
          currentWine = { ...currentWine, quantity: currentWine.quantity + payload.quantity };
          return json([], 201);
        }
        if (url.pathname === "/api/v1/wines") return json([currentWine]);
        if (url.pathname === `/api/v1/wines/${fixture.id}`) {
          if (method === "PATCH") {
            const payload = JSON.parse(String(init?.body));
            sessionStorage.setItem("lot-wine-update", JSON.stringify(payload));
            currentWine = { ...currentWine, ...payload };
          }
          return json(currentWine);
        }
        return original(input, init);
      };
    }, wine);
    await page.goto("/");
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
    await page.getByRole("button", { name: "Modifica selezionato" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const editor = page.locator(".wine-editor-form");
    await editor.getByRole("button", { name: /Giacenza e acquisti/ }).click();
    await editor.getByLabel("Data ordine", { exact: true }).fill("2026-06-01");
    const lots = editor.getByRole("region", { name: "Lotti d'acquisto" });
    await expect(lots.getByText("Primo acquisto", { exact: false })).toBeVisible();
    await lots.getByRole("button", { name: "Registra nuovo acquisto", exact: true }).click();
    await lots.getByLabel("Bottiglie acquistate").fill("2");
    await lots.getByLabel("Prezzo per bottiglia (CHF)").fill("45");
    await lots.getByLabel("Data acquisto", { exact: true }).fill("2026-10-02");
    await lots.getByLabel("Commerciante", { exact: true }).fill("Secondo acquisto");
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      const panel = (await lots.boundingBox())!;
      const button = (await lots.getByRole("button", { name: "Conferma acquisto", exact: true }).boundingBox())!;
      expect(button.x).toBeGreaterThanOrEqual(panel.x);
      expect(button.x + button.width).toBeLessThanOrEqual(panel.x + panel.width);
      const storage = (await lots.getByLabel("Location", { exact: true }).boundingBox())!;
      expect(button.y).toBeGreaterThanOrEqual(storage.y + storage.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 1440) {
        await lots.getByRole("heading", { name: "Lotti d'acquisto" }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`purchase-form-${mode}-desktop.png`) });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await lots.getByRole("button", { name: "Conferma acquisto", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`purchase-form-bottom-${mode}-390.png`) });
    await lots.getByRole("heading", { name: "Lotti d'acquisto" }).scrollIntoViewIfNeeded();
    await lots.screenshot({ path: testInfo.outputPath(`purchase-form-${mode}-390.png`) });
    await page.evaluate(() => sessionStorage.setItem("lot-reject", "1"));
    await lots.getByRole("button", { name: "Conferma acquisto", exact: true }).click();
    await expect(lots.getByRole("alert")).toContainText("Acquisto non disponibile");
    await expect(lots.getByLabel("Bottiglie acquistate")).toHaveValue("2");
    expect(await page.evaluate(() => sessionStorage.getItem("lot-wine-update"))).toBeNull();
    await page.evaluate(() => sessionStorage.removeItem("lot-reject"));
    await lots.getByLabel("Commerciante", { exact: true }).press("Enter");
    await expect(lots.getByRole("status")).toContainText("Acquisto registrato");
    await expect(lots.getByText("Secondo acquisto", { exact: false })).toBeVisible();
    await expect(lots.getByText(/2\/2 bott.*45/)).toBeVisible();
    await expect(lots.getByText(/4\/4 bott.*30/)).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("lot-wine-update"))).toBeNull();
    await lots.getByRole("heading", { name: "Lotti d'acquisto" }).scrollIntoViewIfNeeded();
    await lots.screenshot({ path: testInfo.outputPath(`purchase-lots-${mode}-390.png`) });
    if (mode === "personal") await expect(lots).toHaveScreenshot("purchase-lots-compact.png");
    // Opening another empty purchase must not make the wine form invalid.
    await lots.getByRole("button", { name: "Registra nuovo acquisto", exact: true }).click();
    const save = editor.getByRole("button", { name: "Salva modifiche", exact: true });
    await save.click();
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("lot-wine-update") || "null")?.quantity)).toBe(6);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("lot-wine-update") || "{}").order_date)).toBe("2026-06-01");
    const attempts = await page.evaluate(() => JSON.parse(sessionStorage.getItem("lot-attempts") || "[]"));
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toMatchObject({ wine_id: wine.id, movement_type: "purchase", quantity: 2, unit_cost: 45, occurred_on: "2026-10-02", supplier: "Secondo acquisto" });
    await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
    const detail = page.locator(".wine-detail:visible").first();
    await detail.locator("summary").filter({ hasText: "Giacenza e acquisti" }).click();
    const detailLots = detail.getByRole("region", { name: "Lotti d'acquisto" });
    await expect(detailLots.getByText("Secondo acquisto", { exact: false })).toBeVisible();
    await expect(detailLots.getByRole("button", { name: "Registra nuovo acquisto", exact: true })).toBeVisible();
    await detailLots.screenshot({ path: testInfo.outputPath(`detail-lots-${mode}-390.png`) });
  });
}

test("a mistaken purchase lot can be corrected and deleted from the wine editor", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], false, memberships, [{ ...wine, quantity: 2 }], session);
  await page.addInitScript(fixture => {
    const original = window.fetch.bind(window);
    const base = { wine_id: fixture.id, wine_name: fixture.name, currency: "CHF", reference: "", note: "", created_at: "2026-05-12" };
    let lots = [
      { ...base, id: "lot-real", acquired_on: "2026-05-12", quantity_received: 2, quantity_remaining: 2, unit_cost: "160", total_remaining_cost: "320", supplier: "Caveau 99" },
      { ...base, id: "lot-wrong", acquired_on: "2026-09-10", quantity_received: 1, quantity_remaining: 1, unit_cost: "160", total_remaining_cost: "160", supplier: "" },
    ];
    const record = (key: string, value: unknown) => sessionStorage.setItem(key, JSON.stringify([...JSON.parse(sessionStorage.getItem(key) || "[]"), value]));
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.origin);
      const method = init?.method || "GET";
      if (url.pathname === "/api/v1/inventory/lots") return json(lots);
      const lotId = url.pathname.match(/^\/api\/v1\/inventory\/lots\/([\w-]+)$/)?.[1];
      if (lotId && method === "PATCH") {
        const payload = JSON.parse(String(init?.body));
        record("lot-patches", { lotId, ...payload });
        lots = lots.map(lot => lot.id === lotId ? { ...lot, ...payload, unit_cost: String(payload.unit_cost) } : lot);
        return json(lots.find(lot => lot.id === lotId));
      }
      if (lotId && method === "DELETE") {
        record("lot-deletes", lotId);
        lots = lots.filter(lot => lot.id !== lotId);
        return json({ wine_quantity: 2, quantity_removed: 0 });
      }
      if (url.pathname === `/api/v1/wines/${fixture.id}` && method === "PATCH") {
        sessionStorage.setItem("lot-wine-update", String(init?.body));
        return json({ ...fixture, ...JSON.parse(String(init?.body)) });
      }
      return original(input, init);
    };
  }, { ...wine, quantity: 2 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
  await page.getByRole("button", { name: "Modifica selezionato" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const editor = page.locator(".wine-editor-form");
  await editor.getByRole("button", { name: /Giacenza e acquisti/ }).click();
  const lots = editor.getByRole("region", { name: "Lotti d'acquisto" });
  await expect(lots.getByText(/1\/1 bott/)).toBeVisible();

  await lots.getByRole("button", { name: "Correggi il lotto del 10/09/2026", exact: true }).click();
  const correction = lots.getByRole("group", { name: "Correzione del lotto del 10/09/2026" });
  await correction.getByLabel("Commerciante del lotto", { exact: true }).fill("Arvi");
  await correction.getByLabel("Data acquisto del lotto", { exact: true }).fill("12/09/2026");
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await correction.screenshot({ path: testInfo.outputPath("lot-correction-390.png") });
  await correction.getByRole("button", { name: "Salva correzione", exact: true }).click();
  await expect(lots.getByRole("status")).toContainText("Lotto corretto");
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("lot-patches") || "[]"))).toEqual([
    { lotId: "lot-wrong", acquired_on: "2026-09-12", unit_cost: 160, supplier: "Arvi" },
  ]);

  // Deleting asks for a confirmation first.
  await lots.getByRole("button", { name: "Correggi il lotto del 12/09/2026", exact: true }).click();
  await lots.getByRole("button", { name: "Elimina lotto", exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("lot-deletes"))).toBeNull();
  await lots.getByRole("button", { name: "Conferma eliminazione", exact: true }).click();
  await expect(lots.getByRole("status")).toContainText("La giacenza del vino non cambia");
  await expect(lots.getByText(/1\/1 bott/)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("lot-deletes") || "[]"))).toEqual(["lot-wrong"]);
  await lots.screenshot({ path: testInfo.outputPath("lots-after-delete-390.png") });

  // Saving the wine afterwards keeps the two bottles.
  await editor.getByRole("button", { name: "Salva modifiche", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("lot-wine-update") || "null")?.quantity)).toBe(2);
});
