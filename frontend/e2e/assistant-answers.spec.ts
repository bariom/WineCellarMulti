import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, openSommelierFeature, session, wine } from "./fixtures/app";

async function setup(page: Page) {
  await mockApi(page, [], true, memberships, [wine], { ...session, cellar_ai_assistant_available: true, cellar_ai_assistant_subscribed: true });
  await page.addInitScript((wine) => {
    const previous = window.fetch;
    window.fetch = async (input, init) => {
      const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
      if (path === "/api/v1/ai/cellar-assistant/ask") {
        const body = JSON.parse(String(init?.body));
        const asked = JSON.parse(sessionStorage.getItem("asked") || "[]");
        sessionStorage.setItem("asked", JSON.stringify([...asked, body.question]));
        return Response.json(asked.length === 0 ? {
          answer: `Hai 4 bottiglie di ${wine.name} ${wine.vintage}, pronte da bere.`,
          wines: [{ id: wine.id, name: wine.name, producer: wine.producer, vintage: wine.vintage }],
          follow_ups: ["Quali sono al picco?", "Cosa apro stasera?"],
          tools_used: ["search_wines"], model: "test-model", reasoning_effort: "", estimated_cost_usd: "0.0002",
        } : {
          answer: "Al picco c'è solo questo vino.", wines: [], follow_ups: [],
          tools_used: ["drinking_plan"], model: "test-model", reasoning_effort: "", estimated_cost_usd: "0.0002",
        });
      }
      return previous(input, init);
    };
  }, wine);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`answers link their wines, suggest what to ask next and survive a visit to a wine at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await setup(page);
    await page.goto("/");
    await openSommelierFeature(page, /^Chiedi alla tua cantina/);
    const field = page.getByLabel("Chiedi o racconta", { exact: true });
    await field.fill("Quanti Nebbiolo ho?");
    await page.getByRole("button", { name: "Continua", exact: true }).click();

    const conversation = page.getByRole("region", { name: "Conversazione con l'assistente" });
    await expect(conversation).toContainText("pronte da bere");
    const links = conversation.getByRole("group", { name: "Vini citati" }).or(conversation.locator(".cellar-assistant-wine-links"));
    const wineLink = links.getByRole("button", { name: new RegExp(`^${wine.name}`) });
    await expect(wineLink).toBeVisible();
    const followUps = conversation.locator(".cellar-assistant-follow-ups");
    await expect(followUps.getByRole("button")).toHaveText(["Quali sono al picco?", "Cosa apro stasera?"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`assistant-links-${viewport.width}.png`) });

    // A suggestion is sent as the next question, and only the latest answer offers them.
    await followUps.getByRole("button", { name: "Quali sono al picco?" }).click();
    await expect(conversation).toContainText("Al picco c'è solo questo vino.");
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("asked") || "[]"))).toEqual(["Quanti Nebbiolo ho?", "Quali sono al picco?"]);
    await expect(conversation.locator(".cellar-assistant-follow-ups")).toHaveCount(0);

    // The wine opens its page; coming back, the conversation is still there.
    await wineLink.click();
    await expect(page.locator(".wine-detail:visible").first()).toContainText(wine.name);
    // On the phone the wine fills the screen: close it first, as one would.
    if (viewport.width < 900) await page.locator(".mobile-detail-close-button:visible").first().click();
    await openSommelierFeature(page, /^Chiedi alla tua cantina/);
    await expect(conversation).toContainText("pronte da bere");
    await expect(conversation).toContainText("Al picco c'è solo questo vino.");
  });
}
