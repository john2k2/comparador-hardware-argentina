import { type Page } from '@playwright/test';
import { expect, test } from './fixtures/deterministic.fixture';
import proof from './fixtures/maximus-persistence-proof.json';

// Reproduce el resultado del laboratorio SQL con su fecha original; no escribe
// producción. El producto de control viene de la API pública del mismo corte.
async function compareWithCapture(page: Page, saved: typeof proof.saved) {
  await page.clock.setFixedTime(new Date(proof.provenance.asOf));
  await page.route('**/api/products?**', async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    await route.fulfill({ json: { products: query === saved.name ? [saved] : [proof.control] } });
  });
  await page.goto('/comparativa/comparar');
  await page.getByLabel('¿PARA QUÉ LO VAS A USAR?', { exact: true }).selectOption('productividad');
  for (const [side, product] of [['A', saved], ['B', proof.control]] as const) {
    const search = page.getByRole('textbox', { name: `Buscar producto ${side}`, exact: true });
    await search.fill(product.name);
    await search.press('Enter');
    await page.getByRole('button').filter({ hasText: product.name }).click();
  }
}

for (const width of [1440, 390]) test.describe(`Maximus guardado y mostrado ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test('la observación guardada muestra el precio Maximus con identidad y fecha originales', async ({ page }, testInfo) => {
    await compareWithCapture(page, proof.saved);
    const priceRow = page.getByRole('row').filter({ hasText: 'Mejor precio reciente (24 h)' });
    await expect(priceRow).toContainText('339.300');
    await expect(priceRow).toContainText('362.500');
    const offers = page.locator('section').filter({ has: page.getByRole('heading', { name: '[ OFERTAS RELEVADAS EN LAS ÚLTIMAS 24 H ]', exact: true }) });
    await expect(offers.getByRole('listitem').filter({ hasText: 'Maximus' })).toContainText('339.300');
    await expect(page.getByText(/puntos de .* por cada \$100.000/)).toHaveCount(2);
    await expect(page.getByText('13.583', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('maximus-sql-a-pagina.png'), fullPage: true });
  });
  test('el rechazo anterior no inventa una oferta reciente ni recomienda su precio semilla', async ({ page }) => {
    await compareWithCapture(page, proof.rejected as typeof proof.saved);
    const priceRow = page.getByRole('row').filter({ hasText: 'Mejor precio reciente (24 h)' });
    await expect(priceRow.getByRole('cell').nth(0)).toHaveText('Sin precio reciente');
    const offers = page.locator('section').filter({ has: page.getByRole('heading', { name: '[ OFERTAS RELEVADAS EN LAS ÚLTIMAS 24 H ]', exact: true }) });
    await expect(offers.getByRole('listitem').filter({ hasText: 'Maximus' })).toHaveCount(0);
    const ratio = /puntos de .* por cada \$100.000/;
    const benchmarkCard = (label: string) => page.locator('div.border-2').filter({
      has: page.getByText(label, { exact: true }),
    });
    await expect(benchmarkCard('PRODUCTO A · Ryzen 5 7600X').getByText(ratio)).toHaveCount(0);
    await expect(benchmarkCard('PRODUCTO B · Ryzen 5 7600').getByText(ratio)).toHaveCount(1);
    await expect(page.getByText(ratio)).toHaveCount(1);
    await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: '[ ¿CUÁL CONVIENE? ]', exact: true }) })).not.toContainText('conviene más');
  });
});
