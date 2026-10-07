import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';

// Componentes montados con fronteras de navegación/comerciales aisladas.
// fetch es una fixture controlada: no se consulta catálogo, tienda ni cuenta.
let browser: Browser;
let script: string;
const pageErrors = new WeakMap<Page, string[]>();
type RequestFixture = { signal: AbortSignal; resolve: (response: Response) => void; reject: (error: Error) => void };
type ScreenFixture = { requests: RequestFixture[]; unmount: () => void };

beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ProductComparisonBuilder } from './src/components/comparison/ProductComparisonBuilder';
      window.requests = [];
      window.fetch = (url, options) => new Promise((resolve, reject) => {
        window.requests.push({ url, signal: options?.signal, resolve, reject });
      });
      const root = createRoot(document.getElementById('root'));
      window.unmount = () => root.unmount();
      root.render(<ProductComparisonBuilder />);
    ` },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
    plugins: [{ name: 'comparison-fixture-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /^(next\/link|@\/components\/commercial\/(AdvisoryCta|OfferReportLink))$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: process.cwd(), contents:
        args.path === 'next/link' ? 'export default function Link({ children, href }) { return <a href={href}>{children}</a>; }'
          : args.path.endsWith('AdvisoryCta') ? 'export const AdvisoryCta = () => null;'
            : 'export const OfferReportLink = () => null;',
      }));
    } }],
  });
  script = result.outputFiles[0].text;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);
afterAll(async () => { await browser?.close(); });

async function open(width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(2000);
  await page.route('**/*', route => route.abort());
  await page.route('http://comparison.fixture/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://comparison.fixture/comparativa/comparar');
  await page.addScriptTag({ content: script });
  await expect.poll(() => page.getByLabel('Buscar producto A').count()).toBe(1);
  return page;
}
async function close(page: Page) {
  try { expect(pageErrors.get(page)).toEqual([]); }
  finally { await page.close(); }
}
async function search(page: Page, side: 'A' | 'B', query: string) {
  await page.getByLabel(`Buscar producto ${side}`).fill(query);
  await page.getByLabel(`Buscar producto ${side}`).press('Enter');
}
function product(id: string, name: string) {
  return { id, name, category: 'procesadores', brand: 'AMD', model: name, specs: { socket: 'AM4' }, lowestPrice: 100_000,
    prices: [{ storeId: 'fixture', storeName: 'Tienda fixture', url: 'https://fixture.invalid/5600', price: 100_000,
      stock: 'unknown', lastUpdated: null }] };
}
async function settle(page: Page, index: number, kind: string, products: unknown[] = []) {
  await page.evaluate(({ index, kind, products }) => {
    const request = (window as unknown as ScreenFixture).requests[index];
    if (kind === 'network') request.reject(new TypeError('fixture network unavailable'));
    else request.resolve(new Response(kind === 'json' ? '{invalid' : JSON.stringify(kind === 'shape' ? {} : { products }), {
      status: kind === 'http' ? 503 : 200, headers: { 'Content-Type': 'application/json' },
    }));
  }, { index, kind, products });
}
async function requestCount(page: Page) {
  return page.evaluate(() => (window as unknown as ScreenFixture).requests.length);
}

const valid = product('candidate', 'AMD Ryzen 5 5600');
const malformedRows: Array<[string, unknown[]]> = [
  ['missing prices', [{ id: 'x', name: 'AMD Ryzen 5 5600', category: 'procesadores' }]],
  ['null prices', [{ ...valid, prices: null }]],
  ['wrong prices type', [{ ...valid, prices: {} }]],
  ['wrong lowest price type', [{ ...valid, lowestPrice: '100000' }]],
  ['wrong specification type', [{ ...valid, specs: { socket: {} } }]],
  ['null offer', [{ ...valid, prices: [null] }]],
  ['wrong offer price type', [{ ...valid, prices: [{ ...valid.prices[0], price: '100000' }] }]],
  ['wrong store ID type', [{ ...valid, prices: [{ ...valid.prices[0], storeId: 12 }] }]],
  ['wrong observation type', [{ ...valid, prices: [{ ...valid.prices[0], lastUpdated: {} }] }]],
  ['invalid sixth row', [...Array.from({ length: 5 }, (_, i) => product(`valid-${i}`, `AMD Ryzen 5 5600 ${i}`)), { ...valid, prices: null }]],
  ['invalid unrelated category row', [{ ...valid, category: 'tarjetas-graficas', prices: null }]],
];
const failures: Array<[string, string, unknown[]]> = [
  ...['http', 'network', 'json', 'shape'].map(kind => [kind, kind, []] as [string, string, unknown[]]),
  ...malformedRows.map(([name, rows]) => [name, 'success', rows] as [string, string, unknown[]]),
];

for (const width of [1440, 390]) describe(`comparison search states ${width}px`, () => {
  it('distinguishes idle, loading and successful empty results without claiming stock', async () => {
    const page = await open(width);
    try {
      expect(await page.getByText('Escribí un modelo', { exact: false }).count()).toBe(2);
      await search(page, 'A', 'unknown model');
      await expect.poll(() => page.getByRole('status').textContent()).toBe('Buscando productos…');
      await settle(page, 0, 'success');
      await expect.poll(() => page.getByRole('status').textContent()).toContain('No encontramos coincidencias');
      expect(await page.getByRole('status').textContent()).toContain('Esto no confirma que esté agotado');
      expect(await page.getByRole('alert').count()).toBe(0);
    } finally { await close(page); }
  });

  it.each(failures)('recovers from %s while retaining query and the selected opposite side', async (_name, kind, rows) => {
    const page = await open(width);
    try {
      await search(page, 'B', 'Ryzen 5700X');
      await settle(page, 0, 'success', [product('b', 'AMD Ryzen 7 5700X')]);
      await page.getByRole('button', { name: 'AMD Ryzen 7 5700X', exact: false }).click();
      await search(page, 'A', 'Ryzen 5600');
      await settle(page, 1, kind, rows);
      await expect.poll(() => page.getByRole('alert').textContent()).toContain('No pudimos consultar el catálogo');
      expect(await page.getByLabel('Buscar producto A').inputValue()).toBe('Ryzen 5600');
      expect(await page.getByRole('button', { name: 'Cambiar producto B' }).count()).toBe(1);
      expect(await page.getByText('No encontramos coincidencias', { exact: false }).count()).toBe(0);
      expect(await page.getByRole('button', { name: 'AMD Ryzen 5 5600', exact: false }).count()).toBe(0);
      await page.getByRole('button', { name: 'Reintentar búsqueda' }).click();
      await expect.poll(() => requestCount(page)).toBe(3);
      await settle(page, 2, 'success', [product('a', 'AMD Ryzen 5 5600')]);
      await expect.poll(() => page.getByRole('alert').count()).toBe(0);
      await page.getByRole('button', { name: 'AMD Ryzen 5 5600', exact: false }).click();
      await expect.poll(() => page.getByRole('button', { name: 'Cambiar producto A' }).count()).toBe(1);
      await expect.poll(() => page.getByRole('table').count()).toBe(1);
      expect(await page.getByRole('button', { name: 'Cambiar producto B' }).count()).toBe(1);
    } finally { await close(page); }
  });

  it('ignores failure of a cancelled query and category without showing an error', async () => {
    const page = await open(width);
    try {
      await search(page, 'A', 'old query');
      await page.getByLabel('Buscar producto A').fill('new query');
      expect(await page.evaluate(() => (window as unknown as ScreenFixture).requests[0].signal.aborted)).toBe(true);
      await settle(page, 0, 'http');
      expect(await page.getByRole('alert').count()).toBe(0);
      await page.getByLabel('Buscar producto A').press('Enter');
      await page.getByLabel('TIPO DE COMPONENTE').selectOption('tarjetas-graficas');
      expect(await page.evaluate(() => (window as unknown as ScreenFixture).requests[1].signal.aborted)).toBe(true);
      await settle(page, 1, 'network');
      await expect.poll(() => page.getByText('Escribí un modelo', { exact: false }).count()).toBe(2);
      expect(await page.getByRole('alert').count()).toBe(0);
    } finally { await close(page); }
  });
});
