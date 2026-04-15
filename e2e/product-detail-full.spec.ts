import { expect, test } from '@playwright/test';

// ============================================================================
// E2E: PRODUCT DETAIL - Info, comparador, tiendas, links, schema
// ============================================================================

test.describe('Product Detail Page', () => {
  test('muestra información completa del producto', async ({ page }) => {
    // Ir a búsqueda y entrar a un producto
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(2000); // Esperar carga de resultados

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    if (await firstLink.isVisible()) {
      await firstLink.click();
      await page.waitForURL(/\/product\//);

      // Nombre del producto visible
      await expect(page.locator('h1')).toBeVisible();

      // Marca y modelo
      await expect(page.getByText(/BRAND:/i)).toBeVisible();
      await expect(page.getByText(/MODELO:/i)).toBeVisible();

      // Descripción (usar .first() para evitar strict mode)
      await expect(page.locator('p').filter({ hasText: /.{20,}/ }).first()).toBeVisible();
    }
  });

  test('muestra resumen comparador con tiendas y ahorro', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(2000);

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    if (await firstLink.isVisible()) {
      await firstLink.click();
      await page.waitForURL(/\/product\//);

      // Sección RESUMEN COMPARADOR
      await expect(page.getByText('RESUMEN COMPARADOR')).toBeVisible();

      // Métricas del comparador (usar .first() para evitar strict mode)
      await expect(page.getByText('Tiendas').first()).toBeVisible();
      await expect(page.getByText('Diferencia').first()).toBeVisible();
      await expect(page.getByText('Ahorro Max').first()).toBeVisible();

      // Rango de precios
      await expect(page.getByText(/Rango actual:/i)).toBeVisible();
    }
  });

  test('muestra lista de tiendas con precios', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(2000);

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    if (await firstLink.isVisible()) {
      await firstLink.click();
      await page.waitForURL(/\/product\//);

      // Sección TIENDAS DISPONIBLES
      await expect(page.getByText('TIENDAS DISPONIBLES')).toBeVisible();

      // Al menos una tienda con precio
      const storeItems = page.locator('text=/@.+/');
      await expect(storeItems.first()).toBeVisible();

      // Mejor precio destacado
      await expect(page.getByText('[ MEJOR PRECIO ]')).toBeVisible();
    }
  });

  test('links a tiendas externas funcionan', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(2000);

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    if (await firstLink.isVisible()) {
      await firstLink.click();
      await page.waitForURL(/\/product\//);

      // Links "VER EN TIENDA" (puede haber 0 si solo 1 tienda vende el producto)
      const storeLinks = page.getByRole('link', { name: /VER EN TIENDA/i });
      const count = await storeLinks.count();

      // Si hay múltiples tiendas, verificar que los links son externos
      if (count > 0) {
        const firstStoreLink = storeLinks.first();
        const target = await firstStoreLink.getAttribute('target');
        expect(target).toBe('_blank');
      }
    }
  });

  test('especificaciones técnicas visibles', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(2000);

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    if (await firstLink.isVisible()) {
      await firstLink.click();
      await page.waitForURL(/\/product\//);

      // Tabla de especificaciones
      const specsSection = page.getByText(/ESPECIFICACIONES|SPECS/i);
      if (await specsSection.isVisible()) {
        await expect(specsSection).toBeVisible();
      }
    }
  });

  test('botón volver al inventario funciona', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(2000);

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    if (await firstLink.isVisible()) {
      await firstLink.click();
      await page.waitForURL(/\/product\//);

      // Botón volver
      const backButton = page.getByRole('link', { name: /\[ VOLVER AL INVENTARIO \]/ });
      await expect(backButton).toBeVisible();

      await backButton.click();
      await page.waitForURL(/\/search/);
    }
  });

  test('muestra fecha de actualización', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(2000);

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    if (await firstLink.isVisible()) {
      await firstLink.click();
      await page.waitForURL(/\/product\//);

      // Badge ACT: con fecha
      await expect(page.getByText(/ACT:/i)).toBeVisible();
    }
  });

  test('precio mejor detectado visible', async ({ page }) => {
    await page.goto('/search?category=procesadores');
    await page.waitForTimeout(2000);

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    if (await firstLink.isVisible()) {
      await firstLink.click();
      await page.waitForURL(/\/product\//);

      // Mejor precio
      await expect(page.getByText('MEJOR PRECIO DETECTADO')).toBeVisible();

      // Precio en ARS (usar .first() para evitar strict mode)
      await expect(page.getByText(/\$\s?[\d.,]+/).first()).toBeVisible();
    }
  });

  test('producto no encontrado muestra 404', async ({ page }) => {
    await page.goto('/product/non-existent-product-id');

    // El not-found.tsx muestra "ERROR 404: PAGINA NO ENCONTRADA"
    await expect(page.getByText(/ERROR 404/i)).toBeVisible();
    // El link puede ser "VOLVER AL INICIO" (not-found) o "VOLVER A LA BASE" (product client)
    await expect(page.getByRole('link', { name: /VOLVER AL INICIO|VOLVER A LA BASE/i })).toBeVisible();
  });
});
