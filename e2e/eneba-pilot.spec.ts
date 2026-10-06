import { expect, test } from './fixtures/deterministic.fixture';
import { ENEBA_REVIEWED_GAMES, ENEBA_PRICE_MAX_AGE_MS, type EnebaSnapshot } from '../src/lib/eneba/pilot';

// Datos sintéticos: verifican comportamiento, no disponibilidad comercial.
const now = new Date('2026-10-02T18:00:00.000Z');
const snapshot: EnebaSnapshot = {
  status: 'ready', fetchedAt: now.toISOString(), feedUpdatedAt: now.toISOString(),
  offers: ENEBA_REVIEWED_GAMES.map((game, index) => ({ ...game, price: 1000 + index, currency: 'ARS',
    observedAt: now.toISOString(), url: `https://www.eneba.com/latam/${game.id}?af_id=Comparador_Hardware_Argentina&currency=ARS` })),
};

for (const viewport of [{ width: 1440, height: 1000 }, { width: 360, height: 800 }, { width: 390, height: 844 }]) {
  test.describe(`Eneba ${viewport.width}px`, () => {
    test.use({ viewport });
    test('el acceso de portada es visible, identificado y no descarga precios por una visita', async ({ page }) => {
      let reads = 0;
      await page.route('**/api/juegos-digitales', (route) => { reads += 1; return route.fulfill({ json: snapshot }); });
      await page.goto('/');
      const promotion = page.getByRole('complementary', { name: 'Juegos para PC en Eneba' });
      await expect(promotion).toBeVisible();
      await expect(promotion).toContainText('Enlaces afiliados');
      await expect(promotion).toContainText('Podemos recibir una comisión');
      const link = promotion.getByRole('link', { name: 'Ver juegos y condiciones →' });
      await expect(link).toHaveAttribute('href', '/juegos-digitales');
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      expect(reads).toBe(0);
      await link.click();
      await expect(page).toHaveURL(/\/juegos-digitales$/);
    });
    test('separa juegos, informa precio y restricciones y conserva el enlace profundo', async ({ page }) => {
      await page.clock.install({ time: now });
      let reads = 0;
      await page.route('**/api/juegos-digitales', (route) => { reads += 1; return route.fulfill({ json: snapshot }); });
      await page.goto('/juegos-digitales');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Juegos digitales para Argentina');
      await expect(page.getByLabel('Aviso de afiliación')).toContainText('puede recibir una comisión');
      await expect(page.locator('article')).toHaveCount(2);
      for (const game of snapshot.offers) {
        const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: game.name, exact: true }) });
        await expect(card).toContainText('ARS');
        await expect(card).toContainText(game.platform);
        await expect(card).toContainText(game.edition);
        await expect(card).toContainText('Feed actualizado:');
        await expect(card).toContainText('Activación en Argentina revisada');
        const link = card.getByRole('link', { name: `Ver ${game.name} en Eneba ↗`, exact: true });
        await expect(link).toHaveAttribute('href', game.url);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', /sponsored.*noopener/);
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      expect(reads).toBe(1);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
      if (viewport.width === 360) await page.screenshot({ path: 'tmp/eneba/mobile-fixture.png', fullPage: true });
      if (viewport.width === 1440) await page.screenshot({ path: 'tmp/eneba/desktop-fixture.png', fullPage: true });
    });
  });
}

test('un precio que vence con la pestaña abierta desaparece sin volver a consultar el feed', async ({ page }) => {
  await page.clock.install({ time: now });
  let reads = 0;
  await page.route('**/api/juegos-digitales', (route) => { reads += 1; return route.fulfill({ json: snapshot }); });
  await page.goto('/juegos-digitales');
  await expect(page.locator('article')).toHaveCount(2);
  await page.clock.fastForward(ENEBA_PRICE_MAX_AGE_MS + 30_000);
  await expect(page.locator('article')).toHaveCount(0);
  await expect(page.getByText('Precios sin verificar', { exact: true })).toBeVisible();
  expect(reads).toBe(1);
});

