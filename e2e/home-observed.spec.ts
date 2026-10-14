import { expect, test, browserNow } from './fixtures/deterministic.fixture';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Product } from '../src/lib/types';

const current: Product = {
  id: 'fixture-ryzen', name: 'AMD Ryzen 5 5600', brand: 'AMD', model: 'Ryzen 5 5600', category: 'procesadores', specs: {},
  prices: [{ storeId: 'fixture', storeName: 'Tienda de prueba', url: 'https://store.example/amd-ryzen-5-5600',
    price: 123456, stock: 'in-stock', installment: null, lastUpdated: new Date('2026-09-21T12:00:00Z') }],
  lowestPrice: 123456, highestPrice: 123456, averagePrice: 123456, createdAt: browserNow, updatedAt: browserNow,
};
const snapshot = {
  collectedAt: browserNow.toISOString(), priceDropProducts: [], priceDropFallbackUsed: true,
  latestOfferProducts: [current,
    { ...current, id: 'expired', name: 'AMD Ryzen 7 5700X', prices: current.prices.map(p => ({ ...p, lastUpdated: '2026-09-20T12:00:00Z' })) },
    { ...current, id: 'unknown', name: 'AMD Ryzen 5 5500', prices: current.prices.map(p => ({ ...p, stock: 'unknown' })) },
    { ...current, id: 'bad-category', name: 'Memoria Micro SD 256 Gb Sandisk Extreme con adaptador', category: 'procesadores' },
  ],
};

// El borde publica el documento generado; next start por defecto usa la portada SSR.
// Probar el mismo HTML y CSP del artefacto, con una respuesta API controlada.
test.beforeEach(async ({ page, baseURL }) => {
  const document = JSON.parse(readFileSync('public/__public-documents/home.json', 'utf8'));
  const nonce = randomBytes(16).toString('hex');
  await page.route(baseURL + '/', route => route.fulfill({ status: 200,
    headers: Object.fromEntries(Object.entries(document.headers).map(([key, value]) => [key, String(value).replaceAll('COMPARADOR_DOCUMENT_NONCE', nonce)])),
    body: document.html.replaceAll('COMPARADOR_DOCUMENT_NONCE', nonce) }));
});

for (const width of [1440, 390]) test(`portada conserva ofertas válidas y guía vigente a ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(browserNow);
  await page.route('**/api/home/observed-sections', route => route.fulfill({ json: snapshot }));
  await page.goto('/');
  const latest = page.getByRole('region', { name: 'Últimas ofertas' });
  await expect(latest.getByText(current.name, { exact: true })).toBeVisible();
  await expect(latest).toContainText('123.456');
  await expect(latest).not.toContainText('Ryzen 7 5700X');
  await expect(latest).not.toContainText('Ryzen 5 5500');
  await expect(latest).not.toContainText('Micro SD');
  await expect(page.getByText('BAJARON DE PRECIO', { exact: true })).toHaveCount(0);
  const guide = page.locator('a[href="/guia/pc-gamer-2-millones"]');
  await expect(guide).toContainText('5700');
  await expect(guide).toContainText('16GB');
  await expect(guide).not.toContainText('AM5');
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1] + 5);
  await page.getByRole('button', { name: 'Rechazar analítica', exact: true }).click();
  await latest.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`home-${width}.png`) });
});

test('503 de portada comunica el fallo y conserva acceso al catálogo', async ({ page }) => {
  await page.clock.setFixedTime(browserNow);
  await page.route('**/api/home/observed-sections', route => route.fulfill({ status: 503, json: { error: 'No disponible', reason: 'selection-unavailable' } }));
  await page.goto('/');
  const latest = page.getByRole('region', { name: 'Últimas ofertas' });
  await expect(latest).toContainText('No pudimos cargar una selección reciente');
  await expect(latest.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/search?sortBy=newest');
  await expect(latest).not.toContainText('123.456');
});
