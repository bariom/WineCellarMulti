import { expect, test, type Page } from "@playwright/test";
import { wine, mockApi, openWineDetail, session, memberships } from "./fixtures/app";

test("wine geography can be edited and remains visible without precise coordinates", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.addInitScript(wine => {
    const original = window.fetch;
    let current = { ...wine, wine_zone: "", vineyard_locality: "", vineyard_latitude: null, vineyard_longitude: null };
    window.fetch = async (input, init) => {
      const path = new URL(String(input), location.href).pathname;
      if (path.endsWith(`/wines/${wine.id}`)) {
        if (init?.method === "PATCH") {
          const data = JSON.parse(String(init.body));
          sessionStorage.setItem("wine-geography-saved", JSON.stringify(data));
          current = { ...current, ...data };
        }
        return Response.json(current);
      }
      if (path === "/api/v1/wines") return Response.json([current]);
      return original(input, init);
    };
  }, wine);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator(`[data-wine-row-id="${wine.id}"] article`).click();
  await page.getByRole("button", { name: "Modifica selezionato", exact: true }).click();
  const editor = page.locator(".wine-editor-form");
  await editor.getByLabel("Regione", { exact: true }).fill("Piemonte");
  await editor.getByLabel("Zona vitivinicola", { exact: true }).fill("Roero");
  await editor.getByLabel("Località / Comune", { exact: true }).fill("Castagnito");
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await editor.getByLabel("Zona vitivinicola", { exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Salva modifiche", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.locator(`[data-wine-row-id="${wine.id}"] article`).click();
  await page.locator('.wine-detail:visible').first().locator('[data-wine-detail-section="01"] > summary').click();
  const geographic = page.locator(".wine-detail:visible").first().getByRole("group", { name: "Dettagli geografici", exact: true });
  await expect(geographic).toContainText("Roero");
  await expect(geographic).toContainText("Castagnito");
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const identity = page.locator('.wine-detail:visible').first().locator('[data-wine-detail-section="01"]');
    if (await identity.getAttribute("open") === null) await identity.locator("summary").click();
    await expect(geographic).toBeVisible();
    await geographic.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const bounds = (await geographic.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    for (const field of await geographic.locator(".detail-field").all()) {
      const label = (await field.locator("span").boundingBox())!;
      const value = (await field.locator("strong").boundingBox())!;
      expect(label.y + label.height).toBeLessThanOrEqual(value.y);
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`wine-geography-${width}.png`), fullPage: true });
  }
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("wine-geography-saved") || "null"));
  expect(saved).toMatchObject({ region: "Piemonte", wine_zone: "Roero", vineyard_locality: "Castagnito" });
  await page.getByRole("button", { name: "Modifica selezionato", exact: true }).click();
  await expect(editor.getByLabel("Zona vitivinicola", { exact: true })).toHaveValue("Roero");
  await expect(editor.getByLabel("Località / Comune", { exact: true })).toHaveValue("Castagnito");
});

test("editing an invoice wine identity rechecks reference photos from other vintages", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const name = "Le C des Carmes Haut-Brion";
  const imported = { ...wine, name: `${name}, Pessac-Léognan`, producer: "Chateau des Carmes Haut-Brion", vintage: "2022", photo_thumbnail_url: "", photo_detail_url: "" };
  await mockApi(page, [], false, memberships, [imported]);
  await page.addInitScript(({ imported, name, image }) => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      if (url.pathname.endsWith("/wines/photo/suggestions")) {
        if (url.searchParams.get("name") !== name || url.searchParams.get("producer") !== imported.producer) return Response.json([]);
        sessionStorage.setItem("corrected-photo-query", url.search);
        return Response.json([1, 2].map(id => ({ source_wine_id: `photo-${id}`, thumbnail_url: image, detail_url: image })));
      }
      return original(input, init);
    };
  }, { imported, name, image: wine.photo_thumbnail_url });
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator(`[data-wine-row-id="${wine.id}"] article`).click();
  await page.getByRole("button", { name: "Modifica selezionato" }).click();
  const editor = page.locator(".wine-editor-form");
  await expect(editor.getByText("Foto già disponibile", { exact: true })).toHaveCount(0);
  await editor.getByLabel("Nome", { exact: true }).fill(name);
  await expect(editor.getByText("Foto già disponibile", { exact: true })).toBeVisible();
  await expect(editor.getByText("1 / 2", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Successiva", exact: true }).click();
  await expect(editor.getByText("2 / 2", { exact: true })).toBeVisible();
  const query = await page.evaluate(() => sessionStorage.getItem("corrected-photo-query"));
  expect(query).not.toContain("vintage");
  await page.screenshot({ path: testInfo.outputPath("corrected-invoice-photo-offer.png") });
});

