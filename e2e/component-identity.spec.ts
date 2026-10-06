import { expect, test } from '@playwright/test';

test('una notebook mal clasificada no se ofrece como GPU suelta', async ({ page }) => {
  const base = await (await page.request.get('/api/products?id=fixture-rtx-4060')).json();
  const notebook = { ...base, id: 'nb-gpu', name: 'NB ASUS 15.6 R7-170 16GB 512GB RTX3050', category: 'tarjetas-graficas' };
  await page.route('**/api/products?category=**', route => route.fulfill({ json: { products: [notebook, base] } }));
  await page.goto('/comparativa/comparar');
  await page.getByLabel('TIPO DE COMPONENTE', { exact: true }).selectOption('tarjetas-graficas');
  const search = page.getByRole('textbox', { name: 'Buscar producto A', exact: true });
  await search.fill('RTX');
  await search.press('Enter');
  await expect(page.getByRole('button').filter({ hasText: base.name })).toBeVisible();
  await expect(page.getByRole('button').filter({ hasText: notebook.name })).toHaveCount(0);
});
