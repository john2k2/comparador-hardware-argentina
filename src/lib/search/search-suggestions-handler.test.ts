import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { read, rate, stable, fixtures } = vi.hoisted(() => ({ read: vi.fn(), rate: vi.fn(), stable: vi.fn(), fixtures: vi.fn() }));
vi.mock('@/lib/persistence/product-read', () => ({ readProductsPageFromDatabase: read }));
vi.mock('@/lib/server/runtime-flags', () => ({ isStableRuntimeMode: stable }));
vi.mock('@/lib/server/stable-search-fixtures', () => ({ getStableFixtureProducts: fixtures }));
vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: rate, getRequestIp: () => 'fixture-ip', buildRateLimitHeaders: () => ({ 'X-RateLimit-Limit': '60' }),
}));
const product = { id: 'cpu-7', name: 'AMD Ryzen 7', category: 'procesadores', prices: [{ price: 20, stock: 'unknown' }] };
const request = (query: string) => new NextRequest(`https://catalog.example/api/search/suggestions?q=${encodeURIComponent(query)}`);

beforeEach(() => {
  vi.resetModules();
  read.mockReset().mockResolvedValue({ products: [product] });
  stable.mockReset().mockReturnValue(false);
  fixtures.mockReset().mockReturnValue([{ ...product, id: 'fixture-ryzen' }]);
  rate.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
});

describe('API de sugerencias de sólo lectura', () => {
  it('en modo de pruebas sugiere las mismas fichas sintéticas que el resto de la navegación', async () => {
    stable.mockReturnValue(true);
    const { GET } = await import('./search-suggestions-handler');
    expect((await (await GET(request('ryzen'))).json()).suggestions[0].id).toBe('fixture-ryzen');
    expect(read).not.toHaveBeenCalled();
  });
  it('lee una página de cinco fichas y sólo devuelve identificación y categoría', async () => {
    const { GET } = await import('./search-suggestions-handler');
    const response = await GET(request(' ryzen '));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ query: 'ryzen', suggestions: [{ id: 'cpu-7', name: 'AMD Ryzen 7', category: 'procesadores' }] });
    expect(read).toHaveBeenCalledExactlyOnceWith({ query: 'ryzen', page: 1, pageSize: 5, sortBy: 'relevance' });
  });

  it('no lee el catálogo con consulta corta o excesiva', async () => {
    const { GET } = await import('./search-suggestions-handler');
    expect((await GET(request('ry'))).status).toBe(200);
    expect((await GET(request('a'.repeat(129)))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });

  it('un límite de frecuencia no dispara ninguna lectura ni se guarda como éxito', async () => {
    rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const { GET } = await import('./search-suggestions-handler');
    const response = await GET(request('ryzen'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(read).not.toHaveBeenCalled();
  });

  it('deduplica lecturas simultáneas y reutiliza la respuesta breve', async () => {
    let resolve!: (value: { products: typeof product[] }) => void;
    read.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { GET } = await import('./search-suggestions-handler');
    const first = GET(request('ryzen')), second = GET(request('ryzen'));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    resolve({ products: [product] });
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect((await GET(request('ryzen'))).status).toBe(200);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('un error deja la búsqueda normal disponible y no conserva un resultado vacío falso', async () => {
    read.mockRejectedValueOnce(new Error('private error detail'));
    const { GET } = await import('./search-suggestions-handler');
    const failed = await GET(request('ryzen'));
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain('private');
    expect((await GET(request('ryzen'))).status).toBe(200);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
