import { test, expect, installSearchCatalog, searchProducts } from './fixtures/deterministic.fixture';

// ============================================================================
// E2E: HOME PAGE - Carga, secciones, búsqueda, navegación
// Usando Page Object Model pattern
// ============================================================================

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await installSearchCatalog(page);
    // La portada se renderiza en servidor con observaciones actuales. Un reloj de
    // septiembre cambiaría su frescura durante la hidratación y falsearía esta prueba.
    await page.clock.setFixedTime(new Date());
  });
  test('carga la home con título principal y barra de búsqueda', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');

    // Título principal visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Compará precios de hardware' })).toBeVisible();

    // Barra de búsqueda presente
    const searchInput = page.getByRole('combobox', { name: 'Buscar productos', exact: true });
    await expect(searchInput).toBeVisible();
    await searchInput.fill('procesador');
    await expect(searchInput).toHaveValue('procesador');
    expect(errors).toEqual([]);
  });

  test('las herramientas secundarias siguen accesibles con teclado desde Más', async ({ page }) => {
    await page.goto('/');
    const navigation = page.getByRole('navigation', { name: 'Navegación principal', exact: true });
    const comparison = navigation.getByRole('link', { name: 'Comparar productos', exact: true });
    await expect(comparison).toBeHidden();
    await navigation.locator('summary').press('Enter');
    await expect(comparison).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Índice de precios', exact: true })).toHaveCount(0);
    await comparison.press('Escape');
    await expect(comparison).toBeHidden();
    await expect(navigation.locator('summary')).toBeFocused();
  });

  test('navega desde home a búsqueda con query', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.getByRole('combobox', { name: 'Buscar productos', exact: true });
    await searchInput.fill('ryzen 5600');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search/);
    await expect(page).toHaveURL(/q=ryzen/);
  });

  test('las categorías tienen un único acceso y el resto se despliega', async ({ page }) => {
    await page.goto('/');
    const categories = page.getByRole('navigation', { name: 'Categorías de hardware' });
    await expect(categories.getByRole('link')).toHaveCount(4);
    const rest = categories.locator('details');
    await expect(rest.getByRole('link')).toHaveCount(0);
    await rest.locator('summary').press('Enter');
    await expect(categories.getByRole('link')).toHaveCount(10);
    const paths = await categories.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    expect(new Set(paths).size).toBe(paths.length);
    await expect(categories.getByRole('link', { name: 'Procesadores', exact: true })).toBeVisible();
    await expect(categories.getByRole('link', { name: 'Placas de video', exact: true })).toBeVisible();
  });

  test('navega a categoría desde home', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('navigation', { name: 'Categorías de hardware' }).getByRole('link', { name: 'Procesadores', exact: true }).click();
    await page.waitForURL(/\/comparar\/procesadores/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('no muestra un bloque vacío de productos vistos a una visita nueva', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /VISTOS RECIENTEMENTE/i })).toHaveCount(0);
    await expect(page.getByText('Todavia no hay productos vistos')).toHaveCount(0);
  });

  test('conserva los productos vistos cuando hay historial real en el navegador', async ({ page }) => {
    await page.addInitScript((product) => {
      localStorage.setItem('recently-viewed:v1', JSON.stringify([{ viewedAt: Date.now(), product }]));
    }, searchProducts[0]);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /VISTOS RECIENTEMENTE/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: searchProducts[0].name, exact: true })).toBeVisible();
  });

  test('últimas ofertas conserva su acceso incluso cuando no hay precios verificados', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Últimas ofertas', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /ÚLTIMAS OFERTAS/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegación principal', exact: true })
      .getByRole('link', { name: 'Últimas ofertas', exact: true })).toHaveAttribute('href', '/#ultimas-ofertas');
  });

  test('navega a la metodología desde el footer de home', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('contentinfo').getByRole('link', { name: 'Acerca de y cómo funciona', exact:true }).click();
    await page.waitForURL(/\/acerca/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('muestra disclosure comercial', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('TRANSPARENCIA COMERCIAL')).toBeVisible();
    await expect(page.getByText(/comparador independiente|no vendemos/i).first()).toBeVisible();
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
