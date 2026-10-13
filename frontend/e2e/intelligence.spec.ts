import { expect, test } from "@playwright/test";
import { intelligencePlan, mockApi } from "./fixtures/app";

// Retain the original suite title and viewport for stable test identity.
test.describe("Wine Detail compact/mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("explains Intelligence modes in a responsive help dialog", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Piano cantina", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Come usare Intelligence", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Come usare Intelligence" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Equilibrata", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Cosa bere", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Maturazione", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Investimento", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("makes the first AI plan value clear on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.addInitScript(() => {
      const currentFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        if (url.pathname === "/api/v1/ai/cellar-intelligence/latest") {
          return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.pathname === "/api/v1/ai/cellar-intelligence/history") {
          return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return currentFetch(input, init);
      };
    });
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();
    await page.setViewportSize({ width: 390, height: 844 });

    await expect(page.getByRole("heading", { name: "Trasforma i segnali della cantina in un ordine d’azione" })).toBeVisible();
    await expect(page.getByText("bottiglie ancora da decidere", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("shows Intelligence confidence, history, simulation, goals and group actions", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();

    await expect(page.getByText("Il piano riflette dati precedenti", { exact: true })).toBeVisible();
    await expect(page.getByText("Affidabilità 68%", { exact: true })).toBeVisible();
    await expect(page.getByText("DAL PIANO PRECEDENTE", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Simula", exact: true }).click();
    const simulation = page.getByRole("dialog", { name: /Nebbiolo di Test/ });
    await expect(simulation.getByText("BERE ORA", { exact: true })).toBeVisible();
    await expect(simulation.getByText("ATTENDERE", { exact: true })).toBeVisible();
    await expect(simulation.getByText("PROPOSTA INTELLIGENCE", { exact: true })).toBeVisible();
    await expect(simulation.getByText(/Perdita potenziale prudenziale/)).toBeVisible();
    await simulation.getByRole("button", { name: "Chiudi simulazione", exact: true }).click();

    await page.getByText("Imposta la strategia della cantina", { exact: true }).click();
    await expect(page.getByText("Bottiglie da bere all’anno", { exact: true })).toBeVisible();
    await page.getByText("Seleziona e gestisci più vini", { exact: true }).click();
    await expect(page.getByLabel("Filtra per produttore")).toBeVisible();
    await expect(page.getByLabel("Filtra per regione")).toBeVisible();
    await expect(page.getByLabel("Filtra per tipologia")).toBeVisible();
  });

  test("moves a selected group between cellar purposes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], true);
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();
    await page.getByText("Seleziona e gestisci più vini", { exact: true }).click();
    await page.getByRole("button", { name: "Seleziona visibili", exact: true }).click();
    const moveAction = page.locator(".intelligence-group-action-move");
    await moveAction.getByLabel("Nuovo obiettivo per le assegnate").selectOption("drink");
    await moveAction.getByRole("button", { name: "Sposta assegnate", exact: true }).click();
    await expect(page.getByText("4 bottiglie di 1 vini spostate a Bere.", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("shows the AI animation while generating a cellar plan", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, [], true);
    await page.addInitScript((fixturePlan) => {
      const currentFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        if (url.pathname === "/api/v1/ai/cellar-intelligence" && init?.method === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return new Response(JSON.stringify(fixturePlan), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return currentFetch(input, init);
      };
    }, intelligencePlan);
    await page.goto("/");
    await page.locator("summary").filter({ hasText: "Strumenti AI" }).click();
    await page.getByRole("button", { name: "Intelligence", exact: true }).first().click();

    await page.getByRole("button", { name: "Crea piano AI", exact: true }).click();
    const overlay = page.locator(".ai-generation-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay.getByText("Piano della cantina", { exact: true })).toBeVisible();
    await expect(overlay.getByText("Sto analizzando l'intera cantina: obiettivi delle bottiglie, finestre di beva, valori e qualità dei dati.", { exact: true })).toBeVisible();
    await expect(overlay).toBeHidden();
  });
});


test("Intelligence fills the desktop navigation width and stays within mobile bounds", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockApi(page);
  await page.goto("/");
  await page.locator(".view-tabs-ai-group > summary").click();
  await page.getByRole("button", { name: "Intelligence", exact: true }).click();
  const panel = page.locator(".cellar-intelligence");
  await expect(panel.getByRole("heading", { name: "Piano cantina", exact: true })).toBeVisible();
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1440, height: 900 },
    { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    const workspace = (await page.locator(".workspace").boundingBox())!;
    const content = (await panel.boundingBox())!;
    const leftGap = content.x - workspace.x;
    const rightGap = workspace.x + workspace.width - content.x - content.width;
    expect(leftGap).toBeCloseTo(rightGap, 0);
    if (viewport.width >= 1100) {
      const navigation = (await page.locator(".view-tabs").boundingBox())!;
      expect(content.x).toBeCloseTo(navigation.x, 0);
      expect(content.width).toBeCloseTo(navigation.width, 0);
    }
    expect(content.x).toBeGreaterThanOrEqual(0);
    expect(content.x + content.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await panel.getByRole("heading", { name: "Piano cantina", exact: true }).scrollIntoViewIfNeeded();
    if (viewport.width === 1920 || viewport.width === 390) {
      await page.screenshot({ path: testInfo.outputPath(`intelligence-full-width-${viewport.width}.png`) });
    }
  }
});
