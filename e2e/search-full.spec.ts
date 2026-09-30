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

    await expect(page.locator('#product-grid-start h3')).toHaveText([
      'AMD Ryzen 5 5600 6-Core 12-Thread AM4', 'AMD Ryzen 7 5700X 8-Core AM4',
    ]);
    await expect(page).toHaveURL(/q=ryzen/);
  });

  test('búsqueda sin resultados muestra estado apropiado', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    // Query muy específica que probablemente no tenga resultados
    await searchInput.fill('xyznonexistentproduct123456');
    await searchInput.press('Enter');

    // Wait for response (with timeout)
    await page.waitForTimeout(3000);

    await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
    await expect(page.locator('#product-grid-start article')).toHaveCount(0);
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
    await page.goto('/comparar/procesadores');
    await page.waitForLoadState('domcontentloaded');

    // Verify products exist first
    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    await expect(productLinks.first()).toBeVisible();

    // Apply very low max price filter to force no results
    const maxPriceInput = page.getByLabel('Precio máximo');
    await expect(maxPriceInput).toBeVisible();
    await maxPriceInput.fill('1');
    await maxPriceInput.press('Enter');

    await page.waitForTimeout(2000);

    await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
    await expect(page.locator('#product-grid-start article')).toHaveCount(0);

    // Clear filters button
    const clearButton = page.getByRole('button', { name: 'LIMPIAR FILTROS' });
    await expect(clearButton).toBeVisible();
    await clearButton.click();
    await page.waitForTimeout(1000);
  });

  test('reintentar búsqueda desde sin resultados', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    await searchInput.fill('testquery123');
    await searchInput.press('Enter');

    await page.waitForTimeout(3000);

    const noResults = await page.getByText('[ SIN RESULTADOS ]').isVisible().catch(() => false);
    expect(noResults).toBe(true);
    const retryButton = page.getByRole('button', { name: 'REINTENTAR BUSQUEDA' });
    await expect(retryButton).toBeVisible();
  });

  // Paginación se verifica con 13 productos deterministas en search-pagination.spec.ts.

  test('productos tienen cards con información completa', async ({ page }) => {
    await page.goto('/comparar/procesadores');
    await page.waitForLoadState('domcontentloaded');

    const productCards = page.locator('#product-grid-start [class*="border"]').filter({ hasText: /@/ });
    await expect(productCards.first()).toBeVisible();
    const cardCount = await productCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Wait for first card to be visible
    const firstCard = productCards.first();
    await expect(firstCard).toBeVisible();

    // Verify card has content
    const cardText = await firstCard.textContent();
    expect(cardText).toBeTruthy();
    expect(cardText?.length).toBeGreaterThan(10);
  });

  test('ordenamiento por precio funciona', async ({ page }) => {
    await page.goto('/search?category=procesadores&sortBy=price-asc');
    await page.waitForLoadState('domcontentloaded');

    const names = ['AMD Ryzen 5 5600 6-Core 12-Thread AM4', 'AMD Ryzen 7 5700X 8-Core AM4'];
    const headings = page.locator('#product-grid-start h3');
    await expect(headings).toHaveText(names);
    await expect(page).toHaveURL(/sortBy=price-asc/);
    await page.goto('/search?category=procesadores&sortBy=price-desc');
    await expect(headings).toHaveText([...names].reverse());
    await expect(page).toHaveURL(/sortBy=price-desc/);
  });

  test('búsqueda preserva filtros en URL', async ({ page }) => {
    await page.goto('/comparar/procesadores');
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
