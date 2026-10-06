import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

for (const query of ['ryzen', 'producto-inexistente-medicion']) {
  for (const requestedPage of [1, 20]) {
    test(`SSR ${query} page ${requestedPage} does not fetch its answer again during hydration`, async ({ page }) => {
      const reads: string[] = [];
      page.on('request', req => { if (new URL(req.url()).pathname === '/api/search') reads.push(req.url()); });
      await page.goto(`/search?q=${query}&page=${requestedPage}`);
      if (query === 'ryzen') await expect(page.locator('#product-grid-start article')).toHaveCount(2);
      else await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Mostrar también productos sin oferta reciente', exact: true })).toBeEnabled();
      // La interacción y su respuesta prueban que la hidratación terminó. No
      // damos por aprobada una ausencia de peticiones antes de ejecutar React.
      const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/search' && new URL(res.url()).searchParams.get('sortBy') === 'price-desc');
      await page.getByRole('combobox', { name: 'ORDENAR POR', exact: true }).selectOption('price-desc');
      expect((await response).status()).toBe(200);
      if (query === 'ryzen') await expect(page.locator('#product-grid-start h3')).toHaveText([
        'AMD Ryzen 7 5700X 8-Core AM4', 'AMD Ryzen 5 5600 6-Core 12-Thread AM4',
      ]);
      else await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
      expect(reads).toHaveLength(1);
      expect(new URL(reads[0]).searchParams.get('sortBy')).toBe('price-desc');
    });
  }
}

test('cards use available content width and keep equal heights beside the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1068, height: 1006 });
  await page.goto('/search?q=ryzen');
  const cards = page.locator('#product-grid-start article');
  await expect(cards).toHaveCount(2);
  const sizes = await cards.evaluateAll(items => items.map(item => {
    const r = item.getBoundingClientRect(); return { width:r.width, height:r.height, x:r.x, y:r.y };
  }));
  expect(Math.min(...sizes.map(size => size.width))).toBeGreaterThanOrEqual(260);
  expect(Math.abs(sizes[0].height - sizes[1].height)).toBeLessThanOrEqual(1);
  expect(sizes[0].y).toBe(sizes[1].y);
  expect(await page.locator('html').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  writeFileSync('outputs/e2e-review-2026-10-05/performance-after.json', JSON.stringify({ viewport:1068, cards:sizes }, null, 2));
});
