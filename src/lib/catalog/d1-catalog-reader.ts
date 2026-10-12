import { searchCatalog, type CatalogSqlReader } from '../../../scripts/pilots/cloudflare-catalog/engine.mjs';
import { isHardwareCategory } from './hardware-categories';
import { mapDbGuideProduct } from '@/lib/persistence/product-read-mapper';
import { canRedirectToCanonicalProduct, mergeCanonicalDetailOffers, shareExactProductVariant } from '@/lib/persistence/product-detail-offers';
import { prepareCatalogQuery } from '@/lib/persistence/product-read-helpers';
import type { DbProductRow, ProductPageResult, ReadProductsPageParams } from '@/lib/persistence/product-read-types';
import { computeCurrentStorePriceStats } from '@/lib/price-utils';
import type { Product } from '@/lib/types';
import { createD1PageCache, type D1PageCacheStorage } from './d1-page-cache';
import { CATALOG_PREPARED_POLICY } from './prepared-policy.generated';
import { catalogReadDeadline, checkCatalogReadClock } from './catalog-read-clock';
import { catalogStorePolicyStamp } from './catalog-store-policy';
import { consumePreparedProduct, decodePreparedProductTransport,
  PREPARED_PRODUCT_MAX_TRANSPORT_BYTES } from './prepared-product';
import { preparedProductVerifier } from './prepared-public-key';

export type { CatalogSqlReader };
const tables = ['catalog_price_summaries', 'product_prices', 'products', 'stores'] as const;
export type ProductionCatalogCounts = Record<typeof tables[number], number>;
type CatalogIdentity = { version: 1; fingerprint: string; counts: ProductionCatalogCounts };
type Markers = { snapshot: string; production: string };
const failure = (code: string): never => { throw new Error(code); };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function counts(value: unknown): value is ProductionCatalogCounts {
  return object(value) && Object.keys(value).length === tables.length
    && tables.every(table => Number.isSafeInteger(value[table]) && Number(value[table]) > 0);
}
function readSnapshot(raw: string): CatalogIdentity {
  const value: unknown = JSON.parse(raw);
  if (!object(value) || !counts(value.counts) || !object(value.catalog) || value.catalog.version !== 1
    || typeof value.catalog.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.catalog.fingerprint)
    || !counts(value.catalog.counts) || tables.some(table => object(value.catalog)
      && (value.catalog.counts as ProductionCatalogCounts)[table] !== (value.counts as ProductionCatalogCounts)[table]))
    return failure('CATALOG_SNAPSHOT_INVALID');
  return value.catalog as CatalogIdentity;
}

async function readMarkers(db: CatalogSqlReader): Promise<Markers> {
  // latestFirst garantiza primaria cuando el adapter usa una sesión con réplicas.
  const row = await (db.latestFirst?.bind(db) ?? db.first.bind(db))(`SELECT
    (SELECT value FROM pilot_meta WHERE key='snapshot') AS snapshot,
    (SELECT value FROM pilot_meta WHERE key='production_catalog') AS production`);
  if (typeof row?.snapshot !== 'string' || typeof row.production !== 'string'
    || row.snapshot.length > 16384 || row.production.length > 4096) return failure('CATALOG_PRODUCTION_NOT_READY');
  return { snapshot: row.snapshot, production: row.production };
}

function parseProduct(value: unknown): DbProductRow {
  const row: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!object(row) || typeof row.id !== 'string' || typeof row.name !== 'string' || !row.name
    || typeof row.category !== 'string' || !isHardwareCategory(row.category)
    || row.product_prices !== null && !Array.isArray(row.product_prices)
    || !['lowest_price', 'highest_price', 'average_price'].every(key => Number.isFinite(Number(row[key])) && Number(row[key]) >= 0)
    || !['created_at', 'updated_at'].every(key => typeof row[key] === 'string' && Number.isFinite(Date.parse(String(row[key])))))
    return failure('CATALOG_PRODUCT_INVALID');
  return row as unknown as DbProductRow;
}

