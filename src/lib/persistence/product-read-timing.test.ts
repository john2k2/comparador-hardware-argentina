import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({ clock: 0, transformCost: 0, fetch: undefined as typeof globalThis.fetch | undefined }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/search/category-page-guard', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/search/category-page-guard')>();
  return { ...actual, guardCategoryPage: (...args: Parameters<typeof actual.guardCategoryPage>) => {
    state.clock += state.transformCost; return actual.guardCategoryPage(...args);
  } };
});
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: () => createClient('https://catalog.test', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }),
  createServerSupabaseReadClientForFetch: (fetch: typeof globalThis.fetch) => {
    state.fetch = fetch;
    return createClient('https://catalog.test', 'public-test-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
    });
  },
}));
import { readProductsPageFromDatabase, type CatalogPageReadDiagnostics } from './product-read';
const page = { products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 };
const params = { query: 'private-query', minPrice: 100, maxPrice: 200, onlyCurrentOffers: true, page: 1, pageSize: 12 };

describe('diagnóstico aislado del RPC real del SDK', () => {
  beforeEach(() => { state.clock = 0; state.transformCost = 0; vi.spyOn(performance, 'now').mockImplementation(() => state.clock); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function transport(response: Response) {
    const text = response.text.bind(response);
    vi.spyOn(response, 'text').mockImplementation(async () => { state.clock += 11; return text(); });
    const fetch = vi.fn(async () => { state.clock += 23; return response; });
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }
  it('conserva POST, auth, parámetros y cuerpo; separa headers/text sin agregar requests', async () => {
    state.transformCost = 7;
    const response = Response.json(page);
    const fetch = transport(response);
    const report = vi.fn<(diagnostic: Readonly<CatalogPageReadDiagnostics>) => void>();
    expect(await readProductsPageFromDatabase(params, report)).toMatchObject(page);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://catalog.test/rest/v1/rpc/search_catalog_page');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer public-test-key');
    expect(new Headers(init.headers).get('apikey')).toBe('public-test-key');
    expect(JSON.parse(init.body as string)).toMatchObject({ p_query: 'private-query', p_min_price: 100, p_max_price: 200, p_page: 1, p_page_size: 12 });
    expect(report).toHaveBeenCalledWith({ rpcCalls: 1, rpcMs: 34, headersMs: 23, bodyMs: 11, transformMs: 7 });
    expect(response.bodyUsed).toBe(true);
    expect(JSON.stringify(report.mock.calls)).not.toMatch(/private|Bearer|catalog.test|key/);
  });
  it.each(['http', 'invalid-json', 'transport', 'body'] as const)('conserva rechazo %s y diagnóstico parcial', async kind => {
    const response = kind === 'http' ? Response.json({ message: 'private SQL error' }, { status: 503 })
      : kind === 'invalid-json' ? new Response('{broken') : Response.json(page);
    const fetch = transport(response);
    if (kind === 'transport') fetch.mockImplementation(async () => { state.clock += 23; throw new Error('private transport'); });
    if (kind === 'body') vi.mocked(response.text).mockImplementation(async () => { state.clock += 11; throw new Error('private body'); });
    const report = vi.fn();
    await expect(readProductsPageFromDatabase(params, report)).rejects.toThrow('readProductsPageFromDatabase:');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({ rpcCalls: 1, rpcMs: kind === 'transport' ? 23 : 34,
      headersMs: 23, bodyMs: kind === 'transport' ? 0 : 11, transformMs: 0 });
  });
  it('callback defectuoso no cambia éxito ni error y lectores sin diagnóstico conservan SDK', async () => {
    transport(Response.json(page));
    expect(await readProductsPageFromDatabase(params, () => { throw new Error('diagnostic failure'); })).toMatchObject(page);
    transport(Response.json(page));
    expect(await readProductsPageFromDatabase(params, async () => { throw new Error('async diagnostic failure'); })).toMatchObject(page);
    transport(Response.json(page));
    expect(await readProductsPageFromDatabase(params)).toMatchObject(page);
    transport(Response.json({ message: 'original failure' }, { status: 503 }));
    await expect(readProductsPageFromDatabase(params, () => { throw new Error('diagnostic failure'); })).rejects.toThrow('original failure');
  });
  it('proxy conserva getters y bindings nativos, clone/arrayBuffer y cuerpo sin consumirlo por diagnóstico', async () => {
    const fetch = transport(Response.json(page));
    await readProductsPageFromDatabase(params, () => undefined);
    const original = new Response('native-body', { status: 202, headers: { 'x-native': 'preserved' } });
    fetch.mockResolvedValue(original);
    const proxy = await state.fetch!('https://catalog.test/rest/v1/rpc/search_catalog_page');
    expect(proxy).toBeInstanceOf(Response);
    expect(proxy.status).toBe(202);
    expect(proxy.headers.get('x-native')).toBe('preserved');
    expect(proxy.body).toBe(original.body);
    expect(proxy.bodyUsed).toBe(false);
    const clone = proxy.clone();
    expect(new TextDecoder().decode(await clone.arrayBuffer())).toBe('native-body');
    expect(proxy.bodyUsed).toBe(false);
    expect(await proxy.text()).toBe('native-body');
    expect(proxy.bodyUsed).toBe(true);
  });

});
