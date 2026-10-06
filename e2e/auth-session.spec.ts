import { expect, test } from './fixtures/deterministic.fixture';

// Transporte Auth controlado: acredita integración de UI/sesión, no OAuth real.
test.use({ bypassCSP: true });
const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated',
  email: 'qa-session@example.invalid', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Usuario de prueba' }, created_at: '2026-09-01T00:00:00Z' };
const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'qa-only'].join('.');

test('inicia, recupera tras recarga y cierra la sesión sin volver a pedir contraseña', async ({ page, context }) => {
  let logins = 0;
  let logouts = 0;
  const sync: string[] = [];
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      logins++;
      expect(route.request().postDataJSON()).toMatchObject({ email: user.email, password: 'qa-password' });
      await route.fulfill({ json: { access_token: token, refresh_token: 'qa-refresh', token_type: 'bearer', expires_in: 3600, user } });
    } else if (path.endsWith('/user')) await route.fulfill({ json: user });
    else if (path.endsWith('/logout')) { logouts++; await route.fulfill({ status: 204 }); }
    else throw new Error(`Transporte Auth inesperado: ${path}`);
  });
  await page.route('**/api/auth/session', async route => {
    sync.push(route.request().method());
    await route.continue();
  });
  await page.goto('/auth?next=%2Fauth');
  await page.getByRole('textbox', { name: 'EMAIL' }).fill(user.email);
  await page.getByLabel('PASSWORD').fill('qa-password');
  await page.getByRole('button', { name: 'INGRESAR', exact: true }).click();
  await expect(page.getByText('[ Cuenta activa ]', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bienvenido, Usuario de prueba' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('[ Cuenta activa ]', { exact: true })).toBeVisible();
  expect(logins).toBe(1);
  await expect.poll(() => sync.includes('POST')).toBe(true);
  await page.getByRole('button', { name: 'CERRAR SESION', exact: true }).click();
  // Comprobar el formulario tras salir, no el h1 de página que existe siempre.
  await expect(page.getByRole('heading', { name: 'Entrar o crear cuenta', level: 2, exact: true })).toBeVisible();
  await expect.poll(() => logouts).toBe(1);
  await expect.poll(() => sync.at(-1)).toBe('DELETE');
  await expect.poll(async () => (await context.cookies()).some(c => c.name === 'sb-access-token')).toBe(false);
  await page.reload();
  await expect(page.getByRole('button', { name: 'INGRESAR', exact: true })).toBeVisible();
  expect(logins).toBe(1);
});

test('registro pendiente de confirmación no concede una cuenta activa', async ({ page }) => {
  let signups = 0;
  await page.route('**/auth/v1/signup**', async route => {
    signups++;
    expect(route.request().postDataJSON().email).toBe(user.email);
    await route.fulfill({ json: { ...user, identities: [] } });
  });
  await page.goto('/auth');
  await page.getByRole('button', { name: 'CREAR CUENTA', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'EMAIL' }).fill(user.email);
  await page.getByLabel('PASSWORD').fill('qa-password');
  await page.locator('form').getByRole('button', { name: 'CREAR CUENTA', exact: true }).click();
  await expect(page.getByText('Cuenta creada. Revisa tu email para confirmar la cuenta.', { exact: true })).toBeVisible();
  await expect(page.getByText('[ Cuenta activa ]', { exact: true })).toHaveCount(0);
  expect(signups).toBe(1);
});

test('cookie de sesión es HttpOnly y Secure, se elimina y no autoriza admin con token falso', async ({ request }) => {
  const invalid = await request.post('/api/auth/session', { data: {} });
  expect(invalid.status()).toBe(400);
  const login = await request.post('/api/auth/session', { data: { accessToken: token, expiresAt: Math.floor(Date.now()/1000)+3600 } });
  expect(login.status()).toBe(200);
  const cookie = login.headers()['set-cookie'];
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Secure/i);
  expect(cookie).toMatch(/SameSite=lax/i);
  expect(cookie).toMatch(/Path=\//i);
  const admin = await request.get('/admin', { maxRedirects: 0 });
  expect(admin.status()).toBe(307);
  expect(admin.headers().location).toContain('/auth?next=');
  const logout = await request.delete('/api/auth/session');
  expect(logout.status()).toBe(200);
  expect(logout.headers()['set-cookie']).toMatch(/Max-Age=0/i);
});
