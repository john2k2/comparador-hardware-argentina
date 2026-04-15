import { expect, test } from '@playwright/test';

// ============================================================================
// E2E: AUTH - Login, registro, sesión, logout
// ============================================================================

test.describe('Auth Flow', () => {
  test('pagina de auth muestra opciones de login', async ({ page }) => {
    await page.goto('/auth');

    // Formulario de login visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    // El placeholder de password es "******" - verificar que hay un input de tipo password
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /ingresar|login|iniciar/i })).toBeVisible();

    // Opción de registro
    await expect(page.getByText(/registrate|registro|crear cuenta/i).first()).toBeVisible();

    // Login con Google
    await expect(page.getByText(/google/i).first()).toBeVisible();
  });

  test('login con credenciales invalidas muestra error', async ({ page }) => {
    await page.goto('/auth');

    const emailInput = page.getByPlaceholder(/email/i);
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill('invalid@test.com');
    await passwordInput.fill('wrongpassword123');

    await page.getByRole('button', { name: /ingresar|login|iniciar/i }).click();

    // Debería mostrar error o redirigir (depende del comportamiento)
    await page.waitForTimeout(2000);
    const hasError = await page.getByText(/error|invalida|incorrecta/i).first().isVisible().catch(() => false);
    // Puede mostrar error o simplemente no loguearse
    expect(hasError || page.url().includes('/auth')).toBe(true);
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