test("wine quick actions are visible at the start of the detail on phones and desktop", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWineDetail(page);
  const detail = page.locator(".wine-detail:visible").first();
  const actions = detail.getByRole("region", { name: "Azioni sul vino", exact: true });
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 1440 ? 900 : 844 });
    const title = detail.getByRole("heading", { name: wine.name, exact: true });
    await title.scrollIntoViewIfNeeded();
    const quick = (await actions.boundingBox())!;
    const heading = (await title.boundingBox())!;
    const metrics = (await detail.locator(".detail-hero-metrics").boundingBox())!;
    const drinking = (await detail.locator(".detail-hero-window").boundingBox())!;
    expect(quick.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    expect(quick.y + quick.height).toBeLessThanOrEqual(metrics.y);
    expect(quick.y + quick.height).toBeLessThanOrEqual(drinking.y);
    for (const label of ["Registra bevuta", "Registra vendita"]) {
      const button = detail.getByRole("button", { name: label, exact: true });
      await expect(button).toHaveCount(1);
      await expect(button).toBeInViewport({ ratio: 1 });
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(quick.x);
      expect(box.x + box.width).toBeLessThanOrEqual(quick.x + quick.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`wine-quick-actions-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await detail.getByRole("heading", { name: wine.name, exact: true }).scrollIntoViewIfNeeded();
  await actions.getByRole("button", { name: "Registra bevuta", exact: true }).click();
  await expect(detail.getByLabel("Data in formato giorno, mese, anno", { exact: true })).toBeVisible();
});

test("tasting score offers half points when recording a bottle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWineDetail(page);
  const detail = page.locator(".wine-detail:visible").first();
  await detail.getByRole("button", { name: "Registra bevuta", exact: true }).click();
  // The consume form opens outside the detail column on compact screens.
  const score = page.getByRole("combobox", { name: "Punteggio vino", exact: true });
  expect(await score.evaluate((select: HTMLSelectElement) => Array.from(select.options, (option) => [option.value, option.text]))).toEqual([
    ["0", "Non specificato"],
    ...Array.from({ length: 12 }, (_, index) => [String((index + 1) / 2), `${(index + 1) / 2}/6`]),
  ]);
  await score.selectOption("4.5");
  await expect(score).toHaveValue("4.5");
  // The app's fixture intercepts fetch in the page; record the consume body there.
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (init?.method === "POST" && String(input).includes("/consume")) sessionStorage.setItem("consume-body", String(init.body));
      return original(input, init);
    };
  });
  await page.getByRole("button", { name: "Salva degustazione", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("consume-body") || "{}").tasting_rating)).toBe(4.5);
});

test("tasting date calendar icon stays centred in the field on hover", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWineDetail(page);
  const detail = page.locator(".wine-detail:visible").first();
  await detail.getByRole("button", { name: "Registra bevuta", exact: true }).click();
  const field = detail.getByLabel("Data in formato giorno, mese, anno", { exact: true });
  const calendar = detail.getByRole("button", { name: "Apri calendario", exact: true });
  await expect(calendar).toBeVisible();
  await field.scrollIntoViewIfNeeded();
  const input = (await field.boundingBox())!;
  const rest = (await calendar.boundingBox())!;
  await calendar.hover();
  // Let any hover transition settle before measuring.
  await page.waitForTimeout(400);
  const hovered = (await calendar.boundingBox())!;
  expect(Math.abs(hovered.y - rest.y)).toBeLessThanOrEqual(1);
  const centre = hovered.y + hovered.height / 2;
  expect(Math.abs(centre - (input.y + input.height / 2))).toBeLessThanOrEqual(2);
  expect(hovered.y).toBeGreaterThanOrEqual(input.y);
  expect(hovered.y + hovered.height).toBeLessThanOrEqual(input.y + input.height);
  await page.screenshot({ path: testInfo.outputPath("tasting-date-calendar-hover.png"), clip: { x: input.x - 16, y: input.y - 40, width: input.width + 32, height: input.height + 80 } });
});

test("restaurant quick sale and glass actions are visible at the start of the detail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [], false, memberships, [wine], { ...session, active_household_mode: "restaurant", restaurant_mode_available: true });
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
  const detail = page.locator(".wine-detail:visible").first();
  const actions = detail.getByRole("region", { name: "Azioni sul vino", exact: true });
  for (const label of ["Registra vendita", "Registra mescita"]) {
    await expect(actions.getByRole("button", { name: label, exact: true })).toBeInViewport({ ratio: 1 });
    await expect(actions.getByRole("button", { name: label, exact: true })).toHaveCount(1);
  }
  await expect(actions.getByRole("button", { name: "Registra bevuta", exact: true })).toHaveCount(0);
  const bounds = (await actions.boundingBox())!;
  const window = (await detail.locator(".detail-hero-window").boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(window.y);
});

for (const failFirst of [false, true]) {
  test(`wine detail rechecks central photos on opening and offers an optional choice (${failFirst ? "failed lookup" : "new photo"})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const withoutPhoto = { ...wine, photo_thumbnail_url: "", photo_detail_url: "" };
    await mockApi(page, [], false, undefined, [withoutPhoto]);
    await page.addInitScript(({ wine, withoutPhoto, failFirst }) => {
      const original = window.fetch;
      let current = withoutPhoto;
      let lookups = 0;
      window.fetch = async (input, init) => {
        const url = new URL(String(input), location.href);
        if (url.pathname.endsWith("/wines/photo/suggestions")) {
          lookups++;
          sessionStorage.setItem("detail-photo-lookups", String(lookups));
          if (lookups === 1) return Response.json(failFirst ? { detail: "Unavailable" } : [], { status: failFirst ? 503 : 200 });
          return Response.json([{ source_wine_id: "library-photo-1", thumbnail_url: wine.photo_thumbnail_url, detail_url: wine.photo_detail_url }]);
        }
        if (url.pathname.endsWith("/photo/reuse/library-photo-1")) {
          sessionStorage.setItem("detail-photo-reused", "true");
          current = wine;
          return Response.json(current);
        }
        if (url.pathname.endsWith(`/wines/${wine.id}`)) return Response.json(current);
        return original(input, init);
      };
    }, { wine, withoutPhoto, failFirst });
    await page.goto("/");
    const reopen = async () => {
      const close = page.getByRole("dialog", { name: wine.name, exact: true }).getByRole("button", { name: "Chiudi", exact: true });
      if (await close.isVisible()) await close.click();
      await page.getByRole("button", { name: /^Cantina/ }).first().click();
      await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
      await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
    };
    await reopen();
    await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("detail-photo-lookups")))).toBe(1);
    const detail = page.locator(".wine-detail:visible").first();
    const suggestion = detail.getByRole("complementary", { name: "Foto disponibile", exact: true });
    await expect(suggestion).toHaveCount(0);
    await reopen();
    await expect(suggestion).toBeVisible();
    await expect(suggestion.getByText("Trovata nel database centrale Vinaris. Verifica annata e formato prima di usarla.", { exact: true })).toBeVisible();
    await suggestion.getByRole("button", { name: "Non ora", exact: true }).click();
    await expect(suggestion).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("detail-photo-reused"))).toBeNull();
    await reopen();
    await expect(suggestion).toBeVisible();
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await suggestion.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const box = (await suggestion.boundingBox())!;
      const image = (await suggestion.getByRole("img").boundingBox())!;
      const actions = await suggestion.getByRole("button").all();
      for (const action of actions) {
        const button = (await action.boundingBox())!;
        expect(button.x).toBeGreaterThanOrEqual(box.x);
        expect(button.x + button.width).toBeLessThanOrEqual(box.x + box.width);
        expect(button.y + button.height).toBeLessThanOrEqual(box.y + box.height);
        expect(button.x >= image.x + image.width || button.y >= image.y + image.height).toBe(true);
      }
      if (!failFirst && (width === 390 || width === 1440)) await page.screenshot({ path: testInfo.outputPath(`detail-photo-offer-${width}.png`) });
    }
    await suggestion.getByRole("button", { name: "Usa foto", exact: true }).click();
    await expect(suggestion).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("detail-photo-reused"))).toBe("true");
    const count = await page.evaluate(() => sessionStorage.getItem("detail-photo-lookups"));
    await reopen();
    await expect(suggestion).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("detail-photo-lookups"))).toBe(count);
  });
}

