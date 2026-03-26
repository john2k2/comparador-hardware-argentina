import { expect, test } from '@playwright/test';

test('opens product detail from search and preserves the way back', async ({ page }) => {
  await page.goto('/search?category=procesadores');

  const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
  await expect(productLinks.first()).toBeVisible();

  await productLinks.first().click();
  await page.waitForURL(/\/product\//);

  await expect(page.getByRole('link', { name: /\[ VOLVER AL INVENTARIO \]/ })).toHaveAttribute(
    'href',
    '/search?category=procesadores',
  );
  await expect(page.getByText('RESUMEN COMPARADOR')).toBeVisible();
  await expect(page.getByText('TIENDAS DISPONIBLES')).toBeVisible();

  await page.getByRole('link', { name: /\[ VOLVER AL INVENTARIO \]/ }).click();
  await page.waitForURL(/\/search\?category=procesadores$/);
  await expect(productLinks.first()).toBeVisible();
});
