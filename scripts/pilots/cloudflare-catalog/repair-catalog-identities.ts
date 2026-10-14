// Reparación de identidad en copia nueva; no observa ofertas ni activa el catálogo.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { buildProductIdentityKey, buildProductVariantKey } from '@/lib/product-identity';
import { resolveHardwareCategoryForProduct } from '@/lib/catalog/hardware-categories';
import { catalogIdentityText, catalogSearchText } from './catalog-matchers.mjs';

export const CATALOG_IDENTITY_REPAIR_ALLOWLIST = [
  { id: 'maxtecno-api-879981', name: 'Memoria Micro SD 256 Gb Sandisk Extreme con adaptador', category: 'almacenamiento' },
  { id: 'maxtecno-api-901942', name: 'MB ASUS AM5 PRIME B850M-A DDR5 BOX', category: 'motherboards' },
  { id: 'maxtecno-api-899125', name: 'CELULAR SAMSUNG GALAXY S26 ULTRA 12/512GB 6.9" 120 Hz D AMOLED NEGRO', category: 'perifericos' },
  { id: 'dinobyte-api-3812429', name: 'Celular Samsung Galaxy S26 Ultra 12GB+512GB', category: 'perifericos' },
  { id: 'dinobyte-api-3813055', name: 'MicroSD Sandisk Ultra Lite 256GB C10-U1 Con adaptador', category: 'almacenamiento' },
  { id: 'dinobyte-api-2805048', name: 'Pendrive Kingston DTX 64GB Blanco (3.2)', category: 'almacenamiento' },
  { id: 'dinobyte-api-2903292', name: 'Pendrive Kingston DTXS 64GB (3.2)', category: 'almacenamiento' },
  { id: 'cg-21831', name: 'Gabinete XYZ Airone 60 Mesh Black 3x140mm ARGB Fans 3x120 ARGB Fans USB-C Vidrio Templado', category: 'gabinetes' },
  { id: 'cg-21832', name: 'Gabinete XYZ Airone 60 Mesh White 3x140mm ARGB Fans 3x120 ARGB Fans USB-C Vidrio Templado', category: 'gabinetes' },
  { id: 'cg-22251', name: 'Cooler CPU ASUS PRIME LC 360 ARGB LCD', category: 'refrigeracion' },
  { id: 'cg-22252', name: 'Cooler CPU ASUS PRIME LC 360 ARGB LCD White', category: 'refrigeracion' },
  { id: 'cg-21882', name: 'Placa de Video Gigabyte AORUS GeForce RTX 5070 Ti 16GB GDDR7 INFINITY', category: 'tarjetas-graficas' },
  { id: 'cg-20207', name: 'Placa de Video Gigabyte AORUS GeForce RTX 5070 Ti 16GB GDDR7 MASTER', category: 'tarjetas-graficas' },
] as const;

type StoredRow = Record<string, unknown> & { id: string; category: string; row_json: string };
type Projection = (db: DatabaseSync, options: { now: number; generation: string; affectedProductIds: string[] }) => unknown;
const immutableTables = ['product_prices', 'price_basis', 'summaries', 'stores'] as const;
function digestTable(db: DatabaseSync, table: string): string {
  const hash = createHash('sha256');
  const rows = db.prepare(`SELECT * FROM ${table}`).all().map(row => JSON.stringify({ ...row })).sort();
  for (const row of rows) hash.update(row + '\n');
  return hash.digest('hex');
}
function hashes(db: DatabaseSync) {
  return Object.fromEntries(immutableTables.map(table => [table, digestTable(db, table)]));
}
function untouchedProductsHash(db: DatabaseSync, ids: string[]) {
  const hash = createHash('sha256');
  for (const row of db.prepare('SELECT * FROM products WHERE id NOT IN(SELECT value FROM json_each(?)) ORDER BY id').all(JSON.stringify(ids)))
    hash.update(JSON.stringify({ ...row }) + '\n');
  return hash.digest('hex');
}
function projectionRows(db: DatabaseSync) {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='search_projection'").get()
    ? db.prepare('SELECT * FROM search_projection ORDER BY product_id').all() : [];
}
function plan(db: DatabaseSync, ids: string[]) {
  return ids.map(id => {
    const expected = CATALOG_IDENTITY_REPAIR_ALLOWLIST.find(row => row.id === id)!;
    const stored = db.prepare('SELECT * FROM products WHERE id=?').get(id) as StoredRow | undefined;
    if (!stored) throw new Error('CATALOG_IDENTITY_REPAIR_MISSING_' + id);
    const raw = JSON.parse(stored.row_json);
    if (raw.id !== id || raw.category !== stored.category || raw.name !== expected.name)
      throw new Error('CATALOG_IDENTITY_REPAIR_SOURCE_MISMATCH_' + id);
    const category = resolveHardwareCategoryForProduct(raw.name, raw.category);
    if (category !== expected.category) throw new Error('CATALOG_IDENTITY_REPAIR_CONTRACT_' + id);
    const next = { ...raw, category,
      canonical_product_key: buildProductIdentityKey(category, raw.name),
      variant_key: buildProductVariantKey(category, raw.name) };
    // catalog_identity es título literal, no la clave semántica del producto.
    const after = { ...stored, category, catalog_identity: catalogIdentityText(raw.name),
      catalog_name: catalogSearchText(raw.name),
      catalog_document: catalogSearchText([next.name, next.brand, next.model, next.normalized_title,
        next.family_key, next.variant_key, next.canonical_product_key].map(value => value ?? '').join(' ')),
      grouped_identity: Number(id.startsWith('agrupado-')), row_json: JSON.stringify(next) };
    return { id, before: { ...stored }, after,
      ftsBefore: db.prepare('SELECT id,document FROM product_substrings WHERE id=? ORDER BY rowid').all(id).map(row => ({ ...row })),
      ftsAfter: stored.catalog_component === 1 ? [{ id, document: after.catalog_document }] : [] };
  });
}

