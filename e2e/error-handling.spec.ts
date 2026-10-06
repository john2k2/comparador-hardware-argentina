import { expect, test, installSearchCatalog, searchFromIdle, searchProducts } from './fixtures/deterministic.fixture';

test.describe('HTTP not-found responses', () => {
  for (const path of [
    '/ruta-que-no-existe-xyz-123',
    '/guia/guia-que-no-existe-xyz-123',
    '/comparativa/comparativa-que-no-existe-xyz-123',
    '/comparar/categoria-que-no-existe-xyz-123',
    '/product/producto-que-no-existe-xyz-123',
  ]) {
    test(`${path} returns a real 404 and a recoverable noindex page`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response).not.toBeNull();
      expect(response!.status()).toBe(404);
      await expect(page.getByRole('heading', { name: 'Página no encontrada', exact: true })).toBeVisible();
      const robots = await page.locator('meta[name="robots"]').evaluateAll((tags) => tags.map((tag) => tag.getAttribute('content')));
      expect(robots.length).toBeGreaterThan(0);
      for (const content of robots) expect(content).toContain('noindex');
      const searchLink = page.getByRole('link', { name: 'Buscar productos', exact: true });
      await expect(searchLink).toHaveAttribute('href', '/search');
      await searchLink.click();
      await expect(page).toHaveURL(/\/search$/);
      await expect(page.getByText('[ LISTO PARA BUSCAR ]', { exact: true })).toBeVisible();
    });
  }
});

test.describe('Search error and empty states', () => {
  test.beforeEach(async ({ page }) => { await installSearchCatalog(page); });

  test('renders special characters as text without executing markup', async ({ page }) => {
    const dialogs: string[] = [];
    const errors: string[] = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    page.on('pageerror', (error) => errors.push(error.message));
    const query = '<script>alert("xss")</script>';
    await searchFromIdle(page, query);
    await expect(page.getByRole('heading', { name: `Resultados para ${query}`, exact: true })).toHaveText(`Resultados para ${query}`);
    await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
    await expect(page.locator('#product-grid-start article')).toHaveCount(0);
    expect(await page.locator('script').evaluateAll((scripts) => scripts.some((script) => script.textContent === 'alert("xss")'))).toBe(false);
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  });

  for (const path of ['/search?q=', '/search?page=abc&minPrice=xyz&sortBy=invalid', '/search?minPrice=-100']) {
    test(`${path} normalizes to the idle state`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText('[ LISTO PARA BUSCAR ]', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Precio mínimo')).toHaveValue('');
      await expect(page.locator('#product-grid-start article')).toHaveCount(0);
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    });
  }

  test('unknown category normalizes to the idle state', async ({ page }) => {
    await page.goto('/search?category=categoria-inexistente-xyz');
    await expect(page.getByText('[ LISTO PARA BUSCAR ]', { exact: true })).toBeVisible();
    await expect(page.locator('#product-grid-start article')).toHaveCount(0);
  });

  test('a genuinely empty catalog shows no results, not an idle or error state', async ({ page }) => {
    await searchFromIdle(page, 'no-fixture-matches');
    await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toBeVisible();
    await expect(page.getByText('RESULTADOS: 0 ITEMS', { exact: true })).toBeVisible();
    await expect(page.getByText('[ LISTO PARA BUSCAR ]', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    await expect(page.locator('#product-grid-start article')).toHaveCount(0);
  });

  test('out-of-range history navigation renders the final page and permits returning to page one', async ({ page }) => {
    await searchFromIdle(page);
    await expect(page.locator('#product-grid-start article')).toHaveCount(12);
    // Se conserva un único catálogo simulado durante la navegación cliente.
    // El clamp de la lectura SSR está cubierto por el contrato SQL y su adaptador.
    await page.evaluate(() => {
      history.pushState(null, '', '/search?q=Ryzen&category=procesadores&page=99999');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.locator('#product-grid-start h3')).toHaveText(['AMD Ryzen fixture 13']);
    await expect(page.getByRole('link', { name: 'Ir a la página 3', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Ir a la página 1', exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'Ryzen' &&
      url.searchParams.get('category') === 'procesadores' && !url.searchParams.has('page'));
    await expect(page.locator('#product-grid-start article')).toHaveCount(12);
    await expect(page.locator('#product-grid-start h3').first()).toHaveText(searchProducts[0].name);
  });

  for (const failure of ['http', 'network'] as const) {
    test(`${failure} failure displays an error and retry restores actual results`, async ({ page }) => {
      let failing = true;
      let attempts = 0;
      await page.route('**/api/search**', async (route) => {
        attempts += 1;
        if (!failing) { await route.fallback(); return; }
        if (failure === 'network') await route.abort('failed');
        else await route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } });
      });
      await searchFromIdle(page);
      const alert = page.getByRole('main').getByRole('alert');
      await expect(alert).toContainText('[ ERROR EN LA BUSQUEDA ]');
      await expect(page.getByText('[ SIN RESULTADOS ]', { exact: true })).toHaveCount(0);
      await expect(page.locator('#product-grid-start article')).toHaveCount(0);
      const failedAttempts = attempts;
      expect(failedAttempts).toBeGreaterThan(0);
      failing = false;
      await alert.getByRole('button', { name: 'REINTENTAR', exact: true }).click();
      await expect(page.locator('#product-grid-start article')).toHaveCount(12);
      await expect(page.locator('#product-grid-start h3').first()).toHaveText(searchProducts[0].name);
      await expect(alert).toHaveCount(0);
      expect(attempts).toBeGreaterThan(failedAttempts);
    });
  }
});

test.describe('Catalog content integrity', () => {
  test('every fixture product image has the matching accessible name', async ({ page }) => {
    await installSearchCatalog(page);
    await searchFromIdle(page);
    const cards = page.locator('#product-grid-start article');
    await expect(cards).toHaveCount(12);
    for (let index = 0; index < 12; index += 1) {
      const image = cards.nth(index).getByRole('img');
      await expect(image).toHaveCount(1);
      await expect(image).toHaveAttribute('alt', searchProducts[index].name);
    }
  });

  test('search results become usable within the local response budget', async ({ page }) => {
    await installSearchCatalog(page);
    const startedAt = Date.now();
    await searchFromIdle(page);
    await expect(page.locator('#product-grid-start article')).toHaveCount(12);
    await expect(page.getByRole('link', { name: 'Ir a la página 2', exact: true })).toBeVisible();
    expect(Date.now() - startedAt).toBeLessThan(15_000);
  });
});
