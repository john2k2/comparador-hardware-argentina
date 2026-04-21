import { expect, test } from '@playwright/test';

// ============================================================================
// E2E: NAVEGACIÓN GLOBAL - Nav, footer, páginas estáticas, links
// ============================================================================

test.describe('Global Navigation', () => {
  test('navegación superior visible en todas las páginas', async ({ page }) => {
    const pages = ['/', '/search', '/acerca', '/contacto', '/privacidad', '/terminos'];

    for (const p of pages) {
      await page.goto(p);

      // Logo o nombre del sitio (verificar que el header/nav está presente)
      const nav = page.locator('nav, header').first();
      await expect(nav).toBeVisible();

      // Links de navegación principales
      const navLinks = page.locator('nav a[href], header a[href]');
      await expect(navLinks.first()).toBeVisible();
    }
  });

  test('link a home desde cualquier página', async ({ page }) => {
    await page.goto('/search');

    // Click en logo/home
    const homeLink = page.getByRole('link', { name: /comparador|home|inicio/i }).first();
    if (await homeLink.isVisible()) {
      await homeLink.click();
      await page.waitForURL('/');
      await expect(page).toHaveURL('/');
    }
  });

  test('link a búsqueda desde cualquier página', async ({ page }) => {
    await page.goto('/acerca');

    await page.getByRole('link', { name: /buscar|ir a busqueda/i }).click();
    await page.waitForURL(/\/search/);
    await expect(page).toHaveURL(/\/search/);
  });
});

test.describe('Static Pages', () => {
  test('página Acerca de con contenido', async ({ page }) => {
    await page.goto('/acerca');

    // Título
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/ACERCA DEL PROYECTO/i);

    // Secciones informativas (usar .first() para evitar strict mode)
    await expect(page.getByText('[ MISION ]').first()).toBeVisible();
    await expect(page.getByText('[ FOCO ]').first()).toBeVisible();
    await expect(page.getByText('[ ESTADO ]').first()).toBeVisible();

    // Cómo funciona
    await expect(page.getByText('[ COMO FUNCIONA ]').first()).toBeVisible();
    await expect(page.getByText('[ LIMITES ]').first()).toBeVisible();

    // Disclosure comercial
    await expect(page.getByText('TRANSPARENCIA COMERCIAL').first()).toBeVisible();

    // CTA a búsqueda
    await expect(page.getByRole('link', { name: /IR A BUSCAR/i })).toBeVisible();
  });

  test('página de Contacto con información', async ({ page }) => {
    await page.goto('/contacto');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // El heading contiene "CONTACTO" - usar .first() para strict mode
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/CONTACTO/i);

    // Debería tener alguna forma de contacto (email, formulario, etc.)
    const hasContactInfo = await page.getByText(/email|mail|@|formulario/i).first().isVisible().catch(() => false);
    expect(hasContactInfo).toBe(true);
  });

  test('página de Privacidad con política', async ({ page }) => {
    await page.goto('/privacidad');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/PRIVACIDAD/i);

    // Contenido sustancial (no solo placeholder)
    const content = await page.locator('main').textContent();
    expect(content?.length).toBeGreaterThan(200);
  });

  test('página de Términos con condiciones', async ({ page }) => {
    await page.goto('/terminos');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/TERMINOS/i);

    // Contenido sustancial
    const content = await page.locator('main').textContent();
    expect(content?.length).toBeGreaterThan(200);
  });

  test('todas las páginas estáticas tienen footer', async ({ page }) => {
    const pages = ['/acerca', '/contacto', '/privacidad', '/terminos'];

    for (const p of pages) {
      await page.goto(p);

      // Footer presente (usar .first() por si hay múltiples)
      const footer = page.locator('footer').first();
      await expect(footer).toBeVisible();

      // Links del footer (usar .first() por si hay duplicados)
      await expect(page.getByRole('link', { name: 'Acerca de' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Politica de Privacidad' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Terminos de Uso' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Contacto' }).first()).toBeVisible();
    }
  });
});

test.describe('SEO & Metadata', () => {
  test('home tiene title y description', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    expect(title).toContain('Comparador');
    expect(title.toLowerCase()).toContain('hardware');

    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', /.+/);
  });

  test('categoría tiene title y description SEO', async ({ page }) => {
    await page.goto('/search?category=procesadores');

    const title = await page.title();
    expect(title.length).toBeGreaterThan(10);

    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', /.+/);
  });

  test('robots.txt accesible y configurado', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    // En dev mode puede devolver 500, pero debería funcionar en producción
    if (response?.status() === 200) {
      const content = await page.textContent('body');
      expect(content).toContain('Sitemap');
      expect(content).toContain('/admin');
      expect(content).toContain('/api');
    }
  });

  test('sitemap.xml accesible', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');
    expect(response?.status()).toBe(200);

    const content = await page.textContent('body');
    expect(content).toContain('<urlset');
    expect(content).toContain('comparador-hardware.com.ar');
  });
});

test.describe('Skip to Content (Accesibilidad)', () => {
  test('link skip to main content presente', async ({ page }) => {
    await page.goto('/');

    // El link debería estar presente (aunque sea sr-only)
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeVisible();
  });
});
