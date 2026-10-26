import { expect, test, type Page } from "@playwright/test";
import { intelligencePlan, memberships, mockApi, session, wine } from "./fixtures/app";

async function startAnalysis(page: Page, locale: "it" | "en", fail = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], true, memberships, [wine], { ...session, locale });
  await page.addInitScript(({ plan, fail }) => {
    const previous = window.fetch;
    window.fetch = async (input, init) => {
      const path = new URL(String(input), location.href).pathname;
      if (path === "/api/v1/ai/cellar-intelligence" && init?.method === "POST") {
        await new Promise<void>(resolve => {
          const timer = window.setInterval(() => {
            if (sessionStorage.getItem("release-analysis")) { clearInterval(timer); resolve(); }
          }, 20);
        });
        return fail ? Response.json({ detail: "Analysis unavailable" }, { status: 503 }) : Response.json(plan);
      }
      return previous(input, init);
    };
  }, { plan: intelligencePlan, fail });
  await page.goto("/");
  await page.getByRole("button", { name: "Sommelier AI", exact: true }).filter({ visible: true }).first().click();
  await page.locator(".sommelier-hub").getByRole("button", { name: locale === "it" ? /^Strategia della cantina/ : /^Cellar strategy/ }).click();
  await page.getByRole("button", { name: locale === "it" ? "Crea piano AI" : "Create AI plan", exact: true }).click();
  const overlay = page.locator(".ai-generation-overlay");
  await expect(overlay).toBeVisible();
  return overlay;
}

for (const locale of ["it", "en"] as const) {
  test(`AI analysis has responsive artwork, real task context and reduced motion (${locale})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const overlay = await startAnalysis(page, locale);
    await expect(overlay).toHaveAttribute("aria-live", "polite");
    await expect(overlay).toContainText(locale === "it" ? "Piano della cantina" : "Cellar plan");
    const animated = overlay.locator(".trail-gold").first();
    const firstOffset = await animated.evaluate(el => getComputedStyle(el).strokeDashoffset);
    await expect.poll(() => animated.evaluate(el => getComputedStyle(el).strokeDashoffset)).not.toBe(firstOffset);
    for (const selector of [".ai-generation-glass", ".ai-generation-wine"]) {
      const moving = overlay.locator(selector);
      const firstTransform = await moving.evaluate(el => getComputedStyle(el).transform);
      await expect.poll(() => moving.evaluate(el => getComputedStyle(el).transform)).not.toBe(firstTransform);
    }
    // Review one reproducible frame, without disabling motion in production.
    await overlay.evaluate(el => el.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = 1800; }));
    for (const [width, height] of [[1440, 900], [360, 800], [390, 844], [430, 932], [844, 390]]) {
      await page.setViewportSize({ width, height });
      const stage = (await overlay.locator(".ai-generation-stage").boundingBox())!;
      const copy = (await overlay.locator(".ai-generation-copy").boundingBox())!;
      if (height > 540) expect(stage.y + stage.height).toBeLessThanOrEqual(copy.y);
      else expect(stage.x + stage.width).toBeLessThanOrEqual(copy.x);
      for (const element of [overlay.locator(".ai-generation-brand"), overlay.locator(".ai-generation-copy")]) {
        const box = (await element.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
      }
      expect(await overlay.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (locale === "it" && [1440, 390, 844].includes(width)) {
        await page.screenshot({ path: testInfo.outputPath(`ai-analysis-${width}.png`) });
      }
      if (locale === "it" && width === 390) await expect(overlay).toHaveScreenshot("ai-analysis-compact.png", { animations: "allow" });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await overlay.evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length)).toBe(0);
    await expect(overlay).toBeVisible();
    await page.evaluate(() => sessionStorage.setItem("release-analysis", "1"));
    await expect(overlay).toHaveCount(0);
    await expect(page.getByRole("button", { name: locale === "it" ? "Crea piano AI" : "Create AI plan", exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  });
}

test("AI overlay leaves the application usable after an analysis error", async ({ page }) => {
  const overlay = await startAnalysis(page, "it", true);
  await page.evaluate(() => sessionStorage.setItem("release-analysis", "1"));
  await expect(overlay).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crea piano AI", exact: true })).toBeEnabled();
});

test("batch AI progress keeps long wine names readable on mobile", async ({ page }) => {
  await page.route("**/ai-progress-test", route => route.fulfill({ contentType: "text/html", body: `
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const {default: React} = await import('/node_modules/.vite/deps/react.js');
    const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
    const {AiGenerationOverlay} = await import('/src/components/AppUi.tsx');
    const {translations} = await import('/src/i18n.ts');
    await import('/src/styles.css');
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AiGenerationOverlay, {
      mode: 'batch-all', locale: 'it', t: key => translations.it[key],
      progress: {current: 2, total: 12, itemName: 'Barolo Riserva Vigna delle Colline Storiche Selezione Speciale della Famiglia Vinaris 2019'}
    }));
    </script></body></html>` }));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/ai-progress-test");
  const progress = page.locator(".ai-generation-progress");
  await expect(progress).toContainText("Vino 2 di 12");
  await expect(progress).toContainText("Vinaris 2019");
  await expect(progress).toBeInViewport({ ratio: 1 });
  const box = (await progress.boundingBox())!;
  const hint = (await page.locator(".ai-generation-hint").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(hint.y);
  expect(await progress.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
