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
