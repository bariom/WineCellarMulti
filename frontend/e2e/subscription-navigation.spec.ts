import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

for (const { width, locale, theme } of [
  { width: 360, locale: "it", theme: "light" }, { width: 390, locale: "it", theme: "light" },
  { width: 430, locale: "it", theme: "light" }, { width: 1440, locale: "it", theme: "light" },
  { width: 390, locale: "en", theme: "private-cellar" },
  { width: 390, locale: "it", theme: "dark" }, { width: 1440, locale: "it", theme: "private-cellar" },
] as const) {
  test(`Explore AI Pack opens subscription management at ${width}px (${locale}, ${theme})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await mockApi(page, [], false, memberships, [wine], {
      ...session, locale, theme_preference: theme, is_free_tier: true, has_active_entitlement: false, dashboard_focus: "daily",
    });
    await page.addInitScript(() => {
      const previous = window.fetch;
      (window as any).checkoutRequests = 0;
      window.fetch = async (input, init) => {
        const url = new URL(String(input), location.href);
        if (url.pathname.endsWith("/billing/checkout")) (window as any).checkoutRequests++;
        const response = await previous(input, init);
        if (url.pathname.endsWith("/billing/status")) return Response.json({ ...await response.json(), has_active_entitlement: false, is_free_tier: true, can_purchase_ai_credits: true });
        return response;
      };
    });
    await page.goto("/");
    const notice = page.getByRole("status", { name: "AI Pack", exact: true });
    const explore = notice.getByRole("button", { name: locale === "it" ? "Scopri AI Pack" : "Explore AI Pack", exact: true });
    await notice.scrollIntoViewIfNeeded();
    await explore.scrollIntoViewIfNeeded();
    await notice.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const panel = (await notice.boundingBox())!;
    const action = (await explore.boundingBox())!;
    const dismiss = (await notice.getByRole("button", { name: /seven days|sette giorni/ }).boundingBox())!;
    expect(action.height).toBeGreaterThanOrEqual(44);
    expect(dismiss.height).toBeGreaterThanOrEqual(44);
    expect(action.x).toBeGreaterThanOrEqual(panel.x);
    expect(action.x + action.width).toBeLessThanOrEqual(dismiss.x);
    expect(dismiss.x + dismiss.width).toBeLessThanOrEqual(panel.x + panel.width);
    const title = (await notice.getByText(locale === "it" ? "Potenzia questa area con l’AI" : "Enhance this area with AI", { exact: true }).boundingBox())!;
    expect(width <= 700 ? title.y + title.height <= action.y : title.x + title.width <= action.x).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`ai-pack-notice-${width}-${theme}.png`) });
    if ((width === 390 && locale === "it") || (width === 1440 && theme === "private-cellar")) {
      await expect(notice).toHaveScreenshot(`ai-pack-notice-${width}-${theme}.png`);
    }
    await explore.click();
    const name = locale === "it" ? "Abbonamento e AI Pack" : "Subscription and AI Pack";
    const section = page.getByRole("region", { name, exact: true });
    const heading = section.getByRole("heading", { name, exact: true });
    await expect(heading).toBeFocused();
    await expect(section).toContainText(locale === "it"
      ? "Le funzioni Premium, inclusi Ricordi e Polaroid, richiedono un abbonamento. Nel piano gratuito le funzioni AI richiedono un AI Pack."
      : "Premium features, including Memories and Polaroids, require a subscription. AI features on the free plan require an AI Pack.");
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(section.getByRole("button", { name: locale === "it" ? "Gestisci abbonamento" : "Manage subscription", exact: true })).toBeInViewport({ ratio: 1 });
    const box = (await heading.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await page.evaluate(() => (window as any).checkoutRequests)).toBe(0);
    if (locale === "it" && [390, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`subscription-destination-${width}.png`) });
    if (width === 360) {
      await page.goto("/");
      await notice.getByRole("button", { name: /sette giorni/ }).click();
      await expect(notice).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("tab", { name: "Bere bene oggi", exact: true })).toBeVisible();
      await expect(notice).toHaveCount(0);
    }
  });
}
