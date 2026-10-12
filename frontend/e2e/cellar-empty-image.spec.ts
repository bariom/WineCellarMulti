import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures/app";

const scenes = ["stone", "modern", "rustic", "red-glass", "white-glasses", "tasting-glasses"] as const;
for (const [index, scene] of scenes.entries()) {
  const random = (index + 0.1) / scenes.length;
  test(`cellar illustration ${scene} loads and remains stable during navigation`, async ({ page }, testInfo) => {
    await mockApi(page);
    await page.addInitScript(value => {
      Math.random = () => value;
      const key = "vinaris.cellar-empty-scene.v1";
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, "/images/premium-cellar-empty.jpg");
    }, random);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    const image = page.locator(".empty-detail-image img");
    const src = `/images/cellar-${scene}-v1.webp`;
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", src);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(1000);
    const pictureBox = (await image.boundingBox())!;
    const headingBox = (await page.getByRole("heading", { name: "Nessun elemento selezionato" }).boundingBox())!;
    expect(pictureBox.y + pictureBox.height).toBeLessThanOrEqual(headingBox.y);
    for (const [width, height] of [[1440, 800], [1440, 1000], [1920, 900]]) {
      await page.setViewportSize({ width, height });
      const coverage = await image.evaluate((img: HTMLImageElement) => {
        const imageBox = img.getBoundingClientRect();
        const frame = img.parentElement!;
        const frameBox = frame.getBoundingClientRect();
        const style = getComputedStyle(frame);
        return {
          fit: getComputedStyle(img).objectFit,
          width: imageBox.width,
          height: imageBox.height,
          frameWidth: frameBox.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
          frameHeight: frameBox.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
        };
      });
      expect(coverage.fit).toBe("cover");
      expect(coverage.width).toBeCloseTo(coverage.frameWidth, 0);
      expect(coverage.height).toBeCloseTo(coverage.frameHeight, 0);
      if (width === 1440) await page.screenshot({ path: testInfo.outputPath(`cellar-${scene}-${width}x${height}.png`) });
    }
    await page.screenshot({ path: testInfo.outputPath(`cellar-${scene}-desktop.png`) });
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    await expect(image).toHaveAttribute("src", src);
    await page.reload();
    await page.getByRole("button", { name: /^Cantina/ }).first().click();
    await expect(image).not.toHaveAttribute("src", src);
    for (const [width, height] of [[360, 800], [390, 844], [430, 932]]) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 390 && scene === "stone") await page.screenshot({ path: testInfo.outputPath("cellar-mobile-390.png") });
    }
  });
}

test("cellar illustration falls back safely when images and storage are unavailable", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) {
      if (key === "vinaris.cellar-empty-scene.v1") throw new Error("Storage unavailable");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function(key, value) {
      if (key === "vinaris.cellar-empty-scene.v1") throw new Error("Storage unavailable");
      return set.call(this, key, value);
    };
  });
  await page.route("**/images/cellar-*-v1.webp", route => route.fulfill({ status: 404 }));
  await page.goto("/");
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  const image = page.locator(".empty-detail-image img");
  await expect(image).toHaveAttribute("src", "/images/premium-cellar-empty.jpg");
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.route("**/images/premium-cellar-empty.jpg", route => route.fulfill({ status: 404 }));
  await page.reload();
  await page.getByRole("button", { name: /^Cantina/ }).first().click();
  await expect(image).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Nessun elemento selezionato" })).toBeVisible();
});
