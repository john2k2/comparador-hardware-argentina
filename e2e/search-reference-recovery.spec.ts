import { expect, test, installSearchCatalog, searchFromIdle, searchProducts } from './fixtures/deterministic.fixture';
import type { Product } from '../src/lib/types';

const cases: Array<[string, Product['category']]> = [
  ['RTX 5090', 'tarjetas-graficas'], ['RTX 5080', 'tarjetas-graficas'],
  ['Ryzen 9800X3D', 'procesadores'], ['Kingston NV3', 'almacenamiento'],
  ['Memoria DDR5 32GB', 'memoria-ram'],
];
const response = (products: Product[]) => ({ products,
  pagination: { total: products.length, totalPages: products.length ? 1 : 0, page: 1, pageSize: 12, offset: 0, limit: products.length },
  facets: { categories: [], brands: [], stores: [] },
});

test.beforeEach(async ({ page }) => { await installSearchCatalog(page); });

for (const [query, category] of cases) {
  test(`${query}: muestra automáticamente fichas antiguas sin convertirlas en ofertas actuales`, async ({ page }) => {
    if (query === 'RTX 5090') await page.setViewportSize({ width: 390, height: 844 });
    const reference = { ...searchProducts[0], id: `reference-${category}`, name: query, category,
      prices: searchProducts[0].prices.map(price => ({ ...price, lastUpdated: new Date('2026-09-10T12:00:00Z') })) };
    const seen: URL[] = [];
    await page.route('**/api/search**', async route => {
      const url = new URL(route.request().url());
      seen.push(url);
      await route.fulfill({ json: response(url.searchParams.get('includeUnavailable') === '1' ? [reference] : []) });
    });
    await searchFromIdle(page, query);
    await expect(page.getByText('[ PRODUCTO EN EL CATÁLOGO ]', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Fichas del catálogo sin ofertas recientes' }).getByRole('heading', { name: query, exact: true })).toBeVisible();
    await expect(page.locator('#product-grid-start article')).toContainText('ÚLTIMO PRECIO RELEVADO');
    await expect(page.getByRole('checkbox', { name: 'Mostrar también productos sin oferta reciente' })).not.toBeChecked();
    await expect(page).toHaveURL(url => !url.searchParams.has('includeUnavailable'));
    expect(seen).toHaveLength(2);
    expect(seen[1].searchParams.get('q')).toBe(query);
    expect(seen[1].searchParams.get('category')).toBe(seen[0].searchParams.get('category'));
    await page.getByRole('button', { name: 'VER TODAS LAS FICHAS', exact: true }).click();
    await expect(page).toHaveURL(url => url.searchParams.get('includeUnavailable') === '1');
    await expect(page.getByRole('checkbox', { name: 'Mostrar también productos sin oferta reciente' })).toBeChecked();
    await expect(page.locator('#product-grid-start article')).toHaveCount(1);
    expect(seen).toHaveLength(2); // Reutiliza sólo la caché de referencias.
    await page.goBack();
    await expect(page.getByText('[ PRODUCTO EN EL CATÁLOGO ]', { exact: true })).toBeVisible();
    await expect(page.getByText('OFERTAS RECIENTES: 0', { exact: true })).toBeVisible();
    expect(await page.locator('html').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test('ofertas vigentes no disparan la consulta adicional', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/search')) requests.push(request.url()); });
  await searchFromIdle(page);
  await expect(page.locator('#product-grid-start article')).toHaveCount(12);
  expect(requests).toHaveLength(1);
});

test('sin coincidencias reales termina sin inventar fichas', async ({ page }) => {
  await searchFromIdle(page, 'zzzzmodeloquenoexiste');
  await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
  await expect(page.locator('#product-grid-start article')).toHaveCount(0);
  await expect(page.getByText('[ PRODUCTO EN EL CATÁLOGO ]', { exact: true })).toHaveCount(0);
});

test('un fallo de referencias se informa y permite reintentar en la misma búsqueda', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/search**', route => {
    if (!new URL(route.request().url()).searchParams.has('includeUnavailable')) return route.fulfill({ json: response([]) });
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
      : route.fulfill({ json: response([{ ...searchProducts[0], name: 'RTX 5090', category: 'tarjetas-graficas', prices: [] }]) });
  });
  await searchFromIdle(page, 'RTX 5090');
  await expect(page.getByText('No pudimos consultar las fichas anteriores. Probá abrir las referencias de esta búsqueda.')).toBeVisible();
  await expect(page.locator('#product-grid-start article')).toHaveCount(0);
  await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'REINTENTAR FICHAS', exact: true }).click();
  await expect(page.getByText('[ PRODUCTO EN EL CATÁLOGO ]', { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  await expect(page).toHaveURL(url => url.searchParams.get('q') === 'RTX 5090' && !url.searchParams.has('includeUnavailable'));
});

test('un filtro de precio imposible no se elimina para mostrar referencias', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/search')) requests.push(request.url()); });
  await searchFromIdle(page);
  await page.getByLabel('Precio mínimo').fill('999999999');
  await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(url => url.searchParams.get('minPrice') === '999999999');
  expect(requests.some(url => new URL(url).searchParams.has('includeUnavailable'))).toBe(false);
  await expect(page.locator('#product-grid-start article')).toHaveCount(0);
});

test('cambiar de consulta cancela referencias anteriores en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release: () => void = () => {};
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let referenceRequest: URL | undefined;
  await page.route('**/api/search**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('q') === 'RTX 5090') {
      if (url.searchParams.get('includeUnavailable') === '1') {
        referenceRequest = url;
        await delayed;
        await route.fulfill({ json: response([{ ...searchProducts[0], name: 'RTX 5090 antigua', id: 'old-query' }]) }).catch(() => {});
      } else await route.fulfill({ json: response([]) });
    } else await route.fulfill({ json: response([searchProducts[0]]) });
  });
  await searchFromIdle(page, 'RTX 5090');
  await expect.poll(() => referenceRequest?.searchParams.get('q')).toBe('RTX 5090');
  await page.getByPlaceholder('NUEVA BUSQUEDA...').fill('Ryzen');
  await page.getByPlaceholder('NUEVA BUSQUEDA...').press('Enter');
  await expect(page.locator('#product-grid-start article')).toHaveCount(1);
  release();
  await expect(page.locator('#product-grid-start article').getByRole('heading')).toHaveText(searchProducts[0].name);
  await expect(page.getByText('[ PRODUCTO EN EL CATÁLOGO ]', { exact: true })).toHaveCount(0);
  expect(await page.locator('html').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
});

test('la consulta de referencias conserva una tienda y categoría explícitas', async ({ page }) => {
  const seen: URL[] = [];
  await page.route('**/api/search**', async route => {
    const url = new URL(route.request().url());
    seen.push(url);
    await route.fulfill({ json: response(url.searchParams.get('q') === 'RTX 5090' ? [] : [searchProducts[0]]) });
  });
  await searchFromIdle(page, 'Ryzen');
  await page.getByRole('combobox', { name: 'CATEGORÍA', exact: true }).selectOption('computadoras');
  await expect(page).toHaveURL(url => url.searchParams.get('category') === 'computadoras');
  await page.getByRole('button', { name: '[ ] CompraGamer', exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get('stores') === 'compragamer');
  await page.getByPlaceholder('NUEVA BUSQUEDA...').fill('RTX 5090');
  await page.getByPlaceholder('NUEVA BUSQUEDA...').press('Enter');
  await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
  const referenceRequest = seen.find(url => url.searchParams.get('includeUnavailable') === '1');
  expect(referenceRequest?.searchParams.get('q')).toBe('RTX 5090');
  expect(referenceRequest?.searchParams.get('category')).toBe('computadoras');
  expect(referenceRequest?.searchParams.get('stores')).toBe('compragamer');
});
