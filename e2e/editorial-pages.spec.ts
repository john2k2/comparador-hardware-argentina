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

    test('el índice retirado no aparece en navegación y sus URLs responden 404', async ({ page, request }) => {
      await page.goto('/guia');
      await expect(page.locator('a[href^="/indice-precios-hardware"]')).toHaveCount(0);
      for (const path of ['/indice-precios-hardware', '/indice-precios-hardware/datos.csv']) {
        const response = await request.get(path);
        expect(response.status()).toBe(404);
        expect(await response.text()).toContain('noindex');
      }
      const sitemap = await request.get('/sitemap.xml');
      expect(await sitemap.text()).not.toContain('/indice-precios-hardware');
    });

  });
}
