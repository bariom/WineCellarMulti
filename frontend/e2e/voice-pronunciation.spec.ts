import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, openSommelierFeature, session, wine } from "./fixtures/app";

test("French wine names are respelled the way an Italian voice should say them", async ({ page }) => {
  await page.goto("/");
  const spoken = await page.evaluate(async () => {
    const pronunciation = await import("/src/utils/pronunciation.ts");
    return Object.fromEntries(["Château Pontet-Canet", "Chateau Cos d'Estournel", "Pichon Longueville", "Château Haut-Brion", "Saint-Estèphe", "Château d'Yquem", "Moët & Chandon", "Dom Pérignon", "Veuve Clicquot", "Hospices de Beaune", "Chablis Premier Cru Montée de Tonnerre", "Château Léoville Las Cases", "Domaine Armand Rousseau", "Bâtard-Montrachet", "Nuits-Saint-Georges", "Jacques Selosse", "Guigal La Landonne", "Jean-Louis Chave", "Didier Dagueneau Silex"]
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
    "Dom Pérignon": "Dom Perignòn",
    "Veuve Clicquot": "Vev Clicò",
    "Hospices de Beaune": "Ospis de Bòn",
    "Chablis Premier Cru Montée de Tonnerre": "Sciablì Premiè Crù Montè de Tonèrr",
    "Château Léoville Las Cases": "Sciatò Leovìl Las Cas",
    "Domaine Armand Rousseau": "Domèn Armàn Russò",
    "Bâtard-Montrachet": "Batàr-Monrascè",
    "Nuits-Saint-Georges": "Nuì-Sèn-Giòrg",
    "Jacques Selosse": "Giàc Selòs",
    "Guigal La Landonne": "Ghigàl La Landòn",
    "Jean-Louis Chave": "Giàn-Luì Sciav",
    "Didier Dagueneau Silex": "Didiè Daghenò Silèx",
  });
});

test("French names outside the cellar are respelled too, and Italian ones are left alone", async ({ page }) => {
  await page.goto("/");
  const spoken = await page.evaluate(async () => {
    const pronunciation = await import("/src/utils/pronunciation.ts");
    return pronunciation.pronounceForItalianVoice(
      "Per la wishlist: Château Lafite Rothschild 2019 di Pauillac e Domaine de la Romanée-Conti. Il Barolo di Giacomo Conterno resta in cantina, la Clos non c'entra.",
      [],
    );
  });
  expect(spoken).toBe("Per la wishlist: Sciatò Lafìt Rotsciìld 2019 di Poiàc e Domèn de la Romané-Contì. Il Barolo di Giacomo Conterno resta in cantina, la Clò non c'entra.");
});

test("dictation puts back \"en primeur\" however the recogniser wrote it", async ({ page }) => {
  await page.goto("/");
  const heard = [
    "Quali sono i miei vini Primer?",
    "quali sono i miei vini Marvel",
    "Quali sono i miei vini Un Prime?",
    "ho comprato sei bottiglie an primer",
    "mostrami gli acquisti amprimer",
    "quali vini ho preso en primeur",
    // Not about en primeur: left as dictated.
    "ho bevuto un Premier Cru con le prime bottiglie di Marvel",
    "this is a prime example",
  ];
  const result = await page.evaluate(async (heard) => {
    const dictation = await import("/src/utils/dictation.ts");
    return {
      corrected: heard.map((text) => dictation.correctDictation(text)),
      // A later alternative that heard it right wins over the first.
      best: dictation.bestDictation(["vini Marvin", "vini en primeur"]),
    };
  }, heard);
  expect(result.corrected).toEqual([
    "Quali sono i miei vini en primeur?",
    "quali sono i miei vini en primeur",
    "Quali sono i miei vini en primeur?",
    "ho comprato sei bottiglie en primeur",
    "mostrami gli acquisti en primeur",
    "quali vini ho preso en primeur",
    "ho bevuto un Premier Cru con le prime bottiglie di Marvel",
    "this is a prime example",
  ]);
  expect(result.best).toBe("vini en primeur");
});

test("a long answer is read in pieces of whole sentences", async ({ page }) => {
  await page.goto("/");
  const chunks = await page.evaluate(async () => {
    const speech = await import("/src/utils/speech.ts");
    const sentence = "Hai sei bottiglie di Barolo 2016 al picco, valutate 33.5 franchi l'una.";
    return { short: speech.speechChunks("Sì. Ne hai due."), long: speech.speechChunks(Array(6).fill(sentence).join(" ")), sentence };
  });
  // Short answers stay one reading; long ones break only between sentences.
  expect(chunks.short).toEqual(["Sì. Ne hai due."]);
  expect(chunks.long).toEqual(Array(2).fill(Array(3).fill(chunks.sentence).join(" ")));
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
