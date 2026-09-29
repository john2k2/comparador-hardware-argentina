import { test as base, expect, type Page } from '@playwright/test';
import type { Product } from '../../src/lib/types';

export const browserNow = new Date('2026-09-21T12:10:00.000Z');

export const test = base.extend<{ isolatedNetwork: void }>({
  isolatedNetwork: [async ({ context, baseURL }, use) => {
    if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
      throw new Error('These fixtures require a local server.');
    }
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(baseURL).origin || url.pathname.startsWith('/api/')) {
        await route.abort('blockedbyclient');
      } else {
        await route.continue();
      }
    });
    await use();
  }, { auto: true }],
});
export { expect };

export const searchProducts: Product[] = Array.from({ length: 13 }, (_, index) => ({
  id: `e2e-cpu-${index + 1}`,
  name: `AMD Ryzen fixture ${String(index + 1).padStart(2, '0')}`,
  brand: 'AMD',
  model: `fixture-${index + 1}`,
  category: 'procesadores',
  image: '/e2e-product.svg',
  specs: {},
  prices: [{ storeId: 'fixture-store', storeName: 'Fixture Store', price: 100_000 + index * 1_000,
    url: `https://store.example/cpu-${index + 1}`, stock: 'in-stock', installment: null,
    lastUpdated: new Date('2026-09-21T12:00:00.000Z') }],
  lowestPrice: 100_000 + index * 1_000,
  highestPrice: 100_000 + index * 1_000,
  averagePrice: 100_000 + index * 1_000,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-21T12:00:00.000Z'),
}));

export async function installSearchCatalog(page: Page) {
  await page.clock.setFixedTime(browserNow);
  await page.route('**/e2e-product.svg', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="gray"/></svg>',
  }));
  await page.route('**/api/search**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const query = params.get('q') ?? '';
    const category = params.get('category');
    const min = Number(params.get('minPrice') ?? 0);
    const matches = searchProducts.filter((product) =>
      (!category || category === product.category) &&
      (!query || product.name.toLowerCase().includes(query.toLowerCase())) && product.lowestPrice >= min);
    const pageSize = 12;
    const totalPages = Math.ceil(matches.length / pageSize);
    const pageNumber = Math.max(1, Math.min(Number(params.get('page')) || 1, totalPages || 1));
    const offset = (pageNumber - 1) * pageSize;
    const products = matches.slice(offset, offset + pageSize);
    await route.fulfill({ json: { products,
      pagination: { total: matches.length, totalPages, page: pageNumber, pageSize, offset, limit: products.length },
      facets: { categories: [], brands: [], stores: [] },
    } });
  });
}

export async function searchFromIdle(page: Page, query = 'Ryzen') {
  await page.goto('/search');
  await expect(page.getByText('[ LISTO PARA BUSCAR ]', { exact: true })).toBeVisible();
  await page.getByPlaceholder('NUEVA BUSQUEDA...').fill(query);
  await page.getByPlaceholder('NUEVA BUSQUEDA...').press('Enter');
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === query);
}