test('mide el bloque sólo cuando entra en pantalla y separa el clic interno de las salidas', async ({ page }) => {
  await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  const promotion = page.getByRole('complementary', { name: 'Juegos para PC en Eneba' });
  const events = () => page.evaluate(() => (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((entry) => entry[0] === 'event' && String(entry[1]).startsWith('affiliate_')));
  await promotion.scrollIntoViewIfNeeded();
  expect(await events()).toEqual([]);
  await page.getByRole('button', { name: 'Rechazar analítica', exact: true }).click();
  expect(await events()).toEqual([]);
  await page.getByRole('contentinfo').getByRole('button', { name: 'Preferencias de privacidad' }).click();
  await page.getByRole('button', { name: 'Aceptar analítica', exact: true }).click();
  expect(await events()).toEqual([]);
  await promotion.scrollIntoViewIfNeeded();
  await expect.poll(events).toHaveLength(1);
  await page.evaluate(() => window.dispatchEvent(new Event('cha-analytics-ready')));
  expect(await events()).toEqual([['event', 'affiliate_promo_view', expect.objectContaining({ affiliate_surface: 'home' })]]);
  await promotion.getByRole('link').click({ modifiers: ['ControlOrMeta'] });
  await expect.poll(events).toHaveLength(2);
  expect((await events())[1]).toEqual(['event', 'affiliate_promo_click', expect.objectContaining({ cta_id: 'home-eneba-games' })]);
});

for (const scenario of ['feed-error', 'old', 'network', 'malformed', 'invalid-offer', 'empty']) {
  test(`muestra un estado honesto ante ${scenario}`, async ({ page }) => {
    await page.clock.setFixedTime(now);
    await page.route('**/api/juegos-digitales', (route) => {
      if (scenario === 'network') return route.abort();
      if (scenario === 'malformed') return route.fulfill({ body: 'not json', contentType: 'application/json' });
      if (scenario === 'invalid-offer') return route.fulfill({ json: { ...snapshot, offers: [null, { ...snapshot.offers[0], sku: 'incorrect' }] } });
      const data = scenario === 'old' ? { ...snapshot, offers: snapshot.offers.map((offer) => ({ ...offer, observedAt: '2026-10-01T12:00:00Z' })) }
        : { status: scenario === 'empty' ? 'empty' : 'error', offers: [], fetchedAt: null, feedUpdatedAt: null };
      return route.fulfill({ json: data });
    });
    await page.goto('/juegos-digitales');
    await expect(page.getByText('Precios sin verificar', { exact: true })).toBeVisible();
    await expect(page.locator('article')).toHaveCount(0);
    await expect(page.getByText('Esto no significa que los juegos estén agotados.', { exact: false })).toBeVisible();
  });
}

test('el enlace abre la ficha y emite un único clic propio sin ventas', async ({ page, context }) => {
  await page.clock.setFixedTime(now);
  await page.route('**/api/juegos-digitales', (route) => route.fulfill({ json: snapshot }));
  await page.goto('/juegos-digitales');
  await expect(page.locator('article')).toHaveCount(2);
  await page.evaluate(() => { window.__chaAnalyticsAllowed = true; window.dataLayer = []; window.gtag = (...args) => window.dataLayer.push(args); });
  // No se carga GA4 real ni se envían eventos de prueba a la propiedad del usuario.
  await context.route('https://www.eneba.com/**', (route) => route.fulfill({ body: '<h1>Destino simulado</h1>', contentType: 'text/html' }));
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: `Ver ${snapshot.offers[0].name} en Eneba ↗`, exact: true }).click();
  const popup = await opened;
  // El evento popup puede llegar antes de que la navegación deje about:blank.
  await expect(popup).toHaveURL(snapshot.offers[0].url);
  await popup.waitForLoadState('domcontentloaded');
  expect(await page.evaluate(() => window.dataLayer)).toEqual([['event', 'affiliate_outbound_click', expect.objectContaining({
    affiliate_product_id: snapshot.offers[0].id, affiliate_partner: 'eneba', affiliate_campaign: 'eneba_pc_ar_20261002',
  })]]);
  await popup.close();
});

test('rechazar permite abrir el juego sin analítica; aceptar registra una sola vista del piloto', async ({ page, context }) => {
  await page.clock.setFixedTime(now);
  await page.route('**/api/juegos-digitales', (route) => route.fulfill({ json: snapshot }));
  await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await context.route('https://www.eneba.com/**', (route) => route.fulfill({ body: '<h1>Destino simulado</h1>', contentType: 'text/html' }));
  await page.goto('/juegos-digitales');
  await expect(page.locator('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Rechazar analítica', exact: true }).click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: `Ver ${snapshot.offers[0].name} en Eneba ↗`, exact: true }).click();
  await (await opened).close();
  const events = () => page.evaluate(() => (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((entry) => entry[0] === 'event' && String(entry[1]).startsWith('affiliate_')));
  expect(await events()).toEqual([]);
  await page.getByRole('contentinfo').getByRole('button', { name: 'Preferencias de privacidad' }).click();
  await page.getByRole('button', { name: 'Aceptar analítica', exact: true }).click();
  await expect.poll(events).toHaveLength(1);
  await page.evaluate(() => window.dispatchEvent(new Event('cha-analytics-ready')));
  expect(await events()).toEqual([['event', 'affiliate_pilot_view', expect.objectContaining({ offer_count: 2, pilot_status: 'ready' })]]);
});
