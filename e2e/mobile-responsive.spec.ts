import { expect, test } from '@playwright/test';

// ============================================================================
// E2E: MOBILE - Responsivo, navegación táctil, viewport
// ============================================================================

test.describe('Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test.describe('Home en Mobile', () => {
    test('home se adapta a viewport mobile', async ({ page }) => {
      await page.goto('/');

      // Título visible
      await expect(page.getByRole('heading', { level: 1, name: 'Compará precios de hardware' })).toBeVisible();

      // Search input accesible
      const searchInput = page.getByRole('combobox', { name: 'Buscar productos', exact: true });
      await expect(searchInput).toBeVisible();

      // No debería haber scroll horizontal
      const htmlEl = page.locator('html');
      const scrollWidth = await htmlEl.evaluate((el: HTMLElement) => el.scrollWidth);
      const clientWidth = await htmlEl.evaluate((el: HTMLElement) => el.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance
    });

    test('categorías de hardware accesibles en mobile', async ({ page }) => {
      await page.goto('/');

      const categoriesSection = page.getByRole('navigation', { name: 'Categorías de hardware' });
      await expect(categoriesSection).toBeVisible();

      // Links de categorías deberían ser cliqueables
      const categoryLinks = categoriesSection.getByRole('link');
      const count = await categoryLinks.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Search en Mobile', () => {
    test('búsqueda usable en mobile', async ({ page }) => {
      await page.goto('/comparar/procesadores');

      // Search input visible
      const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
      await expect(searchInput).toBeVisible();

      // Debería poder escribir
      await searchInput.fill('test');
      await expect(searchInput).toHaveValue('test');
    });

    test('filtros accesibles en mobile', async ({ page }) => {
      await page.goto('/comparar/procesadores');

      // Filtros deberían ser visibles (pueden estar colapsados)
      const filtersHeading = page.getByRole('heading', { name: 'FILTROS' });
      await expect(filtersHeading).toBeVisible();
    });
  });

  test.describe('Product Detail en Mobile', () => {
    test('detalle de producto legible en mobile', async ({ page }) => {
      await page.goto('/comparar/procesadores');
      await page.waitForTimeout(2000);

      const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
      const firstLink = productLinks.first();
      await expect(firstLink).toBeVisible();
      await firstLink.click();
      await page.waitForURL(/\/product\//);

      // El producto sintético tiene dos ofertas conocidas.
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.getByText(/\$/).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /VER EN (MEXX|VENEX)/i }).first()).toBeVisible();
      const dimensions = await page.locator('html').evaluate((el) => ({
        scroll: el.scrollWidth, viewport: el.clientWidth,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 5);
    });
  });

  test.describe('Navegación en Mobile', () => {
    test('links del footer clickeables en mobile', async ({ page }) => {
      await page.goto('/');

      const footerLinks = ['Acerca de', 'Politica de Privacidad', 'Terminos de Uso', 'Contacto'];

      for (const linkName of footerLinks) {
        const link = page.getByRole('link', { name: linkName });
        await expect(link).toBeVisible();

        // Verificar que es un link real (no solo texto)
        const href = await link.getAttribute('href');
        expect(href).toBeTruthy();
      }
    });
  });
});

test.describe('Tablet Responsiveness', () => {
  test.use({ viewport: { width: 768, height: 1024 } }); // iPad

  test('home se adapta a tablet', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Compará precios de hardware' })).toBeVisible();

    // Layout debería ser más ancho que en mobile
    const gridSection = page.getByRole('navigation', { name: 'Categorías de hardware' });
    await expect(gridSection).toBeVisible();
  });
});

const homeMobileViewports = [
  { name: '360x800', width: 360, height: 800 },
  { name: '384x832', width: 384, height: 832 },
  { name: '412x915', width: 412, height: 915 },
  { name: '432x960', width: 432, height: 960 },
];

for (const viewport of homeMobileViewports) {
  test.describe(`Home mobile ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('mantiene buscador y boton BUSCAR dentro del viewport y navega con query', async ({ page }) => {
      await page.goto('/');

      const searchInput = page.getByRole('combobox', { name: 'Buscar productos', exact: true });
      const searchButton = page.getByRole('button', { name: 'BUSCAR' });
      await expect(searchInput).toBeVisible();
      await expect(searchButton).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollX).toBe(0);
      expect(dimensions.scrollY).toBe(0);
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 5);

      for (const control of [searchInput, searchButton]) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        if (!box) continue;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }

      await searchInput.fill('rtx 5060');
      await searchButton.click();
      await page.waitForURL((url) => url.pathname === '/search' && url.searchParams.get('q') === 'rtx 5060');
    });
  });
}
