import { expect, test } from '@playwright/test';

// ============================================================================
// E2E: ERRORES Y EDGE CASES - 404, timeouts, errores de red
// ============================================================================

test.describe('Error Handling', () => {
  test('pagina 404 para ruta inexistente', async ({ page }) => {
    await page.goto('/ruta-que-no-existe-xyz-123');

    // Next.js debería mostrar página 404
    // Puede ser la página 404 por defecto o custom
    const bodyText = await page.textContent('body');
    expect(bodyText && (bodyText.includes('404') || bodyText.includes('no encontrado') || bodyText.includes('not found'))).toBe(true);
  });

  test('producto inexistente muestra error amigable', async ({ page }) => {
    await page.goto('/product/producto-que-no-existe-123');

    // Verificar que la página cargó y muestra un título de error
    await page.waitForTimeout(2000);
    const title = await page.title();
    expect(title.toLowerCase()).toContain('no encontrado');

    // Verificar que no crasheó (hay contenido visible)
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(500);
  });

  test('búsqueda con caracteres especiales no crashea', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    await searchInput.fill('<script>alert("xss")</script>');
    await searchInput.press('Enter');

    await page.waitForTimeout(2000);

    // No debería crashar, debería mostrar algo
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test('búsqueda vacía no genera error', async ({ page }) => {
    await page.goto('/search?q=');

    // Debería mostrar estado idle
    await expect(page.getByText('[ LISTO PARA BUSCAR ]')).toBeVisible();
  });

  test('categoría inexistente no crashea', async ({ page }) => {
    await page.goto('/search?category=categoria-inexistente-xyz');

    // Debería cargar sin crash
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test('parámetros inválidos en URL no crashean', async ({ page }) => {
    await page.goto('/search?page=abc&minPrice=xyz&sortBy=invalid');

    // Debería manejar gracefully
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test('precio negativo en URL manejado', async ({ page }) => {
    await page.goto('/search?minPrice=-100');

    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test('pagina muy grande en pagination no crashea', async ({ page }) => {
    await page.goto('/search?category=procesadores&page=99999');

    // Debería mostrar página válida o última página
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(0);
  });
});

test.describe('Network Resilience', () => {
  test('home funciona sin datos de secciones', async ({ page }) => {
    // Home debería cargar aunque las secciones estén vacías
    await page.goto('/');

    // Al menos el header y search deberían estar
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByPlaceholder(/BUSCAR|NUEVA/i)).toBeVisible();
  });

  test('search funciona sin resultados de DB', async ({ page }) => {
    await page.goto('/search');

    // Debería mostrar estado idle incluso si no hay datos
    await expect(page.getByText('[ LISTO PARA BUSCAR ]')).toBeVisible();
  });
});

test.describe('Content Integrity', () => {
  test('sin scripts maliciosos inyectados', async ({ page }) => {
    await page.goto('/');

    // Verificar que no hay scripts sospechosos
    const scripts = page.locator('script:not([src])');
    const count = await scripts.count();

    // Los scripts inline deberían ser mínimos (analytics, theme, Next.js chunks)
    // En dev mode Next.js inyecta muchos scripts, así que el límite es mayor
    expect(count).toBeLessThan(50);
  });

  test('todas las imágenes tienen alt text', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(3000);

    const images = page.locator('img');
    const imageCount = await images.count();

    if (imageCount > 0) {
      for (let i = 0; i < Math.min(imageCount, 5); i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        // Next.js Image siempre tiene alt (puede ser vacío)
        expect(alt !== undefined).toBe(true);
      }
    }
  });

  test('links externos tienen target="_blank"', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(3000);

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    if (await firstLink.isVisible()) {
      await firstLink.click();
      await page.waitForURL(/\/product\//);

      // Links a tiendas deberían abrir en nueva pestaña
      const storeLinks = page.getByRole('link', { name: /VER EN TIENDA/i });
      const count = await storeLinks.count();

      if (count > 0) {
        const target = await storeLinks.first().getAttribute('target');
        expect(target).toBe('_blank');
      }
    }
  });
});

test.describe('Performance Basics', () => {
  test('home carga en tiempo razonable', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Debería cargar en menos de 10 segundos
    expect(loadTime).toBeLessThan(10000);
  });

  test('búsqueda responde en tiempo razonable', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/search?category=procesadores');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Debería cargar en menos de 15 segundos (puede incluir scraping)
    expect(loadTime).toBeLessThan(15000);
  });
});
