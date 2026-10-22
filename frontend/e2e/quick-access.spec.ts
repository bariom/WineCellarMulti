import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

const subscribed = { ...session, cellar_ai_assistant_available: true, cellar_ai_assistant_subscribed: true, dashboard_focus: "collector" };

async function answerAssistantQuestions(page: Page) {
  // mockApi replaces window.fetch, so the assistant endpoint is answered in the page too.
  await page.addInitScript(() => {
    const previous = window.fetch;
    window.fetch = async (input, init) => {
      const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
      if (path === "/api/v1/ai/cellar-assistant/ask") {
        sessionStorage.setItem("asked", String(init?.body));
        return Response.json({ answer: "Il Nebbiolo di Test 2019 è al picco.", tools_used: ["drinking_plan"], model: "test-model", reasoning_effort: "none", estimated_cost_usd: "0.001" });
      }
      return previous(input, init);
    };
  });
}

test("a question asked on the home goes straight to the assistant", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [wine], subscribed);
  await answerAssistantQuestions(page);
  await page.goto("/");
  const ask = page.getByRole("search", { name: "Chiedi all'assistente della cantina" });
  await expect(ask).toBeVisible({ timeout: 15_000 });
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("home-1440.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  // The bar spans the header, not just one of its columns.
  expect((await ask.boundingBox())!.width).toBeGreaterThan(330);
  await ask.screenshot({ path: testInfo.outputPath("home-ask-390.png") });
  await page.screenshot({ path: testInfo.outputPath("home-390.png") });
  await ask.getByRole("textbox", { name: "Chiedi alla tua cantina" }).fill("Quali vini sono al picco");
  await ask.getByRole("button", { name: "Chiedi" }).click();

  await expect(page.getByRole("heading", { name: "Assistente Cantina AI" })).toBeVisible();
  const conversation = page.getByRole("region", { name: "Conversazione con l'assistente" });
  await expect(conversation).toContainText("Il Nebbiolo di Test 2019 è al picco.");
  // Asked once, answered once.
  await expect(conversation.locator("ol > li")).toHaveCount(2);
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("asked") || "{}")).question).toBe("Quali vini sono al picco");

  // On a phone Speak and Continue share one row.
  const speak = page.getByRole("button", { name: "Detta il comando" });
  const send = page.getByRole("button", { name: "Continua", exact: true });
  if (await speak.count()) {
    const [speakBox, sendBox] = [(await speak.boundingBox())!, (await send.boundingBox())!];
    expect(Math.abs(speakBox.y - sendBox.y)).toBeLessThan(4);
    expect(speakBox.x + speakBox.width).toBeLessThanOrEqual(sendBox.x);
  }
  await page.locator(".cellar-assistant-composer-footer").screenshot({ path: testInfo.outputPath("assistant-send-row-390.png") });
});

test("the home ask bar is offered to assistant subscribers only", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [wine], { ...subscribed, cellar_ai_assistant_subscribed: false });
  await page.goto("/");
  await expect(page.locator(".dashboard-focus-navigation")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("search", { name: "Chiedi all'assistente della cantina" })).toHaveCount(0);
});

test("Moments and the assistant are one tap away in the mobile menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // The collector focus has no Moments card on the home: the menu still reaches it.
  await mockApi(page, [], true, memberships, [wine], subscribed);
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const sheet = page.locator(".mobile-navigation-sheet");
  await expect(sheet.getByRole("button", { name: "Assistente AI", exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Momenti", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Momenti", exact: true })).toBeVisible();
});

test("the home microphone opens the assistant in voice conversation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [wine], subscribed);
  await page.addInitScript(() => {
    const win = window as unknown as Record<string, unknown>;
    win.activeRecognitions = 0;
    class FakeRecognition {
      lang = ""; continuous = false; interimResults = false; maxAlternatives = 1;
      onstart: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null; onend: (() => void) | null = null;
      active = false;
      start() { this.active = true; win.activeRecognitions = (win.activeRecognitions as number) + 1; window.setTimeout(() => this.onstart?.(), 20); }
      end() { if (this.active) { this.active = false; win.activeRecognitions = (win.activeRecognitions as number) - 1; this.onend?.(); } }
      stop() { this.end(); }
      abort() { this.end(); }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true });
    class Utterance { text: string; lang = ""; volume = 1; voice = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speaking: false, getVoices: () => [], cancel: () => {}, speak: () => {} } });
  });
  await page.goto("/");
  const ask = page.getByRole("search", { name: "Chiedi all'assistente della cantina" });
  const microphone = ask.getByRole("button", { name: "Parla con l'assistente" });
  await expect(microphone).toBeVisible({ timeout: 15_000 });
  await ask.screenshot({ path: testInfo.outputPath("home-ask-voice-390.png") });
  // Typing a question swaps the microphone for the send arrow.
  await ask.getByRole("textbox", { name: "Chiedi alla tua cantina" }).fill("Quali vini");
  await expect(microphone).toHaveCount(0);
  await ask.getByRole("textbox", { name: "Chiedi alla tua cantina" }).fill("");
  await microphone.click();
  await expect(page.getByRole("heading", { name: "Assistente Cantina AI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Termina la conversazione a voce" })).toHaveAttribute("aria-pressed", "true");
  // Exactly one microphone listens (development remounts may restart it, never double it).
  await expect.poll(() => page.evaluate(() => (window as unknown as { activeRecognitions: number }).activeRecognitions)).toBe(1);
});

