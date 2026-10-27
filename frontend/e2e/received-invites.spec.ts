import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

const invites = [
  { id: "invite-lake", household_id: "household-lake", household_name: "Cantina sul lago", email: "owner@example.com", role: "member", visibility_scope: "shared", expires_at: "2099-11-30T12:00:00Z", accepted_at: null, invite_token: null },
  { id: "invite-hills", household_id: "household-hills", household_name: "Casa in collina", email: "owner@example.com", role: "admin", visibility_scope: "all", expires_at: "2099-12-15T12:00:00Z", accepted_at: null, invite_token: null },
];

for (const width of [390, 1440]) {
  test(`received invitations appear under Cellars and can be declined or accepted ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await mockApi(page, [], true, memberships, [wine], session);
    await page.addInitScript((pending) => {
      const answers: string[] = [];
      (window as unknown as { inviteAnswers: string[] }).inviteAnswers = answers;
      const previous = window.fetch;
      window.fetch = async (input, init) => {
        const path = new URL(String(input instanceof Request ? input.url : input), location.href).pathname;
        if (path === "/api/v1/household/invites/received") return Response.json(pending);
        const answer = path.match(/^\/api\/v1\/household\/invites\/([^/]+)\/(accept|decline)$/);
        if (answer && init?.method === "POST") {
          answers.push(`${answer[2]}:${answer[1]}`);
          pending.splice(pending.findIndex((invite) => invite.id === answer[1]), 1);
          return answer[2] === "accept" ? Response.json({ membership_id: "m-new", role: "member" }) : new Response(null, { status: 204 });
        }
        return previous(input, init);
      };
    }, invites);
    await page.goto("/");
    if (width >= 1100) {
      await page.locator(".topbar").getByRole("button", { name: "Impostazioni", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.getByRole("button", { name: "Impostazioni", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Cantine", exact: true }).click();

    const card = page.getByRole("region", { name: "Ti hanno invitato in una cantina" });
    await expect(card).toBeVisible();
    await expect(card.locator(".invite-row")).toHaveCount(2);
    await expect(card).toContainText("Cantina sul lago");
    await expect(card).toContainText("Membro · Solo posizioni condivise · scade");
    // An administrator sees every wine: no visibility to state.
    await expect(card).toContainText("Casa in collinaAmministratore · scade");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.mouse.move(0, 0);
    await card.screenshot({ path: testInfo.outputPath("received-invites-review.png") });

    const hills = card.locator(".invite-row").filter({ hasText: "Casa in collina" });
    await hills.getByRole("button", { name: "Rifiuta", exact: true }).click();
    await expect(page.getByText("Invito a Casa in collina rifiutato.")).toBeVisible();
    await expect(card.locator(".invite-row")).toHaveCount(1);

    await card.getByRole("button", { name: "Accetta", exact: true }).click();
    await expect(page.getByText("Ora fai parte di Cantina sul lago: la trovi tra le tue cantine.")).toBeVisible();
    await expect(card).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { inviteAnswers: string[] }).inviteAnswers))
      .toEqual(["decline:invite-hills", "accept:invite-lake"]);
  });
}
