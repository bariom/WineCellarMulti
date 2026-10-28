import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine, openSommelierFeature } from "./fixtures/app";

for (const entry of ["cellar row", "wine detail"] as const) {
  test(`a selected wine from ${entry} skips location even after restaurant pairing`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], true, memberships, [wine], session);
    await page.addInitScript(() => {
      const previous = window.fetch;
      window.fetch = async (input, init) => {
        if (new URL(String(input), location.href).pathname === "/api/v1/ai/settings") {
          const response = await previous(input, init);
          return Response.json({ ...await response.json(), pairing_model: "test-model" });
        }
        if (new URL(String(input), location.href).pathname === "/api/v1/ai/pairing" && init?.method === "POST") {
          sessionStorage.setItem("pairing-request", String(init.body));
          return Response.json({ summary: "Piatti per il vino scelto", model: "test-model", reasoning_effort: "low", cellar_matches: [], market_recommendations: {}, dish_recommendations: [{ name: "Risotto ai funghi", description: "Risotto", why_it_works: "Equilibrio", dietary_note: "" }], estimated_cost_usd: "0" });
        }
        return previous(input, init);
      };
    });
    await page.goto("/");
    // The Sommelier AI page starts the restaurant path directly.
    await openSommelierFeature(page, /^Al ristorante/);
    await expect(page.getByRole("heading", { name: "Come vuoi scegliere il vino?" })).toBeVisible();
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    const row = page.locator(`[data-wine-row-id="${wine.id}"]`);
    if (entry === "wine detail") {
      await row.locator("article").click();
      const detail = page.locator(".wine-detail:visible").first();
      await detail.locator(".wine-ai-tools > summary").click();
      await detail.getByRole("button", { name: "Abbinamento", exact: true }).click();
    } else {
      await row.getByRole("button", { name: "Abbinamento", exact: true }).click();
    }
    const pairing = page.locator(".pairing-card");
    await expect(pairing.getByText("Piatti per questo vino", { exact: true })).toBeVisible();
    await expect(pairing.getByText(wine.name, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dove sei?", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Come vuoi scegliere il vino?" })).toHaveCount(0);
    for (const [width, height] of [[360, 800], [390, 844], [430, 932], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await expect(pairing.getByText("Piatti per questo vino", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath("wine-pairing-compact.png"), fullPage: true });
    }
    await pairing.getByRole("button", { name: "Trova abbinamento", exact: true }).click();
    await expect(pairing.getByText("Risotto ai funghi", { exact: true }).first()).toBeVisible();
    const request = await page.evaluate(() => JSON.parse(sessionStorage.getItem("pairing-request") || "null"));
    expect(request).toMatchObject({ target_wine_id: wine.id, market_only: false, prefer_local_wines: false, local_origin: "" });
    await pairing.getByRole("button", { name: "Scegli un piatto invece", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dove sei?", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^A casa/ }).click();
    await expect(pairing.getByRole("textbox", { name: /Piatto o pietanza/ })).toBeVisible();
  });
}

test("a multi-page restaurant wine list can be scanned and questioned", async ({ page }, testInfo) => {
  // Reach Sommelier AI through the desktop menu, then work at phone width.
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], true, memberships, [wine], session);
  await page.addInitScript(() => {
    const previous = window.fetch;
    const wines = [
      { name: "Barolo", producer: "Cantina A", vintage: "2019", price_text: "CHF 78", style: "Rosso" },
      { name: "Soave Classico", producer: "Cantina B", vintage: "2022", price_text: "CHF 42", style: "Bianco" },
      { name: "Moscato d'Asti", producer: "Cantina C", vintage: "2023", price_text: "CHF 36", style: "Dolce" },
    ];
    window.fetch = async (input, init) => {
      const path = new URL(String(input), location.href).pathname;
      if (path === "/api/v1/ai/restaurant-wine-list/scan" && init?.method === "POST") {
        sessionStorage.setItem("scan-pages", String((init.body as FormData).getAll("images").length));
        return Response.json({
          summary: "Carta letta su due pagine.", extracted_text: "Barolo 2019 CHF 78", wines, taste_profile_applied: true, model: "test-model", reasoning_effort: "low", estimated_cost_usd: "0.01",
          recommendations: [{ ...wines[0], reason: "Struttura.", serving_note: "", taste_affinity: 5 }, { ...wines[1], reason: "Freschezza.", serving_note: "", taste_affinity: 4 }],
        });
      }
      if (path === "/api/v1/ai/restaurant-wine-list/ask" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const requests = JSON.parse(sessionStorage.getItem("ask-requests") || "[]");
        sessionStorage.setItem("ask-requests", JSON.stringify([...requests, body]));
        return Response.json(requests.length
          ? { answer: "Con il dessert prendi il Moscato.", referenced_indexes: [2], taste_profile_applied: true, model: "test-model", reasoning_effort: "low", estimated_cost_usd: "0" }
          : { answer: "Il Barolo è più strutturato, il Soave più fresco.", referenced_indexes: [0, 1], taste_profile_applied: true, model: "test-model", reasoning_effort: "low", estimated_cost_usd: "0" });
      }
      return previous(input, init);
    };
  });
  await page.goto("/");
  await openSommelierFeature(page, /^Al ristorante/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Analizza una carta vini/ }).click();
  const photo = { mimeType: "image/jpeg", buffer: Buffer.from("jpeg") };
  await page.locator(".restaurant-wine-list-upload-button input").setInputFiles([{ name: "pagina-1.jpg", ...photo }, { name: "pagina-2.jpg", ...photo }]);
  const pages = page.getByRole("list", { name: "Pagine della carta" });
  await expect(pages.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Scatta un'altra pagina", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("restaurant-pages-390.png"), fullPage: true });
  await page.getByRole("button", { name: "Analizza carta vini", exact: true }).click();

  const chat = page.getByRole("region", { name: "Chiedi al sommelier" });
  await expect(chat).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("scan-pages"))).toBe("2");
  await chat.getByRole("button", { name: "Confronta le prime due scelte", exact: true }).click();
  await expect(chat.getByText("Il Barolo è più strutturato, il Soave più fresco.")).toBeVisible();
  await expect(chat.getByText("Barolo · 2019 · CHF 78", { exact: true })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Cosa abbino al dessert?" })).toHaveCount(0);
  await chat.getByRole("textbox", { name: "Domanda per il sommelier" }).fill("E con il dessert?");
  await chat.getByRole("button", { name: "Chiedi", exact: true }).click();
  await expect(chat.getByText("Con il dessert prendi il Moscato.")).toBeVisible();
  const requests = await page.evaluate(() => JSON.parse(sessionStorage.getItem("ask-requests") || "[]"));
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({ question: "Confronta le prime due scelte", history: [], ignore_preferences: false });
  expect(requests[0].wines).toHaveLength(3);
  expect(requests[1].history).toEqual([
    { role: "user", content: "Confronta le prime due scelte" },
    { role: "assistant", content: "Il Barolo è più strutturato, il Soave più fresco." },
  ]);
  for (const [width, height] of [[360, 800], [390, 844], [430, 932], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await chat.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390 || width === 1440) await chat.screenshot({ path: testInfo.outputPath(`restaurant-chat-${width}.png`) });
  }
});

