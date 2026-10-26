import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, openSommelierFeature, session, wine } from "./fixtures/app";

async function setup(page: Page) {
  await mockApi(page, [], true, memberships, [wine], { ...session, cellar_ai_assistant_available: true, cellar_ai_assistant_subscribed: true });
  await page.addInitScript((wine) => {
    const previous = window.fetch;
    window.fetch = async (input, init) => {
      const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
      if (path === "/api/v1/ai/cellar-assistant/feedback") {
        const rated = JSON.parse(sessionStorage.getItem("rated") || "[]");
        sessionStorage.setItem("rated", JSON.stringify([...rated, JSON.parse(String(init?.body))]));
        return new Response(null, { status: 204 });
      }
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

test("each answer can be rated once, and a thumb down asks what was wrong", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("/");
  await openSommelierFeature(page, /^Chiedi alla tua cantina/);
  await page.getByLabel("Chiedi o racconta", { exact: true }).fill("Quanti Nebbiolo ho?");
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  const conversation = page.getByRole("region", { name: "Conversazione con l'assistente" });
  await conversation.locator(".cellar-assistant-follow-ups").getByRole("button", { name: "Quali sono al picco?" }).click();
  await expect(conversation).toContainText("Al picco c'è solo questo vino.");
  const answers = conversation.locator("li.is-assistant");

  await answers.nth(0).getByRole("button", { name: "Risposta utile" }).click();
  await expect(answers.nth(0).getByRole("status")).toContainText("Grazie");
  await expect(answers.nth(0).getByRole("button", { name: "Risposta da migliorare" })).toBeDisabled();

  await answers.nth(1).getByRole("button", { name: "Risposta da migliorare" }).click();
  await answers.nth(1).getByLabel("Cosa non andava? (facoltativo)").fill("Ne ho due al picco");
  await answers.nth(1).getByRole("button", { name: "Invia", exact: true }).click();
  await expect(answers.nth(1).getByRole("status")).toContainText("Grazie");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const rated = await page.evaluate(() => JSON.parse(sessionStorage.getItem("rated") || "[]"));
  expect(rated).toEqual([
    expect.objectContaining({ rating: "up", question: "Quanti Nebbiolo ho?", model: "test-model", tools_used: ["search_wines"] }),
    expect.objectContaining({ rating: "down", question: "Quali sono al picco?", answer: "Al picco c'è solo questo vino.", comment: "Ne ho due al picco" }),
  ]);
});

for (const outcome of ["ai voice", "fallback"] as const) {
  test(`the natural AI voice reads an answer, or the browser's voice when it cannot (${outcome})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page);
    await page.addInitScript((outcome) => {
      const previous = window.fetch;
      // A twentieth of a second of silent WAV, as the AI voice's audio.
      const samples = 800;
      const bytes = new Uint8Array(44 + samples);
      const view = new DataView(bytes.buffer);
      const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
      text(0, "RIFF"); view.setUint32(4, 36 + samples, true); text(8, "WAVE"); text(12, "fmt ");
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 16000, true); view.setUint32(28, 16000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
      text(36, "data"); view.setUint32(40, samples, true); bytes.fill(128, 44);
      window.fetch = async (input, init) => {
        const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
        if (path === "/api/v1/ai/cellar-assistant/speech") {
          sessionStorage.setItem("speech", String(init?.body));
          if (outcome === "fallback") return Response.json({ detail: "AI credits exhausted" }, { status: 402 });
          return new Response(bytes, { headers: { "Content-Type": "audio/wav", "X-AI-Cost-USD": "0.006120" } });
        }
        return previous(input, init);
      };
      const spoken: string[] = [];
      (window as unknown as { spoken: string[] }).spoken = spoken;
      class Utterance { text: string; lang = ""; volume = 1; voice = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(text: string) { this.text = text; } }
      Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
        speaking: false, getVoices: () => [], cancel: () => {},
        speak: (utterance: Utterance) => { if (utterance.text) spoken.push(utterance.text); window.setTimeout(() => utterance.onend?.(), 20); },
      } });
    }, outcome);
    await page.goto("/");
    await openSommelierFeature(page, /^Chiedi alla tua cantina/);
    const toggle = page.getByLabel(/Voce naturale AI/);
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await page.getByLabel("Chiedi o racconta", { exact: true }).fill("Quanti Nebbiolo ho?");
    await page.getByRole("button", { name: "Continua", exact: true }).click();
    const conversation = page.getByRole("region", { name: "Conversazione con l'assistente" });
    await expect(conversation).toContainText("pronte da bere");
    await conversation.getByRole("button", { name: "Leggi ad alta voce" }).first().click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("speech"))).toContain("pronte da bere");
    const sent = JSON.parse(await page.evaluate(() => sessionStorage.getItem("speech") || "{}"));
    expect(sent.locale).toBe("it");
    if (outcome === "ai voice") {
      await expect(page.locator(".cellar-assistant-ai-voice")).toContainText("Ultima lettura: $0.0061");
      expect(await page.evaluate(() => (window as unknown as { spoken: string[] }).spoken)).toEqual([]);
    } else {
      await expect.poll(() => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken.join(" "))).toContain("pronte da bere");
    }
    // The choice is kept on this device.
    await page.reload();
    await openSommelierFeature(page, /^Chiedi alla tua cantina/);
    await expect(page.getByLabel(/Voce naturale AI/)).toBeChecked();
  });
}

// A real 16×24 PNG, so the conversation can draw its thumbnail.
const labelPhoto = {
  name: "etichetta.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAYCAIAAAB8wupbAAAALElEQVR4nGOskDNiIAUwkaSaYVQDcYCJSHVwMKqBGMBElCokMKqBGED7UAIACIoA+CCd1KEAAAAASUVORK5CYII=", "base64"),
};

for (const recognized of [true, false]) {
  test(`a photographed label is asked about with the wine named (${recognized ? "recognised" : "unreadable"})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, [], true, memberships, [wine], { ...session, cellar_ai_assistant_available: true, cellar_ai_assistant_subscribed: true, can_use_label_recognition: true });
    await page.addInitScript(({ wine, recognized }) => {
      const previous = window.fetch;
      window.fetch = async (input, init) => {
        const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
        if (path === "/api/v1/wines/catalog/recognize-bottle") {
          return Response.json({
            recognition_id: "rec-1", status: recognized ? "recognized" : "not_recognized", producer: recognized ? wine.producer : "", estate: "", wine_name: recognized ? wine.name : "", cuvee: "",
            vintage: recognized ? wine.vintage : "", appellation: "", region: "", country: "", label_text: [], alternative_candidates: [], needs_user_confirmation: false,
            recognition_notes: [], provider: "luna", matches: [], estimated_cost_usd: "0.0040",
          });
        }
        if (path === "/api/v1/ai/cellar-assistant/ask") {
          sessionStorage.setItem("asked", String(JSON.parse(String(init?.body)).question));
          return Response.json({ answer: "Sì: ne hai 4 bottiglie, pronte da bere.", wines: [{ id: wine.id, name: wine.name, producer: wine.producer, vintage: wine.vintage }], follow_ups: [], tools_used: ["search_wines"], model: "test-model", reasoning_effort: "", estimated_cost_usd: "0.0002" });
        }
        return previous(input, init);
      };
    }, { wine, recognized });
    await page.goto("/");
    await openSommelierFeature(page, /^Chiedi alla tua cantina/);
    const camera = page.getByRole("button", { name: "Chiedi di un'etichetta fotografata" });
    await expect(camera).toBeVisible();
    // Camera, speak and send stay on one row at phone width.
    const [cameraBox, sendBox] = await Promise.all([camera.boundingBox(), page.getByRole("button", { name: "Continua", exact: true }).boundingBox()]);
    expect(Math.abs(cameraBox!.y - sendBox!.y)).toBeLessThan(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.locator(".cellar-assistant-send-actions input[type=file]").setInputFiles(labelPhoto);
    const conversation = page.getByRole("region", { name: "Conversazione con l'assistente" });
    if (recognized) {
      await expect(conversation).toContainText("ne hai 4 bottiglie");
      const label = `${wine.producer} · ${wine.name} · ${wine.vintage}`;
      await expect(conversation.locator(".cellar-assistant-photo-question")).toContainText(label);
      await expect(conversation.locator(".cellar-assistant-photo-question")).toContainText("Ce l'ho in cantina? Quanto vale e quando aprirlo?");
      await expect(conversation.getByRole("img", { name: `Etichetta: ${label}` })).toBeVisible();
      // The recognition's cost is said once, under the question.
      await expect(conversation.locator("li.is-user > small")).toHaveCount(1);
      await expect(conversation.locator("li.is-user > small")).toContainText("Riconoscimento etichetta");
      expect(await page.evaluate(() => sessionStorage.getItem("asked"))).toBe(`Vino nella foto dell'etichetta: ${label}. Ce l'ho in cantina? Quanto vale e quando aprirlo?`);
      await page.screenshot({ path: testInfo.outputPath("assistant-photo-390.png") });
    } else {
      await expect(page.getByText("Non riesco a leggere l'etichetta", { exact: false })).toBeVisible();
      expect(await page.evaluate(() => sessionStorage.getItem("asked"))).toBeNull();
    }
  });
}
