import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';

// Se renderizan componentes reales con React en un navegador, sin servidor,
// credenciales, acceso a la red ni dependencias adicionales para simular el DOM.
let browser: Browser;
let script: string;

beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { SearchPageClient } from './src/components/search/SearchPageClient';
        import { ProductComparisonBuilder } from './src/components/comparison/ProductComparisonBuilder';
        import { AuthScreen } from './src/components/auth/AuthScreen';
        import { PaginationControls } from './src/components/search/SearchPageView.tsx';
        import { parseSearchState, buildApiSearchKey } from './src/lib/search/search-state';
        window.routes = [];
        window.routerRoutes = [];
        const pushState = window.history.pushState.bind(window.history);
        window.history.pushState = (state, unused, url) => {
          window.routes.push(url);
          pushState(state, unused, url);
        };
        window.PaginationControls = PaginationControls;
        window.requests = [];
        window.oauthCalls = 0;
        window.fetch = (url, options) => new Promise((resolve, reject) => {
          window.requests.push({ url, signal: options?.signal, resolve, reject });
        });
        const root = createRoot(document.getElementById('root'));
        window.unmountScreen = () => root.render(null);
        window.mount = (screen, initialState = {}, initialProducts = []) => {
          const state = parseSearchState({ q: 'ryzen', ...initialState, ...(initialState.query !== undefined ? { q: initialState.query } : {}) });
          root.render(
          screen === 'comparison' ? <ProductComparisonBuilder /> :
          screen === 'auth' ? <AuthScreen /> :
          <SearchPageClient initialState={state}
            initialBaseProducts={initialProducts} initialPagination={{ total: initialProducts.length, totalPages: 3, page: 1, pageSize: 24, limit: 24, offset: 0 }}
            initialResolvedRequestKey={initialProducts.length ? buildApiSearchKey(state) + '|page=1' : null} initialHasSearchIntent initialIsCategoryLanding={false} />
        );
        };
      `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
    plugins: [{
      name: 'isolated-ui-boundaries',
      setup(plugin) {
        plugin.onResolve({ filter: /^(next\/(navigation|link)|@\/lib\/(analytics|supabase)|.*SearchPageView|@\/components\/functional|@\/components\/commercial\/AdvisoryCta)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
          loader: 'tsx',
          resolveDir: process.cwd(),
          contents: args.path === 'next/navigation' ? `
            const navigate = (url) => {
              window.routerRoutes.push(url);
              window.routes.push(url);
              if (window.lateServerResponse) setTimeout(window.lateServerResponse, 100);
            };
            const router = { push: navigate, replace: navigate, refresh() {} };
            const params = new URLSearchParams();
            export const useRouter = () => router;
            export const useSearchParams = () => params;
          ` : args.path === 'next/link' ? `export default function Link({ children, href, onNavigate, prefetch, ...props }) {
              return <a {...props} href={href} onClick={event => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                event.preventDefault();
                let cancelled = false;
                onNavigate?.({ preventDefault: () => { cancelled = true; } });
                if (!cancelled) window.routerRoutes.push(href);
              }}>{children}</a>;
            }`
            : args.path.endsWith('analytics') ? `export const trackFilterChange = () => {}; export const trackSearch = () => {};`
            : args.path.endsWith('supabase') ? `export const supabase = { auth: {
              getUser: async () => ({ data: { user: null } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signInWithOAuth: async () => { window.oauthCalls++; return { error: { message: 'OAuth unavailable' } }; }
            } };`
            : args.path.endsWith('AdvisoryCta') ? `export const AdvisoryCta = () => null;`
            : args.path.endsWith('/functional') ? `export const SearchBar = () => null; export const ProductGrid = () => null; export const Filters = () => null;`
            : `export function SearchPageView(props) {
                const Pagination = window.PaginationControls;
                return <div>
                  <input aria-label="minimum" value={props.filters.minPrice ?? ''} onChange={e => props.onFiltersChange({ minPrice: e.target.value ? Number(e.target.value) : undefined })} />
                  <input aria-label="maximum" value={props.filters.maxPrice ?? ''} onChange={e => props.onFiltersChange({ maxPrice: e.target.value ? Number(e.target.value) : undefined })} />
                  <button onClick={props.onClearFilters}>Clear</button>
                  <button onClick={() => props.onSearch('intel')}>Search</button>
                  <button onClick={() => props.onPageChange(2)}>Page</button>
                  <button onClick={() => props.onFiltersChange({ category: 'tarjetas-graficas' })}>GPU category</button>
                  <button onClick={() => props.onSearch('')}>Empty search</button>
                  <Pagination currentPage={props.currentPage} totalPages={props.totalPages} isBusy={props.isBusy} searchRoute={props.searchRoute} onPageChange={props.onPageChange} />
                  <p role="alert">{props.searchError}</p>
                  <output>{props.products.map(p => p.name).join(',')}</output>
                  {props.showNoResultsState && <p>No results</p>}
                </div>;
              }`,
        }));
      },
    }],
  });
  script = result.outputFiles[0].text;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

afterAll(async () => { await browser?.close(); });

async function open(screen: string, initialState = {}, initialProducts: object[] = []) {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  const params = new URLSearchParams({ q: 'ryzen' });
  for (const [key, value] of Object.entries(initialState)) params.set(key === 'query' ? 'q' : key, String(value));
  await page.goto(`http://frontend.test/search?${params}`);
  await page.addScriptTag({ content: script });
  expect(errors).toEqual([]);
  await page.evaluate(({ screen, initialState, initialProducts }) => {
    (window as unknown as { mount: (screen: string, state: object, products: object[]) => void }).mount(screen, initialState, initialProducts);
  }, { screen, initialState, initialProducts });
  return page;
}

async function requestCount(page: Page) {
  return page.evaluate(() => (window as unknown as { requests: unknown[] }).requests.length);
}

async function resolveRequest(page: Page, index: number, products: object[] = [], status = 200) {
  await page.evaluate(({ index, products, status }) => {
    const requests = (window as unknown as { requests: { resolve: (response: object) => void }[] }).requests;
    requests[index].resolve({ ok: status === 200, status, json: async () => ({
      products, pagination: { total: products.length, totalPages: 3, page: 1, pageSize: 24, limit: 24, offset: 0 },
      facets: { categories: [], brands: [], stores: [] },
    }) });
  }, { index, products, status });
}

const cpu = { id: 'cpu', category: 'procesadores', name: 'CPU fixture', brand: 'Fixture', model: 'CPU fixture', specs: {}, prices: [], lowestPrice: 0 };
const gpu = { ...cpu, id: 'gpu', category: 'tarjetas-graficas', name: 'GPU fixture', model: 'GPU fixture' };

describe('frontend interaction regressions', () => {
  it.each([200, 500])('keeps the client response authoritative after native navigation (HTTP %s)', async (status) => {
    const serverProducts = [cpu, { ...cpu, id: 'server-2', name: 'SSR second product' }];
    const page = await open('search', {}, serverProducts);
    try {
      await expect.poll(() => page.locator('output').textContent()).toContain('SSR second product');
      expect(await requestCount(page)).toBe(0);
      await page.evaluate(() => {
        const fixture = window as unknown as { lateServerResponse: () => void; mount: (screen: string, state: object, products: object[]) => void };
        fixture.lateServerResponse = () => fixture.mount('search', { minPrice: 123456 }, [
          { id: 'late-server', name: 'Late SSR overwrite', prices: [] },
        ]);
      });
      await page.getByLabel('minimum').fill('123456');
      await expect.poll(() => requestCount(page)).toBe(1);
      expect(new URL(page.url()).searchParams.get('minPrice')).toBe('123456');
      const products = Array.from({ length: 13 }, (_, index) => ({ ...cpu, id: `api-${index}`, name: `API product ${index}` }));
      await resolveRequest(page, 0, products, status);
      await page.waitForTimeout(350);
      expect(await page.evaluate(() => (window as unknown as { routerRoutes: string[] }).routerRoutes)).toEqual([]);
      if (status === 200) {
        expect(await page.locator('output').textContent()).toBe(products.map(product => product.name).join(','));
      } else {
        expect(await page.getByRole('alert').textContent()).toContain('500');
        expect(await page.getByText('No results', { exact: true }).count()).toBe(0);
      }
      expect(await page.getByText('Late SSR overwrite', { exact: true }).count()).toBe(0);
    } finally { await page.close(); }
  });

  it('restores filters and results with back/forward and cancels pending drafts and obsolete responses', async () => {
    const page = await open('search', {}, [cpu]);
    try {
      await expect.poll(() => page.locator('output').textContent()).toBe(cpu.name);
      await page.getByLabel('minimum').fill('100');
      await expect.poll(() => requestCount(page)).toBe(1);
      await resolveRequest(page, 0, [{ ...cpu, name: 'Filtered CPU' }]);
      await expect.poll(() => page.locator('output').textContent()).toBe('Filtered CPU');
      await page.getByLabel('maximum').fill('200');
      await page.goBack();
      await expect.poll(() => page.getByLabel('minimum').inputValue()).toBe('');
      expect(await page.getByLabel('maximum').inputValue()).toBe('');
      await page.waitForTimeout(300);
      expect(new URL(page.url()).searchParams.has('minPrice')).toBe(false);
      expect(await page.locator('output').textContent()).toBe(cpu.name);
      await page.goForward();
      await expect.poll(() => page.getByLabel('minimum').inputValue()).toBe('100');
      await expect.poll(() => page.locator('output').textContent()).toBe('Filtered CPU');
      expect(await requestCount(page)).toBe(1);
      await page.getByLabel('maximum').fill('300');
      await expect.poll(() => requestCount(page)).toBe(2);
      await page.goBack();
      await expect.poll(() => page.getByLabel('maximum').inputValue()).toBe('');
      await resolveRequest(page, 1, [{ ...cpu, name: 'Obsolete response' }]);
      expect(await page.locator('output').textContent()).toBe('Filtered CPU');
      expect(await page.evaluate(() => (window as unknown as { routerRoutes: string[] }).routerRoutes)).toEqual([]);
    } finally { await page.close(); }
  });

  it('updates URL and search metadata without RSC navigation, including back/forward', async () => {
    const page = await open('search', {}, [cpu]);
    try {
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect.poll(() => requestCount(page)).toBe(1);
      expect(new URL(page.url()).searchParams.get('q')).toBe('intel');
      expect(await page.title()).toContain('Busqueda: intel');
      expect(await page.locator('meta[name="description"]').getAttribute('content')).toContain('intel');
      expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, follow');
      expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toMatch(/\/search$/);
      await page.goBack();
      await expect.poll(() => page.title()).toContain('Busqueda: ryzen');
      await page.goForward();
      await expect.poll(() => page.title()).toContain('Busqueda: intel');
    } finally { await page.close(); }
  });

  it('restores the native URL when returning from another page with the original SSR tree', async () => {
    const page = await open('search', {}, [cpu]);
    try {
      await page.getByLabel('minimum').fill('100');
      await expect.poll(() => requestCount(page)).toBe(1);
      await resolveRequest(page, 0, [{ ...cpu, name: 'Filtered CPU' }]);
      await expect.poll(() => page.locator('output').textContent()).toBe('Filtered CPU');
      await page.evaluate(() => (window as unknown as { unmountScreen: () => void }).unmountScreen());
      await expect.poll(() => page.locator('output').count()).toBe(0);
      await page.evaluate(product => {
        (window as unknown as { mount: (screen: string, state: object, products: object[]) => void }).mount('search', {}, [product]);
      }, cpu);
      await expect.poll(() => page.getByLabel('minimum').inputValue()).toBe('100');
      await expect.poll(() => page.locator('output').textContent()).toBe('Filtered CPU');
      expect(await requestCount(page)).toBe(1);
    } finally { await page.close(); }
  });

  it('keeps crawlable pagination hrefs while handling ordinary navigation only once', async () => {
    const page = await open('search', {}, [cpu]);
    try {
      const next = page.getByRole('link', { name: 'Ir a la página 2' });
      expect(await next.getAttribute('href')).toContain('page=2');
      await next.click();
      await expect.poll(() => requestCount(page)).toBe(1);
      expect(new URL(page.url()).searchParams.get('page')).toBe('2');
      expect(await page.evaluate(() => (window as unknown as { routerRoutes: string[] }).routerRoutes)).toEqual([]);
      expect(await page.evaluate(() => (window as unknown as { routes: string[] }).routes.length)).toBe(1);
    } finally { await page.close(); }
  });

  it('delegates canonical category landings to Next without starting a competing API request', async () => {
    const page = await open('search', {}, [cpu]);
    try {
      await page.getByRole('button', { name: 'Empty search', exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { routerRoutes: string[] }).routerRoutes.length)).toBe(1);
      expect(await requestCount(page)).toBe(0);
      expect(await page.evaluate(() => (window as unknown as { routerRoutes: string[] }).routerRoutes[0])).toBe('/search?category=procesadores');
    } finally { await page.close(); }
  });

  it('leaves category landings through Next so their editorial metadata is replaced', async () => {
    const page = await open('search', { query: '', category: 'procesadores' }, [cpu]);
    try {
      await page.getByLabel('minimum').fill('100');
      await expect.poll(() => page.evaluate(() => (window as unknown as { routerRoutes: string[] }).routerRoutes.length)).toBe(1);
      expect(await requestCount(page)).toBe(0);
      expect(await page.evaluate(() => (window as unknown as { routerRoutes: string[] }).routerRoutes[0])).toBe('/search?category=procesadores&minPrice=100');
    } finally { await page.close(); }
  });

  it('retains all six typed digits immediately and debounces only requests/navigation', async () => {
    const page = await open('search');
    try {
      await expect.poll(() => requestCount(page)).toBe(1);
      await page.clock.install();
      await page.getByLabel('minimum').pressSequentially('123456');
      expect(await page.getByLabel('minimum').inputValue()).toBe('123456');
      await page.getByLabel('maximum').pressSequentially('789000');
      expect(await requestCount(page)).toBe(1);
      await page.clock.runFor(250);
      await expect.poll(() => requestCount(page)).toBe(2);
      const routes = await page.evaluate(() => (window as unknown as { routes: string[] }).routes);
      expect(routes).toHaveLength(1);
      expect(routes[0]).toContain('minPrice=123456');
      expect(routes[0]).toContain('maxPrice=789000');
    } finally { await page.close(); }
  });

  it.each(['Clear', 'Search', 'Page'])('cancels pending filters on %s without restoring an old URL', async (action) => {
    const page = await open('search');
    try {
      await expect.poll(() => requestCount(page)).toBe(1);
      await page.clock.install();
      await page.getByLabel('minimum').fill('123456');
      await page.getByRole('button', { name: action, exact: true }).click();
      await page.clock.runFor(500);
      const routes = await page.evaluate(() => (window as unknown as { routes: string[] }).routes);
      if (action === 'Clear') {
        expect(routes).toHaveLength(0);
        expect(new URL(page.url()).searchParams.has('minPrice')).toBe(false);
        expect(await page.getByLabel('minimum').inputValue()).toBe('');
      } else {
        expect(routes).toHaveLength(1);
        expect(routes[0]).toContain('minPrice=123456');
        expect(routes[0]).toContain(action === 'Search' ? 'q=intel' : 'page=2');
      }
    } finally { await page.close(); }
  });

  it('keeps a 500 error visible, then clears it after a successful retry', async () => {
    const page = await open('search');
    try {
      await expect.poll(() => requestCount(page)).toBe(1);
      await resolveRequest(page, 0, [], 500);
      await expect.poll(() => page.getByRole('alert').textContent()).toContain('500');
      expect(await page.getByText('No results', { exact: true }).count()).toBe(0);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect.poll(() => requestCount(page)).toBe(2);
      await resolveRequest(page, 1);
      await expect.poll(() => page.getByRole('alert').textContent()).toBe('');
    } finally { await page.close(); }
  });

  it('restores URL-supplied prices when initial route state changes', async () => {
    const page = await open('search', { minPrice: 50, maxPrice: 100 });
    try {
      expect(await page.getByLabel('minimum').inputValue()).toBe('50');
      await page.getByLabel('minimum').fill('123456');
      await page.evaluate(() => {
        window.history.replaceState(null, '', '/search?q=ryzen&minPrice=70&maxPrice=200');
        (window as unknown as { mount: (screen: string, state: object) => void }).mount('search', { minPrice: 70, maxPrice: 200 });
      });
      await expect.poll(() => page.getByLabel('minimum').inputValue()).toBe('70');
      expect(await page.getByLabel('maximum').inputValue()).toBe('200');
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => (window as unknown as { routes: string[] }).routes)).toEqual([]);
    } finally { await page.close(); }
  });

  it('ignores a CPU response after switching to GPU, even when fetch ignores abort', async () => {
    const page = await open('comparison');
    try {
      await page.getByLabel('Buscar producto A').fill('ryzen');
      await page.getByLabel('Buscar producto A').press('Enter');
      await expect.poll(() => requestCount(page)).toBe(1);
      await page.locator('#comparison-category').selectOption('tarjetas-graficas');
      await page.getByLabel('Buscar producto A').fill('rtx');
      await page.getByLabel('Buscar producto A').press('Enter');
      await expect.poll(() => requestCount(page)).toBe(2);
      await resolveRequest(page, 1, [gpu, cpu]);
      await expect.poll(() => page.getByRole('button', { name: /GPU fixture/ }).count()).toBe(1);
      await resolveRequest(page, 0, [cpu]);
      expect(await page.getByRole('button', { name: /CPU fixture/ }).count()).toBe(0);
      expect(await page.getByRole('button', { name: /GPU fixture/ }).count()).toBe(1);
    } finally { await page.close(); }
  });

  it('invalidates requests as soon as the query changes and preserves the newest result', async () => {
    const page = await open('comparison');
    try {
      const input = page.getByLabel('Buscar producto A');
      await input.fill('old');
      await input.press('Enter');
      await expect.poll(() => requestCount(page)).toBe(1);
      await input.fill('new');
      await resolveRequest(page, 0, [cpu]);
      expect(await page.getByRole('button', { name: /CPU fixture/ }).count()).toBe(0);
      await input.press('Enter');
      await expect.poll(() => requestCount(page)).toBe(2);
      await resolveRequest(page, 1, [{ ...cpu, name: 'New CPU' }]);
      await expect.poll(() => page.getByRole('button', { name: /New CPU/ }).count()).toBe(1);
    } finally { await page.close(); }
  });

  it('does not let an older query overwrite a newer completed query', async () => {
    const page = await open('comparison');
    try {
      const input = page.getByLabel('Buscar producto A');
      await input.fill('old');
      await input.press('Enter');
      await expect.poll(() => requestCount(page)).toBe(1);
      await input.fill('new');
      await input.press('Enter');
      await expect.poll(() => requestCount(page)).toBe(2);
      await resolveRequest(page, 1, [{ ...cpu, name: 'New CPU' }]);
      await expect.poll(() => page.getByRole('button', { name: /New CPU/ }).count()).toBe(1);
      await resolveRequest(page, 0, [cpu]);
      expect(await page.getByRole('button', { name: /CPU fixture/ }).count()).toBe(0);
      expect(await page.getByRole('button', { name: /New CPU/ }).count()).toBe(1);
    } finally { await page.close(); }
  });

  it('clears selected CPUs on category change and rejects mixed-category candidates', async () => {
    const page = await open('comparison');
    try {
      await page.getByLabel('Buscar producto A').fill('ryzen');
      await page.getByLabel('Buscar producto A').press('Enter');
      await expect.poll(() => requestCount(page)).toBe(1);
      await resolveRequest(page, 0, [cpu]);
      await page.getByRole('button', { name: /CPU fixture/ }).click();
      expect(await page.getByRole('button', { name: 'CAMBIAR' }).count()).toBe(1);
      await page.locator('#comparison-category').selectOption('tarjetas-graficas');
      expect(await page.getByRole('button', { name: 'CAMBIAR' }).count()).toBe(0);
      await page.getByLabel('Buscar producto B').fill('rtx');
      await page.getByLabel('Buscar producto B').press('Enter');
      await expect.poll(() => requestCount(page)).toBe(2);
      await resolveRequest(page, 1, [gpu, cpu]);
      await page.getByRole('button', { name: /GPU fixture/ }).click();
      expect(await page.getByText('CPU fixture', { exact: true }).count()).toBe(0);
      expect(await page.getByRole('heading', { name: /CUÁL CONVIENE/ }).count()).toBe(0);
    } finally { await page.close(); }
  });

  it('releases both authentication buttons after a resolved OAuth error and allows retry', async () => {
    const page = await open('auth');
    try {
      const google = page.getByRole('button', { name: 'CONTINUAR CON GOOGLE' });
      await google.click();
      await expect.poll(() => page.getByText('OAuth unavailable').count()).toBe(1);
      expect(await google.isEnabled()).toBe(true);
      expect(await page.getByRole('button', { name: 'INGRESAR', exact: true }).isEnabled()).toBe(true);
      await google.click();
      expect(await page.evaluate(() => (window as unknown as { oauthCalls: number }).oauthCalls)).toBe(2);
    } finally { await page.close(); }
  });
});
