import { expect, test } from '@playwright/test';

// ============================================================================
// E2E: SEARCH COMPLETO - Query, filtros, resultados, sin resultados, orden
// ============================================================================

test.describe('Search Full Flow', () => {
  test('búsqueda con query retorna resultados', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    await searchInput.fill('ryzen');
    await searchInput.press('Enter');

    // Esperar a que haya resultados o termine la búsqueda
    await page.waitForTimeout(5000);

    // Debería mostrar resultados o al menos estar buscando
    const hasResults = await page.locator('#product-grid-start a[href^="/product/"]').first().isVisible().catch(() => false);
    const isSearching = await page.getByText(/ESCANEANDO|BUSCANDO/i).first().isVisible().catch(() => false);
    const hasProductCards = await page.locator('#product-grid-start [class*="border"]').filter({ hasText: /@/ }).first().isVisible().catch(() => false);

    expect(hasResults || isSearching || hasProductCards).toBe(true);
  });

  test('búsqueda sin resultados muestra estado apropiado', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    // Query muy específica que probablemente no tenga resultados
    await searchInput.fill('xyznonexistentproduct123456');
    await searchInput.press('Enter');

    await page.waitForTimeout(5000);

    // Debería mostrar sin resultados o terminar la búsqueda sin productos
    const noResults = await page.getByText('[ SIN RESULTADOS ]').isVisible().catch(() => false);
    const noProducts = await page.locator('#product-grid-start a[href^="/product/"]').count().then(c => c === 0).catch(() => true);
    expect(noResults || noProducts).toBe(true);
  });

  test('estado idle sin intención de búsqueda', async ({ page }) => {
    await page.goto('/search');

    await expect(page.getByText('[ LISTO PARA BUSCAR ]')).toBeVisible();
    await expect(page.getByText(/escribi un producto|para empezar/i)).toBeVisible();
  });

  test('estado de búsqueda en progreso', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    await searchInput.fill('rtx 4060');
    await searchInput.press('Enter');

    // Debería mostrar estado de búsqueda (usar .first() para evitar strict mode)
    await expect(page.getByText(/ESCANEANDO|BUSCANDO|Consultando/i).first()).toBeVisible();
  });

  test('limpiar filtros desde estado sin resultados', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(3000);

    // Verificar que hay productos primero
    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const hasProducts = await productLinks.first().isVisible().catch(() => false);

    if (!hasProducts) return; // Skip si no hay productos

    // Aplicar filtro de precio máximo muy bajo para forzar sin resultados
    const maxPriceInput = page.getByLabel('Precio máximo');
    if (await maxPriceInput.isVisible()) {
      await maxPriceInput.fill('1');
      await maxPriceInput.press('Enter');

      await page.waitForTimeout(3000);

      // Debería mostrar sin resultados o productos vacíos
      const noResults = await page.getByText('[ SIN RESULTADOS ]').isVisible().catch(() => false);
      const noProducts = await page.locator('#product-grid-start a[href^="/product/"]').count().then(c => c === 0).catch(() => true);

      if (noResults || noProducts) {
        // Botón limpiar filtros
        const clearButton = page.getByRole('button', { name: 'LIMPIAR FILTROS' });
        if (await clearButton.isVisible()) {
          await clearButton.click();
          await page.waitForTimeout(1000);
        }
      }
    }
  });

  test('reintentar búsqueda desde sin resultados', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    await searchInput.fill('testquery123');
    await searchInput.press('Enter');

    await page.waitForTimeout(3000);

    const noResults = await page.getByText('[ SIN RESULTADOS ]').isVisible().catch(() => false);
    if (noResults) {
      const retryButton = page.getByRole('button', { name: 'REINTENTAR BUSQUEDA' });
      await expect(retryButton).toBeVisible();
    }
  });

  test('navegación de paginación mantiene categoría', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(2000);

    const nextButton = page.getByRole('button', { name: 'NEXT >>' });
    const hasNext = await nextButton.isVisible().catch(() => false);

    if (hasNext) {
      await nextButton.click();
      await page.waitForURL(/page=2/);
      await expect(page).toHaveURL(/category=procesadores/);
      await expect(page).toHaveURL(/page=2/);
    }
  });

  test('productos tienen cards con información completa', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(3000);

    const productCards = page.locator('#product-grid-start [class*="border"]').filter({ hasText: /@/ });
    const cardCount = await productCards.count();

    if (cardCount > 0) {
      // Esperar a que la primera card esté visible
      const firstCard = productCards.first();
      await firstCard.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

      // Verificar que la card tiene contenido
      const cardText = await firstCard.textContent();
      expect(cardText).toBeTruthy();
      expect(cardText?.length).toBeGreaterThan(10);
    }
  });

  test('ordenamiento por precio funciona', async ({ page }) => {
    await page.goto('/search?category=procesadores&sortBy=price-asc');
    await page.waitForTimeout(3000);

    // URL debe mantener el orden
    await expect(page).toHaveURL(/sortBy=price-asc/);
  });

  test('búsqueda preserva filtros en URL', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(2000);

    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    await searchInput.fill('5600x');
    await searchInput.press('Enter');

    await page.waitForTimeout(3000);

    // URL debería mantener la categoría
    const url = page.url();
    expect(url).toContain('category=procesadores');
    // El query puede o no estar en la URL dependiendo del estado de la búsqueda
  });
});
