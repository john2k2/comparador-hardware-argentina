import { expect, test } from '@playwright/test';

test('opens product detail from search and preserves the way back', async ({ page }) => {
  await page.goto('/comparar/procesadores');
  const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
  await expect(productLinks.first()).toBeVisible();

  await productLinks.first().click();
  await page.waitForURL(/\/product\//);

  // El retorno conserva la categoría inicial, que resuelve a su landing canónica.
  const backLink = page.getByRole('link', { name: 'Volver al catálogo', exact:true });
  await expect(backLink).toHaveAttribute('href', '/search?category=procesadores');
  await expect(page.getByText('MEJOR PRECIO REGISTRADO', { exact:true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ofertas por tienda', exact:true })).toBeVisible();

  await backLink.click();
  await page.waitForURL(/\/comparar\/procesadores$/);
  await expect(productLinks.first()).toBeVisible();
});
