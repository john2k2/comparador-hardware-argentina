import { expect, test, type Page } from '@playwright/test';

async function seedComparison(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('comparison-selection:v1', JSON.stringify({ version: 1, savedAt: Date.now(),
      category: 'procesadores', useCase: 'gaming', leftId: 'fixture-ryzen-5600', rightId: 'fixture-ryzen-5700x' }));
  });
}

test('el comparador conserva los dos productos al visitar una ficha y regresar', async ({ page }) => {
  await page.goto('/comparativa/comparar');
  for (const [side, query, title] of [
    ['A', '5600', 'AMD Ryzen 5 5600 6-Core 12-Thread AM4'],
    ['B', '5700X', 'AMD Ryzen 7 5700X 8-Core AM4'],
  ]) {
    const search = page.getByRole('textbox', { name: `Buscar producto ${side}`, exact: true });
    await search.fill(query);
    await search.press('Enter');
    await page.getByRole('button').filter({ hasText: title }).click();
  }
  await page.getByRole('link', { name: /VER PRECIOS DE A/i }).click();
  await expect(page).toHaveURL(/\/product\/fixture-ryzen-5600\?from=/);
  await page.getByRole('link', { name: 'Volver al catálogo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cambiar producto A', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambiar producto B', exact: true })).toBeVisible();
  const saved = JSON.parse(await page.evaluate(() => sessionStorage.getItem('comparison-selection:v1')) ?? '{}');
  expect(Object.keys(saved).sort()).toEqual(['category', 'leftId', 'rightId', 'savedAt', 'useCase', 'version']);
  await page.getByRole('button', { name: 'Rechazar analítica', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar preferencias', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/reports/confianza-2026-10-06/comparador-regreso.png', fullPage: true });
});

test('un error al recuperar B conserva A sin inventar el producto faltante', async ({ page }) => {
  await seedComparison(page);
  await page.route('**/api/products?id=fixture-ryzen-5700x&preferDb=1', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.goto('/comparativa/comparar');
  await expect(page.getByRole('button', { name: 'Cambiar producto A', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambiar producto B', exact: true })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('No pudimos recuperar todos los productos');
  await expect(page.getByRole('textbox', { name: 'Buscar producto B', exact: true })).toBeVisible();
});

test('una recuperación tardía no reemplaza la categoría que el usuario acaba de elegir', async ({ page }) => {
  await seedComparison(page);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const completed: Promise<void>[] = [];
  await page.route('**/api/products?id=**', route => {
    const task = (async () => {
      const response = await page.request.get(route.request().url());
      const payload = await response.json();
      await delayed;
      // El navegador puede haber abortado la petición por la interacción nueva.
      await route.fulfill({ json: payload }).catch(() => {});
    })();
    completed.push(task);
    return task;
  });
  await page.goto('/comparativa/comparar');
  await expect(page.getByRole('status')).toContainText('Recuperando');
  await expect.poll(() => completed.length).toBe(2);
  await page.getByLabel('TIPO DE COMPONENTE', { exact: true }).selectOption('tarjetas-graficas');
  release();
  await Promise.all(completed);
  await expect(page.getByLabel('TIPO DE COMPONENTE', { exact: true })).toHaveValue('tarjetas-graficas');
  await expect(page.getByRole('button', { name: /Cambiar producto [AB]/ })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
});