/** Fuente sólo lectura y destino reservado nuevo. La copia resultante requiere
 * certifyProductEvidence y reconstrucción de vistas preparadas antes de servirla.
 * Esta unidad no cambia asociaciones, precios, stock, observaciones o estadísticas.
 */
export function repairCatalogIdentities(source: string, target: string, options: {
  now: number; generation: string; rebuildProjection: Projection; productIds?: string[];
}) {
  source = resolve(source); target = resolve(target);
  if (source === target || existsSync(target)) throw new Error('CATALOG_IDENTITY_REPAIR_NEW_COPY_REQUIRED');
  const ids = options.productIds ?? CATALOG_IDENTITY_REPAIR_ALLOWLIST.map(row => row.id);
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !CATALOG_IDENTITY_REPAIR_ALLOWLIST.some(row => row.id === id)))
    throw new Error('CATALOG_IDENTITY_REPAIR_ALLOWLIST');
  if (!Number.isSafeInteger(options.now) || !options.generation || typeof options.rebuildProjection !== 'function')
    throw new Error('CATALOG_IDENTITY_REPAIR_OPTIONS');
  const original = new DatabaseSync(source, { readOnly: true });
  let beforeHashes: Record<string, string>, productsHash: string;
  try {
    original.exec('BEGIN');
    plan(original, ids); beforeHashes = hashes(original); productsHash = digestTable(original, 'products');
    original.exec('COMMIT');
    // wx reserva un archivo propio: jamás reemplazar un destino preexistente.
    closeSync(openSync(target, 'wx', 0o600));
    original.prepare('VACUUM INTO ?').run(target);
  } finally { original.close(); }
  const db = new DatabaseSync(target);
  try {
    // Ningún fallo posterior deja una copia con activación o QC heredadas.
    db.prepare("DELETE FROM pilot_meta WHERE key='production_catalog'").run();
    const snapshot = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
    if (typeof snapshot?.value !== 'string') throw new Error('CATALOG_IDENTITY_REPAIR_SNAPSHOT');
    const meta = JSON.parse(snapshot.value);
    delete meta.prepared_views; delete meta.clock_observations;
    db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify(meta));
    db.exec('DROP TABLE IF EXISTS catalog_prepared_products');
    if (!isDeepStrictEqual(hashes(db), beforeHashes!) || digestTable(db, 'products') !== productsHash!)
      throw new Error('CATALOG_IDENTITY_REPAIR_SOURCE_CHANGED_DURING_COPY');
    const untouchedHash = untouchedProductsHash(db, ids), beforeProjection = projectionRows(db);
    const rows = plan(db, ids), changed = rows.filter(row => !isDeepStrictEqual(row.before, row.after)
      || !isDeepStrictEqual(row.ftsBefore, row.ftsAfter));
    db.exec('BEGIN IMMEDIATE');
    try {
      const update = db.prepare(`UPDATE products SET category=?,catalog_identity=?,catalog_name=?,
        catalog_document=?,grouped_identity=?,row_json=? WHERE id=?`);
      for (const row of changed) {
        const next = row.after;
        update.run(next.category, String(next.catalog_identity), String(next.catalog_name),
          String(next.catalog_document), Number(next.grouped_identity), next.row_json, row.id);
        db.prepare('DELETE FROM product_substrings WHERE id=?').run(row.id);
        for (const fts of row.ftsAfter) db.prepare('INSERT INTO product_substrings(id,document) VALUES(?,?)').run(fts.id, fts.document);
      }
      options.rebuildProjection(db, { now: options.now, generation: options.generation, affectedProductIds: changed.map(row => row.id) });
      const afterHashes = hashes(db);
      if (!isDeepStrictEqual(beforeHashes!, afterHashes) || untouchedProductsHash(db, ids) !== untouchedHash)
        throw new Error('CATALOG_IDENTITY_REPAIR_IMMUTABLE_TABLE_CHANGED');
      for (const row of rows) {
        const actual = db.prepare('SELECT * FROM products WHERE id=?').get(row.id);
        if (!isDeepStrictEqual({ ...actual }, row.after)) throw new Error('CATALOG_IDENTITY_REPAIR_PRODUCT_CHANGED');
        const fts = db.prepare('SELECT id,document FROM product_substrings WHERE id=? ORDER BY rowid').all(row.id);
        if (!isDeepStrictEqual(fts.map(value => ({ ...value })), row.ftsAfter)) throw new Error('CATALOG_IDENTITY_REPAIR_FTS_CHANGED');
      }
      const oldProjection = new Map(beforeProjection.map(row => [String(row.product_id), { ...row }]));
      const afterProjection = projectionRows(db);
      const nextProjection = new Map(afterProjection.map(row => [String(row.product_id), { ...row }]));
      const projectionChanges = [...new Set([...oldProjection.keys(), ...nextProjection.keys()])].sort()
        .filter(id => !isDeepStrictEqual(oldProjection.get(id), nextProjection.get(id)))
        .map(id => ({ id, before: oldProjection.get(id) ?? null, after: nextProjection.get(id) ?? null }));
      db.exec('COMMIT');
      return { version: 1, source, target, stagedAt: new Date(options.now).toISOString(),
        requestedIds: ids, changedIds: changed.map(row => row.id), rows, projectionChanges,
        beforeHashes: beforeHashes!, afterHashes, localOnly: true, productionActivated: false,
        requiresRecertification: true, requiresPreparedViewRebuild: true };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  } finally { db.close(); }
}
