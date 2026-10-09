import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

for (const { width, locale } of [
  { width: 360, locale: "it" }, { width: 390, locale: "it" },
  { width: 430, locale: "it" }, { width: 1440, locale: "it" },
  { width: 390, locale: "en" },
] as const) {
  test(`Explore AI Pack opens subscription management at ${width}px (${locale})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await mockApi(page, [], false, memberships, [wine], {
      ...session, locale, is_free_tier: true, has_active_entitlement: false, dashboard_focus: "daily",
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
    await page.getByRole("button", { name: locale === "it" ? "Scopri AI Pack" : "Explore AI Pack", exact: true }).click();
    const name = locale === "it" ? "Abbonamento e AI Pack" : "Subscription and AI Pack";
    const section = page.getByRole("region", { name, exact: true });
    const heading = section.getByRole("heading", { name, exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(section.getByRole("button", { name: locale === "it" ? "Gestisci abbonamento" : "Manage subscription", exact: true })).toBeInViewport({ ratio: 1 });
    const box = (await heading.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await page.evaluate(() => (window as any).checkoutRequests)).toBe(0);
    if (locale === "it" && [390, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`subscription-destination-${width}.png`) });
  });
}
