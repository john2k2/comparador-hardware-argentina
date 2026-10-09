import { test, expect, installSearchCatalog, searchProducts } from './fixtures/deterministic.fixture';

test('la búsqueda conserva las ofertas válidas y explica las fichas apartadas por identidad', async ({ page }) => {
  await installSearchCatalog(page);
  const product = { ...searchProducts[0], name: 'SSD Kingston NV3 1TB', category: 'almacenamiento' };
  await page.route('**/api/search**', (route) => route.fulfill({ json: { products: [product],
    pagination: { limit: 1, offset: 0, total: 2, totalPages: 1, page: 1, pageSize: 12, identityExcludedOnPage: 1 },
    facets: { categories: [], brands: [], stores: [] } } }));
  await page.goto('/search');
  await page.getByPlaceholder('NUEVA BUSQUEDA...').fill('Kingston');
  await page.getByPlaceholder('NUEVA BUSQUEDA...').press('Enter');
  await expect(page.getByText('SSD Kingston NV3 1TB', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Apartamos una ficha con ofertas de otro producto', { exact: false })).toBeVisible();
  await expect(page.getByText('El total del catálogo todavía las incluye', { exact: false })).toBeVisible();
});
