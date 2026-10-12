// Controlplane de carga reanudable. No conecta cuentas ni activa la aplicación.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const layout = [['stores', 'id'], ['products', 'id'], ['product_prices', 'id'],
  ['summaries', 'product_id'], ['price_basis', 'product_id,kind,id'], ['search_projection', 'product_id']];
const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value);
const publicCounts = counts => ({ products: counts.products, product_prices: counts.product_prices,
  catalog_price_summaries: counts.summaries, stores: counts.stores });
export const LOAD_SCHEMA = `CREATE TABLE IF NOT EXISTS catalog_load_progress(
  sequence INTEGER PRIMARY KEY, plan TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS catalog_load_guard(id INTEGER PRIMARY KEY CHECK(id=1),
  expected TEXT NOT NULL, actual TEXT NOT NULL CHECK(expected=actual));`;

/** Copia estable de todas las filas. Los timestamps originales no se renuevan. */
export function prepareProductionLoad({ sqlite, directory, maxStatements = 40, maxBytes = 75000 }) {
  if (!Number.isInteger(maxStatements) || maxStatements < 2 || maxStatements > 40
    || !Number.isInteger(maxBytes) || maxBytes < 4096 || maxBytes > 75000) throw Error('LOAD_INVALID_LIMIT');
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  const db = new DatabaseSync(sqlite, { readOnly: true });
  const chunks = [], counts = {}, identity = createHash('sha256');
  let statements = [], bytes = 0;
  const flush = () => {
    if (!statements.length) return;
    const payload = canonical(statements), hash = digest(payload), sequence = chunks.length + 1;
    const file = String(sequence).padStart(6, '0') + '.json';
    writeFileSync(join(directory, file), payload, { flag: 'wx', mode: 0o600 });
    chunks.push({ sequence, hash, file, statements: statements.length, bytes }); statements = []; bytes = 0;
  };
  const add = statement => {
    const size = Buffer.byteLength(canonical(statement));
    if (size > maxBytes) throw Error('LOAD_ROW_TOO_LARGE');
    if (statements.length >= maxStatements || bytes + size > maxBytes) flush();
    statements.push(statement); bytes += size;
  };
  try {
    // Un readonly handle no impide que otro proceso escriba en WAL. Mantener
    // una transacción de lectura para que todas las tablas sean el mismo corte.
    db.exec('BEGIN');
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('LOAD_SOURCE_INTEGRITY');
    const snapshot = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()?.value;
    if (typeof snapshot !== 'string') throw Error('LOAD_SOURCE_SNAPSHOT_MISSING');
    for (const [table, order] of layout) {
      counts[table] = 0;
      for (const row of db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).iterate()) {
        counts[table]++;
        const keys = Object.keys(row);
        add({ sql: `INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`, params: keys.map(key => row[key]) });
        if (table === 'products') {
          const raw = JSON.parse(row.row_json);
          if (raw.id !== row.id || raw.category !== row.category) throw Error('LOAD_PRODUCT_IDENTITY_MISMATCH');
          identity.update(canonical([table, row.id, row.category, row.catalog_identity,
            row.catalog_name, row.catalog_document, row.catalog_component, raw.name,
            raw.canonical_product_key ?? null, raw.specs ?? null]) + '\n');
          if (row.catalog_component) add({ sql: 'INSERT INTO product_substrings(id,document) VALUES(?,?)', params: [row.id, row.catalog_document] });
        } else if (table === 'product_prices') {
          const raw = JSON.parse(row.row_json);
          if (raw.id !== row.id || raw.product_id !== row.product_id || raw.store_id !== row.store_id
            || raw.price !== row.price || raw.url !== row.url) throw Error('LOAD_OFFER_COLUMNS_MISMATCH');
          identity.update(canonical([table, row.id, row.product_id, row.store_id, row.url, raw.source_identity ?? null]) + '\n');
        } else if (table === 'stores') identity.update(canonical([table, row.id, row.row_json]) + '\n');
      }
      flush();
    }
    const fingerprint = identity.digest('hex');
    const catalog = { version: 1, fingerprint, counts: publicCounts(counts) };
    const marker = { ...JSON.parse(snapshot), counts: catalog.counts, catalog };
    const body = { version: 1, counts, catalog, snapshot: canonical(marker), chunks };
    const plan = { ...body, hash: digest(canonical(body)) };
    writeFileSync(join(directory, 'plan.json'), canonical(plan), { flag: 'wx', mode: 0o600 });
    db.exec('COMMIT');
    return plan;
  } finally { db.close(); }
}

export function readProductionLoad(directory) {
  const plan = JSON.parse(readFileSync(join(directory, 'plan.json'), 'utf8'));
  const { hash, ...body } = plan;
  if (plan.version !== 1 || hash !== digest(canonical(body))) throw Error('LOAD_PLAN_HASH_MISMATCH');
  return plan;
}

function readChunk(directory, chunk) {
  if (!/^\d{6}\.json$/.test(chunk.file)) throw Error('LOAD_CHUNK_PATH');
  const payload = readFileSync(join(directory, chunk.file), 'utf8');
  if (digest(payload) !== chunk.hash) throw Error('LOAD_CHUNK_HASH_MISMATCH');
  return JSON.parse(payload);
}

