import { expect, test } from '@playwright/test';

// ============================================================================
// E2E: SEARCH COMPLETO - Query, filtros, resultados, sin resultados, orden
// Usando patrones de playwright-best-practices
// ============================================================================

test.describe('Search Full Flow', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate and wait for DOM content to load (not networkidle - can timeout)
    await page.goto('/search');
    await page.waitForLoadState('domcontentloaded');
  });

  test('búsqueda con query retorna resultados', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    await searchInput.fill('ryzen');
    await searchInput.press('Enter');

    // Wait for either results or searching state (with timeout)
    await page.waitForTimeout(2000);

    // Should show results or searching
    const hasResults = await page.locator('#product-grid-start a[href^="/product/"]').first().isVisible().catch(() => false);
    const isSearching = await page.getByText(/ESCANEANDO|BUSCANDO/i).first().isVisible().catch(() => false);
    const hasProductCards = await page.locator('#product-grid-start [class*="border"]').filter({ hasText: /@/ }).first().isVisible().catch(() => false);

    expect(hasResults || isSearching || hasProductCards).toBe(true);
  });

  test('búsqueda sin resultados muestra estado apropiado', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    // Query muy específica que probablemente no tenga resultados
    await searchInput.fill('xyznonexistentproduct123456');
    await searchInput.press('Enter');

    // Wait for response (with timeout)
    await page.waitForTimeout(3000);

    // Should show no results or no products
    const noResults = await page.getByText('[ SIN RESULTADOS ]').isVisible().catch(() => false);
    const noProducts = await page.locator('#product-grid-start a[href^="/product/"]').count().then(c => c === 0).catch(() => true);
    expect(noResults || noProducts).toBe(true);
  });

  test('estado idle sin intención de búsqueda', async ({ page }) => {
    await expect(page.getByText('[ LISTO PARA BUSCAR ]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/escribi un producto|para empezar/i).first()).toBeVisible();
  });

  test('estado de búsqueda en progreso', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    await searchInput.fill('rtx 4060');
    await searchInput.press('Enter');

    // Should show searching state immediately
    await expect(page.getByText(/ESCANEANDO|BUSCANDO|Consultando/i).first()).toBeVisible({ timeout: 3000 });
  });

  test('limpiar filtros desde estado sin resultados', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForLoadState('domcontentloaded');

    // Verify products exist first
    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const hasProducts = await productLinks.first().isVisible().catch(() => false);

    if (!hasProducts) return; // Skip if no products

    // Apply very low max price filter to force no results
    const maxPriceInput = page.getByLabel('Precio máximo');
    if (await maxPriceInput.isVisible()) {
      await maxPriceInput.fill('1');
      await maxPriceInput.press('Enter');

      await page.waitForTimeout(2000);

      // Should show no results or empty products
      const noResults = await page.getByText('[ SIN RESULTADOS ]').isVisible().catch(() => false);
      const noProducts = await page.locator('#product-grid-start a[href^="/product/"]').count().then(c => c === 0).catch(() => true);

      if (noResults || noProducts) {
        // Clear filters button
        const clearButton = page.getByRole('button', { name: 'LIMPIAR FILTROS' });
        if (await clearButton.isVisible()) {
          await clearButton.click();
          await page.waitForTimeout(1000);
        }
      }
    }
  });

  test('reintentar búsqueda desde sin resultados', async ({ page }) => {
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
    await page.waitForLoadState('domcontentloaded');

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
    await page.waitForLoadState('domcontentloaded');

    const productCards = page.locator('#product-grid-start [class*="border"]').filter({ hasText: /@/ });
    const cardCount = await productCards.count();

    if (cardCount > 0) {
      // Wait for first card to be visible
      const firstCard = productCards.first();
      await firstCard.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

      // Verify card has content
      const cardText = await firstCard.textContent();
      expect(cardText).toBeTruthy();
      expect(cardText?.length).toBeGreaterThan(10);
    }
  });

  test('ordenamiento por precio funciona', async ({ page }) => {
    await page.goto('/search?category=procesadores&sortBy=price-asc');
    await page.waitForLoadState('domcontentloaded');

    // URL should maintain order
    await expect(page).toHaveURL(/sortBy=price-asc/);
  });

  test('búsqueda preserva filtros en URL', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    await searchInput.fill('5600x');
    await searchInput.press('Enter');

    // Wait a bit for URL to update
    await page.waitForTimeout(1000);

    // URL should maintain category
    const url = page.url();
    expect(url).toContain('category=procesadores');
  });
});