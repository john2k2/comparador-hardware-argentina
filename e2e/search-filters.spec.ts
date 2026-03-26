import { expect, test } from '@playwright/test';

test('shows the idle search state without intent', async ({ page }) => {
  await page.goto('/search');

  await expect(page.getByText('[ LISTO PARA BUSCAR ]')).toBeVisible();
  await expect(page.getByText('Escribi un producto para empezar')).toBeVisible();
});

test('applies an impossible price filter and lets the user clear it', async ({ page }) => {
  await page.goto('/search?category=procesadores');

  const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
  await expect(productLinks.first()).toBeVisible();

  const minPriceInput = page.getByLabel('Precio mínimo');
  await minPriceInput.fill('999999999');
  await minPriceInput.blur();

  await page.waitForURL(/minPrice=999999999/);
  await expect(page.getByText('[ SIN RESULTADOS ]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'LIMPIAR FILTROS' })).toBeVisible();

  await page.getByRole('button', { name: 'LIMPIAR FILTROS' }).click();
  await page.waitForURL(/\/search$/);
  await expect(page.getByText('[ LISTO PARA BUSCAR ]')).toBeVisible();
});