for (const width of [1100, 1440, 1920]) {
  test(`cellar detail column stays steady when selecting a wine ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    const list = page.locator(".wine-list");
    const panel = page.locator(".wine-side-panel");
    const emptyWidth = (await panel.boundingBox())!.width;
    if (width === 1440) await page.screenshot({ path: testInfo.outputPath("empty-cellar-1440.png") });
    await page.locator('[data-wine-row-id="wine-e2e-1"] .wine-title').click();
    await expect(panel.locator(".wine-detail:not(.empty-detail)")).toBeVisible();
    const listBox = (await list.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.width).toBeCloseTo(emptyWidth, 0);
    // The calmer cellar rows leave room for a wider detail panel (up to 680 px).
    expect(panelBox.width).toBeLessThanOrEqual(680);
    expect(listBox.width).toBeGreaterThan(500);
    expect(listBox.x + listBox.width).toBeLessThanOrEqual(panelBox.x);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`selected-cellar-${width}.png`) });
  });
}

test("wine detail separates speculative legacy scores from ratings", async ({ page }, testInfo) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".authenticated-app-shell")).toBeVisible();
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (String(input).endsWith("/wines") || String(input).endsWith("/wines/wine-e2e-1")) {
        const body = await response.json();
        const enrich = (item: object) => ({ ...item, scores: [
          { critic: "Critico ipotetico", score: "92-94", note: "Possibile fascia; da verificare", verification_status: "unverified" },
          { critic: "Fonte documentata", score: "92", note: "Punteggio pubblicato", source_url: "https://example.com/review" },
        ] });
        return new Response(JSON.stringify(Array.isArray(body) ? body.map(enrich) : enrich(body)), { headers: { "Content-Type": "application/json" } });
      }
      return response;
    };
  });
  await page.reload();
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
  const detail = page.locator(".wine-detail:visible").first();
  await detail.locator('summary').filter({ hasText: "Profilo e riconoscimenti" }).click();
  await expect(detail.getByText("Fonte documentata 92", { exact: true })).toBeVisible();
  await expect(detail.getByRole("link", { name: "Consulta la fonte" })).toHaveAttribute("href", "https://example.com/review");
  await expect(detail.getByText("Critico ipotetico 92-94", { exact: true })).toBeHidden();
  await detail.locator("summary").filter({ hasText: "Dati precedenti non verificati" }).click();
  await expect(detail.getByText("Critico ipotetico 92-94", { exact: true })).toBeVisible();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const legacy = (await detail.locator(".unverified-score-section").boundingBox())!;
    const following = (await detail.locator(".unverified-score-section + .detail-section").boundingBox())!;
    expect(legacy.y + legacy.height).toBeLessThanOrEqual(following.y);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await detail.locator('[data-wine-detail-section="03"]').screenshot({ path: testInfo.outputPath("score-review-390.png") });
  await expect(detail.locator('[data-wine-detail-section="03"]')).toHaveScreenshot("critic-score-review-compact.png");
});

test("wine value history can zoom and navigate recent records", async ({ page }, testInfo) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (String(input).endsWith("/wines") || String(input).endsWith("/wines/wine-e2e-1")) {
        const body = await response.json();
        const valueHistory = [
          ["2026-09-20T12:00:00Z", "245", "manual"],
          ["2026-09-25T12:00:00Z", "255", "ai"],
          ["2026-09-27T12:00:00Z", "246", "ai"],
          ["2026-09-28T12:00:00Z", "240", "ai"],
          ["2026-09-29T12:00:00Z", "299", "ai"],
          ["2026-09-30T12:00:00Z", "255", "manual"],
          ["2026-10-01T10:00:00Z", "260", "ai"],
          ["2026-10-01T14:00:00Z", "262", "manual"],
        ].map(([recorded_at, value, source], index) => ({ id: `value-${index}`, recorded_at, value, currency: "CHF", source }));
        const enrich = (item: object) => ({ ...item, order_date: "2022-12-01", value_history: valueHistory });
        return new Response(JSON.stringify(Array.isArray(body) ? body.map(enrich) : enrich(body)), { headers: { "Content-Type": "application/json" } });
      }
      return response;
    };
  });
  await page.reload();
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();

  const detail = page.locator(".wine-detail:visible").first();
  await detail.locator("summary").filter({ hasText: "Prezzi e valore" }).click();
  const card = detail.locator(".value-history-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText("6 / 9 record", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Periodo successivo" })).toBeDisabled();
  await card.getByRole("button", { name: "Periodo precedente" }).click();
  await expect(card.getByRole("button", { name: "Periodo successivo" })).toBeEnabled();
  await card.getByRole("button", { name: "Mostra tutta la cronologia" }).click();
  await expect(card.getByText("9 record", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Aumenta zoom" }).click();
  await expect(card.getByText("7 / 9 record", { exact: true })).toBeVisible();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await card.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await card.locator(".value-history-navigation-actions").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const controls = await card.locator(".value-history-navigation-actions button").evaluateAll(buttons => buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    for (let first = 0; first < controls.length; first += 1) {
      for (let second = first + 1; second < controls.length; second += 1) {
        const a = controls[first];
        const b = controls[second];
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: testInfo.outputPath("value-history-navigation-390.png"), animations: "disabled" });
});

test("wine sensory signature shows intensity and missing values across viewports", async ({ page }, testInfo) => {
  await page.addInitScript(() => sessionStorage.setItem("vinaris-test-sensory", JSON.stringify({
    identity_id: "sensory-test", generation_status: "available", source: "metadata", confidence: 0.65, validated: false,
    dimensions: { body: 0.8, acidity: 0.65, tannin: 0.75, sweetness: 0, aromatic_intensity: 0.7, fruit: 0.8, wood: null, spice: 0.4, minerality: 0.3 },
  })));
  await page.setViewportSize({ width: 390, height: 844 });
  await openWineDetail(page);
  const panel = page.locator('.wine-detail:visible').first().getByRole('region', { name: 'Impronta sensoriale' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.wine-sensory-indicator').filter({ hasText: 'Dolcezza' })).toContainText('0 / 10');
  await expect(panel.locator('.wine-sensory-indicator').filter({ hasText: 'Legno' })).toContainText('Non disponibile');
  await expect(panel).toContainText('Affidabilità: 65%');
  await expect(panel.locator('header').getByText('Stima dai metadati', { exact: true })).toBeVisible();
  const body = panel.locator('.wine-sensory-indicator').filter({ hasText: 'Corpo' });
  await expect(body.locator('dd')).toHaveText('8 / 10');
  await expect(panel.locator('dt')).toHaveCount(9);
  await expect(panel.locator('dd')).toHaveCount(9);
  await expect(panel.locator('.wine-sensory-track')).toHaveCount(9);
  await expect(panel.getByText('Tu', { exact: true })).toHaveCount(0);
  await expect(panel).not.toContainText('indice del tuo gusto');
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 430 ? 932 : width === 1440 ? 900 : 844 });
    const visiblePanel = page.locator('.wine-detail:visible').first().getByRole('region', { name: 'Impronta sensoriale' });
    await visiblePanel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const row of await visiblePanel.locator('.wine-sensory-indicator').all()) {
      const label = (await row.locator('dt').boundingBox())!;
      const value = (await row.locator('dd').boundingBox())!;
      expect(label.x + label.width).toBeLessThanOrEqual(value.x);
      const track = (await row.locator('.wine-sensory-track').boundingBox())!;
      expect(Math.max(label.y + label.height, value.y + value.height)).toBeLessThanOrEqual(track.y);
      expect(track.x).toBeGreaterThanOrEqual(0);
      expect(track.x + track.width).toBeLessThanOrEqual(width);
    }
    await visiblePanel.locator('header').evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: testInfo.outputPath(`sensory-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const compactPanel = page.locator('.wine-detail:visible').first().getByRole('region', { name: 'Impronta sensoriale' });
  await compactPanel.locator('footer').evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: testInfo.outputPath('sensory-compact-footer.png') });
  await compactPanel.locator('header').evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: testInfo.outputPath('sensory-compact-review.png') });
  await expect(page).toHaveScreenshot('wine-sensory-signature-compact.png', { animations: 'disabled' });
});

