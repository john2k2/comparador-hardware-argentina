import { expect, test } from '@playwright/test';

test('el destacado y la lista usan el mínimo reciente y conservan referencias más bajas', async ({ page }) => {
  await page.goto('/product/fixture-offer-presentation?from=%2Fcomparativa%2Fcomparar');
  const summary = page.getByRole('region', { name: 'Precio y compra', exact: true });
  const recent = page.getByRole('region', { name: 'Ofertas recientes comparables', exact: true });
  await expect(summary).toContainText(/\$\s*100\.000/);
  await expect(summary.getByRole('link', { name: 'Ver en Reciente', exact: false })).toHaveAttribute('href', /venex/);
  await expect(recent.getByText('@Reciente', { exact: true })).toBeVisible();
  expect(await recent.locator('[data-store-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-store-id'))))
    .toEqual(['venex', 'fullh4rd']);
  await expect(recent).not.toContainText('Referencia anterior');
  await expect(recent).not.toContainText('Stock pendiente');
  await expect(recent).not.toContainText('Otra variante');
  const references = page.getByTestId('reference-offers');
  await references.locator('summary').click();
  await expect(references).toContainText(/\$\s*50\.000/);
  await expect(references).toContainText('Precio relevado:');
  await expect(page.getByRole('link', { name: 'Volver al catálogo', exact: true })).toHaveAttribute('href', '/comparativa/comparar');
  await page.getByRole('button', { name: 'Rechazar analítica', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar preferencias', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/reports/confianza-2026-10-06/precios-escritorio.png', fullPage: true });
  await page.screenshot({ path: 'docs/reports/confianza-2026-10-06/precios-escritorio-viewport.png' });
});

test('al vencer conserva la fecha, retira el destacado y no consulta de nuevo', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  let detailRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/products') detailRequests++; });
  await page.goto('/product/fixture-offer-expiry');
  await expect(page.getByRole('region', { name: 'Precio y compra', exact: true })).toBeVisible();
  const references = page.getByTestId('reference-offers');
  await references.locator('summary').click();
  const beforeDates = (await page.locator('#ofertas-por-tienda p').filter({ hasText: 'Precio relevado:' }).allTextContents()).sort();
  const beforeRequests = detailRequests;
  await page.clock.runFor(12_000);
  await expect(page.getByRole('region', { name: 'Precio y compra', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Ofertas recientes comparables', exact: true })).toHaveCount(0);
  expect((await page.locator('#ofertas-por-tienda p').filter({ hasText: 'Precio relevado:' }).allTextContents()).sort()).toEqual(beforeDates);
  expect(detailRequests).toBe(beforeRequests);
});

test('la ficha móvil conserva precio, referencia y regreso sin desbordar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/product/fixture-offer-presentation?from=%2Fsearch%3Fq%3Dryzen%26page%3D2');
  await expect(page.getByRole('region', { name: 'Precio y compra', exact: true })).toContainText(/\$\s*100\.000/);
  await expect(page.getByRole('link', { name: 'Volver al catálogo', exact: true })).toHaveAttribute('href', '/search?q=ryzen&page=2');
  await page.getByTestId('reference-offers').locator('summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Rechazar analítica', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar preferencias', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/reports/confianza-2026-10-06/precios-movil.png', fullPage: true });
  await page.getByRole('region', { name: 'Precio y compra', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/reports/confianza-2026-10-06/precios-movil-viewport.png' });
});
