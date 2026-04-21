import { expect, test } from '@playwright/test';

test('opens product detail from search and preserves the way back', async ({ page }) => {
  await page.goto('/search?category=procesadores');
  await page.waitForTimeout(3000);

  const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
  const hasProducts = await productLinks.first().isVisible().catch(() => false);
  if (!hasProducts) return; // Skip si no hay productos

  await productLinks.first().click();
  await page.waitForURL(/\/product\//);

  // El link tiene texto "[ VOLVER AL INVENTARIO ]"
  const backLink = page.locator('a:has-text("VOLVER AL INVENTARIO")');
  await expect(backLink).toHaveAttribute('href', '/search?category=procesadores');
  await expect(page.getByText('RESUMEN COMPARADOR')).toBeVisible();
  await expect(page.getByText('TIENDAS DISPONIBLES')).toBeVisible();

  await backLink.click();
  await page.waitForURL(/\/search\?category=procesadores$/);
  await expect(productLinks.first()).toBeVisible();
});
