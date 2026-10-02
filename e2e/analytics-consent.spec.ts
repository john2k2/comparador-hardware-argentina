import { expect, test, installSearchCatalog, searchFromIdle } from './fixtures/deterministic.fixture';
import type { Page } from '@playwright/test';
import { ANALYTICS_CONSENT_KEY, ANALYTICS_CONSENT_MAX_AGE_MS } from '../src/lib/analytics/consent';

const gtagScriptPattern = /https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-[A-Z0-9]+$/;

function collectGtagRequests(page: Page) {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (gtagScriptPattern.test(request.url())) requests.push(request.url());
  });
  return requests;
}

async function readConsentCommands(page: Page) {
  return page.evaluate(() => {
    const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
    return dataLayer.map((entry) => {
      const values = Array.from(entry as ArrayLike<unknown>);
      const [command, phase, options] = values;
      if (command !== 'consent' || typeof options !== 'object' || options === null) return null;
      const consent = options as Record<string, unknown>;
      return {
        phase,
        analyticsStorage: consent.analytics_storage,
        adStorage: consent.ad_storage,
        adUserData: consent.ad_user_data,
        adPersonalization: consent.ad_personalization,
      };
    }).filter((entry): entry is {
      phase: unknown;
      analyticsStorage: unknown;
      adStorage: unknown;
      adUserData: unknown;
      adPersonalization: unknown;
    } => entry !== null);
  });
}

async function analyticsEvents(page: Page, name: string) {
  return page.evaluate((eventName) => (window.dataLayer ?? []).map(entry => Array.from(entry as ArrayLike<unknown>))
    .filter(entry => entry[0] === 'event' && entry[1] === eventName), name);
}

