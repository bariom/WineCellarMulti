import { test, expect } from "@playwright/test";

test("AI actions send opt-in and show single-wine errors", async ({ page }) => {
  await page.route("**/sensory-test", route => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {default: Panel} = await import('/src/components/AdminSensoryProfilesPanel.tsx');
      await import('/src/styles.css');
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Panel, {locale:'it'}));
    </script></body></html>`,
  }));
  let single = false;
  let batch = false;
  let approved = false;
  await page.route("**/api/v1/taste-profile/admin/**", async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.endsWith("/summary")) body = { wines_with_profile: 0, wines_without_profile: 1 };
    else if (url.pathname.endsWith("/regenerate")) {
      single = url.searchParams.get("allow_ai") === "true";
      await route.fulfill({ status: 503, json: { detail: "AI temporaneamente non disponibile" } });
      return;
    } else if (url.pathname.endsWith("/approve-pending")) {
      approved = true;
      body = { approved: 1 };
    } else if (url.pathname.endsWith("/enrich-missing")) {
      batch = route.request().postDataJSON().allow_ai === true;
      body = { processed: 1, resolved: 1, ai_generated: 1, skipped: 0 };
    } else if (url.pathname.endsWith("/profiles")) body = [{ identity_id: "test", name: "Amarone Classico", producer: "Villa Verona", vintage: "2019", source: "missing", confidence: 0, validated: false, dimensions: {}, generation_status: "pending" }];
    await route.fulfill({ json: body });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sensory-test");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Approva tutti da validare" }).click();
  await expect(page.getByText("Approvazione completata", { exact: true })).toBeVisible();
  expect(approved).toBe(true);
  await page.getByRole("button", { name: "Genera profilo con AI", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("AI temporaneamente non disponibile");
  expect(single).toBe(true);
  await page.getByRole("button", { name: "Genera mancanti con AI" }).click();
  await expect(page.getByText("Generazione completata", { exact: true })).toBeVisible();
  expect(batch).toBe(true);
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
