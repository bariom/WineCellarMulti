import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

test("the cellar assistant answers questions and keeps the conversation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [wine], { ...session, cellar_ai_assistant_available: true });
  // mockApi replaces window.fetch, so these two endpoints are answered in the page too.
  await page.addInitScript(() => {
    const previous = window.fetch;
    const record = (key: string, value: unknown) => sessionStorage.setItem(key, JSON.stringify([...JSON.parse(sessionStorage.getItem(key) || "[]"), value]));
    window.fetch = async (input, init) => {
      const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
      if (path === "/api/v1/ai/cellar-assistant/ask") {
        const body = JSON.parse(String(init?.body));
        record("asked", body);
        const count = JSON.parse(sessionStorage.getItem("asked") || "[]").length;
        return Response.json({
          answer: count === 1 ? "Hai **4 bottiglie** di Nebbiolo di Test 2019:\n- 2 in cantina\n- 2 nel frigo vini\n\nAl picco fino al 2028." : "Il 2016 non è in cantina.",
          tools_used: ["search_wines"], model: "test-model", reasoning_effort: "low", estimated_cost_usd: "0.01",
        });
      }
      // A sentence that is not an action falls back from the command interpreter to the assistant.
      if (path === "/api/v1/ai/cellar-commands") {
        record("commands", JSON.parse(String(init?.body)).text);
        return Response.json({
          command_id: "command-e2e", status: "unsupported", intent: "unsupported", message: "Questo comando non è ancora supportato.",
          candidates: [], catalog_candidates: [], wishlist_lists: [], matched_wine: null, tasting: null, purchase_draft: null,
          strategy_purpose: null, strategy_quantity: null, strategy_bulk: false, collection_bulk: false, model: "test-model", estimated_cost_usd: "0",
        });
      }
      return previous(input, init);
    };
  });
  // The browser's speech synthesis, recording what would be read aloud.
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { spoken: string[] }).spoken = spoken;
    class Utterance { text: string; lang = ""; volume = 1; voice = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      speaking: false,
      getVoices: () => [],
      cancel: () => {},
      speak: (utterance: Utterance) => { if (utterance.text) spoken.push(`${utterance.lang}|${utterance.text}`); window.setTimeout(() => utterance.onend?.(), 20); },
    } });
  });
  const stored = (key: string) => page.evaluate((name) => JSON.parse(sessionStorage.getItem(name) || "[]"), key);
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.locator(".mobile-navigation-sheet summary").filter({ hasText: "Strumenti AI" }).click();
  await page.getByRole("button", { name: "Assistente AI", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Assistente Cantina AI" })).toBeVisible();

  const field = page.getByLabel("Chiedi o racconta", { exact: true });
  await page.getByRole("checkbox", { name: "Leggi le risposte ad alta voce" }).check();
  await field.fill("Quanti Nebbiolo ho?");
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  const conversation = page.getByRole("region", { name: "Conversazione con l'assistente" });
  await expect(conversation).toContainText("Hai 4 bottiglie di Nebbiolo di Test 2019");
  // The answer's light formatting is rendered, not shown as raw asterisks.
  await expect(conversation.locator(".assistant-answer strong")).toHaveText("4 bottiglie");
  await expect(conversation.locator(".assistant-answer ul li")).toHaveCount(2);
  await expect(conversation).not.toContainText("**");
  // The answer is read aloud in Italian, without the formatting marks.
  const spoken = () => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken);
  await expect.poll(spoken).toEqual(["it-IT|Hai 4 bottiglie di Nebbiolo di Test 2019: 2 in cantina. 2 nel frigo vini. Al picco fino al 2028."]);
  expect(await page.evaluate(() => localStorage.getItem("vinaris.assistant.read-aloud"))).toBe("1");
  // A question with a question mark never goes through the command interpreter.
  expect(await stored("commands")).toEqual([]);
  await expect(field).toHaveValue("");

  await field.fill("Anche quello del 2016");
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await expect(conversation).toContainText("Il 2016 non è in cantina.");
  await expect.poll(async () => (await spoken()).length).toBe(2);
  // Dictation adds no question mark: a request to be told still goes to the assistant.
  await field.fill("Mi puoi dire le ultime 5 bottiglie di champagne che ho acquistato");
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await expect.poll(async () => (await stored("asked")).length).toBe(3);
  expect(await stored("commands")).toEqual(["Anche quello del 2016"]);
  await expect.poll(async () => (await spoken()).length).toBe(3);
  // Each answer can be listened to again.
  await conversation.getByRole("button", { name: "Leggi ad alta voce" }).first().click();
  await expect.poll(async () => (await spoken()).at(-1)).toContain("Hai 4 bottiglie");
  expect(await stored("commands")).toEqual(["Anche quello del 2016"]);
  expect((await stored("asked"))[1].history).toEqual([
    { role: "user", content: "Quanti Nebbiolo ho?" },
    { role: "assistant", content: "Hai **4 bottiglie** di Nebbiolo di Test 2019:\n- 2 in cantina\n- 2 nel frigo vini\n\nAl picco fino al 2028." },
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  // On a phone the new exchange is brought into view, not left above the composer.
  await expect(conversation.getByText("Mi puoi dire le ultime 5 bottiglie di champagne che ho acquistato", { exact: true })).toBeInViewport();
  await expect(conversation.locator("ol > li").last()).toBeInViewport();
  await expect(page.getByLabel("Esempi di domande", { exact: true })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("assistant-latest-exchange-390.png") });
  await page.screenshot({ path: testInfo.outputPath("assistant-conversation-390.png"), fullPage: true });

  await conversation.getByRole("button", { name: "Nuova conversazione", exact: true }).click();
  await expect(conversation).toHaveCount(0);
});

