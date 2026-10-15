import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/session", route => route.fulfill({ json: { authenticated: false } }));
  await page.route("**/api/v1/public-config", route => route.fulfill({ json: { free_tier_label_limit: 23 } }));
  await page.addInitScript(() => localStorage.setItem("vinaris.cookie-consent", JSON.stringify({ marketing: false, updatedAt: "2026-09-23T00:00:00Z" })));
  // The updates panel emerges while scrolling; most tests start with it dismissed so the page is stable.
  await page.addInitScript(() => localStorage.setItem("vinaris.landing-news", JSON.stringify({ dismissedFor: "9999-12" })));
});

for (const locale of ["it", "en"] as const) {
  test(`${locale}: updates emerge as a dismissible panel and can be reopened`, async ({ page }, testInfo) => {
    // This test starts with the updates not yet dismissed.
    await page.addInitScript(() => localStorage.removeItem("vinaris.landing-news"));
    await page.goto(`/?lang=${locale}`);
    const title = locale === "it" ? "Meno gestione. Più piacere di collezionare." : "Less admin. More joy in collecting.";
    const news = page.getByRole("region", { name: title });
    const tab = page.getByRole("button", { name: locale === "it" ? "Novità" : "What’s new", exact: true });
    const close = news.getByRole("button", { name: locale === "it" ? "Chiudi le novità" : "Close updates" });
    // Not part of the page flow: nothing at load but a small tab.
    await expect(news).toHaveCount(0);
    await expect(tab).toBeVisible();
    await expect(page.locator("main #news")).toHaveCount(0);
    // It emerges once the visitor has started reading.
    await page.evaluate(() => window.scrollTo(0, window.innerHeight));
    await expect(news).toBeVisible();
    await close.click();
    await expect(news).toHaveCount(0);
    // A closed panel stays closed after a reload and when scrolling again.
    await page.reload();
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
    await page.waitForTimeout(500);
    await expect(news).toHaveCount(0);
    await expect(tab).toBeVisible();
    // The tab and the menu link reopen it, and Escape closes it again.
    await tab.click();
    await expect(news).toBeVisible();
    await expect(news).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(news).toHaveCount(0);

    const selectors = news.getByRole("group").getByRole("button");
    const article = news.getByRole("article");
    const titles = locale === "it" ? ["Dalla fattura alla cantina. In pochi tocchi.", "Certi vini meritano più di una nota.", "La tua cantina. Le tue priorità."] : ["From invoice to cellar. In a few taps.", "Some wines deserve more than a tasting note.", "Your cellar. Your priorities."];
    for (const width of [360, 390, 430, 1200, 1440]) {
      await page.setViewportSize({ width, height: width >= 1200 ? 1000 : 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width < 1161) await page.getByRole("button", { name: locale === "it" ? "Apri menu" : "Open menu" }).click();
      await page.getByRole("link", { name: locale === "it" ? "Novità" : "What’s new", exact: true }).click();
      await expect(news).toBeVisible();
      await expect(selectors).toHaveCount(3);
      await expect(article).toHaveCount(1);
      await expect(news.locator("#news-signup-note")).toContainText("23");
      for (let index = 0; index < 3; index++) {
        await selectors.nth(index).click();
        await expect(selectors.nth(index)).toHaveAttribute("aria-pressed", "true");
        await expect(article.getByRole("heading")).toHaveText(titles[index]);
        await expect(article.locator("time")).toBeVisible();
        const box = (await news.boundingBox())!;
        const cta = (await article.getByRole("button").boundingBox())!;
        const detail = (await article.locator(".landing-news-copy p").boundingBox())!;
        const viewport = page.viewportSize()!;
        // The panel sits fully inside the viewport and never hides more than a sheet's worth of it.
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        expect(box.height).toBeLessThanOrEqual(viewport.height * 0.9);
        expect(cta.y).toBeGreaterThanOrEqual(detail.y + detail.height);
        expect(cta.height).toBeGreaterThanOrEqual(44);
        expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`news-${locale}-${index}-${width}.png`) });
      }
      await close.click();
      await expect(news).toHaveCount(0);
    }

    await tab.click();
    await news.getByRole("button", { name: locale === "it" ? "Novità successiva" : "Next update" }).click();
    await selectors.nth(0).click();
    await news.getByRole("button", { name: locale === "it" ? "Novità successiva" : "Next update" }).click();
    await expect(article.getByRole("heading")).toHaveText(titles[1]);
    await news.getByRole("button", { name: locale === "it" ? "Novità precedente" : "Previous update" }).click();
    await expect(article.getByRole("heading")).toHaveText(titles[0]);
    await selectors.nth(2).focus();
    await page.keyboard.press("ArrowRight");
    await expect(selectors.nth(0)).toBeFocused();
    await expect(article.getByRole("heading")).toHaveText(titles[0]);
    await page.keyboard.press("End");
    await expect(article.getByRole("heading")).toHaveText(titles[2]);
    await page.keyboard.press("Home");
    await expect(article.getByRole("heading")).toHaveText(titles[0]);
    const swipe = async (dx: number, dy: number) => article.evaluate((el, delta) => {
      const start = new Touch({ identifier: 1, target: el, clientX: 250, clientY: 200 });
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [start] }));
      const end = new Touch({ identifier: 1, target: el, clientX: 250 + delta.dx, clientY: 200 + delta.dy });
      el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [end] }));
    }, { dx, dy });
    await swipe(-150, 5);
    await expect(article.getByRole("heading")).toHaveText(titles[1]);
    // A vertical gesture must leave the current slide unchanged.
    await swipe(-10, 150);
    await expect(article.getByRole("heading")).toHaveText(titles[1]);
    for (let index = 0; index < 3; index++) {
      await selectors.nth(index).click();
      await article.getByRole("button").click();
      await expect(page.getByLabel(locale === "it" ? "Conferma password" : "Confirm password", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: locale === "it" ? "Annulla" : "Cancel", exact: true }).click();
    }
  });

  test(`${locale}: registration-led landing stays clear and compact across viewports`, async ({ page }, testInfo) => {
    await page.goto(`/?lang=${locale}`);
    const hero = page.getByRole("region", { name: locale === "it" ? "Sai cosa hai. Sai cosa aprire. Sai quanto vale." : "Know what you have. Know what to open. Know what it’s worth." });
    const register = hero.getByRole("button", { name: locale === "it" ? /Crea il tuo account gratis/ : /Create your free account/ });
    const demo = hero.getByRole("button", { name: locale === "it" ? "Esplora la demo" : "Explore the demo" });
    await expect(register).toBeVisible();
    await expect(register).toHaveClass(/primary/);
    await expect(demo).toHaveClass(/secondary/);
    await expect(hero.locator("#hero-free-note")).toContainText("23");
    await expect(page.locator("#product").getByRole("listitem")).toHaveCount(3);
    const plans = page.locator("#access");
    await expect(plans.getByRole("article").first()).toContainText("23");
    const faq = plans.locator("details");
    await expect(faq).toHaveCount(6);
    const aiPack = faq.filter({ has: page.locator("summary", { hasText: locale === "it" ? "Che cos’è un AI Pack?" : "What is an AI Pack?" }) });
    await aiPack.locator("summary").click();
    await expect(aiPack.locator("p")).toBeVisible();
    await expect(aiPack.locator("p")).toContainText(locale === "it" ? "credito prepagato" : "prepaid credit");
    await expect(aiPack.locator("p")).toContainText(locale === "it" ? "non sostituisce l’abbonamento" : "does not replace the subscription");
    await aiPack.locator("summary").click();
    await faq.nth(1).getByText(locale === "it" ? "Che cosa comprende l’account gratuito?" : "What does the free account include?", { exact: true }).click();
    await expect(faq.nth(1).locator("p")).toBeVisible();
    await expect(faq.nth(1)).toContainText("23");
    const structured = await page.locator('.marketing-site script[type="application/ld+json"]').textContent();
    expect(JSON.parse(structured!).mainEntity[1].acceptedAnswer.text).toContain("23");
    await faq.nth(1).locator("summary").click();
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 900, height: 1000 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      const heading = (await hero.getByRole("heading").boundingBox())!;
      const cta = (await register.boundingBox())!;
      expect(cta.y).toBeGreaterThan(heading.y + heading.height);
      expect(cta.y + cta.height).toBeLessThan(viewport.height);
      expect(cta.height).toBeGreaterThanOrEqual(44);
      expect(cta.x).toBeGreaterThanOrEqual(0);
      expect(cta.x + cta.width).toBeLessThanOrEqual(viewport.width);
      // The hero shows an illustrated phone with the cellar list, labelled as an image.
      await expect(hero.getByRole("img")).toBeVisible();
      for (const selector of [".story-pillar-grid article", ".story-essential-grid li", ".marketing-plans-grid article"]) {
        const boxes = await page.locator(selector).evaluateAll(nodes => nodes.map(n => { const b = n.getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height}; }));
        for (let i = 0; i < boxes.length; i++) {
          const a = boxes[i];
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.x + a.width).toBeLessThanOrEqual(viewport.width);
          for (const b of boxes.slice(i + 1)) expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      // The landing now presents the essentials and the distinctive features; keep it bounded.
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(viewport.width <= 430 ? 15500 : viewport.width <= 900 ? 12500 : 10500);
      if ([390, 1440].includes(viewport.width)) {
        await page.screenshot({ path: testInfo.outputPath(`landing-${locale}-${viewport.width}.png`) });
        await page.screenshot({ path: testInfo.outputPath(`full-landing-${locale}-${viewport.width}.png`), fullPage: true });
        if (viewport.width === 390) await expect(page).toHaveScreenshot(`landing-${locale}-compact.png`, { fullPage: true, animations: "disabled" });
      }
      if (viewport.width < 1161) await page.getByRole("button", { name: locale === "it" ? "Apri menu" : "Open menu" }).click();
      const nav = page.locator("#marketing-navigation").getByRole("navigation");
      await expect(nav.getByRole("link")).toHaveCount(3);
      await nav.getByRole("link", { name: locale === "it" ? "Come funziona" : "How it works" }).click();
      await expect(page).toHaveURL(/#product$/);
    }
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/v1/auth/demo?**", async route => {
      await pending;
      await route.fulfill({ status: 503, json: { detail: "Demo temporarily unavailable" } });
    });
    const request = page.waitForRequest("**/api/v1/auth/demo?**");
    await demo.click();
    expect((await request).method()).toBe("POST");
    await expect(hero.getByRole("button", { name: /Apertura|Opening/ })).toBeDisabled();
    await expect(page.locator(".marketing-conversion-close").getByRole("button", { name: /Apertura|Opening/ })).toBeDisabled();
    release();
    await expect(demo).toBeEnabled();
    await register.click();
    await expect(page.getByLabel(locale === "it" ? "Conferma password" : "Confirm password", { exact: true })).toBeVisible();
  });

  for (const width of [390, 1440]) {
    test(`${locale}: signup preserves consent and email confirmation at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(`/?lang=${locale}`);
      await page.locator(".marketing-hero").getByRole("button", { name: locale === "it" ? /Crea il tuo account gratis/ : /Create your free account/ }).click();
      const form = page.locator("form.registration-form");
      await expect(form).toBeVisible();
      const cellar = form.getByLabel(locale === "it" ? "Nome cantina" : "Cellar name", { exact: true });
      await expect(cellar).toBeHidden();
      await form.getByLabel(locale === "it" ? "Nome" : "Name", { exact: true }).fill("Landing test");
      await form.getByLabel("Email", { exact: true }).fill("landing@example.test");
      await form.getByLabel("Password", { exact: true }).fill("ExamplePass123!");
      await form.getByLabel(locale === "it" ? "Conferma password" : "Confirm password", { exact: true }).fill("ExamplePass123!");
      const submit = form.getByRole("button", { name: locale === "it" ? "Crea account" : "Create account", exact: true });
      await expect(submit).toBeDisabled();
      const consents = form.getByRole("checkbox");
      await expect(consents).toHaveCount(3);
      for (let i=0; i<3; i++) {
        await expect(consents.nth(i)).not.toBeChecked();
        await consents.nth(i).check();
        if (i < 2) await expect(submit).toBeDisabled();
      }
      await expect(submit).toBeEnabled();
      await form.locator("details summary").click();
      await expect(cellar).toBeVisible();
      await cellar.fill(width === 1440 ? "My collection" : "");
      await form.getByLabel("Email", { exact: true }).click();
      await expect(cellar).toHaveValue(width === 1440 ? "My collection" : "Main Cellar");
      await form.locator("details summary").click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await form.screenshot({ path: testInfo.outputPath(`signup-${locale}-${width}.png`) });
      let payload: Record<string, unknown> | undefined;
      await page.route("**/api/v1/auth/register", async route => {
        payload = route.request().postDataJSON();
        await route.fulfill({ json: { authenticated: false, pending_email_verification: true } });
      });
      await submit.click();
      await expect.poll(() => payload).toBeTruthy();
      expect(payload).toMatchObject({ email: "landing@example.test", display_name: "Landing test", household_name: width === 1440 ? "My collection" : "Main Cellar", privacy_policy_accepted: true, terms_accepted: true, photo_usage_disclaimer_accepted: true, locale });
      await expect(page.locator(".verification-email-address")).toHaveText("landing@example.test");
      await expect(form).toHaveCount(0);
    });
  }
}
