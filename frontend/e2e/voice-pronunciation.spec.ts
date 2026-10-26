import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, openSommelierFeature, session, wine } from "./fixtures/app";

test("French wine names are respelled the way an Italian voice should say them", async ({ page }) => {
  await page.goto("/");
  const spoken = await page.evaluate(async () => {
    const pronunciation = await import("/src/utils/pronunciation.ts");
    return Object.fromEntries(["Château Pontet-Canet", "Chateau Cos d'Estournel", "Pichon Longueville", "Château Haut-Brion", "Saint-Estèphe", "Château d'Yquem", "Moët & Chandon", "Dom Pérignon", "Veuve Clicquot", "Hospices de Beaune", "Chablis Premier Cru Montée de Tonnerre"]
      .map((name) => [name, pronunciation.frenchNameForItalian(name)]));
  });
  expect(spoken).toEqual({
    "Château Pontet-Canet": "Sciatò Pontè-Canè",
    "Chateau Cos d'Estournel": "Sciatò Coss d'Esturnèl",
    "Pichon Longueville": "Pisciòn Longhevìl",
    "Château Haut-Brion": "Sciatò Ò-Briòn",
    "Saint-Estèphe": "Sèn-Estèf",
    "Château d'Yquem": "Sciatò d'Icuèm",
    "Moët & Chandon": "Moèt e Sciandòn",
    "Dom Pérignon": "Dom Pèrignòn",
    "Veuve Clicquot": "Vev Clicò",
    "Hospices de Beaune": "Ospis de Bòn",
    "Chablis Premier Cru Montée de Tonnerre": "Sciablì Premiè Crù Montè de Tonnerr",
  });
});

const bordeaux = { ...wine, id: "wine-pontet", name: "Château Pontet-Canet", producer: "Château Pontet-Canet", vintage: "2025", region: "Bordeaux", appellation: "Pauillac", vineyard_country: "Francia" };

async function readAnswerWith(page: Page, voiceName: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], true, memberships, [wine, bordeaux], { ...session, cellar_ai_assistant_available: true, cellar_ai_assistant_subscribed: true });
  await page.addInitScript((voiceName) => {
    const previous = window.fetch;
    window.fetch = async (input, init) => {
      const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
      if (path === "/api/v1/ai/cellar-assistant/ask") {
        return Response.json({ answer: "Hai 2 bottiglie di **Château Pontet-Canet** 2025, accanto al Nebbiolo di Test.", wines: [], follow_ups: [], tools_used: ["search_wines"], model: "test-model", reasoning_effort: "", estimated_cost_usd: "0.0002" });
      }
      return previous(input, init);
    };
    const said: string[] = [];
    (window as unknown as { said: string[] }).said = said;
    class Utterance { text: string; lang = ""; volume = 1; voice: { name: string } | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      speaking: false, getVoices: () => [{ name: voiceName, lang: "it-IT", localService: false }], cancel: () => {},
      speak: (utterance: Utterance) => { if (utterance.text) said.push(utterance.text); window.setTimeout(() => utterance.onend?.(), 20); },
    } });
  }, voiceName);
  await page.goto("/");
  await openSommelierFeature(page, /^Chiedi alla tua cantina/);
  await page.getByLabel("Chiedi o racconta", { exact: true }).fill("Quanti Pontet-Canet ho?");
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  const conversation = page.getByRole("region", { name: "Conversazione con l'assistente" });
  // On screen the name stays as written.
  await expect(conversation).toContainText("Château Pontet-Canet 2025");
  await conversation.getByRole("button", { name: "Leggi ad alta voce" }).first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { said: string[] }).said.length)).toBe(1);
  return page.evaluate(() => (window as unknown as { said: string[] }).said[0]);
}

test("the Italian voice reads the cellar's French names as an Italian would say them", async ({ page }) => {
  const said = await readAnswerWith(page, "Microsoft Elsa Online (Natural) - Italian (Italy)");
  expect(said).toBe("Hai 2 bottiglie di Sciatò Pontè-Canè 2025, accanto al Nebbiolo di Test.");
});

test("a multilingual voice keeps the French names as written, in the same voice", async ({ page }) => {
  const said = await readAnswerWith(page, "Microsoft Giuseppe Multilingual Online (Natural) - Italian (Italy)");
  expect(said).toBe("Hai 2 bottiglie di Château Pontet-Canet 2025, accanto al Nebbiolo di Test.");
});