for (const source of ["ai", "hybrid", "manual"]) {
  test(`wine sensory signature labels ${source} provenance beside its heading`, async ({ page }) => {
    await page.addInitScript(source => sessionStorage.setItem("vinaris-test-sensory", JSON.stringify({
      generation_status: "available", source, confidence: 0.8, validated: true,
      dimensions: { body: 0.8, acidity: 0.65 },
    })), source);
    await openWineDetail(page);
    const header = page.locator('.wine-detail:visible').first().getByRole('region', { name: 'Impronta sensoriale' }).locator('header');
    await expect(header.getByText(source === "manual" ? "Profilo manuale" : "Stima AI", { exact: true })).toBeVisible();
    if (source === "manual") await expect(header.getByText("Stima AI", { exact: true })).toHaveCount(0);
  });
}

test("wine sensory signature omits absent profiles and rejects invalid intensities", async ({ page }) => {
  await openWineDetail(page);
  const detail = page.locator('.wine-detail:visible').first();
  await expect(detail.getByRole('region', { name: 'Impronta sensoriale' })).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('vinaris-test-sensory', JSON.stringify({
    generation_status: 'available', source: 'ai', confidence: 0.2, validated: false,
    dimensions: { body: 3, acidity: -0.2, tannin: '0.8', sweetness: 0 },
  })));
  await page.locator('[data-wine-row-id="wine-e2e-1"] .wine-row').click();
  await page.locator('[data-wine-row-id="wine-e2e-1"] .wine-row').click();
  const panel = detail.getByRole('region', { name: 'Impronta sensoriale' });
  await expect(panel).toBeVisible();
  for (const label of ['Corpo', 'Acidità', 'Tannini']) {
    await expect(panel.locator('.wine-sensory-indicator').filter({ hasText: label })).toContainText('Non disponibile');
  }
  await expect(panel.locator('.wine-sensory-indicator').filter({ hasText: 'Dolcezza' })).toContainText('0 / 10');
});

