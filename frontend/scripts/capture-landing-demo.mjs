import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Capture the public, read-only demo. No account credentials or invented UI.
const browser = await chromium.launch();
try {
  for (const locale of ['it', 'en']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await page.goto(`https://vinaris.app/?lang=${locale}`);
    await page.getByRole('button', { name: 'Rifiuta', exact: true }).click();
    await page.getByRole('button', { name: locale === 'it' ? /^(Esplora|Prova) la cantina demo$/ : /^(Explore|Try) the demo cellar$/ }).first().click();
    if (process.argv.includes('--map-only')) {
      await page.setViewportSize({ width: 1100, height: 1000 });
      await page.getByText(locale === 'it' ? 'Focus collezionista' : 'Collector focus', { exact: true }).first().click();
      const map = page.locator('.wine-geography-leaflet');
      await page.locator('.collector-atlas').scrollIntoViewIfNeeded();
      await map.waitFor();
      await map.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.waitForFunction(() => {
        const tiles = [...document.querySelectorAll('.wine-geography-leaflet img.leaflet-tile')];
        return tiles.length > 0 && tiles.every(img => img.complete && img.naturalWidth > 0);
      });
      await page.evaluate(() => document.fonts.ready);
      await map.screenshot({ path: fileURLToPath(new URL(`../public/landing/demo-regions-${locale}.png`, import.meta.url)), animations: 'disabled' });
      await page.close();
      continue;
    }
    if (process.argv.includes('--collector-only')) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByText(locale === 'it' ? 'Focus collezionista' : 'Collector focus', { exact: true }).first().click();
      await page.locator('.collector-mobile-highlights').getByText('Ferrari Perlé', { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => {
        const img = document.querySelector('.collector-mobile-highlights img');
        return img && img.complete && img.naturalWidth > 0;
      });
      await page.locator('img').evaluateAll(images => Promise.all(images.filter(img => img.complete).map(img => img.decode().catch(() => {}))));
      await page.screenshot({ path: fileURLToPath(new URL(`../public/landing/vinaris-demo-mobile-${locale}.png`, import.meta.url)), animations: 'disabled' });
      await page.close();
      continue;
    }
    await page.getByText(locale === 'it' ? 'Bere bene oggi' : 'Drink well today', { exact: true }).first().click();
    const card = page.locator('.daily-tone-group').first();
    await card.getByRole('button').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.daily-picks-card img').evaluateAll(images => Promise.all(images.map(img => img.decode().catch(() => {}))));
    await page.locator('.daily-picks-card').screenshot({ path: fileURLToPath(new URL(`../public/landing/demo-drink-desktop-${locale}.png`, import.meta.url)), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    // Let the responsive layout settle before centering the card clear of sticky navigation.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForFunction(() => {
      const rect = document.querySelector('.daily-tone-group')?.getBoundingClientRect();
      return rect && rect.top > 100 && rect.bottom < innerHeight - 85;
    });
    await card.screenshot({ path: fileURLToPath(new URL(`../public/landing/demo-drink-mobile-${locale}.png`, import.meta.url)), animations: 'disabled' });
    await page.close();
  }
} finally {
  await browser.close();
}
