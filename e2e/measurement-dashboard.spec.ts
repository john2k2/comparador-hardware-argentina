import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
const base = 'http://127.0.0.1:3132';
const fixture = 'http://127.0.0.1:3133';
const proof = 'tmp/measurement-e2e-proof';

test.beforeEach(async ({ context, request }) => {
  await request.post(`${fixture}/__fixture/reset`);
  await context.addCookies([{ name: 'sb-access-token', value: 'fixture-admin', domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  // La navegación existente sincroniza la sesión del navegador con la cookie del servidor.
  // Sembrar ambas partes de una sesión de prueba; no modificar ni evitar el guard del producto.
  await context.addInitScript(() => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'fixture-admin', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: { is_admin: true }, user_metadata: {} } }));
  });
});

test('sin sesión, con sesión común o rol inventado no se entregan datos privados', async ({ playwright }) => {
  for (const token of [undefined, 'fixture-member', 'fixture-forged', 'invalid-token']) {
    const context = await playwright.request.newContext({ baseURL: base, extraHTTPHeaders: token ? { Cookie: `sb-access-token=${token}` } : {} });
    const response = await context.get('/api/admin/measurement');
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain('audit');
    const html = await context.get('/admin/seguimiento', { maxRedirects: 0 });
    expect([303, 307, 308]).toContain(html.status());
    expect(await html.text()).not.toContain('Tu proyecto, en claro');
    await context.dispose();
  }
});

test('el inicio de sesión normal permite entrar sin sembrar cookies ni abrir la política de seguridad', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  await page.goto('/auth?next=%2Fadmin%2Fseguimiento');
  await page.getByLabel(/^email$/i).fill('fixture@example.invalid');
  await page.getByLabel(/^password$/i).fill('solo-prueba-local');
  await page.getByRole('button', { name: 'INGRESAR', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu proyecto, en claro.' })).toBeVisible();
  await page.getByRole('button', { name: 'Mi seguimiento', exact: true }).click();
  await page.getByRole('combobox', { name: 'Mi estado' }).first().selectOption('in_progress');
  await expect(page.getByText(/Decisión guardada/)).toBeVisible();
  await context.close();
});

test('el resumen usa lecturas fechadas y explica los límites sin errores del navegador', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/admin/seguimiento');
  await expect(page.getByRole('heading', { name: 'Tu proyecto, en claro.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Indicadores principales' }).getByText('12', { exact: true })).toBeVisible();
  await expect(page.getByText('19%', { exact: true })).toBeVisible();
  await expect(page.getByText('Esto no confirma una falla actual ni su reparación.', { exact: true })).toBeVisible();
  const response = await page.request.get('/api/admin/measurement', { headers: { Authorization: 'Bearer fixture-admin' } });
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.readings.find((reading: { provider: string }) => reading.provider === 'ga4').origin).toBe('audit');
  expect(JSON.stringify(data)).not.toMatch(/fixture-private|fixture-access-only|sb_secret/);
  expect(errors).toEqual([]);
});

test('actualizar guarda consultas, indica las fuentes sin autorización y permite revisar conexiones', async ({ page }) => {
  await page.goto('/admin/seguimiento');
  await page.getByRole('button', { name: 'Actualizar lecturas', exact: true }).click();
  await expect(page.getByText(/6 lecturas actualizadas y guardadas/)).toBeVisible();
  await expect(page.getByText('52', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conexiones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Google Analytics', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar conexión' }).fill('AdSense');
  await expect(page.getByRole('heading', { name: 'Google AdSense', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Google Analytics', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('52', { exact: true })).toBeVisible();
});

test('una decisión persiste y un error de guardado no finge éxito', async ({ page, request }) => {
  await page.goto('/admin/seguimiento');
  await page.getByRole('button', { name: 'Mi seguimiento', exact: true }).click();
  await page.getByRole('combobox', { name: 'Mi estado' }).nth(1).selectOption('in_progress');
  await expect(page.getByText(/Decisión guardada/)).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Mi seguimiento', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Mi estado' }).nth(1)).toHaveValue('in_progress');
  await request.post(`${fixture}/__fixture/fail-write?on=1`);
  await page.getByRole('combobox', { name: 'Mi estado' }).nth(1).selectOption('done');
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo guardar' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Mi estado' }).nth(1)).toHaveValue('in_progress');
});

