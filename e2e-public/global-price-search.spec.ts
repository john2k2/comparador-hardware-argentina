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
