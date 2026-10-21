import { expect, test } from "@playwright/test";

// A 400×300 PNG, so previews keep a real size and a shelf-like aspect ratio.
const shelfPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAZAAAAEsCAIAAABi1XKVAAAC+ElEQVR42u3UMQ0AAAgEsVfCiBT8S0IHpEkV3HCZLoATIgFgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhAYalAmBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBhqUCYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYgGFJABgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFiAYakAGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFjAZwtpY75FvvSG9AAAAABJRU5ErkJggg==", "base64");

test("a shelf photo is ranked, highlighted and questioned", async ({ page }, testInfo) => {
  await page.route("**/wine-shelf-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root" style="padding:16px"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {browserHash} = await (await fetch('/node_modules/.vite/deps/_metadata.json')).json();
      const {default: React} = await import('/node_modules/.vite/deps/react.js?v=' + browserHash);
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js?v=' + browserHash);
      const {WineShelfScanner} = await import('/src/components/WineShelfScanner.tsx');
      await import('/src/styles.css');
      window.shelfScans = [];
      window.shelfQuestions = [];
      window.shelfWishlist = [];
      const bottles = [
        { name: 'Barbera d\\'Alba', producer: 'Cantina B', vintage: '2022', style: 'Red', region: 'Piemonte', price_text: 'CHF 24.50', confidence: 'high', owned: false, image_index: 0, x: 0.1, y: 0.2, width: 0.12, height: 0.4 },
        { name: 'Barolo', producer: 'Vietti', vintage: '2019', style: 'Red', region: 'Piemonte', price_text: '', confidence: 'medium', owned: true, image_index: 1, x: 0.6, y: 0.3, width: 0.1, height: 0.4 },
        { name: 'Dolcetto', producer: 'Cantina C', vintage: '2023', style: 'Red', region: 'Piemonte', price_text: 'CHF 18', confidence: 'low', owned: false, image_index: 0, x: 0.7, y: 0.5, width: 0.1, height: 0.3 },
      ];
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(WineShelfScanner, {
        locale: 'it', canGenerateAi: true, canWriteWishlist: true, formatAiBudget: (value) => 'USD ' + value,
        onScan: async (formData) => {
          window.shelfScans.push({ images: formData.getAll('images').length, budget: formData.get('max_price_chf'), type: formData.get('wine_type'), cellar: formData.get('cellar_mode'), size: formData.get('ranking_size') });
          return { summary: 'Due scelte solide sotto budget.', bottles, photo_count: 2, taste_profile_applied: true, cellar_mode: 'avoid_owned', model: 'test-model', reasoning_effort: 'low', estimated_cost_usd: '0.04',
            recommendations: [{ bottle_index: 0, rank: 1, reason: 'Frutto e freschezza, perfetta per il tuo gusto.', taste_affinity: 5 }, { bottle_index: 1, rank: 2, reason: 'Grande annata ma ce l\\'hai già.', taste_affinity: 4 }] };
        },
        onAsk: async (payload) => { window.shelfQuestions.push(payload); return { answer: 'La Barbera è più pronta da bere.', referenced_indexes: [0], taste_profile_applied: true, model: 'test-model', reasoning_effort: 'low', estimated_cost_usd: '0' }; },
        onAddToWishlist: async (candidate) => { window.shelfWishlist.push(candidate); },
      }));
    </script></body></html>`,
  }));

  // Smooth scrolling would move the circles while they are tapped.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wine-shelf-test");
  await expect(page.getByRole("heading", { name: "Fotografa lo scaffale: ti dico quale comprare" })).toBeVisible();
  await page.locator(".wine-shelf-upload input").setInputFiles([
    { name: "scaffale-1.png", mimeType: "image/png", buffer: shelfPng },
    { name: "scaffale-2.png", mimeType: "image/png", buffer: shelfPng },
  ]);
  await expect(page.getByRole("list", { name: "Foto dello scaffale" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("spinbutton", { name: "Budget massimo (CHF)" }).fill("40");
  await page.getByRole("combobox", { name: "Tipologia" }).selectOption("Red");
  await page.screenshot({ path: testInfo.outputPath("shelf-form-390.png"), fullPage: true });
  await page.getByRole("button", { name: "Quale compro?", exact: true }).click();

  await expect(page.getByRole("heading", { name: "3 etichette riconosciute" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).shelfScans)).toEqual([{ images: 2, budget: "40", type: "Red", cellar: "avoid_owned", size: "3" }]);
  // The previews finish loading after the ranking appears and push the page down.
  await expect.poll(() => page.locator(".wine-shelf-photo-frame img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const pins = page.locator(".wine-shelf-pin");
  await expect(pins).toHaveCount(2);
  await expect(page.getByRole("button", { name: "1. Barbera d'Alba 2022" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "2. Barolo 2019" }).click();
  await expect(page.locator("#wine-shelf-choice-1")).toHaveClass(/is-active/);
  const ranking = page.getByRole("list", { name: "Classifica" });
  await expect(ranking.getByRole("listitem").first()).toContainText("CHF 24.50");
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("Prezzo non leggibile · budget non verificato");
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("Già in cantina");
  await expect(page.locator(".wine-shelf-dot")).toHaveCount(0);
  await page.getByText("Mostra tutte le etichette riconosciute", { exact: true }).click();
  await expect(page.locator(".wine-shelf-dot")).toHaveCount(1);

  await ranking.getByRole("listitem").first().getByRole("button", { name: "Aggiungi alla wishlist" }).click();
  await expect(ranking.getByRole("listitem").first().getByRole("button", { name: "In wishlist" })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).shelfWishlist[0])).toMatchObject({ name: "Barbera d'Alba", price: "24.50", currency: "CHF", local: true });

  const chat = page.getByRole("region", { name: "Chiedi al sommelier" });
  await chat.getByRole("button", { name: "Quale si conserva più a lungo?" }).click();
  await expect(chat.getByText("La Barbera è più pronta da bere.")).toBeVisible();
  const question = await page.evaluate(() => (window as any).shelfQuestions[0]);
  expect(question).toMatchObject({ setting: "shop", max_price_chf: "40", history: [] });
  expect(question.wines).toHaveLength(3);

  await page.locator(".wine-shelf-photo").first().getByRole("button", { name: "Ingrandisci", exact: true }).click();
  const zoomed = page.getByRole("dialog", { name: "Foto dello scaffale ingrandita" });
  await expect(zoomed).toBeVisible();
  await expect(zoomed).toContainText("Foto 1 di 2");
  await zoomed.getByRole("button", { name: "1. Barbera d'Alba 2022" }).click();
  await expect(zoomed.locator(".wine-shelf-zoom-choice")).toContainText("Barbera d'Alba 2022");
  await zoomed.getByRole("button", { name: "Ingrandisci di più" }).click();
  await expect(zoomed).toContainText("2×");
  expect(await zoomed.locator(".wine-shelf-zoom-stage").evaluate((stage) => stage.scrollWidth > stage.clientWidth)).toBe(true);
  await zoomed.getByRole("button", { name: "Foto successiva" }).click();
  await expect(zoomed).toContainText("Foto 2 di 2");
  await expect(zoomed).toContainText("1×");
  await expect(zoomed.getByRole("button", { name: "2. Barolo 2019" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("shelf-zoom-390.png") });
  await page.keyboard.press("Escape");
  await expect(zoomed).toBeHidden();

  for (const [width, height] of [[360, 800], [390, 844], [430, 932], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`shelf-result-${width}.png`), fullPage: true });
  }

  await page.getByRole("button", { name: "Nuova analisi" }).click();
  await page.getByRole("button", { name: "Rimuovi foto 1" }).click();
  await expect(page.getByRole("button", { name: "Torna all'ultima classifica" })).toHaveCount(0);
});