/** Activación explícita e inyectada. No registra backend ni escribe manifiestos. */
export async function createD1CatalogReader(db: CatalogSqlReader,
  options: { expectedCatalogFingerprint: string; now?: () => number; pageCache?: D1PageCacheStorage | null; prepared?: { publicKey: string } }) {
  if (!/^[a-f0-9]{64}$/.test(options.expectedCatalogFingerprint)) failure('CATALOG_EXPECTED_FINGERPRINT_REQUIRED');
  const now = options.now ?? Date.now;
  const storePolicy = catalogStorePolicyStamp();
  let preparedKey: CryptoKey | undefined, preparedKeyId: string | undefined;
  if (options.prepared) {
    const encoded = options.prepared.publicKey;
    if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded) || !/^[a-f0-9]{64}$/.test(CATALOG_PREPARED_POLICY)
      || /^0+$/.test(CATALOG_PREPARED_POLICY)) failure('CATALOG_PREPARED_CONFIGURATION_INVALID');
    const verifier = await preparedProductVerifier(encoded);
    preparedKeyId = verifier.keyId;
    preparedKey = verifier.key;
  }
  // Los conteos reales se verifican en el controlplane antes de certificar el
  // manifiesto. Ni la factory ni un request escanean tablas grandes.
  const currentGeneration = async () => {
    const current = await readMarkers(db), catalog = readSnapshot(current.snapshot);
    const manifest: unknown = JSON.parse(current.production);
    if (!object(manifest) || manifest.version !== 1 || manifest.complete !== true || manifest.countsVerified !== true
      || manifest.fingerprint !== options.expectedCatalogFingerprint || manifest.fingerprint !== catalog.fingerprint
      || !counts(manifest.counts)
      || tables.some(table => (manifest.counts as ProductionCatalogCounts)[table] !== catalog.counts[table]))
      failure('CATALOG_PRODUCTION_MANIFEST_INVALID');
    if (preparedKey) {
      const snapshot: unknown = JSON.parse(current.snapshot);
      const prepared = object(snapshot) ? snapshot.prepared_views : null;
      if (!object(prepared) || prepared.version !== 1 || prepared.storageVersion !== 2 || prepared.ready !== true
        || prepared.policy !== CATALOG_PREPARED_POLICY || prepared.keyId !== preparedKeyId
        || prepared.count !== catalog.counts.products) failure('CATALOG_PREPARED_MANIFEST_INVALID');
    }
    if (catalogStorePolicyStamp() !== storePolicy) failure('CATALOG_STORE_POLICY_CHANGED');
    return current;
  };
  const assertGeneration = async (before: Markers) => {
    const after = await currentGeneration();
    if (after.snapshot !== before.snapshot || after.production !== before.production)
      failure('CATALOG_PRODUCTION_GENERATION_CHANGED');
  };
  // Captura primaria para el primer uso, consumida una única vez. Un lector
  // reutilizado jamás mantiene un snapshot de precio permanente.
  let initial: Markers | null = await currentGeneration();
  const begin = async () => { const first = initial; initial = null; return first ?? currentGeneration(); };
  const cache = options.pageCache ? createD1PageCache(db, options.pageCache, options.expectedCatalogFingerprint, now) : null;

  async function readRow(id: string): Promise<Product | null> {
    if (!id || id.length > 256) return failure('CATALOG_PRODUCT_ID_INVALID');
    const row = await db.first(`SELECT p.id,p.category,p.row_json,
      (SELECT json_group_array(json(o.row_json)) FROM (SELECT row_json FROM product_prices
        WHERE product_id=p.id ORDER BY price,store_id,url) o) AS offers_json
      FROM products p WHERE p.id=?`, [id]);
    if (!row) return null;
    return mapStored(row);
  }
  function mapStored(row: Record<string, unknown>): Product {
    const raw = JSON.parse(String(row.row_json));
    if (raw.id !== row.id || raw.category !== row.category) failure('CATALOG_PRODUCT_IDENTITY_MISMATCH');
    return mapDbGuideProduct(parseProduct({ ...raw, product_prices: JSON.parse(String(row.offers_json)) }));
  }
  async function related(product: Product): Promise<Product[]> {
    const rows = await db.all(`SELECT p.id,p.category,p.row_json,
      (SELECT json_group_array(json(o.row_json)) FROM (SELECT row_json FROM product_prices
        WHERE product_id=p.id ORDER BY price,store_id,url) o) AS offers_json
      FROM products p WHERE category=? AND catalog_identity=(SELECT catalog_identity FROM products WHERE id=?)
      ORDER BY id LIMIT 201`, [product.category, product.id]);
    if (rows.length > 200) return failure('CATALOG_DETAIL_RELATED_LIMIT');
    const result: Product[] = [];
    for (const row of rows) {
      const candidate = mapStored(row);
      if (shareExactProductVariant(product, candidate)) result.push(candidate);
    }
    return result;
  }
  function canonicalProductId(product: Product, candidates: Product[]): string | null {
    return candidates.filter(candidate => candidate.id.startsWith('agrupado-'))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))
      .find(candidate => canRedirectToCanonicalProduct(product, candidate))?.id ?? null;
  }
  return {
    async readProductsPage(params: ReadProductsPageParams): Promise<ProductPageResult> {
      const before = await begin();
      const input = { p_query: prepareCatalogQuery(params.query ?? '', params.category),
        p_category: params.category ?? null, p_stores: [...new Set([...params.storeIds ?? []]
          .map(id => id.trim().toLowerCase()).filter(Boolean))].sort(),
        p_min_price: params.minPrice ?? (params.onlyCurrentOffers ? 0 : null), p_max_price: params.maxPrice ?? null,
        p_sort: params.sortBy ?? 'relevance', p_page: params.page, p_page_size: params.pageSize };
      const plan = cache ? await cache.plan(input, before.snapshot, params.onlyCurrentOffers === true) : null;
      const hit = plan ? await cache!.read(plan) : null;
      if (hit) {
        await assertGeneration(before);
        cache!.checkClock(plan!, hit.certificate, true);
        return hit.page;
      }
      const certificate = plan ? await cache!.certificate(plan) : null;
      if (plan) cache!.checkClock(plan, certificate);
      const decisionClock = certificate ? plan!.clock : now();
      const deadline = certificate?.validUntil ?? await catalogReadDeadline(db, before.snapshot, decisionClock, input.p_min_price === null && input.p_max_price === null);
      const checkClock = () => checkCatalogReadClock(now(), decisionClock, deadline);
      checkClock();
      const result = await searchCatalog(db, input,
        // Sin certificado el guard pudo demorarse o fallar tras una transición.
        // La degradación debe leer el reloj actual, como una lectura sin caché.
        { now: decisionClock, snapshot: before.snapshot, preferCurrentRepresentative: true, preparedViews: !!preparedKey });
      checkClock();
      const products = await Promise.all(result.products.map(async row => {
        const raw = parseProduct(row);
        let prepared;
        if (preparedKey) {
          const envelope = result.preparedRecords?.[raw.id];
          if (typeof envelope !== 'string' || envelope.length > PREPARED_PRODUCT_MAX_TRANSPORT_BYTES) return failure('CATALOG_PREPARED_RECORD_REQUIRED');
          prepared = await consumePreparedProduct(raw, await decodePreparedProductTransport(raw.id, CATALOG_PREPARED_POLICY, envelope),
            { publicKey: preparedKey, policy: CATALOG_PREPARED_POLICY, now });
        }
        const product = prepared?.product ?? mapDbGuideProduct(raw);
        // Rechazar toda la página ante una selección certificada que el mapper
        // ya no admite. No ocultar filas manteniendo conteos/filtros incorrectos.
        if (params.category && product.category !== params.category) failure('CATALOG_PAGE_EVIDENCE_MISMATCH');
        if (product.lowestPrice !== Number(row.lowest_price) || product.highestPrice !== Number(row.highest_price)
          || product.averagePrice !== Number(row.average_price)) failure('CATALOG_PAGE_EVIDENCE_MISMATCH');
        if (params.onlyCurrentOffers || params.minPrice !== undefined || params.maxPrice !== undefined) {
          const current = prepared?.current ?? (() => {
            const stats = computeCurrentStorePriceStats(product.prices, product, now());
            return { count: stats.comparablePrices.length, ...stats };
          })();
          if (!current.count || current.lowest !== Number(row.lowest_price)
            || current.highest !== Number(row.highest_price) || current.average !== Number(row.average_price))
            failure('CATALOG_PAGE_EVIDENCE_MISMATCH');
        }
        return { ...product, lowestPrice: Number(row.lowest_price), highestPrice: Number(row.highest_price), averagePrice: Number(row.average_price) };
      }));
      await assertGeneration(before);
      checkClock();
      if (plan) cache!.checkClock(plan, certificate);
      // El transporte preparado no sale al navegador ni entra en la caché pública.
      const { preparedRecords: _preparedRecords, ...plainResult } = result;
      void _preparedRecords;
      const page = { ...plainResult, products };
      if (plan && certificate) {
        await cache!.write(plan, certificate, page);
        await assertGeneration(before);
        checkClock();
        cache!.checkClock(plan, certificate);
      }
      return page;
    },
    async readProductDetailById(id: string): Promise<Product | null> {
      const before = await begin();
      const product = await readRow(id);
      const result = product?.canonicalProductKey ? mergeCanonicalDetailOffers(product, await related(product)) : product;
      await assertGeneration(before);
      return result;
    },
    async readCanonicalProductIdForProductId(id: string): Promise<string | null> {
      const before = await begin();
      const current = await readRow(id);
      // Resolver desde la fila de este corte evita hidratar el detalle y sus
      // relaciones varias veces antes de decidir una redirección.
      const canonicalId = current?.canonicalProductKey
        ? canonicalProductId(current, await related(current)) : null;
      await assertGeneration(before);
      return canonicalId;
    },
    async readCanonicalProductIdByKey(key: string, product: Product): Promise<string | null> {
      const before = await begin();
      if (product.canonicalProductKey !== key) return failure('CATALOG_CANONICAL_KEY_MISMATCH');
      const current = await readRow(product.id);
      if (!current) { await assertGeneration(before); return null; }
      if (current.canonicalProductKey !== key) return failure('CATALOG_CANONICAL_KEY_MISMATCH');
      const candidates = await related(current);
      const id = canonicalProductId(current, candidates);
      await assertGeneration(before);
      return id;
    },
  };
}
