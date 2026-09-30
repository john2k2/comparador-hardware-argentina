import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'escritorio 1440x900', viewport: { width: 1440, height: 900 } },
  { name: 'móvil 390x844', viewport: { width: 390, height: 844 } },
];

for (const { name, viewport } of viewports) {
  test.describe(`Páginas editoriales - ${name}`, () => {
    test.use({ viewport });

    test('guías navega al detalle de PC Gamer', async ({ page }) => {
      const response = await page.goto('/guia');
      expect(response).not.toBeNull();
      expect(response!.status()).toBe(200);

      await expect(page.getByRole('heading', { level: 1, name: 'Guías de PC Gamer', exact: true })).toBeVisible();

      const guideLink = page.locator('a[href="/guia/pc-gamer-1-millon"]').first();
      await expect(guideLink).toBeVisible();
      await guideLink.click();
      await page.waitForURL(/\/guia\/pc-gamer-1-millon$/);
      await expect(page).toHaveURL(/\/guia\/pc-gamer-1-millon$/);
      await expect(page.getByRole('heading', { level: 1 }).filter({ hasText: /PC Gamer de/i })).toBeVisible();
    });

    test('comparativas navega al detalle de RTX 4060 y RX 7600', async ({ page }) => {
      const response = await page.goto('/comparativa');
      expect(response).not.toBeNull();
      expect(response!.status()).toBe(200);

      await expect(page.getByRole('heading', { level: 1, name: 'Comparaciones de Hardware', exact: true })).toBeVisible();

      const comparisonLink = page.locator('a[href="/comparativa/rtx-4060-vs-rx-7600"]').first();
      await expect(comparisonLink).toBeVisible();
      await comparisonLink.click();
      await page.waitForURL(/\/comparativa\/rtx-4060-vs-rx-7600$/);
      await expect(page.getByRole('heading', { level: 1 }).filter({ hasText: /RTX 4060.*RX 7600/i })).toBeVisible();
    });

    test('índice de precios expone metodología y descarga CSV', async ({ page }) => {
      const response = await page.goto('/indice-precios-hardware');
      expect(response).not.toBeNull();
      expect(response!.status()).toBe(200);

      await expect(page.getByRole('heading', { level: 1 }).filter({
        hasText: /Qué pasó con el precio del hardware esta semana|Cómo medimos el precio del hardware en Argentina/i,
      })).toBeVisible();
      await expect(page.locator('a[href="/indice-precios-hardware/datos.csv"]')).toBeVisible();
    });

    test('descarga CSV del índice con contrato HTTP y encabezado', async ({ request }) => {
      const response = await request.get('/indice-precios-hardware/datos.csv');

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toMatch(/text\/csv/);
      expect(response.headers()['content-disposition']).toMatch(
        /attachment;\s*filename="indice-precios-hardware-argentina\.csv"/i,
      );

      // El contenido puede no tener filas: este caso acredita navegación y contrato, no disponibilidad de datos.
      const firstLine = (await response.text()).split(/\r?\n/, 1)[0].trim();
      expect(firstLine).toBe('fecha,categoria,indice,precio_mediano_ars,productos,ofertas');
    });
  });
}