// Retain the original suite title and viewport for stable test identity.
test.describe("Wine Detail compact/mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("renders functional hierarchy without horizontal overflow", async ({ page }) => {
    await openWineDetail(page);
    const detail = page.locator(".wine-detail:visible").first();
    await expect(detail.getByRole("heading", { name: "Nebbiolo di Test" })).toBeVisible();
    await expect(detail.getByText("Nota di gusto", { exact: true })).toBeVisible();
    await expect(detail.getByText("86% in sintonia con i tuoi gusti", { exact: true })).toBeVisible();
    await expect(detail.getByLabel("Affinità personale: 5 su 6")).toBeVisible();
    await expect(detail.getByText("Stato", { exact: true }).first()).toBeVisible();
    await expect(detail.getByText("Quantità", { exact: true }).first()).toBeVisible();
    await expect(detail.getByRole("heading", { name: "Finestra degustazione" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Registra bevuta", exact: true })).toHaveCount(1);
    await expect(detail.getByRole("button", { name: "Registra vendita", exact: true })).toHaveCount(1);

    const metrics = detail.locator(".detail-hero-metrics");
    const drinkingWindow = detail.locator(".detail-hero-window");
    const photoAction = detail.getByRole("button", { name: "Sostituisci foto", exact: true });
    const origin = detail.getByRole("button", { name: /Origine/ });
    await expect(photoAction).toBeVisible();
    await expect(origin).toBeVisible();
    const metricsBox = (await metrics.boundingBox())!;
    const photoActionBox = (await photoAction.boundingBox())!;
    const originBox = (await origin.boundingBox())!;
    expect(photoActionBox.y + photoActionBox.height).toBeLessThanOrEqual(metricsBox.y);
    expect(originBox.y + originBox.height).toBeLessThanOrEqual(metricsBox.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(detail.locator(".detail-market-block")).not.toHaveAttribute("open", "");
    await expect(detail.locator(".ai-audit-detail")).not.toHaveAttribute("open", "");
  });

  test("opens a wine detail from tasting history on mobile", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Diario", exact: true }).click();
    await page.getByText("Nebbiolo di Test", { exact: true }).first().click();
    await page.getByRole("button", { name: "Scheda vino", exact: true }).click();

    const detailDialog = page.getByRole("dialog", { name: "Nebbiolo di Test" });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.locator(".wine-detail").getByRole("heading", { name: "Nebbiolo di Test" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("keeps the desktop detail smoke path available", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWineDetail(page);
    await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nebbiolo di Test", exact: true }).first()).toBeVisible();
    const expandDetail = page.getByRole("button", { name: "Espandi dettaglio vino", exact: true }).first();
    await expect(expandDetail).toBeVisible();
    await expandDetail.click();
    await expect(page.locator(".wine-detail-modal")).toBeVisible();
  });

  test("keeps the mobile layout free of horizontal overflow at supported widths", async ({ page }) => {
    for (const viewport of [{ width: 360, height: 800 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      await openWineDetail(page);
      await expect(page.locator(".wine-detail:visible").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });

  test("matches the compact visual baseline", async ({ page }) => {
    await openWineDetail(page);
    await expect(page).toHaveScreenshot("wine-detail-compact.png", { fullPage: true });
  });
});


async function persistStarEdits(page: Page) {
  // The app's fixture intercepts fetch; wrap it to persist explicit star edits.
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      if (url.pathname === "/api/v1/wines/wine-e2e-1" && init?.method === "PATCH") {
        const data = JSON.parse(String(init.body));
        sessionStorage.setItem("personal-stars-saved", JSON.stringify(data));
        const response = await original(input, init);
        return Response.json({ ...await response.json(), ...data });
      }
      return original(input, init);
    };
  });
}

test("personal stars set half points by holding a star and reset across responsive widths", async ({ page }, testInfo) => {
  await openWineDetail(page);
  await persistStarEdits(page);
  const detail = page.locator(".wine-detail:visible").first();
  const input = detail.locator(".rating-input");
  const star = (n: number) => input.getByRole("button", { name: `: ${n}/6`, exact: false });
  // Pointer devices get the hold hint as a tooltip, not as text.
  await expect(input).toHaveAttribute("title", "Tieni premuta una stella per il mezzo punto");
  await expect(detail.locator(".rating-input-hint")).toBeHidden();
  // Holding a star sets the half point below it; the release must not also set the whole point.
  await star(5).click({ delay: 700 });
  await expect(input).toHaveAttribute("aria-label", /: 4\.5\/6$/);
  await expect(input.locator("button.half-filled")).toHaveCount(1);
  await expect(star(5)).toHaveAttribute("aria-pressed", "mixed");
  await expect(page.locator('[data-wine-row-id="wine-e2e-1"] .star-rating')).toHaveAttribute("aria-label", /4\.5\/6$/);
  await expect(page.locator('[data-wine-row-id="wine-e2e-1"] .star-rating .half-filled')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("personal-stars-saved") || "null"))).toEqual({ rating: 4.5 });
  for (const [width, height] of [[360, 800], [390, 844], [430, 932], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await input.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const controls = await input.locator("button:visible").all();
    let previousRight = 0;
    for (const control of controls) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(previousRight);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      previousRight = box.x + box.width;
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`half-stars-${width}.png`), fullPage: true });
    if (width === 390) await expect(page).toHaveScreenshot("wine-detail-half-stars-compact.png", { fullPage: true });
  }
  await star(1).click({ delay: 700 });
  await expect(input).toHaveAttribute("aria-label", /: 0\.5\/6$/);
  await expect(input.locator("button.half-filled")).toHaveCount(1);
  await star(6).click();
  await expect(input).toHaveAttribute("aria-label", /: 6\/6$/);
  await expect(input.locator("button.half-filled")).toHaveCount(0);
  // Arrow keys step by half a point for keyboard users.
  await star(6).press("ArrowLeft");
  await expect(input).toHaveAttribute("aria-label", /: 5\.5\/6$/);
  await input.getByRole("button", { name: "0", exact: true }).click();
  await expect(input).toHaveAttribute("aria-label", /: 0\/6$/);
  await expect(input.locator("button.filled, button.half-filled")).toHaveCount(0);
});

