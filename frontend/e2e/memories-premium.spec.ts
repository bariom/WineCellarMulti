import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, tastingArchive, wine } from "./fixtures/app";

for (const pack of [false, true]) {
  test(`memories locked on the free plan, AI Pack=${pack}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, [], pack, memberships, [wine], {
      ...session, has_active_entitlement: false, is_free_tier: true, dashboard_focus: "personal",
      theme_preference: pack ? "private-cellar" : "light",
      personal_dashboard_widgets: [{ id: "memories", width: "half" }, { id: "polaroids", width: "half" }],
    });
    await page.addInitScript(() => {
      const original = window.fetch;
      (window as any).premiumMemoryRequests = 0;
      window.fetch = async (input, init) => {
        if (String(input).includes("photos_only=true")) (window as any).premiumMemoryRequests++;
        return original(input, init);
      };
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Personalizza", exact: true })).toBeVisible({ timeout: 15000 });
    for (const id of ["memories", "polaroids"]) {
      const widget = page.locator(`[data-widget-id="${id}"]`);
      await expect(widget.getByText("Premium", { exact: true })).toBeVisible();
      await expect(widget.getByRole("button", { name: "Scopri l’abbonamento", exact: true })).toBeVisible();
      await expect(widget.locator("img, .memory-polaroid")).toHaveCount(0);
    }
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      const widget = page.locator('[data-widget-id="polaroids"]');
      await widget.scrollIntoViewIfNeeded();
      const card = await widget.boundingBox();
      const action = await widget.getByRole("button", { name: "Scopri l’abbonamento", exact: true }).boundingBox();
      expect(action!.x).toBeGreaterThanOrEqual(card!.x);
      expect(action!.x + action!.width).toBeLessThanOrEqual(card!.x + card!.width);
      expect(action!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (viewport.width === 390 || (!pack && viewport.width === 1440)) await page.screenshot({ path: testInfo.outputPath(`memories-locked-${viewport.width}.png`) });
      if (viewport.width === 390) await expect(widget).toHaveScreenshot(pack ? "memories-premium-private-cellar.png" : "memories-premium-compact.png");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Bere bene oggi", exact: true }).click();
    const home = page.getByRole("region", { name: "Momenti", exact: true });
    await expect(home.getByText("Premium", { exact: true })).toBeVisible();
    await home.getByRole("button", { name: "Registra una bevuta", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Registra bevuta", exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Chiudi", exact: true }).click();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Storico", exact: true }).click();
    const locked = page.getByRole("region", { name: "Ricordi Premium", exact: true });
    await expect(locked).toBeVisible();
    await expect(page.getByRole("button", { name: "Momenti · Sfoglia i ricordi", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).premiumMemoryRequests)).toBe(0);
    await locked.getByRole("button", { name: "Scopri l’abbonamento", exact: true }).click();
    await expect(page.getByRole("button", { name: "Acquista abbonamento mensile", exact: true })).toBeVisible();
  });
}

for (const admin of [false, true]) {
  test(`memories accessible to ${admin ? "admin without subscription" : "subscriber"}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, [], false, memberships, [wine], {
      ...session, is_app_admin: admin, has_active_entitlement: !admin, is_free_tier: false,
      dashboard_focus: "personal", personal_dashboard_widgets: [{ id: "polaroids", width: "full" }],
    }, [], undefined, {
      ...tastingArchive, total: 1, items: [{ ...tastingArchive.items[0], occasion: "Ricordo premium", memory_photo_url: "/images/home-tasting-v1.jpg" }],
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Personalizza", exact: true })).toBeVisible({ timeout: 15000 });
    const widget = page.locator('[data-widget-id="polaroids"]');
    await expect(widget.locator(".memory-polaroid")).toHaveCount(1);
    await widget.getByRole("button", { name: "Apri degustazione: Ricordo premium", exact: true }).press("Enter");
    const book = page.getByRole("dialog", { name: "Momenti", exact: true });
    await expect(book.getByRole("heading", { name: "Ricordo premium", exact: true })).toBeVisible();
    await book.getByRole("button", { name: "Chiudi", exact: true }).click();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Storico", exact: true }).click();
    await page.getByRole("button", { name: "Momenti · Sfoglia i ricordi", exact: true }).click();
    await expect(book).toBeVisible();
  });
}