test("a food pairing question is answered in chat and opens in the Sommelier AI", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], true, memberships, [wine], subscribed);
  await page.addInitScript((fixture) => {
    // The budget set earlier in the Sommelier AI, remembered on this device.
    localStorage.setItem("vinaris.pairing.max-price", "60");
    const previous = window.fetch;
    window.fetch = async (input, init) => {
      const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
      if (path === "/api/v1/ai/cellar-assistant/ask") {
        sessionStorage.setItem("asked", String(init?.body));
        // A moment of work, so the question is seen while the answer is on its way.
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        return Response.json({
          answer: `Apri il **${fixture.name} ${fixture.vintage}**: tannini e acidità reggono il sugo di selvaggina.`,
          tools_used: ["suggest_pairing"], model: "gpt-6-luna", reasoning_effort: "none", estimated_cost_usd: "0.004",
          pairing_dish: "salmì di cervo",
          pairing: {
            summary: "Un rosso strutturato regge il salmì.", model: "gpt-6-luna", reasoning_effort: "low", taste_profile_applied: true,
            cellar_matches: [{ wine_id: fixture.id, wine_name: fixture.name, producer: fixture.producer, reason: "Tannini e acidità per il sugo di selvaggina.", serving_note: "Aprire un'ora prima.", taste_affinity: 5 }],
            market_recommendations: { low: [], medium: [], high: [] }, dish_recommendations: [], estimated_cost_usd: "0.003",
          },
        });
      }
      if (path === "/api/v1/ai/pairing") {
        sessionStorage.setItem("pairing-called", "1");
      }
      return previous(input, init);
    };
  }, wine);
  await page.goto("/");
  const ask = page.getByRole("search", { name: "Chiedi all'assistente della cantina" });
  await ask.getByRole("textbox", { name: "Chiedi alla tua cantina" }).fill("Che cosa apro con un salmì di cervo?");
  await ask.getByRole("button", { name: "Chiedi" }).click();
  const conversation = page.getByRole("region", { name: "Conversazione con l'assistente" });
  // The question is visible at once, in the box and in the chat, while the answer comes.
  await expect(page.getByLabel("Chiedi o racconta", { exact: true })).toHaveValue("Che cosa apro con un salmì di cervo?");
  await expect(conversation.locator("li.is-user")).toHaveText("Che cosa apro con un salmì di cervo?");
  await expect(conversation.locator("li.is-pending")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("pending-question-390.png") });
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("asked") || "{}")).pairing_max_price_chf).toBe(60);
  await expect(conversation).toContainText("tannini e acidità reggono il sugo");
  await expect(conversation.locator("li.is-pending")).toHaveCount(0);
  await expect(page.getByLabel("Chiedi o racconta", { exact: true })).toHaveValue("");
  await conversation.getByRole("button", { name: "Vedi nel Sommelier AI" }).screenshot({ path: testInfo.outputPath("open-pairing-button-390.png") });
  await conversation.getByRole("button", { name: "Vedi nel Sommelier AI" }).click();

  // The pairing view opens on the cellar result, without asking where the user is or a new call.
  await expect(page.getByRole("heading", { name: "Dove sei?" })).toHaveCount(0);
  await expect(page.locator(".pairing-view")).toContainText("Tannini e acidità per il sugo di selvaggina.");
  // It opens on the result, not on the form above it.
  await expect(page.locator(".pairing-result")).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("pairing-result-in-view-390.png") });
  expect(await page.evaluate(() => sessionStorage.getItem("pairing-called"))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("pairing-from-assistant-390.png"), fullPage: true });
});
