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
