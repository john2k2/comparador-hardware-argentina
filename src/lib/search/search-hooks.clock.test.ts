import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';

// Loader real montado con dos precios sintéticos. No toca DB ni tiendas.
let browser: Browser;
let script: string;
const start = new Date('2026-10-10T12:00:00Z');
beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, { useCallback, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { SearchCacheProvider, useProductLoader } from './src/lib/search/search-hooks';
      const state = {query:'ryzen',category:'procesadores',maxPrice:150,stores:[],sortBy:'price-asc',page:2};
      const product = {id:'cpu',name:'AMD Ryzen 5 5500',brand:'AMD',model:'5500',category:'procesadores',specs:{},
        createdAt:'2026-10-10T12:00:00Z',updatedAt:'2026-10-10T12:00:00Z',lowestPrice:100,highestPrice:200,averagePrice:150,
        prices:[{storeId:'mexx',storeName:'Mexx',price:100,stock:'in-stock',installment:null,
          url:'https://www.mexx.com.ar/product/cpu',lastUpdated:'2026-10-09T12:00:05Z'},
          {storeId:'venex',storeName:'Venex',price:200,stock:'in-stock',installment:null,
          url:'https://www.venex.com.ar/product/cpu',lastUpdated:'2026-10-10T12:00:00Z'}]};
      window.requests = [];
      window.fetch = async url => {
        window.requests.push(url);
        const observedAt = Date.now();
        if (window.slow && window.requests.length === 1) await new Promise(resolve => setTimeout(resolve,6000));
        if (window.fail && window.requests.length > 1) return new Response('{}', {status:503});
        const products = window.alwaysExpired || observedAt <= Date.parse('2026-10-10T12:00:05Z') ? [product] : [];
        return new Response(JSON.stringify({products,pagination:{page:2,pageSize:12,limit:products.length,
          offset:12,total:products.length,totalPages:2},facets:{categories:[],brands:[],stores:[]}}));
      };
      function Screen() {
        const [data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
        const resolved=useCallback(() => {},[]);
        const loaded=useCallback((products,pagination) => setData({products,pagination}),[]);
        useProductLoader({currentState:state,hasSearchIntent:true,requestKey:'clock-page2',pageSize:12,
          onLoadingChange:setLoading,onResolvedRequestKey:resolved,onProductsLoaded:loaded,onError:setError});
        return <><pre id="data">{JSON.stringify(data)}</pre><span id="loading">{String(loading)}</span><span id="error">{error}</span></>;
      }
      const root=createRoot(document.getElementById('root'));
      window.unmount=() => root.unmount();
      root.render(<SearchCacheProvider><Screen /></SearchCacheProvider>);
    ` },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
  });
  script = result.outputFiles[0].text;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);
afterAll(async () => { await browser?.close(); });

async function open(options: { slow?: boolean; alwaysExpired?: boolean } = {}): Promise<Page> {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  await page.route('http://search.fixture/**', route => route.fulfill({ contentType:'text/html', body:'<div id="root"></div>' }));
  await page.goto('http://search.fixture/search');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 100));
  await page.evaluate(options => Object.assign(window, options), options);
  await page.addScriptTag({ content: script });
  if (!options.slow) await expect.poll(() => page.locator('#data').textContent()).toContain('"price":100');
  return page;
}
async function requests(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { requests: string[] }).requests);
}

describe('search offer expiration on an open page', () => {
  it('rechecks a response whose cheapest offer expires in flight before caching or displaying it', async () => {
    const page = await open({ slow:true });
    try {
      await expect.poll(() => requests(page).then(reads => reads.length)).toBe(1);
      await page.clock.runFor(6000);
      await expect.poll(() => page.locator('#data').textContent()).toContain('"products":[]');
      expect(await requests(page)).toHaveLength(2);
      expect(await page.locator('#data').textContent()).not.toContain('"price":100');
    } finally { await page.close(); }
  });
  it('bounds an invalid response retry and reports failure instead of retaining a now over-budget result', async () => {
    const page = await open({ alwaysExpired:true });
    try {
      await page.clock.runFor(4901);
      await expect.poll(() => page.locator('#error').textContent()).toContain('Vencieron ofertas');
      expect(await requests(page)).toHaveLength(3);
      expect(await page.locator('#data').textContent()).toContain('"products":[]');
      await page.clock.runFor(180_000);
      expect(await requests(page)).toHaveLength(3);
    } finally { await page.close(); }
  });
  it('rechecks at the first offer expiry, preserves filters/page and removes a now over-budget result without polling', async () => {
    const page = await open();
    try {
      await page.clock.runFor(4900);
      expect(await requests(page)).toHaveLength(1);
      await page.clock.runFor(1);
      await expect.poll(() => page.locator('#data').textContent()).toContain('"products":[]');
      const reads = await requests(page);
      expect(reads).toHaveLength(2);
      const url = new URL(reads[1], 'http://search.fixture');
      expect(url.searchParams.get('maxPrice')).toBe('150');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('sortBy')).toBe('price-asc');
      await page.clock.runFor(180_000);
      expect(await requests(page)).toHaveLength(2);
    } finally { await page.close(); }
  });
  it.each(['focus','pageshow','visibilitychange'])('rechecks suspended timers on %s only after an offer expires', async event => {
    const page = await open();
    try {
      await page.evaluate(event => (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event)), event);
      expect(await requests(page)).toHaveLength(1);
      await page.clock.setSystemTime(new Date(start.getTime() + 6000));
      await page.evaluate(event => (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event)), event);
      await expect.poll(() => page.locator('#data').textContent()).toContain('"products":[]');
      expect(await requests(page)).toHaveLength(2);
    } finally { await page.close(); }
  });
  it('reports a failed recheck and does not keep showing an expired filtered result', async () => {
    const page = await open();
    try {
      await page.evaluate(() => { (window as unknown as {fail:boolean}).fail = true; });
      await page.clock.runFor(4901);
      await expect.poll(() => page.locator('#error').textContent()).toContain('503');
      expect(await page.locator('#data').textContent()).toContain('"products":[]');
      expect(await requests(page)).toHaveLength(2);
    } finally { await page.close(); }
  });
  it('cleans up expiry work and resume listeners on unmount', async () => {
    const page = await open();
    try {
      await page.evaluate(() => (window as unknown as {unmount:()=>void}).unmount());
      await page.clock.runFor(180_000);
      await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange')); });
      expect(await requests(page)).toHaveLength(1);
    } finally { await page.close(); }
  });
});