test('escritura desde otro origen y carga de secretos se rechazan aunque la sesión sea admin', async ({ page }) => {
  const rejected = await page.request.post('/api/admin/measurement', { headers: { Origin: 'https://other.example' }, data: { action: 'decision', id: 'catalog', status: 'done' } });
  expect(rejected.status()).toBe(403);
  const secret = await page.request.post('/api/admin/measurement', { headers: { Origin: base }, data: { action: 'import', reading: { provider: 'ga4', apiKey: 'never-save' } } });
  expect(secret.status()).toBe(400);
});

test('configurar acceso guarda una autorización cifrada y verifica una lectura sin devolver la clave', async ({ page }) => {
  await page.goto('/admin/seguimiento');
  await page.getByRole('button', { name: 'Conexiones', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar conexión' }).fill('Cloudflare');
  await page.getByRole('button', { name: 'Configurar acceso', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await modal.getByLabel('Identificador de cuenta', { exact: true }).fill('a'.repeat(32));
  const token = modal.getByLabel('Token de lectura', { exact: true });
  await expect(token).toHaveAttribute('type', 'password');
  await token.fill('synthetic-token-only-for-test');
  await modal.getByRole('button', { name: 'Guardar y verificar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Cloudflare', exact: true }) }).getByText('Lectura verificada', { exact: false })).toBeVisible();
  const response = await page.request.get('/api/admin/measurement');
  expect(JSON.stringify(await response.json())).not.toMatch(/synthetic-token-only-for-test|encrypted|refreshToken/);
  await page.getByRole('button', { name: 'Configurar acceso', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Token de lectura', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
});

test('Google prepara una autorización real con PKCE y permisos de lectura, sin divulgar secretos', async ({ page }) => {
  const response = await page.request.post('/api/admin/measurement/google/start', { headers: { Origin: base }, data: { provider: 'ga4' } });
  expect(response.status()).toBe(200);
  const data = await response.json();
  const authorization = new URL(data.url);
  expect(authorization.origin).toBe('https://accounts.google.com');
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorization.searchParams.get('scope')).toContain('adsense.readonly');
  expect(authorization.searchParams.get('scope')).not.toContain('/auth/adwords');
  expect(JSON.stringify(data)).not.toMatch(/fixture-private|fixture-access|refresh_token|client_secret|code_verifier/);
  const denied = await page.request.post('/api/admin/measurement/google/start', { headers: { Origin: 'https://other.example' }, data: { provider: 'ga4' } });
  expect(denied.status()).toBe(403);
});

test('escritorio y móvil: claro, oscuro, teclado, movimiento reducido y sin desbordamiento del panel', async ({ page }) => {
  await fs.mkdir(proof, { recursive: true });
  await page.goto('/admin/seguimiento');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => document.fonts.ready);
  for (const [name, width, height, dark] of [['desktop-light', 1440, 1100, false], ['desktop-dark', 1440, 1100, true], ['mobile-light', 390, 844, false], ['mobile-dark', 390, 844, true]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), dark);
    await page.screenshot({ path: `${proof}/${name}.png`, fullPage: true, animations: 'disabled' });
    if (name === 'desktop-light') await page.screenshot({ path: `${proof}/overview-desktop.png`, animations: 'disabled' });
    await expect(page.getByRole('heading', { name: 'Comprobá las fallas antes de buscar más visitas.', exact: true })).toHaveCSS('font-family', 'Arial, Helvetica, sans-serif');
    const overflow = await page.getByRole('navigation', { name: 'Vistas del seguimiento' }).evaluate((nav) => { const root = nav.parentElement!; return root.scrollWidth > root.clientWidth + 1; });
    expect(overflow, name).toBe(false);
  }
  await page.getByRole('button', { name: 'Conexiones', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Tus fuentes de datos, en un lugar.' })).toBeVisible();
  await page.getByRole('button', { name: 'Entender los datos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lo necesario para tomar una decisión.' })).toBeVisible();
});
