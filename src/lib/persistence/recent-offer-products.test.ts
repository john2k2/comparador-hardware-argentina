import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbProductRow } from './product-read-types';

vi.mock('server-only', () => ({}));
const runtime = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseReadClient: runtime.client }));
import { readRecentOfferProducts } from './recent-offer-products';
import { readBuilderCatalog } from '@/lib/pc-builder/catalog';

const now = '2026-10-09T20:00:00.000Z';
function row(id = 'cg-17143'): DbProductRow {
  return {
    id, name: 'AMD Ryzen 5 5600', category: 'procesadores', brand: 'AMD', model: 'Ryzen 5 5600',
    description: null, image: null, normalized_title: null, canonical_product_key: null,
    family_key: null, variant_key: null, refresh_priority: null, last_scraped_at: null,
    last_normalized_at: null, specs: {}, lowest_price: 100000, highest_price: 200000, average_price: 150000,
    created_at: '2026-05-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    product_prices: [{ store_id: 'mexx', url: 'https://www.mexx.com.ar/productos/amd-ryzen-5-5600',
      price: 200000, original_price: null, stock: 'in-stock', installment_count: null,
      installment_amount: null, last_updated: '2026-10-09T19:00:00Z' }],
  };
}
function database(rows: DbProductRow[], options: { seedError?: boolean; productError?: boolean; invalid?: boolean } = {}) {
  function chain(data: unknown, error: unknown) {
    const value = {
      select: vi.fn(() => value), in: vi.fn(() => value), gt: vi.fn(() => value),
      gte: vi.fn(() => value), lte: vi.fn(() => value), eq: vi.fn(() => value),
      order: vi.fn(() => value), limit: vi.fn(() => value),
      abortSignal: vi.fn(async () => ({ data, error })),
    };
    return value;
  }
  const seeds = chain(options.invalid ? null : rows.map(r => ({ product_id: r.id, product: { id: r.id, name: r.name, category: r.category } })), options.seedError ? { code: '57014' } : null);
  const products = chain(rows, options.productError ? { code: '57014' } : null);
  const from = vi.fn(table => table === 'product_prices' ? seeds : products);
  runtime.client.mockReturnValue({ from });
  return { seeds, products, from };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); runtime.client.mockReset(); });
afterEach(() => vi.useRealTimers());

describe('candidatas desde observaciones recientes', () => {
  it('recupera una publicación sin agrupado y de ficha antigua, sin renovar sus fechas', async () => {
    const source = row();
    const original = structuredClone(source);
    const db = database([source]);
    const products = await readBuilderCatalog({ slot: 'cpu' });
    expect(products.map(p => p.id)).toEqual(['cg-17143']);
    expect(products[0].updatedAt).toEqual(new Date(source.updated_at));
    expect(products[0].prices[0].lastUpdated).toEqual(new Date('2026-10-09T19:00:00Z'));
    expect(source).toEqual(original);
    expect(db.seeds.eq).toHaveBeenCalledWith('product.category', 'procesadores');
    expect(db.seeds.gte).toHaveBeenCalledWith('last_updated', '2026-10-09T17:00:00.000Z');
    expect(db.seeds.limit).toHaveBeenCalledWith(160);
    expect(db.seeds.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    expect(db.products.abortSignal.mock.calls[0][0]).toBe(db.seeds.abortSignal.mock.calls[0][0]);
  });

  it('elige el precio reciente aunque el mismo comercio conserve una referencia más barata', async () => {
    const source = row();
    source.product_prices!.push({ ...source.product_prices![0], url: 'https://www.mexx.com.ar/productos/amd-ryzen-5-5600-anterior', price: 100000, last_updated: '2026-10-09T15:59:00Z' });
    database([source]);
    const [product] = await readRecentOfferProducts();
    expect(product.lowestPrice).toBe(200000);
    expect(product.prices).toHaveLength(1);
    expect(source.product_prices).toHaveLength(2);
  });

  it.each([
    ['vencida', { last_updated: '2026-10-09T16:59:59Z' }],
    ['fecha ausente', { last_updated: null }],
    ['fecha futura', { last_updated: '2026-10-09T20:02:00Z' }],
    ['stock desconocido', { stock: 'unknown' }],
    ['agotada', { stock: 'out-of-stock' }],
    ['sin precio', { price: 0 }],
    ['sin enlace', { url: '' }],
    ['otro modelo', { url: 'https://www.mexx.com.ar/productos/amd-ryzen-5-5600g' }],
  ])('reevalúa la oferta %s después de la segunda lectura', async (_reason, change) => {
    const source = row(); Object.assign(source.product_prices![0], change); database([source]);
    expect(await readRecentOfferProducts()).toEqual([]);
  });

  it('no traslada una motherboard mal categorizada a memoria RAM', async () => {
    const source = { ...row(), category: 'memoria-ram', name: 'Motherboard MSI PRO B650M-B DDR5 AM5' };
    const db = database([source]);
    expect(await readRecentOfferProducts({ category: 'memoria-ram' })).toEqual([]);
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it('devuelve un vacío real sin buscar referencias ni hacer una segunda consulta', async () => {
    const db = database([]);
    expect(await readRecentOfferProducts()).toEqual([]);
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it.each([{ seedError: true }, { productError: true }, { invalid: true }])('propaga la indisponibilidad en lugar de publicar un catálogo vacío: %j', async options => {
    database([row()], options);
    await expect(readRecentOfferProducts()).rejects.toThrow('RECENT_CATALOG_UNAVAILABLE');
  });

  it('ordena por la oferta observada y conserva las identidades de filas diferentes', async () => {
    const old = row('old-file'); const recent = row('recent-offer');
    old.updated_at = now; old.product_prices![0].last_updated = '2026-10-09T18:00:00Z';
    database([old, recent]);
    expect((await readRecentOfferProducts()).map(p => p.id)).toEqual(['recent-offer', 'old-file']);
  });
});
