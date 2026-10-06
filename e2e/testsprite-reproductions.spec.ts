import { expect, test, type Page } from '@playwright/test';
import { ANALYTICS_CONSENT_KEY } from '../src/lib/analytics/consent';

async function dismissPrivacy(page: Page) {
  const reject = page.getByRole('button', { name: 'Rechazar analítica', exact: true });
  if (await reject.isVisible()) await reject.click();
  const close = page.getByRole('button', { name: 'Cerrar preferencias', exact: true });
  if (await close.isVisible()) await close.click();
}

for (const entry of ['/', '/search']) {
  test(`opening a suggestion from ${entry} returns to the typed query and its results`, async ({ page }) => {
    await page.goto(entry);
    await dismissPrivacy(page);
    await page.getByRole('combobox', { name: 'Buscar productos', exact: true }).fill('Ryzen');
    await page.getByRole('option', { name: /AMD Ryzen 5 5600/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ryzen 5 5600');
    await page.getByRole('link', { name: 'Volver al catálogo', exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === '/search' && url.searchParams.get('q') === 'Ryzen');
    await expect(page.getByRole('combobox', { name: 'Buscar productos', exact: true })).toHaveValue('Ryzen');
    await expect(page.locator('#product-grid-start article')).toHaveCount(2);
  });
}

test('opening a suggestion preserves the active filters and historical-reference toggle', async ({ page }) => {
  await page.goto('/search?q=Ryzen&category=procesadores&sortBy=price-desc&includeUnavailable=1&minPrice=100000');
  await dismissPrivacy(page);
  const query = page.getByRole('combobox', { name: 'Buscar productos', exact: true });
  await query.click();
  await page.getByRole('option', { name: /AMD Ryzen 5 5600/ }).click();
  await page.getByRole('link', { name: 'Volver al catálogo', exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get('q') === 'Ryzen'
    && url.searchParams.get('category') === 'procesadores'
    && url.searchParams.get('sortBy') === 'price-desc'
    && url.searchParams.get('minPrice') === '100000'
    && url.searchParams.get('includeUnavailable') === '1');
  await expect(page.getByRole('checkbox', { name: 'Mostrar también productos sin oferta reciente', exact: true })).toBeChecked();
  await expect(page.locator('#product-grid-start h3')).toHaveText([
    'AMD Ryzen 7 5700X 8-Core AM4', 'AMD Ryzen 5 5600 6-Core 12-Thread AM4',
  ]);
});

test('Enter submits a query while unselected suggestions are visible', async ({ page }) => {
  await page.goto('/search');
  await dismissPrivacy(page);
  const query = page.getByRole('combobox', { name: 'Buscar productos', exact: true });
  await query.fill('Ryzen');
  await expect(page.getByRole('option', { name: /AMD Ryzen 5 5600/ })).toBeVisible();
  await query.press('Enter');
  await expect(page).toHaveURL(url => url.pathname === '/search' && url.searchParams.get('q') === 'Ryzen');
  await expect(page.locator('#product-grid-start article')).toHaveCount(2);
});

test('saving an actual partial CPU selection survives reset, restore and reload', async ({ page }) => {
  await page.goto('/guia/armar');
  await dismissPrivacy(page);
  const cpu = page.getByRole('combobox', { name: 'Elegir Procesador', exact: true });
  await expect(cpu).toBeEnabled();
  await cpu.selectOption('fixture-ryzen-5600');
  await expect(cpu).toHaveValue('fixture-ryzen-5600');
  await expect(page.getByRole('region', { name: 'Resumen del presupuesto' })).toContainText('185.000');
  await expect(page.getByText('Total parcial, no confirmado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar armado', exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText('Armado guardado');
  await page.getByRole('button', { name: 'Empezar de cero', exact: true }).click();
  await expect(cpu).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Recuperar guardado', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Recuperar guardado', exact: true }).click();
  await expect(cpu).toHaveValue('fixture-ryzen-5600');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Recuperar guardado', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Recuperar guardado', exact: true }).click();
  await expect(cpu).toHaveValue('fixture-ryzen-5600');
  await expect(page.getByRole('region', { name: 'Resumen del presupuesto' })).toContainText('185.000');
});

test('rejecting analytics survives reload and reopening preferences keeps the saved rejection', async ({ page }) => {
  const googleRequests: string[] = [];
  page.on('request', request => {
    if (/googletagmanager\.com|google-analytics\.com/.test(request.url())) googleRequests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Rechazar analítica', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar preferencias', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Preferencias de privacidad', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.allowed, ANALYTICS_CONSENT_KEY)).toBe(false);
  await page.getByRole('contentinfo').getByRole('button', { name: 'Preferencias de privacidad', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rechazar analítica', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__chaAnalyticsAllowed)).toBe(false);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.allowed, ANALYTICS_CONSENT_KEY)).toBe(false);
  expect(googleRequests).toEqual([]);
});

test('Tab focuses a header destination and Enter opens it', async ({ page }) => {
  await page.goto('/');
  await dismissPrivacy(page);
  const link = page.getByRole('navigation', { name: 'Navegación principal', exact: true }).getByRole('link', { name: 'Armá tu PC', exact: true });
  for (let index = 0; index < 25; index++) {
    if (await link.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/guia\/armar$/);
  await expect(page.getByRole('combobox', { name: 'Elegir Procesador', exact: true })).toBeEnabled();
});
