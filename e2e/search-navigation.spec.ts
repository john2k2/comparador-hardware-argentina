import { expect, test } from '@playwright/test';

test('restores scroll when going back from product detail', async ({ page }) => {
  await page.goto('/search?category=procesadores&page=2');
  await page.waitForTimeout(3000);

  const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
  const hasProducts = await productLinks.first().isVisible().catch(() => false);
  if (!hasProducts) return; // Skip si no hay productos

  await page.evaluate(() => {
    window.scrollTo(0, 1400);
  });
  await page.waitForTimeout(200);

  const targetLink = productLinks.nth(5);
  await expect(targetLink).toBeVisible();

  const beforeScroll = await page.evaluate(() => Math.round(window.scrollY));
  expect(beforeScroll).toBeGreaterThan(400);

  await targetLink.evaluate((link: HTMLAnchorElement) => link.click());
  await page.waitForURL(/\/product\//);
  await expect(page).toHaveURL(/from=%2Fsearch%3Fcategory%3Dprocesadores%26page%3D2/);

  await page.goBack();
  await page.waitForURL(/\/search\?category=procesadores&page=2/);
  await expect(productLinks.first()).toBeVisible();
  await page.waitForTimeout(700);

  const restoredScroll = await page.evaluate(() => Math.round(window.scrollY));
  expect(restoredScroll).toBeGreaterThan(Math.max(350, beforeScroll - 120));
  expect(Math.abs(restoredScroll - beforeScroll)).toBeLessThan(180);
});
