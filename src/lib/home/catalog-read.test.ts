import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerMacCatalogBinding, MAC_CATALOG_BINDING_SYMBOL } from '@/lib/catalog/mac-catalog-binding';
import { getD1CatalogReader } from '@/lib/catalog/catalog-backend';
import { listingReference } from '@/lib/scrapers/listing-reference';
import { GET as observed } from '@/app/api/home/observed-sections/route';
import { GET as sections } from '@/app/api/home/sections/route';
const clients = vi.hoisted(() => ({ service: vi.fn(), read: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: clients.service, getServerSupabaseReadClient: clients.read }));
const databases: DatabaseSync[] = [];
const now = Date.parse('2026-10-14T03:00:00Z');
afterEach(() => {
  databases.splice(0).forEach(db => db.close());
  delete (globalThis as unknown as Record<PropertyKey, unknown>)[MAC_CATALOG_BINDING_SYMBOL];
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks();
});
async function fixture(includeRejected = false) {
  vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv('CATALOG_READ_BACKEND', 'mac'); vi.stubEnv('CATALOG_FINGERPRINT', 'a'.repeat(64));
  vi.stubEnv('CATALOG_PREPARED_VIEWS', ''); vi.stubEnv('CATALOG_RESPONSE_CACHE', '');
  clients.service.mockReturnValue(null); clients.read.mockReturnValue(null);
  const db = new DatabaseSync(':memory:'); databases.push(db);
  db.exec(readFileSync(new URL('../../../scripts/pilots/cloudflare-catalog/schema.sql', import.meta.url), 'utf8'));
  const queries: string[] = [], stamp = new Date(now - 30 * 60_000).toISOString();
  for (const store of ['mexx', 'venex']) db.prepare('INSERT INTO stores VALUES(?,?)').run(store, JSON.stringify({ id: store, name: store }));
  const scenarios = [['agrupado-current', stamp, 'in-stock', 'AMD Ryzen 5 5600'],
    ['agrupado-expired', new Date(now - 4 * 3_600_000).toISOString(), 'in-stock', 'AMD Ryzen 5 5600'],
    ['agrupado-unknown', stamp, 'unknown', 'AMD Ryzen 5 5600'],
    ['agrupado-conflict', stamp, 'in-stock', 'AMD Ryzen 7 5700X']] as const;
  const selected = includeRejected ? scenarios : scenarios.slice(0, 1);
  for (const [id, date, stock, sourceTitle] of selected) {
    const name = 'AMD Ryzen 5 5600', category = 'procesadores';
    // Stock unknown puede conservar referencia histórica, pero no entra a últimas ofertas.
    const eligible = sourceTitle === name;
    const row = { id, name, category, brand: 'AMD', model: 'Ryzen 5 5600', description: null, image: null,
      normalized_title: name, canonical_product_key: id, family_key: null, variant_key: null,
      refresh_priority: null, last_scraped_at: date, last_normalized_at: null, specs: {}, lowest_price: eligible ? 200000 : 0,
      highest_price: eligible ? 210000 : 0, average_price: eligible ? 205000 : 0, created_at: date, updated_at: date };
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, category, id, name, name, 1, 1, date, date, JSON.stringify(row));
    db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(id, name);
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, eligible ? 200000 : 0, eligible ? 210000 : 0, eligible ? 205000 : 0, eligible ? 2 : 0,
      'https://www.mexx.com.ar/producto/ryzen-5600', 0, JSON.stringify(['mexx', 'venex']), null, null, date, '{}');
    for (const [store, price] of [['mexx', 200000], ['venex', 210000]] as const) {
      const url = `https://www.${store}.com.ar/producto/ryzen-5600`;
      const offer = { id: `${id}-${store}`, product_id: id, store_id: store, price, original_price: null, stock, url,
        last_updated: date, installment_count: null, installment_amount: null, source_identity: { title: sourceTitle, listingRef: listingReference(store, url)! }, price_condition: 'special' };
      db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer.id, id, store, price, url, JSON.stringify(offer));
      for (const kind of eligible ? ['historical', 'current'] : []) db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id, kind, offer.id, store, price, stock, url, date);
    }
  }
  const counts = { products: selected.length, product_prices: selected.length * 2, catalog_price_summaries: selected.length, stores: 2 }, fingerprint = 'a'.repeat(64);
  for (const [key, value] of Object.entries({ snapshot: { counts, catalog: { version: 1, fingerprint, counts },
    clock_observations: { version: 1, validated: true, timestampPolicy: 'js-sql-ms-v1', offers: selected.length * 2 } },
    production_catalog: { version: 1, fingerprint, counts, complete: true, countsVerified: true } })) {
    db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run(key, JSON.stringify(value));
  }
  const { rebuildProjection } = await import('../../../scripts/pilots/cloudflare-catalog/projection.mjs');
  rebuildProjection(db, { now, generation: 'home-fixture' });
  registerMacCatalogBinding({ prepare: sql => ({ bind: (...values) => ({ all: async () => {
    queries.push(sql); return { success: true, results: db.prepare(sql).all(...values as never[]) as Record<string, unknown>[] };
  } }) }) });
  return { db, stamp, queries };
}
const request = () => new Request('https://www.comparador-hardware.com.ar/api/home/observed-sections');

