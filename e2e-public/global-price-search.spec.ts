import { expect, test } from '@playwright/test';

test('rango general con catálogo real conserva precio, tarjetas y paginación', async ({ page }, testInfo) => {
  await page.context().route('**/*google-analytics.com/**', route => route.abort());
  await page.context().route('**/*googletagmanager.com/**', route => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('cha-analytics-consent:v1', JSON.stringify({ allowed: false, savedAt: Date.now() }));
  });
  const query = 'minPrice=100137&maxPrice=300000&sortBy=price-asc';
  await page.goto(`/search?${query}`);
  await expect(page.locator('#product-grid-start article')).toHaveCount(12);
  await expect(page.getByLabel('Precio mínimo')).toHaveValue('100137');
  await expect(page.getByLabel('Precio máximo')).toHaveValue('300000');
  const first = await page.request.get(`/api/search?${query}`);
  expect(first.status()).toBe(200);
  const firstData = await first.json();
  expect(firstData.pagination.totalPages).toBeGreaterThan(1);
  const cardIds = () => page.locator('#product-grid-start a[href^="/product/"]').evaluateAll(links =>
    links.map(link => decodeURIComponent(new URL((link as HTMLAnchorElement).href).pathname.split('/').at(-1)!)));
  expect(await cardIds()).toEqual(firstData.products.map((p: { id: string }) => p.id));
  await page.getByRole('link', { name: 'Ir a la página 2', exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get('page') === '2' &&
    url.searchParams.get('minPrice') === '100137' && url.searchParams.get('maxPrice') === '300000');
  const second = await page.request.get(`/api/search?${query}&page=2`);
  expect(second.status()).toBe(200);
  const secondData = await second.json();
  const ids = secondData.products.map((p: { id: string }) => p.id);
  await expect.poll(cardIds).toEqual(ids);
  expect(secondData.pagination.total).toBe(firstData.pagination.total);
  expect(firstData.products.some((p: { id: string }) => ids.includes(p.id))).toBe(false);
  const prices = [...firstData.products, ...secondData.products].map((p: { lowestPrice: number }) => p.lowestPrice);
  expect(prices.every((p: number, i: number) => p >= 100137 && p <= 300000 && (!i || prices[i - 1] <= p))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('global-price-page-2.png'), fullPage: true });
});

test('rangos nuevos se consultan en base de datos y se renderizan sin error inicial', async ({ page }, testInfo) => {
  await page.context().setExtraHTTPHeaders({ 'X-Release-Probe': '7be8088' });
  await page.context().route('**/*google-analytics.com/**', route => route.abort());
  await page.context().route('**/*googletagmanager.com/**', route => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('cha-analytics-consent:v1', JSON.stringify({ allowed: false, savedAt: Date.now() }));
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const observations = [];
  const minimum = 100147 + Date.now() % 10000;
  for (let index = 0; index < 3; index++) {
    const query = `minPrice=${minimum + index}&maxPrice=300000&sortBy=price-asc`;
    const started = performance.now();
    const document = await page.goto(`/search?${query}`, { waitUntil: 'domcontentloaded' });
    expect(document?.status()).toBe(200);
    await expect(page.locator('#product-grid-start article')).toHaveCount(12);
    await expect(page.getByRole('heading', { name: /ERROR: algo sali/i })).toHaveCount(0);
    const renderedMs = Math.round(performance.now() - started);
    const apiStarted = performance.now();
    const response = await page.request.get(`/api/search?${query}`);
    const apiMs = Math.round(performance.now() - apiStarted);
    expect(response.status()).toBe(200);
    const cache = response.headers()['x-search-cache'];
    expect(['DB', 'DB-STALE']).toContain(cache);
    const data = await response.json();
    const ids = await page.locator('#product-grid-start a[href^="/product/"]').evaluateAll(links =>
      links.map(link => decodeURIComponent(new URL((link as HTMLAnchorElement).href).pathname.split('/').at(-1)!)));
    expect(ids).toEqual(data.products.map((product: { id: string }) => product.id));
    expect(apiMs).toBeLessThan(8000);
    observations.push({ query, renderedMs, apiMs, cache, total: data.pagination.total, ids });
    await page.waitForTimeout(1000);
  }
  expect(errors).toEqual([]);
  await testInfo.attach('uncached-public-ranges', { body: JSON.stringify({ observations, errors }), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('uncached-public-range.png'), fullPage: true });
});
