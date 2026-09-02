import { expect, test } from "@playwright/test";

test("Italian guide exposes crawlable SEO metadata and a clear conversion path", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/it/guide/quale-vino-bere-oggi/");

  await expect(page).toHaveTitle(/Quale vino bere oggi dalla tua cantina/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://vinaris.app/it/guide/quale-vino-bere-oggi/",
  );
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    "href",
    "https://vinaris.app/en/guides/which-wine-to-drink-today/",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quale vino bere oggi dalla tua cantina?");
  await expect(page.getByRole("link", { name: "Crea la tua cantina" }).first()).toHaveAttribute("href", "/#access");
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true);
});

test("English guide index links to distinct English article URLs", async ({ page }) => {
  await page.goto("/en/guides/");

  await expect(page).toHaveTitle(/Guides for organising and enjoying your wine cellar/);
  await expect(page.getByRole("link", { name: "Read the guide" }).first()).toHaveAttribute(
    "href",
    "/en/guides/which-wine-to-drink-today/",
  );
  await expect(page.locator('link[rel="alternate"][hreflang="it"]')).toHaveAttribute(
    "href",
    "https://vinaris.app/it/guide/",
  );
});

test("Italian guide index uses Italian category labels", async ({ page }) => {
  await page.goto("/it/guide/");

  await expect(page.getByText("Bere bene oggi", { exact: true })).toBeVisible();
  await expect(page.getByText("Gestione della cantina", { exact: true })).toBeVisible();
  await expect(page.getByText("Scegli il tuo sistema", { exact: true })).toBeVisible();
  await expect(page.getByText("Drink well today", { exact: true })).toHaveCount(0);
});
