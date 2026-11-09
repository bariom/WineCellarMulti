import { expect, test, type Locator, type Page } from "@playwright/test";

// The six mobile checks from the website audit, on a 375x812 phone: hero
// legibility, CTA above the fold, tap targets, plan cards stacking, form inputs
// that do not trigger iOS zoom, and no autoplaying media with sound.

const viewport = { width: 375, height: 812 };

async function mockPublicApi(page: Page) {
  await page.route("**/api/v1/session", (route) => route.fulfill({ json: { authenticated: false } }));
  await page.route("**/api/v1/public-config", (route) => route.fulfill({ json: { free_tier_label_limit: 15 } }));
  await page.addInitScript(() => localStorage.setItem("vinaris.cookie-consent", JSON.stringify({ marketing: false, analytics: false, updatedAt: "2026-09-23T00:00:00Z" })));
  await page.addInitScript(() => localStorage.setItem("vinaris.landing-news", JSON.stringify({ dismissedFor: "9999-12" })));
}

async function expectTapTarget(locator: Locator) {
  const box = (await locator.boundingBox())!;
  expect(box.height, await locator.innerText()).toBeGreaterThanOrEqual(44);
}

async function expectNoSoundAutoplay(page: Page) {
  const loud = await page.evaluate(() => [...document.querySelectorAll("video, audio")].filter((media) => (media as HTMLMediaElement).autoplay && !(media as HTMLMediaElement).muted).length);
  expect(loud).toBe(0);
}

for (const locale of ["it", "en"] as const) {
  test(`${locale}: homepage passes the six mobile checks at 375px`, async ({ page }) => {
    await mockPublicApi(page);
    await page.setViewportSize(viewport);
    await page.goto(`/?lang=${locale}`);
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
    // 1. Hero legibility: a large headline and body copy of at least 15px.
    expect(parseFloat(await h1.evaluate((node) => getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(28);
    const lead = page.locator(".marketing-hero-lead");
    expect(parseFloat(await lead.evaluate((node) => getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(15);
    // 2. Primary CTA above the fold.
    const cta = page.getByRole("button", { name: locale === "it" ? /Crea il tuo account gratis/ : /Create your free account/ }).first();
    const ctaBox = (await cta.boundingBox())!;
    expect(ctaBox.y + ctaBox.height).toBeLessThanOrEqual(viewport.height);
    // 3. Tap targets on the hero CTAs and the menu toggle.
    await expectTapTarget(cta);
    await expectTapTarget(page.getByRole("button", { name: locale === "it" ? /Esplora la demo/ : /Explore the demo/ }).first());
    await expectTapTarget(page.locator(".marketing-menu-toggle"));
    // 4. Plan cards stack vertically.
    const plans = await page.locator(".marketing-plans-grid > *").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans[1].y).toBeGreaterThanOrEqual(plans[0].y + plans[0].height);
    // 5. Registration inputs are at least 16px, so iOS does not zoom on focus.
    await cta.click();
    const inputs = page.locator("form input:visible:not([type=checkbox]):not([type=radio])");
    await expect(inputs.first()).toBeVisible();
    for (const size of await inputs.evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)))) expect(size).toBeGreaterThanOrEqual(16);
    // 6. No media plays sound on its own.
    await expectNoSoundAutoplay(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

for (const path of ["/pricing/index.html", "/it/prezzi/index.html"]) {
  test(`${path} passes the mobile checks at 375px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(path);
    const h1 = page.locator("h1");
    expect(parseFloat(await h1.evaluate((node) => getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(28);
    const firstPlanCta = page.locator(".plan a").first();
    const planBoxes = await page.locator(".plan").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
    expect(planBoxes[1].y).toBeGreaterThanOrEqual(planBoxes[0].y + planBoxes[0].height);
    await expectTapTarget(firstPlanCta);
    await expectTapTarget(page.locator(".header-cta"));
    for (const label of await page.locator(".billing-toggle label").all()) await expectTapTarget(label);
    await expectNoSoundAutoplay(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