/** execute debe implementar un batch atómico, incluyendo el recibo de progreso. */
export async function loadNextChunk({ directory, plan, db, sequence }) {
  const chunk = plan.chunks[sequence - 1];
  if (!chunk || chunk.sequence !== sequence) throw Error('LOAD_SEQUENCE_INVALID');
  const already = await db.first('SELECT plan,hash FROM catalog_load_progress WHERE sequence=?', [sequence]);
  if (already) {
    if (already.plan !== plan.hash || already.hash !== chunk.hash) throw Error('LOAD_PROGRESS_CONFLICT');
    return { sequence, skipped: true, rowsWritten: 0 };
  }
  const prior = await db.first('SELECT sequence,plan FROM catalog_load_progress ORDER BY sequence DESC LIMIT 1');
  if (Number(prior?.sequence ?? 0) !== sequence - 1 || prior && prior.plan !== plan.hash) throw Error('LOAD_OUT_OF_ORDER');
  const statements = readChunk(directory, chunk);
  // Un CHECK aborta el batch si otro publicador avanzó o activó la base.
  statements.unshift({ sql: `INSERT OR REPLACE INTO catalog_load_guard VALUES(1,?,
    CASE WHEN COALESCE((SELECT sequence FROM catalog_load_progress ORDER BY sequence DESC LIMIT 1),0)=?
    AND NOT EXISTS(SELECT 1 FROM pilot_meta WHERE key IN('snapshot','production_catalog')) THEN ? ELSE 'conflict' END)`,
  params: [plan.hash, sequence - 1, plan.hash] });
  statements.push({ sql: 'INSERT INTO catalog_load_progress(sequence,plan,hash) VALUES(?,?,?)', params: [sequence, plan.hash, chunk.hash] });
  statements.push({ sql: 'DELETE FROM catalog_load_guard WHERE id=1', params: [] });
  const receipt = await db.execute(statements);
  return { sequence, skipped: false, ...receipt };
}

/** Única certificación de conteos globales. Nunca se llama desde la búsqueda. */
export async function activateProductionLoad({ plan, db }) {
  const progress = await db.first(`SELECT COUNT(*) AS count,MIN(plan) AS first_plan,MAX(plan) AS last_plan,
    MIN(sequence) AS first_sequence,MAX(sequence) AS last_sequence FROM catalog_load_progress`);
  if (Number(progress.count) !== plan.chunks.length || progress.first_plan !== plan.hash || progress.last_plan !== plan.hash
    || Number(progress.first_sequence) !== 1 || Number(progress.last_sequence) !== plan.chunks.length) throw Error('LOAD_INCOMPLETE');
  const actual = {};
  for (const [table] of layout) actual[table] = Number((await db.first(`SELECT COUNT(*) AS count FROM ${table}`)).count);
  if (canonical(actual) !== canonical(plan.counts)) throw Error('LOAD_COUNTS_MISMATCH');
  const receipts = await db.all('SELECT sequence,plan,hash FROM catalog_load_progress ORDER BY sequence');
  if (receipts.some((row, i) => row.sequence !== plan.chunks[i]?.sequence || row.plan !== plan.hash
    || row.hash !== plan.chunks[i]?.hash)) throw Error('LOAD_CHUNK_RECEIPTS_MISMATCH');
  const ftsCount = Number((await db.first('SELECT COUNT(*) AS count FROM product_substrings')).count);
  const components = Number((await db.first('SELECT COUNT(*) AS count FROM products WHERE catalog_component=1')).count);
  if (ftsCount !== components) throw Error('LOAD_FTS_COUNT_MISMATCH');
  const manifest = { ...plan.catalog, complete: true, countsVerified: true, loadPlan: plan.hash };
  // Una respuesta perdida después del commit se recupera verificando el corte,
  // no insertando de nuevo ni borrando un manifiesto que ya está completo.
  const active = await db.first(`SELECT
    (SELECT value FROM pilot_meta WHERE key='snapshot') AS snapshot,
    (SELECT value FROM pilot_meta WHERE key='production_catalog') AS production`);
  if (active?.snapshot != null || active?.production != null) {
    if (active.snapshot !== plan.snapshot || active.production !== canonical(manifest)) throw Error('LOAD_ACTIVATION_CONFLICT');
    return manifest;
  }
  // La activación queda atómica con los conteos finales. No cambia bindings ni rutas públicas.
  const guards = layout.map(([table]) => `(SELECT COUNT(*) FROM ${table})=?`).join(' AND ');
  await db.execute([
    { sql: `INSERT OR REPLACE INTO catalog_load_guard VALUES(1,'complete',CASE WHEN ${guards}
      AND (SELECT COUNT(*) FROM catalog_load_progress)=? THEN 'complete' ELSE 'conflict' END)`, params: [...layout.map(([table]) => plan.counts[table]), plan.chunks.length] },
    { sql: "INSERT INTO pilot_meta(key,value) VALUES('snapshot',?),('production_catalog',?)", params: [plan.snapshot, canonical(manifest)] },
    { sql: 'DELETE FROM catalog_load_guard WHERE id=1', params: [] },
  ]);
  return manifest;
}
