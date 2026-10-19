import { expect, test } from "@playwright/test";
import { memberships, mockApi, session, wine } from "./fixtures/app";

const isoDaysFromToday = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

test("the delivery timeline flags past deliveries that never arrived", async ({ page }, testInfo) => {
  const wines = [
    { ...wine, id: "missed-wine", name: "Barolo in ritardo", status: "ordered", expected_delivery: isoDaysFromToday(-12) },
    { ...wine, id: "received-wine", name: "Barolo arrivato", status: "in_cellar", expected_delivery: isoDaysFromToday(-20) },
    { ...wine, id: "future-wine", name: "Barolo in arrivo", status: "ordered", expected_delivery: isoDaysFromToday(40) },
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page, [], false, memberships, wines, session);
  await page.goto("/");
  await page.locator(".dashboard-analysis-switcher > summary").click();
  await page.getByRole("tab", { name: "Timeline", exact: true }).click();

  const missed = page.getByRole("region", { name: "Consegne mancate", exact: true });
  await expect(missed).toBeVisible();
  await expect(missed.locator(".delivery-event")).toHaveCount(1);
  await expect(missed.locator(".delivery-event")).toContainText("Barolo in ritardo");
  await expect(missed.locator(".delivery-event")).toContainText("Consegna mancata");
  await expect(missed.locator(".delivery-event")).toContainText("12 g di ritardo");
  await expect(missed).not.toContainText("Barolo arrivato");
  await expect(page.locator(".timeline-card .delivery-timeline")).toContainText("Barolo in arrivo");
  await expect(page.locator(".timeline-kpi-missed")).toContainText("1");

  for (const [width, height] of [[360, 800], [390, 844], [430, 932], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    await missed.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.locator(".timeline-card").screenshot({ path: testInfo.outputPath(`missed-deliveries-${width}.png`) });
  }
});
