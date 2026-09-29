import { expect, test, installSearchCatalog, searchFromIdle } from './fixtures/deterministic.fixture';

test.beforeEach(async ({ page }) => { await installSearchCatalog(page); });

test('shows the idle search state without intent', async ({ page }) => {
  await page.goto('/search');
  await expect(page.getByText('[ LISTO PARA BUSCAR ]', { exact: true })).toBeVisible();
  await expect(page.getByText('Escribi un producto para empezar (ej: RTX 5060, Ryzen 7600).')).toBeVisible();
  await expect(page.locator('#product-grid-start article')).toHaveCount(0);
});

test('an impossible price filter yields no results and clearing restores the query results', async ({ page }) => {
  await searchFromIdle(page);
  const cards = page.locator('#product-grid-start article');
  await expect(cards).toHaveCount(12);
  await page.getByLabel('Precio mínimo').fill('999999999');
  await page.getByLabel('Precio mínimo').blur();
  await expect(page).toHaveURL((url) => url.searchParams.get('minPrice') === '999999999');
  await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: 'LIMPIAR FILTROS', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'Ryzen' && !url.searchParams.has('minPrice'));
  await expect(page.getByLabel('Precio mínimo')).toHaveValue('');
  await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toHaveCount(0);
  await expect(cards).toHaveCount(12);
  await expect(cards.first().getByRole('heading')).toHaveText('AMD Ryzen fixture 01');
  await expect(page.getByText('RESULTADOS: 13 ITEMS', { exact: true })).toBeVisible();
});