describe('portada y detalle consultan la misma generación Mac', () => {
  it('conserva la tupla oferta/precio/fecha entre portada y detalle', async () => {
    const { stamp, queries } = await fixture();
    const response = await observed(request()); expect(response.status).toBe(200);
    const payload = await response.json(); expect(payload.collectedAt).toBe(new Date(now).toISOString());
    expect(payload.latestOfferProducts.map((product: { id: string }) => product.id)).toEqual(['agrupado-current']);
    const reader = await getD1CatalogReader(); const detail = await reader!.readProductDetailById('agrupado-current');
    const offer = payload.latestOfferProducts[0].prices[0];
    expect(detail!.prices.find(price => price.storeId === offer.storeId && price.url === offer.url)).toMatchObject({ price: offer.price, lastUpdated: new Date(stamp) });
    expect(offer.lastUpdated).toBe(stamp); expect(payload.priceDropProducts).toEqual([]);
    expect(payload.priceDropFallbackUsed).toBe(true);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(queries.length).toBeLessThanOrEqual(10);
    expect(clients.service).not.toHaveBeenCalled(); expect(clients.read).not.toHaveBeenCalled();
  });
  it('una generación rota no se representa como selección vacía ni activa otro backend', async () => {
    const { db } = await fixture(); db.exec('DELETE FROM pilot_meta');
    for (const response of [await observed(request()), await sections()]) {
      expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).not.toContain('latestOfferProducts');
    }
    expect(clients.service).not.toHaveBeenCalled(); expect(clients.read).not.toHaveBeenCalled();
  });
  it('aplica stock, identidad y tres horas también con ofertas candidatas rechazadas en SQL', async () => {
    await fixture(true);
    const response = await observed(request()); expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.latestOfferProducts.map((product: { id: string }) => product.id)).toEqual(['agrupado-current']);
    const legacyResponse = await sections(); expect(legacyResponse.status).toBe(200);
    const data = await legacyResponse.json();
    expect(data.latestOfferProducts.map((product: { id: string }) => product.id)).toEqual(['agrupado-current']);
    expect(legacyResponse.headers.get('cache-control')).toBe('no-store');
    expect(clients.service).not.toHaveBeenCalled(); expect(clients.read).not.toHaveBeenCalled();
  });
  it('una consulta posterior renueva collectedAt y retira la oferta que venció, sin renovar su observación', async () => {
    const { stamp } = await fixture();
    const initial = await (await observed(request())).json();
    expect(initial.latestOfferProducts[0].prices[0].lastUpdated).toBe(stamp);
    vi.setSystemTime(now + 151 * 60_000);
    const response = await observed(request()); expect(response.status).toBe(200);
    const later = await response.json();
    expect(later.collectedAt).toBe(new Date(now + 151 * 60_000).toISOString());
    expect(later.latestOfferProducts).toEqual([]);
    expect(initial.latestOfferProducts[0].prices[0].lastUpdated).toBe(stamp);
  });
  it('el modo Supabase conserva el corte observado y rechaza más de 75 minutos', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv('CATALOG_READ_BACKEND', '');
    vi.stubEnv('SUPABASE_URL', 'https://zyiyziubpcpgoqlkcrie.supabase.co'); vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-only');
    const snapshot = { kind: 'public-home', data: { collectedAt: new Date(now - 60_000).toISOString(),
      latestOfferProducts: [], priceDropProducts: [], priceDropFallbackUsed: false } };
    const fetcher = vi.fn(async () => Response.json([{ payload: snapshot }])); vi.stubGlobal('fetch', fetcher);
    const response = await observed(request()); expect(response.status).toBe(200);
    expect((await response.json()).collectedAt).toBe(snapshot.data.collectedAt);
    vi.setSystemTime(now + 75 * 60_000);
    const expired = await observed(request()); expect(expired.status).toBe(503);
    expect(await expired.json()).toMatchObject({ reason: 'snapshot-expired' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
