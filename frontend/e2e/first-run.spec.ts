import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

// The first minutes of a newcomer: an empty cellar welcomes instead of showing zeros,
// and the cookie banner speaks the page language without hiding the sign-up form.

for (const locale of ["it", "en"] as const) {
  test(`an empty cellar opens on a welcome with one clear first step (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await mockApi(page, [], false, memberships, [], { ...session, locale, onboarding_completed: true });
    for (const [width, height] of [[390, 844], [1440, 900]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      const welcome = page.getByRole("region", { name: it ? "La tua cantina è pronta. Aggiungi il primo vino." : "Your cellar is ready. Add your first wine." });
      await expect(welcome).toBeVisible();
      // No dashboard full of zeros underneath.
      await expect(page.locator(".home-dashboard")).toHaveCount(0);
      await expect(welcome.getByRole("list", { name: it ? "Cosa vedrai con i primi vini" : "What you will see with your first wines" }).getByRole("listitem")).toHaveCount(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`welcome-${locale}-${width}.png`) });
    }
    await page.getByRole("button", { name: it ? "Aggiungi il primo vino" : "Add your first wine", exact: true }).click();
    await expect(page.getByRole("dialog").filter({ hasText: it ? /Aggiungi/ : /Add/ }).first()).toBeVisible();
  });
}

test("the welcome leads to importing a list, and steps aside once the cellar has a wine", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], false, memberships, [], { ...session, onboarding_completed: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Importa un elenco", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Dati", exact: true })).toHaveAttribute("aria-selected", "true");

  const filled = await page.context().newPage();
  await mockApi(filled, [], false, memberships, [wine], { ...session, onboarding_completed: true });
  await filled.setViewportSize({ width: 1440, height: 900 });
  await filled.goto("/");
  await expect(filled.locator(".home-dashboard")).toBeVisible();
  await expect(filled.locator(".empty-cellar-welcome")).toHaveCount(0);
});

test("an empty cellar list says it is empty, not that filters hide everything", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, [], false, memberships, [], { ...session, onboarding_completed: true });
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await expect(page.getByText("La tua cantina è ancora vuota", { exact: true })).toBeVisible();
  await expect(page.getByText("Nessun vino corrisponde ai filtri", { exact: true })).toHaveCount(0);
});

test("the cookie banner speaks English on the English page and leaves the sign-up form usable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/v1/session", route => route.fulfill({ json: { authenticated: false } }));
  await page.route("**/api/v1/public-config", route => route.fulfill({ json: { free_tier_label_limit: 15 } }));
  await page.goto("/?lang=en");
  const banner = page.getByRole("dialog", { name: "Your cookie preferences" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Reject", exact: true })).toBeVisible();
  await expect(banner.getByRole("link", { name: "Read the privacy policy" })).toHaveAttribute("href", "/privacy?lang=en#cookies");
  await page.getByRole("button", { name: /Create (your )?(free )?account|Sign up|Get started/i }).first().click();
  const card = page.locator(".auth-modal-card");
  await expect(card.getByPlaceholder("name@example.com")).toBeVisible();
  const cardBox = (await card.boundingBox())!;
  const bannerBox = (await banner.boundingBox())!;
  // The form ends above the banner; it scrolls instead of hiding fields underneath.
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(bannerBox.y + 1);
  await banner.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(banner).toHaveCount(0);
  // Without the banner the form takes its usual height again.
  await expect.poll(async () => (await card.boundingBox())!.height).toBeGreaterThan(cardBox.height);
});