test.describe("personal stars on touch screens", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("shows the hold hint under the stars without overlapping the title block", async ({ page }, testInfo) => {
    await openWineDetail(page);
    const detail = page.locator(".wine-detail:visible").first();
    const input = detail.locator(".rating-input");
    const hint = detail.locator(".rating-input-hint");
    await expect(hint).toHaveText("Tieni premuta una stella per il mezzo punto");
    await expect(input).toHaveAttribute("aria-describedby", (await hint.getAttribute("id"))!);
    for (const [width, height] of [[360, 800], [390, 844], [430, 932]]) {
      await page.setViewportSize({ width, height });
      await expect(hint).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const stars = (await input.boundingBox())!;
      const hintBox = (await hint.boundingBox())!;
      const meta = (await detail.locator(".detail-wine-meta").boundingBox())!;
      expect(hintBox.y).toBeGreaterThanOrEqual(stars.y + stars.height);
      expect(meta.y).toBeGreaterThanOrEqual(hintBox.y + hintBox.height);
      expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(width);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath("half-stars-touch-390.png"), fullPage: true });
    }
  });

  test("holding a star with a finger sets the half point", async ({ page }) => {
    await openWineDetail(page);
    await persistStarEdits(page);
    const input = page.locator(".wine-detail:visible").first().locator(".rating-input");
    const star = input.getByRole("button", { name: ": 4/6", exact: false });
    await star.scrollIntoViewIfNeeded();
    const box = (await star.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // Real touch events (not mouse) with the slight drift of a resting finger.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x + 3, y: point.y + 4 }] });
    await page.waitForTimeout(800);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(input).toHaveAttribute("aria-label", /: 3\.5\/6$/);
    await expect(input.locator("button.half-filled")).toHaveCount(1);
    // A short tap still sets the whole point.
    await input.getByRole("button", { name: ": 6/6", exact: false }).tap();
    await expect(input).toHaveAttribute("aria-label", /: 6\/6$/);
    await expect(input.locator("button.half-filled")).toHaveCount(0);
  });
});

