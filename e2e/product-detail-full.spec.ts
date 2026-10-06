import { expect, test } from '@playwright/test';

// ============================================================================
// E2E: PRODUCT DETAIL - Info, comparador, tiendas, links, schema
// ============================================================================

test.describe('Product Detail Page', () => {
  test('muestra información completa del producto', async ({ page }) => {
    // Ir a búsqueda y entrar a un producto
    await page.goto('/comparar/procesadores');

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await page.waitForURL(/\/product\//);

    // Nombre del producto visible
    await expect(page.locator('h1')).toBeVisible();

    // Marca y modelo
    await expect(page.locator('main header')).toContainText('AMD');
    await expect(page.locator('main header')).toContainText('Ryzen 5 5600');

    // Descripción (usar .first() para evitar strict mode)
    await expect(page.locator('p').filter({ hasText: /.{20,}/ }).first()).toBeVisible();
  });

  test('muestra resumen comparador con tiendas y ahorro', async ({ page }) => {
    await page.goto('/comparar/procesadores');

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await page.waitForURL(/\/product\//);

    // Sección RESUMEN COMPARADOR
    await expect(page.getByText('MEJOR PRECIO REGISTRADO', { exact: true })).toBeVisible();

    // Métricas del comparador (usar .first() para evitar strict mode)
    await expect(page.getByText('2 tiendas con oferta comparable en las últimas 24 h.', { exact: true })).toBeVisible();
    await expect(page.getByText(/Rango:.*185.000.*189.999.*diferencia.*4.999/i)).toBeVisible();
    await expect(page.locator('#ofertas-por-tienda')).toContainText('Mexx');

    // Rango de precios
    await expect(page.getByText(/Confirmá precio final, stock, envío y forma de pago/i)).toBeVisible();
  });

  test('muestra lista de tiendas con precios', async ({ page }) => {
    await page.goto('/comparar/procesadores');

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await page.waitForURL(/\/product\//);

    // Sección TIENDAS DISPONIBLES
    await expect(page.getByRole('heading', { name: 'Ofertas por tienda', exact: true })).toBeVisible();

    // Al menos una tienda con precio
    const storeItems = page.locator('text=/@.+/');
    await expect(storeItems.first()).toBeVisible();

    // Mejor precio destacado
    await expect(page.getByText('[ MEJOR PRECIO ]')).toBeVisible();
  });

  test('links a tiendas externas funcionan', async ({ page }) => {
    await page.goto('/comparar/procesadores');

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await page.waitForURL(/\/product\//);

    // El producto sintético tiene dos ofertas; ambas deben ser accesibles.
    const storeLinks = page.locator('a[target="_blank"]').filter({ hasText: /VER EN TIENDA/ });
    await expect(storeLinks).toHaveCount(2);
    for (const link of await storeLinks.all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('href', /^https:\/\//);
      await expect(link).toHaveAttribute('rel', /noopener/);
    }
  });

  test('especificaciones técnicas visibles', async ({ page }) => {
    await page.goto('/comparar/procesadores');

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await page.waitForURL(/\/product\//);

    // Este producto fixture tiene especificaciones; deben mostrarse.
    await expect(page.getByRole('heading', { name: 'Ficha técnica', exact: true })).toBeVisible();
    const specs = page.locator('#ficha-tecnica');
    await expect(specs).toContainText('AM4');
    await expect(specs).toContainText('Núcleos');
    await expect(specs).toContainText('6');
    await expect(specs).toContainText('12');
  });

  test('botón volver al inventario funciona', async ({ page }) => {
    await page.goto('/comparar/procesadores');

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await page.waitForURL(/\/product\//);

    // Botón volver
    const backButton = page.getByRole('link', { name: 'Volver al catálogo', exact: true });
    await expect(backButton).toBeVisible();

    await backButton.click();
    await page.waitForURL(/\/comparar\/procesadores$/);
  });

  test('muestra fecha de actualización', async ({ page }) => {
    await page.goto('/comparar/procesadores');

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await page.waitForURL(/\/product\//);

    // Badge ACT: con fecha
    await expect(page.getByText(/Precio relevado:/i).first()).toBeVisible();
  });

  test('precio mejor detectado visible', async ({ page }) => {
    await page.goto('/comparar/procesadores');

    const productLinks = page.locator('#product-grid-start a[href^="/product/"]');
    const firstLink = productLinks.first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await page.waitForURL(/\/product\//);

    // Mejor precio
    await expect(page.getByText('MEJOR PRECIO REGISTRADO', { exact: true })).toBeVisible();

    // Precio en ARS (usar .first() para evitar strict mode)
    await expect(page.getByText(/\$\s?[\d.,]+/).first()).toBeVisible();
  });

  test('producto no encontrado muestra 404', async ({ page }) => {
    await page.goto('/product/non-existent-product-id');

    // El not-found.tsx muestra "ERROR 404: PAGINA NO ENCONTRADA"
    await expect(page.getByText(/ERROR 404/i)).toBeVisible();
    // El link puede ser "VOLVER AL INICIO" (not-found) o "VOLVER A LA BASE" (product client)
    await expect(page.getByRole('link', { name: /VOLVER AL INICIO|VOLVER A LA BASE/i })).toBeVisible();
  });
});
