import { expect, test, installSearchCatalog, searchFromIdle, searchProducts } from './fixtures/deterministic.fixture';
import type { Product } from '../src/lib/types';

test('GPU → CPU → RAM → SSD cambia la categoría automática, también al volver atrás', async ({ page }) => {
  await installSearchCatalog(page);
  const products: Product[] = [
    ['RTX 5090', 'tarjetas-graficas'], ['Ryzen 7600', 'procesadores'],
    ['Memoria DDR5 32GB', 'memoria-ram'], ['SSD NVMe', 'almacenamiento'],
  ].map(([name, category], index) => ({ ...searchProducts[0], id: `category-${index}`, name, category: category as Product['category'] }));
  await page.route('**/api/search**', async route => {
    const params = new URL(route.request().url()).searchParams;
    const matches = products.filter(product => product.name === params.get('q') && (!params.get('category') || params.get('category') === product.category));
    await route.fulfill({ json: { products: matches,
      pagination: { total: matches.length, totalPages: matches.length ? 1 : 0, page: 1, pageSize: 12, offset: 0, limit: matches.length },
      facets: { categories: [], brands: [], stores: [] },
    } });
  });
  await searchFromIdle(page, products[0].name);
  for (const product of products) {
    await page.getByPlaceholder('NUEVA BUSQUEDA...').fill(product.name);
    await page.getByPlaceholder('NUEVA BUSQUEDA...').press('Enter');
    await expect(page.locator('#product-grid-start article').getByRole('heading')).toHaveText(product.name);
    await expect(page.getByRole('combobox', { name: 'CATEGORÍA', exact: true })).toHaveValue(product.category);
    await expect(page).toHaveURL(url => url.searchParams.get('q') === product.name);
  }
  await page.goBack();
  await expect(page.locator('#product-grid-start article').getByRole('heading')).toHaveText('Memoria DDR5 32GB');
  await expect(page.getByRole('combobox', { name: 'CATEGORÍA', exact: true })).toHaveValue('memoria-ram');
});