test("AI audit keeps a wine's history beyond the cellar's latest 30 calls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.addInitScript(() => {
    const previous = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      if (url.pathname !== "/api/v1/ai/audit") return previous(input, init);
      const requests = JSON.parse(sessionStorage.getItem("audit-requests") || "[]");
      sessionStorage.setItem("audit-requests", JSON.stringify([...requests, url.search]));
      // The cellar-wide list no longer reaches this wine; its own history does.
      if (url.searchParams.get("entity_id") !== "wine-e2e-1") return Response.json([]);
      return Response.json([{
        id: "audit-old-1", household_id: "household-e2e", user_id: null, entity_type: "wine", entity_id: "wine-e2e-1",
        feature: "ai_value", model: "gpt-test", reasoning_effort: "low", outcome: "success", summary: "Valutazione di sei giorni fa.",
        sources: [], input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, total_tokens: 15, estimated_cost_usd: "0.001000",
        created_at: "2026-10-22T09:00:00Z",
      }]);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.locator('[data-wine-row-id="wine-e2e-1"] article').click();
  const section = page.locator('.wine-detail:visible details[data-wine-detail-section="07"]').first();
  await expect(section.locator("summary small")).toHaveText("1");
  await section.locator("summary").click();
  await expect(section).toContainText("Valutazione di sei giorni fa.");
  const requests = await page.evaluate(() => JSON.parse(sessionStorage.getItem("audit-requests") || "[]"));
  expect(requests).toContain("?entity_type=wine&entity_id=wine-e2e-1");
});
