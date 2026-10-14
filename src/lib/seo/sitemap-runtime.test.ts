import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { registerMacCatalogBinding, MAC_CATALOG_BINDING_SYMBOL } from '@/lib/catalog/mac-catalog-binding';
import { GET as index } from '@/app/sitemap-index.xml/route';
import { GET as page } from '@/app/product-sitemap/[page]/route';
import { getD1CatalogReader } from '@/lib/catalog/catalog-backend';
const legacy = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseReadClient: legacy }));
const databases: DatabaseSync[] = [];
afterEach(() => {
  databases.splice(0).forEach(db => db.close());
  delete (globalThis as unknown as Record<PropertyKey, unknown>)[MAC_CATALOG_BINDING_SYMBOL];
  vi.unstubAllEnvs(); vi.clearAllMocks();
});
function fixture() {
  const db = new DatabaseSync(':memory:'); databases.push(db);
  db.exec(readFileSync(new URL('../../../scripts/pilots/cloudflare-catalog/schema.sql', import.meta.url), 'utf8'));
  const stamp = '2026-10-13T12:00:00.000Z';
  for (const store of ['mexx', 'venex']) db.prepare('INSERT INTO stores VALUES(?,?)').run(store, JSON.stringify({ id: store }));
  for (const [id, count] of [['agrupado-cpu', 2], ['agrupado-single', 1], ['individual', 2]] as const) {
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, 'procesadores', id, id, id, 1,
      Number(id.startsWith('agrupado-')), stamp, stamp, JSON.stringify({ canonical_product_key: id }));
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, 200000, 200000, 200000, count,
      'https://mexx.example/cpu', 0, JSON.stringify(['mexx', 'venex'].slice(0, count)), null, null, stamp, '{}');
    for (const store of ['mexx', 'venex'].slice(0, count)) {
      db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(`${id}-${store}`, id, store, 200000,
        `https://${store}.example/cpu`, JSON.stringify({ stock: 'in-stock', last_updated: stamp }));
    }
  }
  const fingerprint = 'a'.repeat(64);
  const counts = { products: 3, product_prices: 5, catalog_price_summaries: 3, stores: 2 };
  // Certificación sólo de esta fixture local, nunca un manifiesto productivo.
  for (const [key, value] of Object.entries({
    snapshot: { counts, catalog: { version: 1, fingerprint, counts }, clock_observations: { version: 1,
      validated: true, timestampPolicy: 'js-sql-ms-v1', offers: 5 } },
    production_catalog: { version: 1, fingerprint, counts, complete: true, countsVerified: true },
  })) db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run(key, JSON.stringify(value));
  registerMacCatalogBinding({ prepare: sql => ({ bind: (...values) => ({ all: async () => ({ success: true,
    results: db.prepare(sql).all(...values as never[]) as Record<string, unknown>[] }) }) }) });
  vi.stubEnv('CATALOG_READ_BACKEND', 'mac'); vi.stubEnv('CATALOG_FINGERPRINT', fingerprint);
  vi.stubEnv('CATALOG_PREPARED_VIEWS', '');
  return { db, stamp };
}
const getPage = (id = '0.xml') => page(new NextRequest(`https://www.comparador-hardware.com.ar/product-sitemap/${id}`), { params: Promise.resolve({ page: id }) });

describe('sitemap contra el backend Mac real con SQLite de fixture', () => {
  it('índice y página conservan universo indexable, URL y fecha del catálogo seleccionado', async () => {
    const { stamp } = fixture();
    await getD1CatalogReader();
    const response = await index(); expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('/product-sitemap/0.xml'); expect(body).not.toContain('/product-sitemap/1.xml');
    const products = await getPage(); expect(products.status).toBe(200);
    const xml = await products.text();
    expect(xml).toContain('/product/agrupado-cpu'); expect(xml).toContain(`<lastmod>${stamp}</lastmod>`);
    expect(xml).not.toContain('agrupado-single'); expect(xml).not.toContain('/product/individual');
    expect((await getPage('1.xml')).status).toBe(404);
    expect(legacy).not.toHaveBeenCalled();
  });
  it('backend elegido ausente devuelve 503 en ambos documentos sin consultar Supabase', async () => {
    vi.stubEnv('CATALOG_READ_BACKEND', 'mac'); vi.stubEnv('CATALOG_FINGERPRINT', 'a'.repeat(64));
    for (const response of [await index(), await getPage()]) {
      expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).not.toContain('<urlset');
    }
    expect(legacy).not.toHaveBeenCalled();
  });
});
