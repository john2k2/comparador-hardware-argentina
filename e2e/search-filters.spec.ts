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

for (const width of [1068, 390, 320]) {
  test(`un único selector de categoría funciona a ${width}px y conserva la consulta`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1006 });
    await searchFromIdle(page);
    if (width < 1024) await page.getByRole('button', { name: 'MOSTRAR', exact: true }).click();
    const category = page.getByRole('combobox', { name: 'CATEGORÍA', exact: true });
    await expect(category).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Filtrar por categoría:/ })).toHaveCount(0);
    await category.selectOption('tarjetas-graficas');
    await expect(page).toHaveURL(url => url.searchParams.get('q') === 'Ryzen' && url.searchParams.get('category') === 'tarjetas-graficas');
    await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
    await category.selectOption('procesadores');
    await expect(page).toHaveURL(url => url.searchParams.get('q') === 'Ryzen' && url.searchParams.get('category') === 'procesadores');
    await expect(page.locator('#product-grid-start article')).toHaveCount(12);
    expect(await page.locator('html').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test('historical references are opt-in and returning to current results preserves their separate cache', async ({ page }) => {
  const { searchProducts } = await import('./fixtures/deterministic.fixture');
  const current = searchProducts[0];
  const historical = { ...current, id: 'historical-cpu', name: 'AMD Ryzen 5 5500 referencia',
    prices: current.prices.map(price => ({ ...price, lastUpdated: new Date('2026-09-20T10:00:00Z') })) };
  const unavailable = { ...current, id: 'unpriced-cpu', name: 'AMD Ryzen ficha sin publicaciones', prices: [], lowestPrice: 0, highestPrice: 0, averagePrice: 0 };
  await page.route('**/api/search**', async route => {
    const include = new URL(route.request().url()).searchParams.get('includeUnavailable') === '1';
    const products = include ? [current, historical, unavailable] : [current];
    await route.fulfill({ json: { products, pagination: { total:products.length, totalPages:1, page:1, pageSize:12, offset:0, limit:products.length }, facets:{ categories:[], brands:[], stores:[] } } });
  });
  await searchFromIdle(page);
  const cards = page.locator('#product-grid-start article');
  await expect(cards).toHaveCount(1);
  const toggle = page.getByRole('checkbox', { name: 'Mostrar también productos sin oferta reciente', exact: true });
  await toggle.check();
  await expect(page).toHaveURL(url => url.searchParams.get('includeUnavailable') === '1');
  await expect(cards).toHaveCount(3);
  await expect(cards.filter({ hasText: historical.name })).toContainText('ÚLTIMO PRECIO RELEVADO');
  await expect(cards.filter({ hasText: unavailable.name })).toContainText(/Sin oferta disponible para comparar/i);
  await expect(page.getByText('Incluye referencias anteriores y fichas sin una oferta reciente para comparar.', { exact:true })).toBeVisible();
  await toggle.uncheck();
  await expect(page).toHaveURL(url => !url.searchParams.has('includeUnavailable'));
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole('heading')).toHaveText(current.name);
  await page.goBack();
  await expect(toggle).toBeChecked();
  await expect(cards).toHaveCount(3);
});
