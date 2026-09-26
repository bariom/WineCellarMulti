import { expect, test } from "@playwright/test";
import { wine, session, memberships, mockApi } from "./fixtures/app";

for (const width of [360, 390, 430, 1440]) {
  test(`admin announcements preview and safe retry ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await mockApi(page, [], false, memberships, [wine], { ...session, is_app_admin: true });
    await page.goto("/");
    await page.evaluate(() => {
      const original = window.fetch;
      const writes: unknown[] = [];
      Object.assign(window, { announcementWrites: writes });
      window.fetch = async (input, init) => {
        const url = String(input);
        if (!url.includes("/admin/announcements")) return original(input, init);
        if (url.endsWith("/audience")) return new Response(JSON.stringify({ recipient_count: 23 }));
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body));
          writes.push(payload);
          if (writes.length === 1) return new Response(JSON.stringify({ detail: "Temporary error" }), { status: 503 });
          return new Response(JSON.stringify({ ...payload, recipient_count: 23, created_by_user_id: "admin", created_at: "2026-09-26T12:00:00Z" }));
        }
        return new Response("[]");
      };
    });
    if (width < 1100) {
      await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
      await page.getByRole("menuitem", { name: "Impostazioni", exact: true }).click();
    } else await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
    await page.locator(".settings-tabs").getByRole("tab", { name: "Comunicazioni", exact: true }).click();
    const form = page.getByRole("region", { name: "Comunicazioni agli utenti", exact: true });
    await expect(form).toContainText("23 destinatari attuali");
    await form.getByRole("button", { name: "Prepara annuncio nuova grafica", exact: true }).click();
    await expect(form.getByLabel("Titolo", { exact: true })).toHaveValue("Vinaris si rinnova");
    await expect(form.getByLabel("Messaggio", { exact: true })).toHaveValue(/I tuoi vini e i tuoi dati restano invariati/);
    expect(await page.evaluate(() => (window as any).announcementWrites.length)).toBe(0);
    await form.getByLabel("Titolo", { exact: true }).fill("Vinaris si rinnova");
    await form.getByLabel("Messaggio", { exact: true }).fill("La tua cantina ha una nuova veste.\nScopri la Home e le nuove dashboard. <img src=x onerror=alert(1)>");
    await form.getByRole("combobox").selectOption("/home");
    await form.getByRole("button", { name: "Anteprima invio", exact: true }).click();
    const preview = form.getByRole("region", { name: "Anteprima comunicazione" });
    await expect(preview).toContainText("attualmente 23");
    await expect(preview.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).announcementWrites.length)).toBe(0);
    await preview.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("announcement-preview.png") });
    await expect(page.locator(".back-to-top-button")).toBeHidden();
    if (width === 390) await expect(preview).toHaveScreenshot("admin-announcement-preview-compact.png");
    await preview.getByRole("button", { name: "Conferma e invia a tutti", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Invio non confermato");
    await expect(preview.getByRole("button", { name: "Modifica", exact: true })).toBeDisabled();
    await preview.getByRole("button", { name: "Riprova invio", exact: true }).click();
    await expect(form.getByRole("status")).toContainText("inviata a 23 utenti");
    await expect(form.getByRole("region", { name: "Storico comunicazioni" })).toContainText("Vinaris si rinnova");
    const writes = await page.evaluate(() => (window as any).announcementWrites);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[0].confirm).toBe(true);
    await expect(form.getByLabel("Titolo", { exact: true })).toHaveValue("");
  });
}

test("admin announcements are not offered to cellar owners", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
  await expect(page.locator(".settings-tabs")).toBeVisible();
  await expect(page.locator(".settings-tabs").getByRole("tab", { name: "Comunicazioni" })).toHaveCount(0);
});

test("admin announcements appear for recipients and open Home", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const center = {
    items: [{ id: "announcement-copy", source: "notification", kind: "admin_announcement", category: "system", state: "unread",
      title: "Vinaris si rinnova", message: "Scopri la nuova Home.\nI tuoi dati restano invariati.", action_url: "/home",
      action_kind: "open", resource_id: null, actor_label: null, metadata: {}, created_at: "2026-09-26T12:00:00Z", read_at: null, archived_at: null }],
    counts: { total: 1, unread: 1, actionable: 0, attention: 1, actions: 0, updates: 0, system: 1 }, offset: 0, next_offset: null, has_more: false,
  };
  await mockApi(page, [], false, memberships, [wine], session, [], center);
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await page.getByRole("button", { name: "Notifiche", exact: true }).click();
  const section = page.getByRole("region", { name: "Notifiche", exact: true });
  await expect(section).toContainText("Vinaris si rinnova");
  await expect(section.getByText("Scopri la nuova Home.\nI tuoi dati restano invariati.", { exact: true })).toHaveCSS("white-space", "pre-wrap");
  await expect(section.getByRole("button", { name: "Archivia", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("recipient.png") });
  await section.getByRole("button", { name: "Apri", exact: true }).click();
  await expect(page.locator(".cellar-home-hero")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Notifiche", exact: true })).toBeHidden();
});

for (const withCellarReminders of [false, true]) {
  test(`app admin sees pending catalog wines ${withCellarReminders ? "alongside cellar reminders" : "without cellar reminders"}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
    const pendingCatalogEntry = {
      id: "catalog-pending-e2e",
      name: "Nuovo Vino Test",
      producer: "Tenuta E2E",
      region: "Ticino",
      appellation: "Ticino DOC",
      type: "Red",
      format: "Bottle (750ml)",
      country: "Svizzera",
      grapes_text: "Merlot",
      source: "confirmed_recognition",
      is_active: false,
    };
    await mockApi(
      page,
      [],
      false,
      memberships,
      withCellarReminders ? [wine] : [],
      { ...session, is_app_admin: true },
      [pendingCatalogEntry],
    );

    await page.goto("/");

    const notifications = page.getByRole("button", { name: "Notifiche", exact: true });
    // The badge includes live cellar reminders as well as catalog approvals.
    await expect(notifications.locator("strong")).toHaveText(withCellarReminders ? "4" : "1");
    await notifications.click();
    const reminders = page.getByRole("region", { name: "Promemoria operativi" });
    await expect(reminders.getByRole("button", { name: /1 Vini in catalogo da approvare/ })).toBeVisible();
    await expect(reminders.getByRole("button", { name: "Rimanda di 14 giorni" })).toHaveCount(withCellarReminders ? 3 : 0);
    if (withCellarReminders) {
      await expect(reminders.getByRole("button", { name: /Da bere ora/ })).toBeVisible();
      await expect(reminders.getByRole("button", { name: /Valori da aggiornare/ })).toBeVisible();
      await expect(reminders.getByRole("button", { name: /Punteggi mancanti/ })).toBeVisible();
    }
  });
}

