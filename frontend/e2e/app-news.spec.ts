import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

async function setup(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("vinaris.e2e-news-seen")) {
      localStorage.setItem("vinaris.e2e-news-seen", "1");
      sessionStorage.setItem("vinaris.e2e-show-news", "1");
      localStorage.removeItem("vinaris.app-news");
    }
  });
  await mockApi(page, [], true, memberships, [wine], { ...session, locale: "it", has_active_entitlement: true, is_free_tier: false, theme_preference: "light" });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 800 }, { width: 1440, height: 1000 }]) {
  test(`signed-in users see the updates once and can reopen them at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.install();
    await setup(page);
    await page.goto("/");
    const news = page.getByRole("region", { name: "Meno gestione. Più piacere di collezionare." });
    await expect(page.locator(".app-shell, .authenticated-app-shell").first()).toBeVisible();
    await expect(news).toHaveCount(0);
    await page.clock.runFor(6000);
    await expect(news).toBeVisible();
    const article = news.getByRole("article");
    await expect(article.getByRole("heading")).toHaveText("Una foto. Tutta la cantina dentro.");
    // Signed in, the update leads to the feature instead of the sign-up.
    await expect(news.getByRole("button", { name: /Crea il tuo account/ })).toHaveCount(0);
    await expect(page.locator("#news-signup-note")).toHaveCount(0);
    const box = (await news.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    if (viewport.width < 1000) {
      // Above the bottom navigation, which stays usable.
      const navigation = (await page.getByRole("navigation", { name: "Navigazione principale" }).boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(navigation.y + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`app-news-${viewport.width}.png`) });

    await news.getByRole("button", { name: "Chiudi le novità" }).click();
    await expect(news).toHaveCount(0);
    await page.reload();
    await page.clock.runFor(6000);
    await expect(news).toHaveCount(0);

    if (viewport.width < 1000) {
      await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
      await page.getByRole("menuitem", { name: "Novità" }).click();
    } else {
      await page.getByRole("button", { name: "Novità", exact: true }).click();
    }
    await expect(news).toBeVisible();
    await news.getByRole("button", { name: /^Prova l'inserimento veloce/ }).click();
    await expect(news).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Fotografa le tue bottiglie" })).toBeVisible();
  });
}

test("the shelf scanner update opens the buying view on the shelf", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Novità", exact: true }).click();
  const news = page.getByRole("region", { name: "Meno gestione. Più piacere di collezionare." });
  await news.getByRole("button", { name: "Scaffale AI", exact: true }).click();
  await news.getByRole("button", { name: /^Apri lo Scaffale AI/ }).click();
  await expect(page.locator(".buying-view")).toBeVisible();
  await expect(page.locator(".buying-place-switch button").nth(1)).toHaveAttribute("aria-pressed", "true");
});

test("the updates tab can be hidden for a week, and returns with something new", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  await page.goto("/");
  const tab = page.getByRole("button", { name: "Novità", exact: true });
  // Read first, so the panel does not emerge by itself in the middle of the test.
  await tab.click();
  await page.getByRole("button", { name: "Chiudi le novità" }).click();
  await expect(tab).toBeVisible();
  await page.getByRole("button", { name: "Nascondi Novità per 7 giorni" }).click();
  await expect(tab).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".authenticated-app-shell")).toBeVisible();
  await expect(tab).toHaveCount(0);

  // A week later it is back.
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("vinaris.app-news") || "{}");
    localStorage.setItem("vinaris.app-news", JSON.stringify({ ...stored, tabHiddenUntil: Date.now() - 1000 }));
  });
  await page.reload();
  await expect(tab).toBeVisible();

  // Hidden again, it also returns as soon as a newer update is published.
  await page.getByRole("button", { name: "Nascondi Novità per 7 giorni" }).click();
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("vinaris.app-news") || "{}");
    localStorage.setItem("vinaris.app-news", JSON.stringify({ ...stored, tabHiddenFor: "2000-01-01" }));
  });
  await page.reload();
  await expect(tab).toBeVisible();
});
