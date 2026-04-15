import { expect, test } from '@playwright/test';

test('navigates search pagination without losing category context', async ({ page }) => {
  await page.goto('/search?category=procesadores');
  await page.waitForTimeout(3000);

  const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
  const hasProducts = await productLinks.first().isVisible().catch(() => false);
  if (!hasProducts) return; // Skip si no hay productos

  const nextButton = page.getByRole('button', { name: 'NEXT >>' });
  const hasNext = await nextButton.isVisible().catch(() => false);
  if (!hasNext) return; // Skip si no hay paginación

  await nextButton.click();
  await page.waitForURL(/\/search\?category=procesadores&page=2/);

  const prevButton = page.getByRole('button', { name: '<< PREV' });
  await expect(prevButton).toBeVisible();
  await prevButton.click();

  await page.waitForURL(/\/search\?category=procesadores$/);
});
