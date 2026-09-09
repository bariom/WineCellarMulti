import { expect, test } from "@playwright/test";

test("taste preferences use an individual scale and expandable wine styles", async ({ page }) => {
  await page.route("**/taste-profile-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {default: Panel, TasteProfileExplanation} = await import('/src/components/TasteProfilePanel.tsx');
      await import('/src/styles.css');
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null,
        React.createElement(Panel, {locale:'it', variant:'insight', wines:[{rating:4}, {rating:0}]}),
        React.createElement(TasteProfileExplanation, {locale:'it'})
      ));
    </script></body></html>`,
  }));
  const profile = (category: string, sampleCount: number) => ({
    category,
    dimensions: { body: { preference: .7, confidence: .5, samples: sampleCount }, tannin: { preference: .46, confidence: .5, samples: sampleCount } },
    attributes: { preferred_regions: [["Toscana", .8]] },
    confidence: .5,
    sample_count: sampleCount,
    tasting_count: sampleCount,
    star_rating_count: 3,
    confidence_level: "probable",
  });
  await page.route("**/api/v1/taste-profile/me**", route => route.fulfill({ json: { profiles: [profile("global", 16), profile("red", 8), profile("white", 5)] } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/taste-profile-test");
  await expect(page.locator(".taste-profile-portrait-copy small")).toContainText("I valori non sono percentuali da sommare.");
  await expect(page.locator(".taste-profile-evidence-summary > div").nth(1).locator("strong")).toHaveText("1");
  await expect(page.locator(".taste-profile-signature-values")).toContainText("70/100");
  await expect(page.locator(".taste-profile-radar-wrap .regional-radar")).toBeAttached();
  const red = page.locator(".taste-profile-category").filter({ hasText: "Rossi" });
  await expect(red).not.toHaveAttribute("open", "");
  await red.locator("summary").click();
  await expect(red).toHaveAttribute("open", "");
  await expect(red.getByText("8 vini valutati")).toBeVisible();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