test("restaurant picks with glass and bottle prices stay readable inside their cards", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], true, memberships, [wine], session);
  await page.addInitScript(() => {
    const previous = window.fetch;
    const chablis = { name: "AOC Chablis Réserve de Vaudon “Joseph Drouhin”", producer: "Joseph Drouhin", vintage: "", price_text: "Calice 1 dl CHF 13; bottiglia 0,75 l CHF 70", style: "Bianco; Chablis" };
    const rose = { name: "Pinot Nero Rosato", producer: "Cantina D", vintage: "2023", price_text: "CHF 58", style: "Rosato" };
    window.fetch = async (input, init) => {
      const path = new URL(String(input), location.href).pathname;
      if (path === "/api/v1/ai/restaurant-wine-list/scan" && init?.method === "POST") {
        return Response.json({
          summary: "Trascrizione delle voci leggibili nelle due pagine nell’ordine fornito. Per l’insalata di legumi, le opzioni più adatte entro CHF 120 sono bianchi freschi e un rosato di Pinot Nero.",
          extracted_text: "Chablis", wines: [chablis, rose], taste_profile_applied: true, model: "gpt-6-luna", reasoning_effort: "low", estimated_cost_usd: "0.01",
          recommendations: [
            { ...chablis, reason: "Chablis: la freschezza e la sapidità possono accompagnare bene i legumi; bottiglia entro budget.", serving_note: "Servire il Chablis e il Pouilly-Fumé ben freschi.", taste_affinity: 3 },
            { ...rose, reason: "Rosato fragrante.", serving_note: "", taste_affinity: 4 },
          ],
        });
      }
      return previous(input, init);
    };
  });
  await page.goto("/");
  await openSommelierFeature(page, /^Al ristorante/);
  await page.getByRole("button", { name: /^Analizza una carta vini/ }).click();
  await page.locator(".restaurant-wine-list-upload-button input").setInputFiles([{ name: "carta.jpg", mimeType: "image/jpeg", buffer: Buffer.from("jpeg") }]);
  await page.getByRole("button", { name: "Analizza carta vini", exact: true }).click();
  const picks = page.locator(".restaurant-wine-list-recommendations");
  await expect(picks.getByText("AOC Chablis Réserve de Vaudon “Joseph Drouhin”", { exact: true })).toBeVisible();

  const inside = (inner: { x: number; width: number }, outer: { x: number; width: number }) => inner.x >= outer.x - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5;
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const [width, height] of [[360, 800], [390, 844], [430, 932], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const result = (await page.locator(".restaurant-wine-list-result").boundingBox())!;
    expect(result.x + result.width).toBeLessThanOrEqual(width);
    for (const paragraph of await page.locator(".restaurant-wine-list-result > p").all()) {
      expect(inside((await paragraph.boundingBox())!, result)).toBe(true);
    }
    const card = picks.locator("article").first();
    const cardBox = (await card.boundingBox())!;
    const name = (await card.locator(".restaurant-wine-list-recommendation-head strong").boundingBox())!;
    const price = (await card.locator(".restaurant-wine-list-recommendation-head > b").boundingBox())!;
    expect(overlap(name, price)).toBe(false);
    // The name keeps a readable measure instead of one word per line.
    expect(name.width).toBeGreaterThanOrEqual(Math.min(220, cardBox.width * 0.55));
    for (const part of [name, price, (await card.locator("p").boundingBox())!, (await card.locator("small").boundingBox())!]) {
      expect(inside(part, cardBox)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390 || width === 1440) await picks.screenshot({ path: testInfo.outputPath(`restaurant-picks-${width}.png`) });
  }
});
