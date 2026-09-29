import { expect, test } from "@playwright/test";
import { mockApi, wine, session, memberships } from "./fixtures/app";

test("new user setup saves preferences together and does not return after reload", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, onboarding_completed: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const setup = page.getByRole("region", { name: "Configurazione iniziale" });
  await expect(setup).toBeVisible();
  await setup.getByRole("button", { name: "Continua", exact: true }).click();
  await expect(setup.getByRole("alert")).toContainText("Scegli il tuo mercato");
  await setup.getByLabel("Mercato di riferimento", { exact: true }).selectOption("CH");
  await setup.getByRole("button", { name: "Continua", exact: true }).click();
  await setup.getByRole("radio", { name: /Bere bene oggi/ }).check();
  await setup.getByLabel("Budget vino quotidiano (CHF), facoltativo").fill("45");
  await setup.getByRole("button", { name: "Salva e apri la cantina" }).click();
  await expect(setup).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("vinaris-test-preferences") || "{}"))).toMatchObject({ onboarding_completed: true, locale: "it", market_country: "CH", dashboard_focus: "daily", daily_wine_budget_chf: 45 });
  await page.reload();
  await expect(page.locator(".authenticated-app-shell")).toBeVisible();
  await expect(setup).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  const dailyBudget = page.locator(".daily-budget-setting").getByRole("spinbutton");
  await expect(dailyBudget).toHaveValue("45");
  await dailyBudget.fill("35");
  await page.getByRole("button", { name: "Salva impostazioni", exact: true }).click();
  await expect(dailyBudget).toHaveValue("35");
});

test("existing user can defer and resume setup and retry without losing choices", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, onboarding_completed: false, market_country: "DE" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const setup = page.getByRole("region", { name: "Configurazione iniziale" });
  await expect(setup.getByLabel("Mercato di riferimento", { exact: true })).toHaveValue("DE");
  await setup.getByRole("button", { name: "Più tardi" }).click();
  await expect(setup).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("vinaris-test-preferences"))).toBeNull();
  await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  await page.getByRole("button", { name: "Completa configurazione", exact: true }).click();
  await setup.getByRole("button", { name: "Continua", exact: true }).click();
  await expect(setup.getByRole("radio", { name: /Cantina equilibrata/ })).toBeChecked();
  await setup.getByLabel("Budget vino quotidiano (CHF), facoltativo").fill("-1");
  await setup.getByRole("button", { name: "Salva e apri la cantina" }).click();
  await expect(setup.getByRole("alert")).toContainText("maggiore di zero");
  await setup.getByLabel("Budget vino quotidiano (CHF), facoltativo").fill("30");
  await page.evaluate(() => sessionStorage.setItem("vinaris-test-save-error", "1"));
  await setup.getByRole("button", { name: "Salva e apri la cantina" }).click();
  await expect(setup.getByRole("alert")).toContainText("Save unavailable");
  await expect(setup.getByLabel("Budget vino quotidiano (CHF), facoltativo")).toHaveValue("30");
  await setup.getByRole("button", { name: "Indietro" }).click();
  await expect(setup.getByLabel("Mercato di riferimento", { exact: true })).toHaveValue("DE");
  await setup.getByRole("button", { name: "Continua", exact: true }).click();
  await page.evaluate(() => sessionStorage.removeItem("vinaris-test-save-error"));
  await setup.getByRole("button", { name: "Salva e apri la cantina" }).click();
  await expect(setup).toHaveCount(0);
});

test("setup remains readable on compact and desktop screens", async ({ page }, testInfo) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, onboarding_completed: false, market_country: "CH" });
  await page.goto("/");
  const setup = page.getByRole("region", { name: "Configurazione iniziale" });
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const step of [1, 2]) {
      await expect(setup).toBeVisible();
      const card = (await setup.boundingBox())!;
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(width);
      const header = (await setup.locator("header").boundingBox())!;
      const footer = (await setup.locator("footer").boundingBox())!;
      expect(header.y + header.height).toBeLessThanOrEqual(footer.y);
      for (const button of await setup.locator("footer button").all()) {
        const box = (await button.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(card.x);
        expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await setup.screenshot({ path: testInfo.outputPath(`setup-${step}-${width}.png`) });
      if (width === 390) await expect(setup).toHaveScreenshot(`personal-onboarding-step-${step}-compact.png`, { animations: "disabled" });
      if (step === 1) await setup.getByRole("button", { name: "Continua", exact: true }).click();
    }
    await setup.getByRole("button", { name: "Indietro" }).click();
  }
});

test("demo accounts bypass personal setup", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, is_demo: true, onboarding_completed: false });
  await page.goto("/");
  await expect(page.locator(".authenticated-app-shell")).toBeVisible();
  await expect(page.locator(".personal-onboarding")).toHaveCount(0);
});

test("required legal acceptance is shown before personal setup", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, requires_legal_acceptance: true, onboarding_completed: false });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Accetta e continua/ })).toBeVisible();
  await expect(page.locator(".personal-onboarding")).toHaveCount(0);
});

test("setup supports English and an explicit international market", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, onboarding_completed: false });
  await page.goto("/");
  await page.locator(".personal-onboarding").getByLabel("Lingua", { exact: true }).selectOption("en");
  const setup = page.getByRole("region", { name: "Initial setup" });
  await setup.getByLabel("Reference market", { exact: true }).selectOption("");
  await setup.getByRole("button", { name: "Continue", exact: true }).click();
  await setup.getByRole("button", { name: "Save and open cellar", exact: true }).click();
  await expect(setup).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("vinaris-test-preferences") || "{}"))).toMatchObject({ onboarding_completed: true, market_country: "", locale: "en", daily_wine_budget_chf: null });
});

test("restaurant setup preserves its dashboard and existing budget", async ({ page }) => {
  await mockApi(page, [], false, memberships, [wine], { ...session, active_household_mode: "restaurant", onboarding_completed: false, market_country: "IT", daily_wine_budget_chf: "50" });
  await page.goto("/");
  const setup = page.getByRole("region", { name: "Configurazione iniziale" });
  await setup.getByRole("button", { name: "Continua", exact: true }).click();
  await expect(setup.getByRole("radio")).toHaveCount(0);
  await setup.getByRole("button", { name: "Salva e apri la cantina" }).click();
  await expect(setup).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("vinaris-test-preferences") || "{}"));
  expect(saved).not.toHaveProperty("dashboard_focus");
  expect(saved).not.toHaveProperty("daily_wine_budget_chf");
});