test("the cellar assistant is offered to subscribers only", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [wine], { ...session, cellar_ai_assistant_available: true, cellar_ai_assistant_subscribed: false });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.locator(".mobile-navigation-sheet summary").filter({ hasText: "Strumenti AI" }).click();
  await page.getByRole("button", { name: "Assistente AI", exact: true }).click();
  const locked = page.locator(".cellar-assistant-locked");
  await expect(locked).toContainText("riservato agli abbonati Vinaris Riserva");
  await expect(page.getByLabel("Chiedi o racconta", { exact: true })).toHaveCount(0);
  await expect(locked.getByRole("button", { name: /Scopri Riserva/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("several actions in one message become cards confirmed one by one", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [wine], { ...session, cellar_ai_assistant_available: true });
  await page.addInitScript((fixture) => {
    const previous = window.fetch;
    const record = (key: string, value: unknown) => sessionStorage.setItem(key, JSON.stringify([...JSON.parse(sessionStorage.getItem(key) || "[]"), value]));
    const base = { candidates: [], catalog_candidates: [], wishlist_lists: [], matched_wine: null, tasting: null, purchase_draft: null, strategy_purpose: null, strategy_quantity: null, strategy_bulk: false, collection_bulk: false, previous_quantity: null, new_quantity: null, model: "gpt-6-luna", estimated_cost_usd: "0.0003", follow_up_texts: [] };
    const candidate = { wine_id: fixture.id, name: fixture.name, producer: fixture.producer, vintage: fixture.vintage, format: "", quantity: 4, location: "" };
    const tasting = { consumed_at: "2026-10-21", note: "", score_value: null, score_scale: null, occasion: "", pairing: "", companions: "" };
    window.fetch = async (input, init) => {
      const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
      if (path === "/api/v1/ai/cellar-commands") {
        const text = JSON.parse(String(init?.body)).text;
        record("commands", text);
        if (text.startsWith("ho ordinato")) {
          return Response.json({ ...base, command_id: "cmd-order", status: "draft_ready", intent: "acquire_wine", message: "Vino trovato nel catalogo. Ho precompilato la scheda da verificare.",
            purchase_draft: { catalog_entry_id: null, lookup_source: "catalog", name: "Sassicaia", producer: "Tenuta San Guido", vintage: "2021", quantity: 6, format: "", region: "Toscana", appellation: "", type: "Red", country: "Italia", grapes_text: "", price: null, currency: "CHF", merchant: "Arvi", order_date: "2026-10-21", status: "Ordered" } });
        }
        return Response.json({ ...base, command_id: "cmd-drink", status: "needs_confirmation", intent: "consume_wine", message: "Ho preparato la bevuta: controlla e conferma.", candidates: [candidate], tasting, follow_up_texts: ["ho ordinato 6 Sassicaia 2021 da Arvi"] });
      }
      if (path === "/api/v1/ai/cellar-commands/cmd-drink/execute") {
        record("executed", JSON.parse(String(init?.body)));
        return Response.json({ ...base, command_id: "cmd-drink", status: "executed", intent: "consume_wine", message: "Fatto. Bevuta registrata.", matched_wine: candidate, tasting, previous_quantity: 4, new_quantity: 3 });
      }
      return previous(input, init);
    };
  }, wine);
  const stored = (key: string) => page.evaluate((name) => JSON.parse(sessionStorage.getItem(name) || "[]"), key);
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Assistente AI", exact: true }).click();
  await page.getByLabel("Chiedi o racconta", { exact: true }).fill("Ho bevuto il Nebbiolo e ho ordinato 6 Sassicaia 2021 da Arvi");
  await page.getByRole("button", { name: "Continua", exact: true }).click();

  // Each operation has its own card; nothing is written before a confirmation.
  const cards = page.locator(".cellar-assistant-result");
  await expect(cards).toHaveCount(2);
  expect(await stored("commands")).toEqual(["Ho bevuto il Nebbiolo e ho ordinato 6 Sassicaia 2021 da Arvi", "ho ordinato 6 Sassicaia 2021 da Arvi"]);
  expect(await stored("executed")).toEqual([]);
  await expect(cards.nth(0)).toContainText("Ho preparato la bevuta");
  await expect(cards.nth(1)).toContainText("Sassicaia");
  await expect(cards.nth(1).getByRole("button", { name: "Apri la scheda del vino" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.locator(".cellar-assistant-result").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("assistant-two-actions-390.png"), fullPage: true });

  await cards.nth(0).getByRole("button", { name: "Conferma", exact: true }).click();
  await expect(cards.nth(0)).toContainText("Fatto. Bevuta registrata.");
  expect(await stored("executed")).toEqual([{ wine_id: wine.id }]);
  await expect(cards.nth(0).getByRole("button", { name: "Annulla aggiornamento" })).toBeVisible();
  // The other card is unchanged and still waits for its own step.
  await expect(cards.nth(1).getByRole("button", { name: "Apri la scheda del vino" })).toBeVisible();
});
