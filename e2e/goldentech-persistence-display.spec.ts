import { type Page } from '@playwright/test';
import { expect, test, installSearchCatalog, searchFromIdle } from './fixtures/deterministic.fixture';
import proof from './fixtures/goldentech-persistence-proof.json';

// Respuestas reales del 10/10, guardadas en PostgreSQL local y leídas por el
// mapper real. La API se sustituye aquí: esto no acredita recuperación remota.
async function showCapture(page: Page, product: typeof proof.saved, current: boolean) {
  await installSearchCatalog(page);
  await page.clock.setFixedTime(new Date(proof.provenance.asOf));
  await page.route('**/api/search**', async route => {
    const references = new URL(route.request().url()).searchParams.get('includeUnavailable') === '1';
    const products = current || references ? [product] : [];
    await route.fulfill({ json: { products,
      pagination: { total: products.length, totalPages: products.length ? 1 : 0, page: 1, pageSize: 12, offset: 0, limit: products.length },
      facets: { categories: [], brands: [], stores: [] },
    } });
  });
  await searchFromIdle(page, product.name);
  const card = page.locator('#product-grid-start article');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('heading')).toHaveText(product.name);
  return card;
}

for (const width of [1440, 390]) test.describe(`GoldenTech guardado y mostrado ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test('el HDD muestra el precio capturado, la tienda y la fecha original', async ({ page }, testInfo) => {
    const card = await showCapture(page, proof.saved, true);
    await expect(card).toContainText('MEJOR PRECIO REGISTRADO');
    await expect(card).toContainText('423.813');
    await expect(card).toContainText('@Golden Tech');
    await expect(card.locator('time')).toHaveAttribute('datetime', proof.provenance.observedAt);
    await expect(card).toContainText('COMPARAR TIENDAS');
    expect(await page.locator('html').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('goldentech-sql-a-pagina.png'), fullPage: true });
  });
  for (const [label, product] of [['rechazado antes de la migración', proof.rejected], ['stock desconocido', proof.unknown], ['identidad pendiente de la RX 9070', proof.pendingIdentity]] as const) {
    test(`${label} no se convierte en oferta comparable`, async ({ page }) => {
      const card = await showCapture(page, product as typeof proof.saved, false);
      await expect(card).toContainText('Sin oferta disponible para comparar');
      await expect(card).toContainText('VER FICHA Y REFERENCIAS');
      await expect(card).not.toContainText('MEJOR PRECIO REGISTRADO');
      await expect(card.locator('time')).toHaveCount(0);
      await expect(page.getByText('OFERTAS RECIENTES: 0', { exact: true })).toBeVisible();
    });
  }
});