test("a wine marked To Collect immediately appears in notifications", async ({ page }) => {
  await mockApi(page, [], false, memberships, [{ ...wine, status: "To Collect" }]);
  await page.goto("/");

  const notifications = page.getByRole("button", { name: "Notifiche", exact: true });
  await expect(notifications.locator("strong")).toBeVisible();
});

test("separates archivable notifications from operational reminders", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const notificationCenter = {
    items: [{
      id: "notification-e2e-1",
      source: "notification",
      kind: "value_updated",
      category: "update",
      state: "unread",
      title: "Valore aggiornato",
      message: "La stima di mercato è stata aggiornata.",
      action_url: null,
      action_kind: "open",
      resource_id: null,
      actor_label: null,
      metadata: {},
      created_at: "2026-09-12T10:00:00Z",
      read_at: null,
      archived_at: null,
    }],
    counts: { total: 1, unread: 1, actionable: 0, attention: 1, actions: 0, updates: 1, system: 0 },
    offset: 0,
    next_offset: null,
    has_more: false,
  };
  await mockApi(page, [], false, memberships, [{ ...wine, status: "To Collect" }], session, [], notificationCenter);
  await page.goto("/");

  await page.getByRole("button", { name: "Notifiche", exact: true }).click();
  await expect(page.getByLabel(/elementi da controllare/)).toBeVisible();

  const notificationSection = page.getByRole("region", { name: "Notifiche" });
  await expect(notificationSection.getByText("Messaggi ed eventi: puoi segnarli come letti o archiviarli.")).toBeVisible();
  await expect(notificationSection.getByRole("button", { name: "Segna letta" })).toBeVisible();
  await expect(notificationSection.getByRole("button", { name: "Archivia" })).toBeVisible();

  const reminderSection = page.getByRole("region", { name: "Promemoria operativi" });
  await expect(reminderSection.getByText(/Derivano dallo stato della cantina/)).toBeVisible();
  await expect(reminderSection.getByText("Non è una notifica da archiviare").first()).toBeVisible();
  await expect(reminderSection.getByRole("button", { name: "Rimanda di 14 giorni" }).first()).toBeVisible();
  await expect(reminderSection.getByRole("button", { name: "Archivia" })).toHaveCount(0);

  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    const [notificationBox, reminderBox] = await Promise.all([notificationSection.boundingBox(), reminderSection.boundingBox()]);
    expect(notificationBox).not.toBeNull();
    expect(reminderBox).not.toBeNull();
    expect(notificationBox!.y + notificationBox!.height).toBeLessThanOrEqual(reminderBox!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