test.describe('Consentimiento de analítica', () => {
  test('una entrada directa en búsqueda espera consentimiento y emite un solo search', async ({ page }) => {
    await installSearchCatalog(page);
    await page.route(gtagScriptPattern, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.goto('/search?q=Ryzen');
    await expect(page.getByPlaceholder('NUEVA BUSQUEDA...')).toHaveValue('Ryzen');
    expect(await analyticsEvents(page, 'search')).toHaveLength(0);
    await page.getByRole('button', { name: 'Aceptar analítica' }).click();
    await expect.poll(() => analyticsEvents(page, 'search')).toHaveLength(1);
    await page.evaluate(() => window.dispatchEvent(new Event('cha-analytics-ready')));
    expect(await analyticsEvents(page, 'search')).toHaveLength(1);
  });

  test('una ficha emite view_item tras aceptar y no lo duplica al volver a abrir privacidad', async ({ page }) => {
    await page.route(gtagScriptPattern, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.goto('/product/fixture-ryzen-5600');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ryzen 5 5600');
    expect(await analyticsEvents(page, 'view_item')).toHaveLength(0);
    await page.getByRole('button', { name: 'Aceptar analítica' }).click();
    await expect.poll(() => analyticsEvents(page, 'view_item')).toHaveLength(1);
    await page.getByRole('contentinfo').getByRole('button', { name: 'Preferencias de privacidad' }).click();
    await page.getByRole('button', { name: 'Aceptar analítica' }).click();
    expect(await analyticsEvents(page, 'view_item')).toHaveLength(1);
    await page.reload();
    await expect.poll(() => analyticsEvents(page, 'view_item')).toHaveLength(1);
  });

  test('una respuesta de búsqueda fallida no se registra como búsqueda resuelta', async ({ page }) => {
    await installSearchCatalog(page);
    await page.route(gtagScriptPattern, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.route('**/api/search**', route => route.fulfill({ status: 503, json: { error: 'fixture-unavailable' } }));
    await page.goto('/search');
    await page.getByRole('button', { name: 'Aceptar analítica' }).click();
    await searchFromIdle(page);
    await expect(page.getByRole('alert').filter({ hasText: '[ ERROR EN LA BUSQUEDA ]' })).toBeVisible();
    expect(await analyticsEvents(page, 'search')).toHaveLength(0);
  });
  test('inicio sin elección no solicita Google Analytics y rechazar persiste tras recargar', async ({ page }) => {
    const gtagRequests = collectGtagRequests(page);

    await page.goto('/');
    await expect(page.getByRole('complementary', { name: 'Preferencias de privacidad' })).toBeVisible();
    expect(gtagRequests).toHaveLength(0);
    await expect.poll(() => page.evaluate(() => window.__chaAnalyticsAllowed)).toBe(false);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ANALYTICS_CONSENT_KEY)).toBeNull();
    await expect.poll(() => readConsentCommands(page)).toContainEqual({
      phase: 'default',
      analyticsStorage: 'denied',
      adStorage: 'denied',
      adUserData: 'denied',
      adPersonalization: 'denied',
    });

    await page.getByRole('button', { name: 'Rechazar analítica' }).click();
    await expect(page.getByRole('status')).toContainText('Preferencia guardada');
    await expect.poll(() => page.evaluate(() => window.__chaAnalyticsAllowed)).toBe(false);
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), ANALYTICS_CONSENT_KEY)).toMatchObject({ allowed: false });
    expect(gtagRequests).toHaveLength(0);

    await page.reload();

    await expect(page.getByRole('complementary', { name: 'Preferencias de privacidad' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__chaAnalyticsAllowed)).toBe(false);
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), ANALYTICS_CONSENT_KEY)).toMatchObject({ allowed: false });
    expect(gtagRequests).toHaveLength(0);
  });

  test('aceptar solicita exactamente un gtag.js con nonce y mantiene publicidad denegada', async ({ page }) => {
    const gtagRequests = collectGtagRequests(page);
    await page.route(gtagScriptPattern, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.goto('/');
    expect(gtagRequests).toHaveLength(0);

    await page.getByRole('button', { name: 'Aceptar analítica' }).click();
    await expect.poll(() => gtagRequests.length).toBe(1);

    await expect.poll(() => page.evaluate(() => window.__chaAnalyticsAllowed)).toBe(true);
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), ANALYTICS_CONSENT_KEY)).toMatchObject({ allowed: true });
    const gtagScript = page.locator('script[src*="www.googletagmanager.com/gtag/js"]');
    await expect(gtagScript).toHaveCount(1);
    await expect.poll(() => gtagScript.evaluate((script) => (script as HTMLScriptElement).nonce)).toMatch(/.+/);

    await expect.poll(() => readConsentCommands(page)).toContainEqual({
      phase: 'default',
      analyticsStorage: 'denied',
      adStorage: 'denied',
      adUserData: 'denied',
      adPersonalization: 'denied',
    });
    await expect.poll(() => readConsentCommands(page)).toContainEqual({
      phase: 'update',
      analyticsStorage: 'granted',
      adStorage: 'denied',
      adUserData: 'denied',
      adPersonalization: 'denied',
    });
    expect(gtagRequests).toHaveLength(1);
  });

  test('revocar desde el footer elimina cookies y recarga sin volver a solicitar gtag.js', async ({ page }) => {
    const gtagRequests = collectGtagRequests(page);
    await page.route(gtagScriptPattern, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await page.goto('/');
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ allowed: true, savedAt: Date.now() }));
    }, ANALYTICS_CONSENT_KEY);
    await page.context().addCookies([{ name: '_ga', value: 'GA1.1.fixture', domain: '127.0.0.1', path: '/' }]);
    await page.reload();
    await expect.poll(() => gtagRequests.length).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__chaAnalyticsAllowed)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.cookie.split(';').some((cookie) => /^\s*_ga(?:_|=)/.test(cookie)))).toBe(true);

    await page.getByRole('contentinfo').getByRole('button', { name: 'Preferencias de privacidad' }).click();
    await expect(page.getByRole('complementary', { name: 'Preferencias de privacidad' })).toBeVisible();
    await page.getByRole('button', { name: 'Rechazar analítica' }).click();
    await page.waitForLoadState('domcontentloaded');

    await expect.poll(() => page.evaluate(() => window.__chaAnalyticsAllowed)).toBe(false);
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), ANALYTICS_CONSENT_KEY)).toMatchObject({ allowed: false });
    await expect.poll(() => page.evaluate(() => document.cookie.split(';').some((cookie) => /^\s*_ga(?:_|=)/.test(cookie)))).toBe(false);
    expect(gtagRequests).toHaveLength(1);
  });

  test('elecciones vencidas o futuras vuelven a pedir consentimiento sin solicitar gtag.js', async ({ page }) => {
    const gtagRequests = collectGtagRequests(page);
    const scenarios = [
      { label: 'vencida', savedAt: Date.now() - ANALYTICS_CONSENT_MAX_AGE_MS - 1 },
      { label: 'futura', savedAt: Date.now() + 60_000 },
    ];

    for (const scenario of scenarios) {
      await page.goto('/');
      await page.evaluate(({ key, savedAt }) => {
        localStorage.setItem(key, JSON.stringify({ allowed: true, savedAt }));
      }, { key: ANALYTICS_CONSENT_KEY, savedAt: scenario.savedAt });
      await page.reload();

      await expect(page.getByRole('complementary', { name: 'Preferencias de privacidad' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Aceptar analítica' })).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.__chaAnalyticsAllowed)).toBe(false);
      expect(gtagRequests, scenario.label).toHaveLength(0);
    }
  });
});
