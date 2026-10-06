import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { publicRoutes } from './fixtures/public-routes';
import { measureGradientTextContrast } from './fixtures/gradient-contrast';

const baseline = process.env.QA_THEME_BASELINE === '1';
const routes = baseline ? ['/', '/search?q=Ryzen', '/product/fixture-ryzen-5600', '/guia/armar', '/comparativa/comparar', '/comparativa/rtx-4060-vs-rx-7600', '/guia/pc-gamer-2-millones', '/juegos-digitales', '/acerca', '/contacto', '/privacidad', '/auth'] : publicRoutes;
const widths = baseline ? [1440] : [1440, 390];
const root = `outputs/theme-motion-2026-10-05/${baseline ? 'baseline' : 'pages'}`;

for (const theme of ['light', 'dark']) for (const width of widths) for (const route of routes) {
  test(`${theme} ${width}px ${route} meets automated accessibility and layout checks`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main h1')).toBeVisible();
    await expect.poll(() => page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(theme === 'dark');
    const reject = page.getByRole('button', { name: 'Rechazar analítica', exact: true });
    if (await reject.isVisible()) await reject.click();
    const close = page.getByRole('button', { name: 'Cerrar preferencias', exact: true });
    if (await close.isVisible()) await close.click();
    if (route === '/guia/armar') await expect(page.getByRole('combobox', { name: 'Elegir Procesador', exact: true })).toBeEnabled();
    if (route === '/juegos-digitales') await expect(page.getByText('Consultando la muestra de precios…', { exact: true })).toHaveCount(0);
    await page.evaluate(async () => { await document.fonts.ready; });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    const gradientContrast = await measureGradientTextContrast(page, result.incomplete
      .filter(check => check.id === 'color-contrast')
      .flatMap(check => check.nodes.filter(node => node.target.length === 1 && typeof node.target[0] === 'string').map(node => node.target[0] as string)));
    const geometry = await page.locator('html').evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }));
    const filename = `${theme}-${width}-${route.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home'}`;
    mkdirSync(root, { recursive: true });
    await page.screenshot({ path: `${root}/${filename}.png`, fullPage: true });
    writeFileSync(`${root}/${filename}.json`, JSON.stringify({ route, theme, width, geometry, errors, violations: result.violations, incomplete: result.incomplete, gradientContrast, passes: result.passes.map(check => check.id), screenshot: `${filename}.png` }, null, 2));
    expect(geometry.scrollWidth - geometry.width).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    expect(result.violations, JSON.stringify(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })))).toEqual([]);
    for (const check of gradientContrast) {
      if (check.minimum !== undefined && check.threshold !== undefined) {
        expect(check.minimum, `${check.selector}: contrast against the visible canvas and background layers`).toBeGreaterThanOrEqual(check.threshold);
      }
    }
  });
}
