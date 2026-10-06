import { expect, test, installSearchCatalog, searchFromIdle } from './fixtures/deterministic.fixture';

test('pagination preserves category and query and replaces the result set in both directions', async ({ page }) => {
  await installSearchCatalog(page);
  await searchFromIdle(page);
  await expect(page.locator('#product-grid-start article')).toHaveCount(12);
  await page.getByRole('combobox', { name: 'CATEGORÍA', exact: true }).selectOption('procesadores');
  await expect(page).toHaveURL((url) => url.pathname === '/search' && url.searchParams.get('q') === 'Ryzen' &&
    url.searchParams.get('category') === 'procesadores');
  const headings = page.locator('#product-grid-start h3');
  const firstPageNames = Array.from({ length: 12 }, (_, i) => `AMD Ryzen fixture ${String(i + 1).padStart(2, '0')}`);
  await expect(headings).toHaveText(firstPageNames);
  const next = page.getByRole('link', { name: 'Ir a la página 2', exact: true });
  await expect(next).toHaveAttribute('href', /category=procesadores/);
  await next.click();
  await expect(page).toHaveURL((url) => url.pathname === '/search' && url.searchParams.get('q') === 'Ryzen' &&
    url.searchParams.get('category') === 'procesadores' && url.searchParams.get('page') === '2');
  await expect(headings).toHaveText(['AMD Ryzen fixture 13']);
  await expect(page.getByText('RESULTADOS: 13 ITEMS', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ir a la página 1', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'Ryzen' &&
    url.searchParams.get('category') === 'procesadores' && !url.searchParams.has('page'));
  await expect(headings).toHaveText(firstPageNames);
});
