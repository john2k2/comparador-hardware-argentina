import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = 'outputs/theme-motion-2026-10-05/interactions';
async function dismissPrivacy(page: Page) {
  const reject = page.getByRole('button', { name: 'Rechazar analítica', exact: true });
  if (await reject.isVisible()) await reject.click();
  const close = page.getByRole('button', { name: 'Cerrar preferencias', exact: true });
  if (await close.isVisible()) await close.click();
}
function luminance(hex: string) {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? `#${hex.slice(1).split('').map(value => value + value).join('')}`
    : hex;
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) throw new Error(`Unsupported palette color: ${hex}`);
  const values = [1, 3, 5].map(i => Number.parseInt(normalized.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return values.reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
for (const theme of ['light', 'dark']) {
  test(`${theme} theme persists and its shared text and control palette has sufficient contrast`, async ({ page }) => {
    await page.goto('/');
    await dismissPrivacy(page);
    const target = theme === 'dark' ? 'Usar tema oscuro' : 'Usar tema claro';
    const toggle = page.getByRole('button', { name: target, exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await expect.poll(() => page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(theme === 'dark');
    await page.reload();
    await expect.poll(() => page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(theme === 'dark');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Politica de Privacidad', exact: true }).click();
    await expect.poll(() => page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(theme === 'dark');
    const palette = await page.locator('html').evaluate(el => {
      const styles = getComputedStyle(el);
      return Object.fromEntries(['background', 'card', 'muted', 'canvas-top', 'canvas-middle', 'canvas-bottom', 'foreground', 'muted-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border'].map(key => [key, styles.getPropertyValue(`--${key}`).trim()]));
    });
    const layers = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundImage,
      sky: getComputedStyle(document.querySelector('.sky-layer')!).backgroundImage,
      night: getComputedStyle(document.querySelector('.night-sky-layer')!).backgroundImage,
      textureZIndex: getComputedStyle(document.body, '::before').zIndex,
      scanlineZIndex: getComputedStyle(document.body, '::after').zIndex,
    }));
    // The opaque decorative layer is the visible canvas on desktop, not the body behind it.
    expect(theme === 'dark' ? layers.night : layers.sky).toBe(layers.body);
    expect(Number(layers.textureZIndex)).toBeLessThan(0);
    expect(Number(layers.scanlineZIndex)).toBeLessThan(0);
    const checks = [];
    for (const surface of ['background', 'card', 'muted', 'canvas-top', 'canvas-middle', 'canvas-bottom']) {
      for (const text of ['foreground', 'muted-foreground', 'primary', 'secondary', 'accent', 'destructive']) {
        const ratio = contrast(palette[text], palette[surface]);
        checks.push({ text, surface, ratio, threshold: 4.5 });
      }
      const outlineRatio = contrast(palette.secondary, palette[surface]);
      checks.push({ text: 'focus', surface, ratio: outlineRatio, threshold: 3 });
    }
    for (const surface of ['primary', 'secondary', 'accent', 'destructive']) {
      const ratio = contrast(palette[`${surface}-foreground`], palette[surface]);
      checks.push({ text: `${surface}-foreground`, surface, ratio, threshold: 4.5 });
    }
    mkdirSync(root, { recursive: true });
    writeFileSync(`${root}/${theme}-palette.json`, JSON.stringify({ theme, palette, layers, checks, minimum: Math.min(...checks.filter(c => c.threshold === 4.5).map(c => c.ratio)) }, null, 2));
    for (const check of checks) {
      expect(check.ratio, `${theme} ${check.text} over ${check.surface}`).toBeGreaterThanOrEqual(check.threshold);
    }
  });
  for (const width of [390, 1068]) for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`${theme} ${width}px menu opens, supports Escape and navigation with ${reducedMotion} motion`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1006 });
      await page.emulateMedia({ reducedMotion });
      await page.addInitScript(value => localStorage.setItem('theme', value), theme);
      await page.goto('/');
      await dismissPrivacy(page);
      const mainTop = await page.locator('main').evaluate(el => el.getBoundingClientRect().top);
      const toggle = page.getByRole('button', { name: /^(Abrir|Cerrar) menú$/ });
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const nav = page.getByRole('navigation', { name: 'Navegación móvil', exact: true });
      await expect(nav).toBeVisible();
      const panel = nav.locator('..');
      await expect(panel).toHaveCSS('animation-name', reducedMotion === 'reduce' ? 'none' : 'nav-panel-reveal');
      if (reducedMotion === 'reduce') {
        const properties = await toggle.locator('.nav-toggle-line').first().evaluate(el => getComputedStyle(el).transitionProperty);
        expect(properties).not.toContain('transform');
      }
      await expect(toggle.locator('.nav-toggle-line').nth(1)).toHaveCSS('opacity', '0');
      const currentTop = await page.locator('main').evaluate(el => el.getBoundingClientRect().top);
      expect(currentTop).toBe(mainTop);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(result.violations, JSON.stringify(result.violations)).toEqual([]);
      mkdirSync(root, { recursive: true });
      await page.screenshot({ path: `${root}/${theme}-${width}-${reducedMotion}-menu.png`, fullPage: false });
      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      await expect(nav).not.toBeVisible();
      await expect(toggle.locator('.nav-toggle-line').nth(1)).toHaveCSS('opacity', '1');
      await toggle.click();
      await nav.getByRole('link', { name: 'Armá tu PC', exact: true }).click();
      await expect(page).toHaveURL(/\/guia\/armar$/);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  }
  test(`${theme} desktop More dropdown and reopened privacy preferences pass automated checks`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await page.goto('/'); await dismissPrivacy(page);
    await page.locator('.nav-more > summary').click();
    await expect(page.locator('.nav-more')).toHaveAttribute('open', '');
    await expect(page.locator('.nav-more > .nav-panel')).toBeVisible();
    let result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations).toEqual([]);
    await page.locator('.nav-more > summary').press('Escape');
    await page.getByRole('contentinfo').getByRole('button', { name: 'Preferencias de privacidad', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Rechazar analítica', exact: true })).toBeVisible();
    result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
