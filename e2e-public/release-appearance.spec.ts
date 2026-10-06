import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { measureGradientTextContrast } from '../e2e/fixtures/gradient-contrast';

// Revisión pública de lectura: no envía formularios, pulsa tiendas ni solicita refresh.
const routes = [
  '/', '/search?q=rtx+5090&category=tarjetas-graficas&page=2',
  '/product/katech-api-973502', '/comparativa/comparar',
  '/guia/armar', '/juegos-digitales', '/contacto', '/privacidad',
];

test.beforeEach(async ({ page }) => {
  await page.context().route('**/*google-analytics.com/**', route => route.abort());
  await page.context().route('**/*googletagmanager.com/**', route => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('cha-analytics-consent:v1', JSON.stringify({ allowed: false, savedAt: Date.now() }));
  });
});

for (const theme of ['light', 'dark']) {
  for (const route of routes) {
    test(`${theme}: ${route} conserva diseño, accesibilidad y contenido en producción`, async ({ page }, testInfo) => {
      await page.addInitScript(value => localStorage.setItem('theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(page.locator('main h1')).toBeVisible();
      // Un HTTP 200 transmitido puede terminar en el límite de error del servidor.
      await expect(page.getByRole('heading', { name: /ERROR: algo sali/i })).toHaveCount(0);
      await expect.poll(() => page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(theme === 'dark');
      await expect(page.getByRole('button', { name: theme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro', exact: true })).toBeVisible();
      await expect(page.locator('a[href*="indice-precios-hardware"]')).toHaveCount(0);
      if (route === '/') {
        await expect(page.locator('#ultimas-ofertas')).toBeVisible();
      }
      if (route.startsWith('/product/')) {
        await expect(page.getByRole('heading', { name: 'Ficha técnica', exact: true })).toBeVisible();
        await expect(page.locator('#ficha-tecnica')).toContainText('Fuente: atributos y descripción publicados por las tiendas.');
        await expect(page.locator('#ficha-tecnica')).not.toContainText(/SOURCELISTINGID|STATS DEL ITEM/);
      }
      if (route.startsWith('/search')) {
        await expect(page.getByRole('heading', { name: 'Categorías', exact: true })).toHaveCount(0);
        const cards = page.locator('#product-grid-start article');
        await expect(page.getByText('Buscando productos...', { exact: true })).toHaveCount(0);
        await expect(cards.filter({ hasText: '0 TIENDAS' })).toHaveCount(0);
        await expect(cards.filter({ hasText: '// GENERICA' })).toHaveCount(0);
      }
      if (route === '/guia/armar') await expect(page.getByRole('combobox', { name: 'Elegir Procesador', exact: true })).toBeEnabled();
      if (route === '/juegos-digitales') await expect(page.getByText('Consultando la muestra de precios…', { exact: true })).toHaveCount(0);
      await page.evaluate(async () => { await document.fonts.ready; });
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const gradientContrast = await measureGradientTextContrast(page, accessibility.incomplete
        .filter(check => check.id === 'color-contrast')
        .flatMap(check => check.nodes.filter(node => node.target.length === 1 && typeof node.target[0] === 'string').map(node => node.target[0] as string)));
      const geometry = await page.locator('html').evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }));
      await testInfo.attach('public-appearance', { body: JSON.stringify({ route, theme, errors, geometry, violations: accessibility.violations, gradientContrast }), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath(`${theme}-public.png`), fullPage: true });
      expect(geometry.scrollWidth - geometry.width).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
      expect(accessibility.violations, JSON.stringify(accessibility.violations)).toEqual([]);
      for (const check of gradientContrast) {
        if (check.minimum !== undefined && check.threshold !== undefined) expect(check.minimum, check.selector).toBeGreaterThanOrEqual(check.threshold);
      }
    });
  }

  test(`${theme}: menú con teclado, movimiento reducido y tema persistente`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: testInfo.project.name === 'mobile' ? 390 : 1068, height: 1006 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(value => {
      if (!localStorage.getItem('theme')) localStorage.setItem('theme', value);
    }, theme);
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /^(Abrir|Cerrar) menú$/ });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const nav = page.getByRole('navigation', { name: 'Navegación móvil', exact: true });
    await expect(nav).toBeVisible();
    await expect(nav.locator('..')).toHaveCSS('animation-name', 'none');
    await expect(nav.getByRole('link', { name: 'Juegos', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${theme}-public-menu.png`) });
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await expect(nav).not.toBeVisible();
    await page.getByRole('button', { name: theme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro', exact: true }).click();
    await expect.poll(() => page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(theme !== 'dark');
    await page.reload();
    await expect.poll(() => page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(theme !== 'dark');
  });
}
