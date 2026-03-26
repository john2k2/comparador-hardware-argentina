import { expect, test } from '@playwright/test';

test('navigates search pagination without losing category context', async ({ page }) => {
  await page.goto('/search?category=procesadores');

  const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
  await expect(productLinks.first()).toBeVisible();

  const nextButton = page.getByRole('button', { name: 'NEXT >>' });
  await expect(nextButton).toBeVisible();
  await nextButton.click();

  await page.waitForURL(/\/search\?category=procesadores&page=2/);
  await expect(productLinks.first()).toBeVisible();

  const prevButton = page.getByRole('button', { name: '<< PREV' });
  await expect(prevButton).toBeVisible();
  await prevButton.click();

  await page.waitForURL(/\/search\?category=procesadores$/);
  await expect(productLinks.first()).toBeVisible();
});
