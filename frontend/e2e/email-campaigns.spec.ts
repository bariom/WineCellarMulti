import { expect, test, type Page } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

const adminSession = { ...session, is_app_admin: true };

async function mockCampaignApi(page: Page) {
  await page.addInitScript(() => {
    const previous = window.fetch;
    const recipients = [
      { id: "11111111-1111-4111-8111-111111111111", display_name: "Anna Rossi", email: "anna@example.test", locale: "it", opted_out: false },
      { id: "22222222-2222-4222-8222-222222222222", display_name: "Ben Smith", email: "ben@example.test", locale: "en", opted_out: false },
      { id: "33333333-3333-4333-8333-333333333333", display_name: "Luca Verdi", email: "luca@example.test", locale: "it", opted_out: true },
    ];
    const record = (key: string, value: unknown) => {
      const calls = JSON.parse(sessionStorage.getItem(key) || "[]");
      sessionStorage.setItem(key, JSON.stringify([...calls, value]));
    };
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      const path = url.pathname;
      if (!path.startsWith("/api/v1/admin/email-campaigns")) return previous(input, init);
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
      if (path.endsWith("/assets")) {
        return Response.json([
          { id: "lib:home-showcase", kind: "library", title: "La vetrina in home", description: "", url: "/email-library/home-showcase-it.jpg" },
          { id: "lib:diary", kind: "library", title: "Il Diario delle bevute", description: "", url: "/email-library/diary-it.jpg" },
        ]);
      }
      if (path.endsWith("/recipients")) {
        const q = (url.searchParams.get("q") || "").toLowerCase();
        return Response.json(recipients.filter((item) => !q || item.email.includes(q) || item.display_name.toLowerCase().includes(q)));
      }
      if (path.endsWith("/compose")) {
        record("compose-calls", body);
        return Response.json({
          subject: "Novità di ottobre in Vinaris",
          preheader: "La vetrina in home e un Diario più compatto",
          model: "test-model",
          blocks: [
            { type: "heading", text: "Una cantina più luminosa", asset_id: "", caption: "", path: "" },
            { type: "paragraph", text: "Ciao {first_name}, ecco le novità del mese.", asset_id: "", caption: "", path: "" },
            { type: "image", text: "", asset_id: "lib:home-showcase", caption: "La vetrina in home", path: "" },
            { type: "button", text: "Apri la cantina", asset_id: "", caption: "", path: "/?open=cellar" },
          ],
        });
      }
      if (path.endsWith("/preview")) {
        record("preview-calls", body);
        return Response.json({ html: `<html><body><h1>${body.subject}</h1></body></html>`, text: body.subject });
      }
      if (path.endsWith("/test")) {
        record("test-calls", body);
        return Response.json({ delivered: true, email: "e2e@example.test" });
      }
      if (path === "/api/v1/admin/email-campaigns" && init?.method === "POST") {
        record("send-calls", body);
        return Response.json({ id: body.id, subject: body.subject, locale: body.locale, recipient_count: body.recipient_ids.length, sent_count: body.recipient_ids.length, failed_count: 0, created_at: "2026-10-28T10:00:00Z", finished_at: "2026-10-28T10:00:05Z" });
      }
      if (path === "/api/v1/admin/email-campaigns") return Response.json([]);
      return previous(input, init);
    };
  });
}

async function openComposer(page: Page, width: number) {
  await page.setViewportSize({ width, height: width < 1100 ? 844 : 1000 });
  await mockApi(page, [], true, memberships, [wine], adminSession);
  await mockCampaignApi(page);
  await page.goto("/");
  if (width < 1100) {
    await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Impostazioni", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  }
  await page.locator(".settings-tabs").getByRole("tab", { name: "Comunicazioni", exact: true }).click();
  const composer = page.getByRole("region", { name: "Email con le novità" });
  await expect(composer).toBeVisible();
  return composer;
}

for (const width of [390, 1440]) {
  test(`compose, test and send a news e-mail at ${width}`, async ({ page }, testInfo) => {
    const composer = await openComposer(page, width);
    const compose = composer.getByRole("button", { name: "Componi con l'AI" });
    await expect(compose).toBeDisabled();
    await composer.getByLabel("Descrizione per l'AI").fill("Annuncia la vetrina in home e il Diario compatto.");
    await compose.click();
    await expect(composer.getByLabel("Oggetto")).toHaveValue("Novità di ottobre in Vinaris");
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("compose-calls") || "[]"))).toEqual([
      { locale: "it", brief: "Annuncia la vetrina in home e il Diario compatto." },
    ]);
    await expect(composer.locator(".email-block")).toHaveCount(4);
    await expect(composer.locator("iframe.email-preview-frame")).toBeVisible();

    // Edit: move the image above the paragraph, then remove the heading.
    await composer.locator(".email-block").nth(2).getByRole("button", { name: "Sposta su" }).click();
    await expect(composer.locator(".email-block").nth(1)).toHaveClass(/is-image/);
    await composer.locator(".email-block").first().getByRole("button", { name: "Elimina blocco" }).click();
    await expect(composer.locator(".email-block")).toHaveCount(3);

    await composer.getByRole("button", { name: "Invia una prova a me" }).click();
    await expect(composer.getByRole("status")).toContainText("Prova inviata a e2e@example.test");

    // Recipients: an unsubscribed user cannot be selected.
    await expect(composer.locator(".email-recipients li")).toHaveCount(3);
    await expect(composer.getByRole("checkbox", { name: /Luca Verdi/ })).toBeDisabled();
    await composer.getByRole("button", { name: "Seleziona tutti i visibili" }).click();
    await expect(composer.getByText("2 destinatari selezionati")).toBeVisible();
    await composer.getByRole("button", { name: "Invia a 2 destinatari" }).click();
    await expect(composer.getByRole("group", { name: "Conferma invio" })).toContainText("Novità di ottobre in Vinaris");
    expect(await page.evaluate(() => sessionStorage.getItem("send-calls"))).toBeNull();
    await composer.getByRole("button", { name: "Conferma e invia" }).click();
    await expect(composer.getByRole("status")).toContainText("Email inviata a 2 destinatari");
    const [sent] = await page.evaluate(() => JSON.parse(sessionStorage.getItem("send-calls") || "[]"));
    expect(sent.confirm).toBe(true);
    expect(sent.recipient_ids.sort()).toEqual(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
    expect(sent.blocks.map((block: { type: string }) => block.type)).toEqual(["image", "paragraph", "button"]);
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await composer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`email-composer-${width}.png`), fullPage: true });
  });
}

test("users can turn news e-mails off and on from their profile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page, [], true, memberships, [wine], session);
  await page.goto("/");
  await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  const toggle = page.getByRole("checkbox", { name: /Ricevi le novità di Vinaris via email/ });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("vinaris-test-preferences") || "{}").news_email_opt_out)).toBe(true);
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("vinaris-test-preferences") || "{}").news_email_opt_out)).toBe(false);
});

test("e-mail buttons open the requested section and clean the address", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page, [], true, memberships, [wine], session);
  await page.goto("/?open=wishlist");
  await expect(page.getByRole("region", { name: "La tua wishlist" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe("");
});
