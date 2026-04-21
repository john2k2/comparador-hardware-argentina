import { test, expect } from '@playwright/test';

// ============================================================================
// E2E: HOME PAGE - Carga, secciones, búsqueda, navegación
// Usando Page Object Model pattern
// ============================================================================

test.describe('Home Page', () => {
  test('carga la home con título principal y barra de búsqueda', async ({ page }) => {
    await page.goto('/');

    // Título principal visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('COMPARA PRECIOS DE HARDWARE EN ARGENTINA')).toBeVisible();

    // Barra de búsqueda presente
    const searchInput = page.getByPlaceholder(/\[ BUSCAR PRODUCTO/i);
    await expect(searchInput).toBeVisible();
  });

  test('muestra ticker de tiendas animado', async ({ page }) => {
    await page.goto('/');

    // Ticker con nombres de tiendas
    const tickerSection = page.locator('section').filter({ hasText: /@/ }).first();
    await expect(tickerSection).toBeVisible();
    await expect(page.getByText('@ Mexx').first()).toBeVisible();
  });

  test('navega desde home a búsqueda con query', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.getByPlaceholder(/\[ BUSCAR PRODUCTO/i);
    await searchInput.fill('ryzen 5600');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search/);
    await expect(page).toHaveURL(/q=ryzen/);
  });

  test('muestra categorías rápidas', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('CATEGORIAS RAPIDAS')).toBeVisible();

    // Links a categorías principales
    const categoryLinks = [
      'Procesadores',
      'Tarjetas Graficas',
      'Motherboards',
      'Memoria RAM',
    ];

    for (const category of categoryLinks) {
      // Usar .first() porque los links aparecen tanto en categorías rápidas como en el footer
      await expect(page.getByRole('link', { name: category }).first()).toBeVisible();
    }
  });

  test('navega a categoría desde home', async ({ page }) => {
    await page.goto('/');

    // Click en el link de categorías rápidas (no el del footer)
    await page.locator('#main-content').getByRole('link', { name: 'Procesadores' }).click();
    await page.waitForURL(/\/search\?category=procesadores/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('muestra sección de productos vistos recientemente vacía', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('VISTOS RECIENTEMENTE')).toBeVisible();
    await expect(page.getByText('Todavia no hay productos vistos')).toBeVisible();
  });

  test('muestra secciones de productos o fallback', async ({ page }) => {
    await page.goto('/');

    // Al menos una de estas secciones debe estar visible
    const featuredSection = page.getByText('PRODUCTOS DESTACADOS');
    const priceDropSection = page.getByText(/BAJARON DE PRECIO|RECIEN ACTUALIZADOS/);

    const hasFeatured = await featuredSection.isVisible().catch(() => false);
    const hasPriceDrop = await priceDropSection.isVisible().catch(() => false);

    expect(hasFeatured || hasPriceDrop).toBe(true);
  });

  test('navega a "Cómo funciona" desde home', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'COMO FUNCIONA' }).click();
    await page.waitForURL(/\/acerca/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('muestra disclosure comercial', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('TRANSPARENCIA COMERCIAL')).toBeVisible();
    await expect(page.getByText(/comparador independiente|no vendemos/i)).toBeVisible();
  });

  test('footer con links funcionales', async ({ page }) => {
    await page.goto('/');

    // Links del footer
    const footerLinks = [
      { name: 'Acerca de', expectedUrl: /\/acerca/ },
      { name: 'Politica de Privacidad', expectedUrl: /\/privacidad/ },
      { name: 'Terminos de Uso', expectedUrl: /\/terminos/ },
      { name: 'Contacto', expectedUrl: /\/contacto/ },
    ];

    for (const link of footerLinks) {
      const linkEl = page.getByRole('link', { name: link.name });
      await expect(linkEl).toBeVisible();
    }
  });
});