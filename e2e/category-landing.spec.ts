import { expect, test } from '@playwright/test';

// ============================================================================
// E2E: CATEGORÍAS - Landing SEO, H1, filtros, navegación
// ============================================================================

test.describe('Category Landing Pages', () => {
  const categories = [
    { slug: 'procesadores', name: 'Procesadores', heading: 'Comparador de precios de procesadores en Argentina' },
    { slug: 'tarjetas-graficas', name: 'Tarjetas Graficas', heading: 'Comparador de precios de tarjetas graficas en Argentina' },
    { slug: 'motherboards', name: 'Motherboards', heading: 'Comparador de precios de motherboards en Argentina' },
    { slug: 'memoria-ram', name: 'Memoria RAM', heading: 'Comparador de precios de memoria RAM en Argentina' },
  ];

  for (const cat of categories) {
    test.describe(`Categoria: ${cat.name}`, () => {
      test('landing tiene H1 SEO e intro visible', async ({ page }) => {
        await page.goto(`/search?category=${cat.slug}`);

        // H1 SEO visible
        const heading = page.getByRole('heading', { level: 1 });
        await expect(heading).toBeVisible();
        await expect(heading).toContainText(cat.heading, { ignoreCase: true });

        // Intro editorial (usar .first() para evitar strict mode)
        await expect(page.getByText(/explora|compara|encuentra|revisa/i).first()).toBeVisible();
      });

      test('muestra panel de filtros', async ({ page }) => {
        await page.goto(`/search?category=${cat.slug}`);

        // Panel de filtros visible (buscar el heading FILTROS)
        await expect(page.locator('h2:has-text("FILTROS")').first()).toBeVisible();

        // Panel de categorías (buscar el heading CATEGORIAS)
        await expect(page.locator('h3:has-text("CATEGORIAS")').first()).toBeVisible();
      });

      test('puede navegar a otras categorías desde sidebar', async ({ page }) => {
        await page.goto(`/search?category=${cat.slug}`);

        // Click en otra categoría usando el texto del botón
        const otherCategory = categories.find(c => c.slug !== cat.slug);
        if (otherCategory) {
          // Usar texto exacto del botón en el sidebar
          await page.locator(`button:has-text("${otherCategory.name}")`).first().click();
          await page.waitForURL(new RegExp(`/search\\?category=${otherCategory.slug}`));
          await expect(page).toHaveURL(new RegExp(`/search\\?category=${otherCategory.slug}`));
        }
      });

      test('muestra contador de resultados o estado de búsqueda', async ({ page }) => {
        await page.goto(`/search?category=${cat.slug}`);

        // Debería mostrar resultados o estar buscando (usar .first() para strict mode)
        const resultCounter = page.getByText(/RESULTADOS|BUSCANDO|ESCANEANDO/i).first();
        await expect(resultCounter).toBeVisible();
      });

      test('landing pura sin query es indexable (sin noindex)', async ({ page }) => {
        await page.goto(`/search?category=${cat.slug}`);

        // Verificar que no hay meta robots noindex
        const noindexMeta = page.locator('meta[name="robots"][content*="noindex"]');
        await expect(noindexMeta).toHaveCount(0);
      });
    });
  }

  test('perifericos landing con múltiples subtipos', async ({ page }) => {
    await page.goto('/search?category=perifericos');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Comparador de precios de perifericos')).toBeVisible();
  });

  test('categoría con filtros de precio funciona', async ({ page }) => {
    await page.goto('/search?category=procesadores');

    // Aplicar filtro de precio mínimo
    const minPriceInput = page.getByLabel('Precio mínimo');
    if (await minPriceInput.isVisible()) {
      await minPriceInput.fill('100000');
      await minPriceInput.press('Enter');

      await page.waitForTimeout(1000);

      // URL debería incluir el filtro
      const url = page.url();
      expect(url).toContain('minPrice=100000');
    }
  });

  test('categoría con filtro de tiendas', async ({ page }) => {
    await page.goto('/search?category=procesadores');

    // Verificar que hay checkboxes de tiendas
    const storeCheckboxes = page.locator('input[type="checkbox"]');
    const count = await storeCheckboxes.count();
    expect(count).toBeGreaterThan(0);
  });
});
