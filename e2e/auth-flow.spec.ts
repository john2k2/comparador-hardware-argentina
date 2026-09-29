import { expect, test } from './fixtures/deterministic.fixture';

// ============================================================================
// E2E: AUTH - Login, registro, sesión, logout
// ============================================================================

test.describe('Auth Flow', () => {
  // Allow the mocked auth transport; production CSP is covered by csp-hydration.
  test.use({ bypassCSP: true });

  test('pagina de auth muestra opciones de login', async ({ page }) => {
    await page.goto('/auth');

    // Formulario de login visible
    await expect(page.getByRole('heading', { level: 2, name: /entrar o crear cuenta/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'INGRESAR' })).toBeVisible();

    // Opción de registro - el tab dice "CREAR CUENTA"
    await expect(page.getByRole('button', { name: 'CREAR CUENTA' })).toBeVisible();

    // Login con Google
    await expect(page.getByRole('button', { name: 'CONTINUAR CON GOOGLE' })).toBeVisible();
  });

  test('login con credenciales invalidas muestra error', async ({ page }) => {
    const submitted: unknown[] = [];
    await page.route('**/auth/v1/token?grant_type=password', async (route) => {
      expect(route.request().method()).toBe('POST');
      submitted.push(route.request().postDataJSON());
      await route.fulfill({ status: 400, json: {
        code: 'invalid_credentials', message: 'Invalid login credentials',
      } });
    });
    await page.goto('/auth');

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await emailInput.fill('invalid@test.com');
    await passwordInput.fill('wrongpassword123');

    await submitButton.click();

    await expect(page.getByText('Invalid login credentials', { exact: true })).toBeVisible();
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ email: 'invalid@test.com', password: 'wrongpassword123' });
    await expect(submitButton).toBeEnabled();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByText('[ Cuenta activa ]', { exact: true })).toHaveCount(0);
  });

  test('admin panel protegido - redirige a auth sin sesión', async ({ page }) => {
    await page.goto('/admin');

    // Debería redirigir a login
    await page.waitForURL(/\/auth\?next=/);
    await expect(page).toHaveURL(/\/auth/);
    await expect(page).toHaveURL(/next=.*admin/);
  });

  test('admin stores protegido', async ({ page }) => {
    await page.goto('/admin/stores');
    await page.waitForURL(/\/auth\?next=/);
    await expect(page).toHaveURL(/\/auth/);
  });

  test('admin scrapers protegido', async ({ page }) => {
    await page.goto('/admin/scrapers');
    await page.waitForURL(/\/auth\?next=/);
    await expect(page).toHaveURL(/\/auth/);
  });

  test('admin logs protegido', async ({ page }) => {
    await page.goto('/admin/logs');
    await page.waitForURL(/\/auth\?next=/);
    await expect(page).toHaveURL(/\/auth/);
  });

  test('admin alerts protegido', async ({ page }) => {
    await page.goto('/admin/alerts');
    await page.waitForURL(/\/auth\?next=/);
    await expect(page).toHaveURL(/\/auth/);
  });
});
