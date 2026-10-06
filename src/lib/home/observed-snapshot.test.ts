import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { decodeObservedHome, PUBLIC_HOME_KEY, PUBLIC_HOME_SCOPE } from './observed-snapshot';
import { handleObservedHomeRead } from './edge-read';

const now = Date.parse('2026-10-06T05:00:00Z');
const hour = 3_600_000;
function offer(age: number, changes: Partial<ProductPrice> = {}): ProductPrice {
  return { storeId: 'mexx', storeName: 'Mexx', url: 'https://www.mexx.com.ar/producto/ryzen-5600', price: 200_000,
    stock: 'in-stock', installment: null, lastUpdated: new Date(now - age * hour), ...changes };
}
function product(id: string, prices = [offer(1)]): Product {
  return { id, name: 'AMD Ryzen 5 5600', category: 'procesadores', brand: 'AMD', model: 'Ryzen 5 5600', specs: {}, prices,
    lowestPrice: 1, highestPrice: 999_999, averagePrice: 1, createdAt: new Date(now), updatedAt: new Date(now) };
}
function payload(latest = [product('recent')], drops: Product[] = [], fallback = false) {
  return JSON.parse(JSON.stringify({ kind: 'public-home', data: { collectedAt: new Date(now).toISOString(), latestOfferProducts: latest, priceDropProducts: drops, priceDropFallbackUsed: fallback } }));
}
const env = { SUPABASE_URL: 'https://zyiyziubpcpgoqlkcrie.supabase.co', SUPABASE_SECRET_KEY: 'server-secret-test' };
const request = () => new Request('https://www.comparador-hardware.com.ar/api/home/observed-sections');

describe('corte público observado de portada', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); });

  it('conserva la observación y recalcula el precio con ofertas válidas; una nueva lectura no amplía tres horas', () => {
    const input = payload([product('mixed', [offer(2.99, { price: 210_000 }), offer(8, { price: 10_000 })])]);
    const data = decodeObservedHome(input, now)!;
    expect(data.latestOfferProducts[0].lowestPrice).toBe(210_000);
    expect(data.latestOfferProducts[0].prices).toHaveLength(1);
    expect(data.latestOfferProducts[0].prices[0].lastUpdated.getTime()).toBe(now - 2.99 * hour);
    expect(decodeObservedHome(input, now + .1 * hour)!.latestOfferProducts).toEqual([]);
    expect(input.data.latestOfferProducts[0].prices).toHaveLength(2);
  });

  it('descarta stock desconocido, fechas inválidas y contradicción de modelo aunque el corte sea nuevo', () => {
    const input = payload([product('unknown', [offer(0, { stock: 'unknown' })]), product('date', [offer(0, { lastUpdated: new Date(NaN) })]),
      product('conflict', [offer(0, { sourceIdentity: { listingRef: 'mexx:5600', title: 'AMD Ryzen 7 5700X' } })])]);
    expect(decodeObservedHome(input, now)!.latestOfferProducts).toEqual([]);
  });

  it('no muestra fallback como baja real ni duplica productos entre secciones', () => {
    const latest = product('same');
    const drop = product('drop', [offer(4, { originalPrice: 250_000 })]);
    expect(decodeObservedHome(payload([], [drop], true), now)!.priceDropProducts).toEqual([]);
    const data = decodeObservedHome(payload([latest], [latest, drop, drop, product('expired', [offer(25)])]), now)!;
    expect(data.priceDropProducts.map(({ id }) => id)).toEqual(['drop']);
    expect(data.priceDropProducts[0].prices[0].originalPrice).toBe(250_000);
  });

  it('distingue una selección realmente vacía de un corte ausente, vencido o futuro', () => {
    expect(decodeObservedHome(payload([]), now)!.latestOfferProducts).toEqual([]);
    expect(decodeObservedHome(payload(), now + 76 * 60_000)).toBeNull();
    expect(decodeObservedHome(payload(), now - 61_000)).toBeNull();
    expect(decodeObservedHome({ kind: 'dashboard-view', data: payload().data }, now)).toBeNull();
    const invalid = payload(); invalid.data.latestOfferProducts[0].prices = [null];
    expect(decodeObservedHome(invalid, now)).toBeNull();
  });

  it('excluye campos desconocidos del producto, de la oferta y del informe público', async () => {
    const input = payload();
    input.credentials = 'private-root'; input.data.credentials = 'private-report';
    input.data.latestOfferProducts[0].credentials = 'private-product';
    input.data.latestOfferProducts[0].prices[0].credentials = 'private-price';
    const fetcher = vi.fn(async () => Response.json([{ payload: input }]));
    const response = await handleObservedHomeRead(request(), env, fetcher)!;
    expect(response!.status).toBe(200);
    expect(response!.headers.get('cache-control')).toBe('no-store');
    expect(await response!.text()).not.toContain('private-');
  });

  it('acepta sólo el destino y la fila públicos fijos aunque se pidan scopes o credenciales por URL', async () => {
    const fetcher = vi.fn(async () => Response.json([{ payload: payload() }]));
    const response = await handleObservedHomeRead(new Request(`${request().url}?scope=credentials&entry_key=private`), env, fetcher);
    expect(response!.status).toBe(200);
    const [destination, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(destination.origin).toBe(env.SUPABASE_URL);
    expect(destination.pathname).toBe('/rest/v1/measurement_dashboard_entries');
    expect(Object.fromEntries(destination.searchParams)).toEqual({ scope: `eq.${PUBLIC_HOME_SCOPE}`, entry_key: `eq.${PUBLIC_HOME_KEY}`, select: 'payload', limit: '1' });
    expect(options.redirect).toBe('manual');
    expect(await (await handleObservedHomeRead(request(), { ...env, SUPABASE_URL: 'https://example.com' }, fetcher))!.text()).not.toContain(env.SUPABASE_SECRET_KEY);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([[], [{ payload: { kind: 'credentials', secret: 'private-token' } }], [{ payload: payload() }, { payload: payload() }]])('falla sin publicar filas privadas, ausentes o múltiples', async (rows) => {
    const response = await handleObservedHomeRead(request(), env, vi.fn(async () => Response.json(rows)));
    expect(response!.status).toBe(503);
    expect(await response!.text()).not.toContain('private-token');
  });

  it('cancela una respuesta demasiado grande y no sigue una redirección del backend', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65_537)); }, cancel });
    const response = await handleObservedHomeRead(request(), env, vi.fn(async () => new Response(body)));
    expect(response!.status).toBe(503); expect(cancel).toHaveBeenCalledOnce();
    const redirect = await handleObservedHomeRead(request(), env, vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://example.com' } })));
    expect(redirect!.status).toBe(503);
  });

  it('no captura escrituras ni rutas administrativas', async () => {
    const fetcher = vi.fn();
    expect(await handleObservedHomeRead(new Request(request().url, { method: 'POST' }), env, fetcher)).toBeNull();
    expect(await handleObservedHomeRead(new Request('https://www.comparador-hardware.com.ar/api/admin/measurement'), env, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
