import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';

// Replay montado sin servidor, DB, tiendas ni refresh. Dos piezas sintéticas
// bastan para comprobar vencimientos distintos; no representan una PC completa.
let browser: Browser;
let script: string;
const start = new Date('2026-10-07T14:59:59Z');
type ScreenFixture = {
  requests: string[];
  unmount: () => void;
  exportText?: string;
  clockListeners: Record<string, Set<EventListener>>;
  clockTimers: Set<number>;
};

beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { PcBuilder } from './src/components/pc-builder/PcBuilder';
      const definitions = [
        { id: 'cpu', category: 'procesadores', name: 'AMD Ryzen 5 5600', price: 100000, date: '2026-10-07T12:00:00Z' },
        { id: 'ram', category: 'memoria-ram', name: 'Kingston Fury 16GB DDR4 3200', price: 50000, date: '2026-10-07T12:00:02Z' },
      ];
      const products = definitions.map(item => ({...item, brand:'Fixture', model:item.name, specs:{},
        createdAt:item.date, updatedAt:item.date, lowestPrice:item.price, highestPrice:item.price, averagePrice:item.price,
        prices:[{storeId:'fixture',storeName:'Fixture',price:item.price,stock:'in-stock',installment:null,
          url:'https://store.example/' + item.id,lastUpdated:item.date}],
      }));
      window.requests = [];
      window.fetch = async url => {
        window.requests.push(url);
        const slot = new URL(url, 'https://fixture.invalid').searchParams.get('slot');
        return new Response(JSON.stringify({products:products.filter(p => p.id === slot)}));
      };
      window.clockListeners = { focus:new Set(), pageshow:new Set(), visibilitychange:new Set() };
      for (const [target, events] of [[window,['focus','pageshow']],[document,['visibilitychange']]]) {
        const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
        target.addEventListener = (event, callback, options) => {
          if (events.includes(event)) window.clockListeners[event].add(callback);
          return add(event,callback,options);
        };
        target.removeEventListener = (event, callback, options) => {
          if (events.includes(event)) window.clockListeners[event].delete(callback);
          return remove(event,callback,options);
        };
      }
      window.clockTimers = new Set();
      const schedule = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => {
        const id = schedule(() => { window.clockTimers.delete(id); callback(...args); }, delay);
        if (delay > 0 && delay <= 3001) window.clockTimers.add(id);
        return id;
      };
      window.clearTimeout = id => { window.clockTimers.delete(id); clear(id); };
      URL.createObjectURL = blob => { blob.text().then(text => { window.exportText = text; }); return 'blob:fixture'; };
      URL.revokeObjectURL = () => {};
      document.addEventListener('click', event => { if (event.target.closest('a[download]')) event.preventDefault(); });
      const root = createRoot(document.getElementById('root'));
      window.unmount = () => root.unmount();
      root.render(<PcBuilder initialBudget={null} />);
    ` },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
    plugins: [{ name: 'builder-fixture-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /^(next\/link|@\/lib\/analytics\/ga4|@\/components\/commercial\/(AdvisoryCta|OfferReportLink)|@\/components\/product\/MotherboardMemorySupport|\.\/RefreshOffersButton)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: process.cwd(), contents:
        args.path === 'next/link' ? 'export default function Link({ children, href }) { return <a href={href}>{children}</a>; }'
          : args.path.endsWith('/ga4') ? 'export const trackBudgetBuilder = () => {}; export const trackPcBuilderAction = () => {}; export const trackStoreClick = () => {};'
            : `export const ${args.path.split('/').pop()} = () => null;`,
      }));
    } }],
  });
  script = result.outputFiles[0].text;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);
afterAll(async () => { await browser?.close(); });

async function open(width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  page.setDefaultTimeout(2000);
  await page.route('**/*', route => route.abort());
  await page.route('http://builder.fixture/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://builder.fixture/guia/armar');
  // Instalar antes del corte evita que el tiempo real entre las dos llamadas
  // convierta pauseAt(start) en un intento de retroceder el reloj.
  await page.clock.install({ time: new Date(start.getTime() - 60_000) });
  await page.clock.pauseAt(start);
  await page.addScriptTag({ content: script });
  await expect.poll(() => page.getByLabel('Elegir Procesador').isEnabled()).toBe(true);
  await page.getByLabel('Elegir Procesador').selectOption('cpu');
  await page.getByLabel('Elegir Memoria RAM').selectOption('ram');
  await expect.poll(() => page.getByTestId('build-total').textContent()).toContain('150.000');
  return page;
}
async function requestCount(page: Page) {
  return page.evaluate(() => (window as unknown as ScreenFixture).requests.length);
}

for (const width of [1440, 390]) describe(`builder offer clock ${width}px`, () => {
  it('expires at 3h +1ms without editing selections, preserves dates and exports pending prices', async () => {
    const page = await open(width);
    try {
      const dates = await page.getByText('Precio relevado:', { exact: false }).allTextContents();
      const reads = await requestCount(page);
      await page.clock.runFor(1000);
      expect(await page.getByTestId('build-total').textContent()).toContain('150.000');
      await page.clock.runFor(1);
      await expect.poll(() => page.getByTestId('build-total').textContent()).toContain('50.000');
      expect(await page.getByText('Precio anterior:', { exact: true }).count()).toBe(1);
      await page.clock.runFor(2000);
      await expect.poll(() => page.getByTestId('build-total').textContent()).toBe('Pendiente');
      expect(await page.getByText('Precio anterior:', { exact: true }).count()).toBe(2);
      expect(await page.getByText('Precio relevado:', { exact: false }).allTextContents()).toEqual(dates);
      expect(await page.getByLabel('Elegir Procesador').inputValue()).toBe('cpu');
      expect(await page.getByLabel('Elegir Memoria RAM').inputValue()).toBe('ram');
      expect(await requestCount(page)).toBe(reads);
      await page.getByRole('button', { name: 'Descargar presupuesto' }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as ScreenFixture).exportText)).toContain('Total calculado parcial, no confirmado: pendiente');
    } finally { await page.close(); }
  });

  it.each(['focus', 'visibilitychange', 'pageshow'])('rechecks after suspended timers on %s without fetching', async event => {
    const page = await open(width);
    try {
      const reads = await requestCount(page);
      await page.clock.setSystemTime(new Date('2026-10-07T15:00:03Z'));
      expect(await page.getByTestId('build-total').textContent()).toContain('150.000');
      await page.evaluate(event => (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event)), event);
      await expect.poll(() => page.getByTestId('build-total').textContent()).toBe('Pendiente');
      expect(await requestCount(page)).toBe(reads);
    } finally { await page.close(); }
  });

  it('removes its timer and resume listeners when unmounted', async () => {
    const page = await open(width);
    try {
      expect(await page.evaluate(() => Object.values((window as unknown as ScreenFixture).clockListeners).map(listeners => listeners.size))).toEqual([1, 1, 1]);
      expect(await page.evaluate(() => (window as unknown as ScreenFixture).clockTimers.size)).toBeGreaterThan(0);
      await page.evaluate(() => (window as unknown as ScreenFixture).unmount());
      expect(await page.evaluate(() => Object.values((window as unknown as ScreenFixture).clockListeners).map(listeners => listeners.size))).toEqual([0, 0, 0]);
      expect(await page.evaluate(() => (window as unknown as ScreenFixture).clockTimers.size)).toBe(0);
    } finally { await page.close(); }
  });
});
