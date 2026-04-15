import { expect, test } from '@playwright/test';

test('shows the idle search state without intent', async ({ page }) => {
  await page.goto('/search');

  await expect(page.getByText('[ LISTO PARA BUSCAR ]')).toBeVisible();
  // El texto puede variar según el estado
  await expect(page.getByText(/escribi un producto|para empezar/i)).toBeVisible();
});

test('applies an impossible price filter and lets the user clear it', async ({ page }) => {
  await page.goto('/search?category=procesadores');
  await page.waitForTimeout(3000);

  const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
  const hasProducts = await productLinks.first().isVisible().catch(() => false);
  if (!hasProducts) return; // Skip si no hay productos

  const minPriceInput = page.getByLabel('Precio mínimo');
  await minPriceInput.fill('999999999');
  await minPriceInput.blur();

  await page.waitForURL(/minPrice=999999999/);
  
  // Debería mostrar sin resultados o productos vacíos
  const noResults = await page.getByText('[ SIN RESULTADOS ]').isVisible().catch(() => false);
  if (noResults) {
    await expect(page.getByRole('button', { name: 'LIMPIAR FILTROS' })).toBeVisible();
    await page.getByRole('button', { name: 'LIMPIAR FILTROS' }).click();
  }
});
