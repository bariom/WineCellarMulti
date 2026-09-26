import { expect, test } from "@playwright/test";
import { wine, mockApi, openWineDetail } from "./fixtures/app";

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
    expect(panelBox.width).toBeLessThanOrEqual(550);
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
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const visiblePanel = page.locator('.wine-detail:visible').first().getByRole('region', { name: 'Impronta sensoriale' });
    await visiblePanel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const row of await visiblePanel.locator('.wine-sensory-indicator').all()) {
      const label = (await row.locator('dt').boundingBox())!;
      const value = (await row.locator('dd').boundingBox())!;
      expect(label.x + label.width).toBeLessThanOrEqual(value.x);
    }
    await visiblePanel.screenshot({ path: testInfo.outputPath(`sensory-${width}.png`) });
    if (width === 390) await expect(visiblePanel).toHaveScreenshot('wine-sensory-signature-compact.png', { animations: 'disabled' });
  }
});

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
    await page.getByRole("button", { name: "Storico", exact: true }).click();
    await page.getByText("Nebbiolo di Test", { exact: true }).first().click();
    await page.getByRole("button", { name: "Apri vino", exact: true }).click();

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
