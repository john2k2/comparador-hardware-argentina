import { expect, test } from './fixtures/deterministic.fixture';

for (const width of [1440, 390]) test.describe(`Precio más envío ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test('el envío cambia el menor total y un importe inválido no cuenta como cero', async ({ page }, testInfo) => {
    await page.goto('/product/fixture-ryzen-5600');
    await page.getByText('Comparar precio más envío', { exact: true }).click();
    const calculator = page.locator('details').filter({ has: page.getByText('Comparar precio más envío', { exact: true }) });
    const status = calculator.getByRole('status');
    await expect(status).toContainText('al menos dos tiendas');
    await page.getByLabel('Envío en Mexx (ARS)', { exact: true }).fill('6000');
    await expect(status).toContainText('al menos dos tiendas');
    await page.getByLabel('Envío en Venex (ARS)', { exact: true }).fill('0');
    await expect(status).toContainText(/Menor total entre las 2 ofertas con envío cargado: Venex/);
    await expect(status).toContainText('189.999');
    await expect(page.getByRole('region', { name: 'Precio y compra', exact: true }).getByRole('link', { name: 'Ver en Mexx' })).toBeVisible();
    await page.getByLabel('Envío en Venex (ARS)', { exact: true }).fill('-1');
    await expect(page.getByLabel('Envío en Venex (ARS)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(status).toContainText('al menos dos tiendas');
    await page.getByLabel('Envío en Venex (ARS)', { exact: true }).fill('0,50');
    await expect(status).toContainText('189.999,50');
    expect(await page.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await calculator.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('precio-mas-envio.png') });
  });
});
