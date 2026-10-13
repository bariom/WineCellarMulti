import { expect, test } from "@playwright/test";
import { mockApi, session, snapshotChrome, wine } from "./fixtures/app";

for (const mode of ["discovery", "empty", "countries"] as const) {
  test(`taste origins explain evidence and handle ${mode}`, async ({ page }) => {
    const attributes = mode === "countries"
      ? { preferred_countries: [["Italia", 8]] }
      : { preferred_regions: [["Toscana", 8], ["Bordeaux", 12], ["Champagne", 2], ["Piemonte", 0]], preferred_grapes: [["Merlot", 10]] };
    const wines = mode === "empty" ? [] : [
      { ...wine, region: "Toscana", quantity: 3 },
      { ...wine, id: "outside", name: "Merlot da esplorare", region: "Ticino", vineyard_country: "Svizzera", grapes: [{ name: "Merlot" }] },
      { ...wine, id: "pending", region: "Toscana", quantity: 20, status: "ordered" },
    ];
    await page.route("**/taste-origins-test", route => route.fulfill({
      contentType: "text/html",
      body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const {default: React} = await import('/node_modules/.vite/deps/react.js');
        const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
        const {TasteOrigins} = await import('/src/components/TasteOrigins.tsx');
        await import('/src/styles.css');
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(TasteOrigins, {
          locale:'it', profile:${JSON.stringify({ attributes, confidence_level: "emerging" })}, wines:${JSON.stringify(wines)},
          onOpenWine: wine => { document.title = wine.id; }
        }));
      </script></body></html>`,
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/taste-origins-test");
    await expect(page.getByText(/La quantità in cantina indica disponibilità, non gradimento/)).toBeVisible();
    await expect(page.getByText(/questa classifica può cambiare/)).toBeVisible();
    const cards = page.locator(".taste-origin-card");
    if (mode === "countries") {
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText("Paese");
      await expect(cards.first()).toContainText("3 bottiglie in cantina");
    } else {
      await expect(cards).toHaveCount(3);
      await expect(cards.first().getByRole("heading")).toHaveText("Bordeaux");
      await expect(cards.nth(1)).toContainText(`${mode === "empty" ? 0 : 3} bottiglie in cantina`);
    }
    if (mode === "discovery") {
      await expect(page.locator(".taste-origin-discovery")).toContainText("Merlot emerge");
      await expect(page.locator(".taste-origin-discovery")).toContainText("non è una previsione di gradimento");
      await page.getByRole("button", { name: "Apri la bottiglia da esplorare" }).click();
      await expect(page).toHaveTitle("outside");
    } else {
      await expect(page.getByText(/Non ci sono ancora bottiglie con dati sufficienti/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Apri la bottiglia da esplorare" })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

for (const mode of ["photo", "detail", "missing", "broken"] as const) {
  test(`taste discovery handles ${mode} bottle images in the real dashboard`, async ({ page }, testInfo) => {
    const locale = mode === "detail" ? "en" : "it";
    const theme = mode === "detail" ? "private-cellar" : "light";
    const candidate = { ...wine, id: "explore-wine", name: "Merlot da esplorare", region: "Valais", grapes: [{ name: "Merlot" }],
      photo_thumbnail_url: mode === "photo" ? wine.photo_thumbnail_url : mode === "broken" || mode === "detail" ? "/missing-thumb.jpg" : "",
      photo_detail_url: mode === "detail" ? wine.photo_thumbnail_url : mode === "broken" ? "/missing-detail.jpg" : "",
    };
    await mockApi(page, [], false, undefined, [wine, candidate], { ...session, locale, theme_preference: theme });
    await page.route("**/missing-*.jpg", route => route.fulfill({ status: 404 }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.locator(".dashboard-analysis-switcher > summary").click();
    await page.getByRole("tab", { name: locale === "it" ? "Il mio gusto" : "My Taste", exact: true }).click();
    const geography = page.getByRole("region", { name: locale === "it" ? "Dove vale la pena esplorare" : "Where to explore next", exact: true });
    const discovery = geography.locator(".taste-origin-discovery");
    await expect(discovery.getByRole("heading", { name: candidate.name, exact: true })).toBeVisible();
    await expect(discovery).toContainText(locale === "it" ? "Già nella tua cantina" : "Already in your cellar");
    if (mode === "photo" || mode === "detail") {
      const photo = discovery.getByRole("img", { name: new RegExp(candidate.name) });
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      await expect(photo).toHaveCSS("object-fit", "contain");
    } else {
      await expect(discovery.locator(".taste-discovery-placeholder .key-position-wine-illustration")).toBeVisible();
      await expect(discovery.getByText("Foto non disponibile", { exact: true })).toHaveCount(0);
      await expect(discovery.getByRole("img")).toHaveCount(0);
    }
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const box = (await discovery.boundingBox())!;
      const picture = (await discovery.locator(".taste-discovery-visual").boundingBox())!;
      const copy = (await discovery.locator(".taste-discovery-copy").boundingBox())!;
      expect(picture.x + picture.width <= copy.x || picture.y + picture.height <= copy.y).toBe(true);
      const button = discovery.getByRole("button");
      const action = (await button.boundingBox())!;
      expect(action.height).toBeGreaterThanOrEqual(44);
      expect(action.x).toBeGreaterThanOrEqual(box.x);
      expect(action.x + action.width).toBeLessThanOrEqual(box.x + box.width);
      if ((mode === "photo" || mode === "detail") && (viewport.width === 390 || viewport.width === 1440)) {
        await snapshotChrome(page, false);
        await geography.screenshot({ path: testInfo.outputPath(`taste-explore-${viewport.width}.png`) });
        if (mode === "photo" && viewport.width === 390) await expect(discovery).toHaveScreenshot("taste-discovery-compact.png");
        await snapshotChrome(page, true);
      }
      if (mode === "missing" && viewport.width === 390) await discovery.screenshot({ path: testInfo.outputPath("discovery-glass-390.png") });
    }
  });
}


test("discovery glass reflects the proposed wine type", async ({ page }, testInfo) => {
  const candidate = { ...wine, name: "Vino da esplorare", region: "Valais", grapes: [{ name: "Merlot" }], photo_thumbnail_url: "", photo_detail_url: "" };
  await page.route("**/taste-glass-colors", route => route.fulfill({ contentType: "text/html", body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default: React} = await import('/node_modules/.vite/deps/react.js');
      const {default: ReactDOM} = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {TasteOrigins} = await import('/src/components/TasteOrigins.tsx');
      await import('/src/styles.css');
      const root = ReactDOM.createRoot(document.getElementById('root'));
      window.showWineType = type => root.render(React.createElement(TasteOrigins, {
        locale:'it', profile:{attributes:{preferred_regions:[['Toscana',8]],preferred_grapes:[['Merlot',10]]}},
        wines:[{...${JSON.stringify(candidate)},type}]
      }));
      window.showWineType('Red');
    </script></body></html>` }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/taste-glass-colors");
  const fill = page.locator(".taste-discovery-placeholder .key-position-wine-fill");
  await expect(fill).toBeAttached();
  for (const [type, rgb] of [
    ["Red", [143, 32, 57]], ["White", [214, 180, 72]], ["Rose", [215, 131, 148]],
    ["Sparkling", [185, 160, 93]], ["Sweet", [201, 130, 44]], ["", [120, 144, 134]],
    ["Rosso", [143, 32, 57]], ["Bianco", [214, 180, 72]], ["Rosato", [215, 131, 148]],
  ] as const) {
    await page.evaluate(type => (window as any).showWineType(type), type);
    await expect.poll(() => fill.evaluate((element, expected) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = getComputedStyle(element).fill; context.fillRect(0, 0, 1, 1);
      // The translucent fill's 8-bit premultiplied-alpha round trip can lose
      // one RGB level; keep that quantization tolerance separate from the hue.
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
        .every((value, index) => Math.abs(value - expected[index]) <= 1);
    }, [...rgb])).toBe(true);
    if (["Red", "White", "Rose"].includes(type)) await page.locator(".taste-discovery-photo").screenshot({ path: testInfo.outputPath(`glass-${type}.png`) });
  }
});
