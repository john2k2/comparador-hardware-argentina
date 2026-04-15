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
      await expect(page.getByText('COMPARA PRECIOS DE HARDWARE')).toBeVisible();

      // Search input accesible
      const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
      await expect(searchInput).toBeVisible();

      // No debería haber scroll horizontal
      const htmlEl = page.locator('html');
      const scrollWidth = await htmlEl.evaluate((el: HTMLElement) => el.scrollWidth);
      const clientWidth = await htmlEl.evaluate((el: HTMLElement) => el.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance
    });

    test('categorías rápidas accesibles en mobile', async ({ page }) => {
      await page.goto('/');

      const categoriesSection = page.getByText('CATEGORIAS RAPIDAS');
      await expect(categoriesSection).toBeVisible();

      // Links de categorías deberían ser cliqueables
      const categoryLinks = page.locator('a[href*="category="]');
      const count = await categoryLinks.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Search en Mobile', () => {
    test('búsqueda usable en mobile', async ({ page }) => {
      await page.goto('/search?category=procesadores');

      // Search input visible
      const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
      await expect(searchInput).toBeVisible();

      // Debería poder escribir
      await searchInput.fill('test');
      await expect(searchInput).toHaveValue('test');
    });

    test('filtros accesibles en mobile', async ({ page }) => {
      await page.goto('/search?category=procesadores');

      // Filtros deberían ser visibles (pueden estar colapsados)
      const filtersHeading = page.getByRole('heading', { name: 'FILTROS' });
      await expect(filtersHeading).toBeVisible();
    });
  });

  test.describe('Product Detail en Mobile', () => {
    test('detalle de producto legible en mobile', async ({ page }) => {
      await page.goto('/search?category=procesadores');
      await page.waitForTimeout(2000);

      const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
      const firstLink = productLinks.first();
      if (await firstLink.isVisible()) {
        await firstLink.click();
        await page.waitForURL(/\/product\//);

        // Información básica legible
        await expect(page.locator('h1')).toBeVisible();

        // Precio visible (usar .first() para evitar strict mode)
        await expect(page.getByText(/\$/).first()).toBeVisible();

        // Botón VER EN TIENDA accesible
        const storeButtons = page.getByRole('link', { name: /VER EN TIENDA/i });
        const count = await storeButtons.count();
        if (count > 0) {
          await expect(storeButtons.first()).toBeVisible();
        }
      }
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

    await expect(page.getByText('COMPARA PRECIOS DE HARDWARE')).toBeVisible();

    // Layout debería ser más ancho que en mobile
    const gridSection = page.locator('section').filter({ hasText: /CATEGORIAS RAPIDAS/i });
    await expect(gridSection).toBeVisible();
  });
});
