import { expect, test } from "@playwright/test";
import { mockApi, memberships, session, wine } from "./fixtures/app";

for (const locale of ["it", "en"] as const) {
  test(`Ambassador affiliation can be granted, updated and revoked (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockApi(page, [], true, memberships, [wine], { ...session, locale, is_app_admin: true });
    await page.addInitScript(() => {
      const previous = window.fetch;
      let user = {
        id: "ambassador-user", email: "ambassador@example.test", display_name: "Ambassador Test",
        is_approved: true, is_app_admin: false, is_blocked: false, has_demo_access: false,
        can_use_restaurant_mode: false, can_use_label_recognition: false, can_manage_wine_photos: false,
        has_active_subscription: false, subscription_plan: null, subscription_cancel_at_period_end: false,
        access_override_until: null, ai_credit_balance_usd: "2", standard_ai_credit_balance_usd: "2",
        is_ambassador: false, ambassador_until: null as string | null, ambassador_ai_credit_balance_usd: "0",
        approved_at: null, entitlement_valid_until: null as string | null, entitlement_days_remaining: null as number | null,
        last_activity_at: null, last_activity_days_ago: null,
      };
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.href).pathname;
        if (path.endsWith("/auth/users")) return Response.json([user]);
        if (path.endsWith("/auth/pending-users")) return Response.json([]);
        if (path.endsWith("/auth/users/ambassador-user") && init?.method === "PATCH") {
          const change = JSON.parse(String(init.body));
          sessionStorage.setItem("ambassador-last-change", JSON.stringify(change));
          if (change.ambassador) {
            user = { ...user, is_ambassador: true, ambassador_until: change.ambassador.valid_until,
              ambassador_ai_credit_balance_usd: change.ambassador.ai_credit_target_usd,
              ai_credit_balance_usd: String(2 + Number(change.ambassador.ai_credit_target_usd)),
              entitlement_valid_until: change.ambassador.valid_until, entitlement_days_remaining: 30 };
          } else if (change.revoke_ambassador) {
            user = { ...user, is_ambassador: false, ambassador_until: null, ambassador_ai_credit_balance_usd: "0", ai_credit_balance_usd: "2", entitlement_valid_until: null, entitlement_days_remaining: null };
          }
          return Response.json(user);
        }
        return previous(input, init);
      };
    });
    await page.goto("/");
    await page.getByRole("button", { name: it ? "Impostazioni" : "Settings", exact: true }).click();
    await page.getByRole("tab", { name: it ? "Utenti" : "Users", exact: true }).click();
    await page.getByRole("listitem").filter({ hasText: "ambassador@example.test" }).click();
    const editor = page.locator("details").filter({ has: page.locator("summary strong", { hasText: "Vinaris Ambassador" }) });
    await editor.locator("summary").click();
    const expiry = editor.getByLabel(it ? "Scadenza affiliazione" : "Affiliation expiry", { exact: true });
    const credit = editor.getByLabel(it ? "Saldo AI Ambassador da impostare (USD)" : "Target Ambassador AI balance (USD)", { exact: true });
    const save = editor.getByRole("button", { name: it ? "Salva affiliazione Ambassador" : "Save Ambassador affiliation", exact: true });
    await expiry.fill("2027-01-31T18:00");
    await credit.fill("15");
    await save.click();
    await expect(editor.getByText(it ? "Affiliazione attiva" : "Active affiliation", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("ambassador-last-change")!))).toEqual({ ambassador: { valid_until: new Date("2027-01-31T18:00").toISOString(), ai_credit_target_usd: "15" } });
    await credit.fill("20");
    await save.click();
    await expect(credit).toHaveValue("20");
    for (const width of [1440, 360, 390, 430]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await editor.scrollIntoViewIfNeeded();
      for (const control of [expiry, credit, save]) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        if (width <= 430) expect(box.height).toBeGreaterThanOrEqual(44);
      }
      const expiryBox = (await expiry.boundingBox())!;
      const creditBox = (await credit.boundingBox())!;
      expect(creditBox.y).toBeGreaterThanOrEqual(expiryBox.y + expiryBox.height);
      const saveBox = (await save.boundingBox())!;
      expect(saveBox.y).toBeGreaterThanOrEqual(creditBox.y + creditBox.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await editor.screenshot({ path: testInfo.outputPath(`ambassador-editor-${locale}-${width}.png`) });
    }
    await editor.getByRole("button", { name: it ? "Revoca affiliazione" : "Revoke affiliation", exact: true }).click();
    await expect(editor.getByText(it ? "Accesso promozionale a tempo" : "Time-limited promotional access", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("ambassador-last-change")!))).toEqual({ revoke_ambassador: true });
  });

  test(`Ambassador sees affiliation expiry and promotional budget without admin tools (${locale})`, async ({ page }, testInfo) => {
    const it = locale === "it";
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockApi(page, [], true, memberships, [wine], { ...session, locale, is_app_admin: false, is_ambassador: true, ambassador_until: "2027-01-31T17:00:00Z", has_active_entitlement: true, restaurant_mode_available: true, can_use_label_recognition: true, can_manage_wine_photos: true });
    await page.addInitScript(() => {
      const previous = window.fetch;
      window.fetch = async (input, init) => {
        if (new URL(String(input), location.href).pathname.endsWith("/billing/status")) return Response.json({
          has_active_entitlement: true, active_source: "ambassador", valid_until: "2027-01-31T17:00:00Z", entitlements: [], available_redeem_codes: [],
          is_ambassador: true, ambassador_until: "2027-01-31T17:00:00Z", ambassador_ai_credit_balance_usd: "15", standard_ai_credit_balance_usd: "2", ai_credit_balance_usd: "17", ai_credit_pack_size_usd: "5", can_purchase_ai_credits: true,
        });
        return previous(input, init);
      };
    });
    await page.goto("/");
    await page.getByRole("button", { name: it ? "Impostazioni" : "Settings", exact: true }).click();
    await expect(page.getByRole("tab", { name: it ? "Utenti" : "Users", exact: true })).toHaveCount(0);
    const status = page.getByRole("status").filter({ hasText: "Vinaris Ambassador" });
    await expect(status).toContainText("15");
    await expect(status).toContainText(it ? "Il credito omaggio scade" : "Promotional credit expires");
    for (const width of [360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await status.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390) await status.screenshot({ path: testInfo.outputPath(`ambassador-status-${locale}-${width}.png`) });
    }
  });
}
