import { expect, test } from "@playwright/test";

// The shelf analysis runs as a background job: the app starts it, then shows each
// polled status in the AI overlay until the result arrives.
test("the shelf analysis reports its progress in the AI overlay", async ({ page }, testInfo) => {
  await page.route("**/wine-shelf-progress-test", (route) => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {browserHash} = await (await fetch('/node_modules/.vite/deps/_metadata.json')).json();
      const {default: React} = await import('/node_modules/.vite/deps/react.js?v=' + browserHash);
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js?v=' + browserHash);
      const {AiGenerationOverlay} = await import('/src/components/AppUi.tsx');
      const {translate} = await import('/src/i18n.ts');
      const {runWineShelfScan} = await import('/src/services/wineShelfScan.ts');
      await import('/src/styles.css');
      const result = { summary: 'Due scelte.', bottles: [], recommendations: [], photo_count: 1, taste_profile_applied: false, cellar_mode: 'ignore', model: 'test-model', reasoning_effort: '', estimated_cost_usd: '0.02' };
      const statuses = [
        { stage: 'reading', sections_done: 0, bottles_found: 0 },
        { stage: 'reading', sections_done: 2, bottles_found: 31 },
        { stage: 'reading', sections_done: 4, bottles_found: 83 },
        { stage: 'ranking', sections_done: 4, bottles_found: 83 },
      ];
      let polls = 0;
      window.requests = [];
      window.progress = [];
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.href).pathname;
        window.requests.push((init?.method || 'GET') + ' ' + path);
        const base = { id: 'job-1', status: 'running', sections_total: 4, error: '', result: null };
        if (path === '/api/v1/ai/wine-shop/shelf-scans') return Response.json({ ...base, ...statuses[0] }, { status: 202 });
        polls += 1;
        // Hold the ranking status until the test has looked at it.
        if (polls >= statuses.length && !window.release) return Response.json({ ...base, ...statuses[statuses.length - 1] });
        if (polls < statuses.length) return Response.json({ ...base, ...statuses[polls] });
        return Response.json({ ...base, status: 'done', stage: 'done', sections_done: 4, bottles_found: 83, result });
      };
      function Harness() {
        const [text, setText] = React.useState('');
        const [done, setDone] = React.useState('');
        React.useEffect(() => {
          const form = new FormData();
          runWineShelfScan(form, 'it', (next) => { window.progress.push(next); setText(next); }, 50)
            .then((value) => setDone(value.summary), (error) => setDone('error: ' + error.message));
        }, []);
        return done
          ? React.createElement('p', { id: 'done' }, done)
          : React.createElement(AiGenerationOverlay, { mode: 'wine-shelf', t: (key) => translate('it', key), locale: 'it', progress: { text } });
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));
    </script></body></html>`,
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wine-shelf-progress-test");
  const progress = page.locator(".ai-generation-progress");
  await expect(progress).toHaveText("83 vini riconosciuti · scelgo i migliori per te");
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("shelf-progress-390.png") });

  await page.evaluate(() => { (window as unknown as { release: boolean }).release = true; });
  await expect(page.locator("#done")).toHaveText("Due scelte.");
  const seen = await page.evaluate(() => (window as unknown as { progress: string[] }).progress);
  expect(seen).toEqual(expect.arrayContaining([
    "Carico le foto dello scaffale…",
    "Leggo le etichette: 4 sezioni dello scaffale in parallelo…",
    "Sezioni lette: 2 di 4 · 31 vini riconosciuti",
    "Sezioni lette: 4 di 4 · 83 vini riconosciuti",
    "83 vini riconosciuti · scelgo i migliori per te",
  ]));
  const requests = await page.evaluate(() => (window as unknown as { requests: string[] }).requests);
  expect(requests[0]).toBe("POST /api/v1/ai/wine-shop/shelf-scans");
  expect(requests.slice(1).every((request) => request === "GET /api/v1/ai/wine-shop/shelf-scans/job-1")).toBe(true);
});
