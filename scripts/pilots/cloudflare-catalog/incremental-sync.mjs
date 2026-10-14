// Sincronización offline: nunca abre una cuenta ni una base D1 remota.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { verifySnapshot } from './snapshot-verify.mjs';
import { chargeDailyBudget } from './daily-budget.mjs';

const TABLES = ['stores', 'products', 'product_prices', 'catalog_price_summaries'];
const KEYS = { stores: 'id', products: 'id', product_prices: 'id', catalog_price_summaries: 'product_id' };
const forbidden = /^(access_token|refresh_token|password|secret|email|user_id|auth_uid)$/i;
export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const rowHash = row => createHash('sha256').update(canonicalJson(row)).digest('hex');
function metadata(manifest) {
  return { counts: Object.fromEntries(manifest.tables.map(t => [t.table, t.count])), hashes: Object.fromEntries(manifest.tables.map(t => [t.table, t.sha256])) };
}
export const snapshotGeneration = manifest => rowHash(metadata(manifest));
const iso = value => value == null ? null : new Date(value).toISOString();
const text = value => value == null ? null : String(value);
function requireId(value, label) { if (typeof value !== 'string' || !value.length) throw new Error('INVALID_ID:' + label); }
function publicFields(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key)) throw new Error('NONPUBLIC_FIELD:' + key);
    if (child && typeof child === 'object') publicFields(child);
  }
}
function number(value, label) { if (!Number.isFinite(Number(value))) throw new Error('INVALID_NUMBER:' + label); }
function date(value, label) { if (value != null && !Number.isFinite(Date.parse(value))) throw new Error('INVALID_DATE:' + label); }
export async function loadIncrementalSnapshot(source) {
  const manifest = await verifySnapshot(source), rows = {};
  for (const table of TABLES) {
    const map = rows[table] = new Map();
    for await (const line of createInterface({ input: createReadStream(join(source, table + '.jsonl')), crlfDelay: Infinity })) {
      if (!line) continue;
      const row = JSON.parse(line); publicFields(row);
      requireId(row[KEYS[table]], table);
      if (map.has(row[KEYS[table]])) throw new Error('DUPLICATE_ID:' + table + ':' + row[KEYS[table]]);
      if (table === 'products') {
        for (const key of ['category', 'catalog_identity', 'catalog_name', 'catalog_document']) if (typeof row[key] !== 'string') throw new Error('INVALID_PRODUCT:' + key);
        date(row.last_scraped_at, 'last_scraped_at'); date(row.updated_at, 'updated_at');
      }
      if (table === 'product_prices') { requireId(row.product_id, 'price.product_id'); requireId(row.store_id, 'price.store_id'); number(row.price, 'price'); date(row.last_updated, 'last_updated'); }
      if (table === 'catalog_price_summaries') {
        for (const key of ['lowest', 'highest', 'average', 'available']) number(row[key], key);
        date(row.comparable_valid_until, 'comparable_valid_until'); date(row.comparable_latest_observed_at, 'comparable_latest_observed_at');
      }
      map.set(row[KEYS[table]], { row, hash: rowHash(row) });
    }
  }
  validateDataset(rows);
  return { manifest, rows, generation: snapshotGeneration(manifest) };
}
function validateDataset(rows) {
  for (const { row } of rows.product_prices.values()) {
    if (!rows.products.has(row.product_id) || !rows.stores.has(row.store_id)) throw new Error('ORPHAN_PRICE:' + row.id);
  }
  for (const { row } of rows.catalog_price_summaries.values()) {
    if (!rows.products.has(row.product_id)) throw new Error('ORPHAN_SUMMARY:' + row.product_id);
    for (const store of row.store_ids ?? []) if (!rows.stores.has(store)) throw new Error('ORPHAN_SUMMARY_STORE:' + store);
    for (const [kind, offers] of [['historical', row.best_offers ?? []], ['current', row.comparable_offers ?? []]]) {
      if (!Array.isArray(offers)) throw new Error('INVALID_OFFERS:' + row.product_id);
      const ids = new Set();
      for (const offer of offers) {
        if (ids.has(offer.id)) throw new Error('DUPLICATE_BASIS:' + offer.id); ids.add(offer.id);
        const price = rows.product_prices.get(offer.id)?.row;
        if (!price || price.product_id !== row.product_id || price.store_id !== offer.store_id || Number(price.price) !== Number(offer.price)
          || text(price.stock) !== text(offer.stock) || text(price.url) !== text(offer.url)) throw new Error('BASIS_PRICE_MISMATCH:' + offer.id);
        if (offer.last_updated != null && iso(offer.last_updated) !== iso(price.last_updated)) throw new Error('BASIS_DATE_MISMATCH:' + offer.id);
        if (kind === 'current' && (Number(offer.price) <= 0 || !['in-stock', 'low-stock'].includes(offer.stock) || !offer.last_updated || !/^https?:\/\//i.test(offer.url ?? ''))) throw new Error('INVALID_CURRENT_BASIS:' + offer.id);
      }
    }
  }
}
function materialize(table, row) {
  if (table === 'stores') return { id: row.id, row_json: canonicalJson(row) };
  if (table === 'products') {
    const publicProduct = { ...row };
    for (const key of ['catalog_name', 'catalog_document', 'catalog_identity', 'catalog_component']) delete publicProduct[key];
    return { id: row.id, category: row.category, catalog_identity: row.catalog_identity, catalog_name: row.catalog_name, catalog_document: row.catalog_document,
      catalog_component: Number(Boolean(row.catalog_component)), grouped_identity: Number(row.id.startsWith('agrupado-')), last_scraped_at: iso(row.last_scraped_at), updated_at: iso(row.updated_at), row_json: canonicalJson(publicProduct) };
  }
  if (table === 'product_prices') return { id: row.id, product_id: row.product_id, store_id: row.store_id, price: Number(row.price), url: text(row.url), row_json: canonicalJson(row) };
  return { product_id: row.product_id, lowest: Number(row.lowest), highest: Number(row.highest), average: Number(row.average), available: Number(row.available), urls: text(row.urls), portable_listing: Number(Boolean(row.portable_listing)),
    store_ids_json: canonicalJson(row.store_ids ?? []), comparable_stats_json: row.comparable_stats ? canonicalJson(row.comparable_stats) : null,
    comparable_valid_until: iso(row.comparable_valid_until), comparable_latest_observed_at: iso(row.comparable_latest_observed_at), row_json: '{}' };
}
function basis(row) {
  const map = new Map();
  for (const [kind, offers] of [['historical', row.best_offers], ['current', row.comparable_offers]]) for (const offer of offers ?? []) {
    const value = { product_id: row.product_id, kind, id: offer.id, store_id: offer.store_id, price: Number(offer.price), stock: text(offer.stock), url: text(offer.url), observed_at: iso(offer.last_updated) };
    map.set(canonicalJson([row.product_id, kind, offer.id]), value);
  }
  return map;
}
function normalizedSqlRow(row) {
  const result = { ...row };
  for (const key of ['row_json', 'store_ids_json', 'comparable_stats_json']) if (result[key] != null) result[key] = canonicalJson(JSON.parse(result[key]));
  return result;
}
// Escaneo estrictamente local: detectar corrupción incluso en una repetición sin cambios.
function verifyDatabase(db, snapshot) {
  let scannedRows = 0;
  for (const sourceTable of TABLES) {
    const sqlTable = sourceTable === 'catalog_price_summaries' ? 'summaries' : sourceTable;
    const actual = db.prepare('SELECT * FROM ' + sqlTable).all(); scannedRows += actual.length;
    if (actual.length !== snapshot.rows[sourceTable].size) throw new Error('DATABASE_COUNT_CONFLICT:' + sqlTable);
    for (const row of actual) {
      const original = snapshot.rows[sourceTable].get(row[KEYS[sourceTable]])?.row;
      if (!original || rowHash(normalizedSqlRow(row)) !== rowHash(materialize(sourceTable, original))) throw new Error('DATABASE_ROW_CONFLICT:' + sqlTable + ':' + row[KEYS[sourceTable]]);
    }
  }
  const expectedBasis = new Map();
  for (const { row } of snapshot.rows.catalog_price_summaries.values()) for (const [key, value] of basis(row)) expectedBasis.set(key, rowHash(value));
  const actualBasis = db.prepare('SELECT * FROM price_basis').all(); scannedRows += actualBasis.length;
  if (actualBasis.length !== expectedBasis.size) throw new Error('DATABASE_BASIS_COUNT_CONFLICT');
  for (const row of actualBasis) {
    const key = canonicalJson([row.product_id, row.kind, row.id]);
    if (expectedBasis.get(key) !== rowHash(row)) throw new Error('DATABASE_BASIS_CONFLICT:' + row.id);
    expectedBasis.delete(key);
  }
  if (expectedBasis.size) throw new Error('DATABASE_BASIS_MISSING');
  const actualFts = db.prepare('SELECT id,document FROM product_substrings').all(); scannedRows += actualFts.length;
  const expectedFts = new Map([...snapshot.rows.products].filter(([, v]) => v.row.catalog_component).map(([id, v]) => [id, v.row.catalog_document]));
  if (actualFts.length !== expectedFts.size) throw new Error('DATABASE_FTS_COUNT_CONFLICT');
  for (const row of actualFts) { if (expectedFts.get(row.id) !== row.document) throw new Error('DATABASE_FTS_CONFLICT:' + row.id); expectedFts.delete(row.id); }
  if (expectedFts.size) throw new Error('DATABASE_FTS_MISSING');
  return scannedRows;
}
export function diffSnapshots(before, after) {
  const changes = {}, affected = new Set(), changedStores = new Set();
  for (const table of TABLES) {
    const list = changes[table] = [];
    for (const [id, old] of before.rows[table]) {
      const next = after.rows[table].get(id);
      if (!next || next.hash !== old.hash) list.push({ id, kind: next ? 'update' : 'delete', before: old.row, after: next?.row ?? null, beforeHash: old.hash, afterHash: next?.hash ?? null });
    }
    for (const [id, next] of after.rows[table]) if (!before.rows[table].has(id)) list.push({ id, kind: 'insert', before: null, after: next.row, beforeHash: null, afterHash: next.hash });
    list.sort((a, b) => a.id.localeCompare(b.id, 'en'));
    for (const change of list) {
      if (table === 'stores') changedStores.add(change.id);
      else if (table === 'products' || table === 'catalog_price_summaries') affected.add(change.id);
      else { if (change.before) affected.add(change.before.product_id); if (change.after) affected.add(change.after.product_id); }
    }
  }
  if (changedStores.size) for (const snapshot of [before, after]) for (const { row } of snapshot.rows.product_prices.values()) if (changedStores.has(row.store_id)) affected.add(row.product_id);
  return { changes, affectedProductIds: [...affected].sort() };
}
function operation(table, kind, before, after, keyColumns) {
  if (before && after && rowHash(before) === rowHash(after)) return null;
  if (kind === 'delete') return { table, kind, sql: 'DELETE FROM ' + table + ' WHERE ' + keyColumns.map(k => k + '=?').join(' AND '), bindings: keyColumns.map(k => before[k]), expectedRows: 1 };
  if (kind === 'insert') {
    const columns = Object.keys(after);
    return { table, kind, sql: 'INSERT INTO ' + table + '(' + columns.join(',') + ') VALUES(' + columns.map(() => '?').join(',') + ')', bindings: columns.map(k => after[k]), expectedRows: 1 };
  }
  const columns = Object.keys(after).filter(k => !keyColumns.includes(k) && canonicalJson(before[k]) !== canonicalJson(after[k]));
  if (!columns.length) return null;
  return { table, kind, changedColumns: columns, sql: 'UPDATE ' + table + ' SET ' + columns.map(k => k + '=?').join(',') + ' WHERE ' + keyColumns.map(k => k + '=?').join(' AND '), bindings: [...columns.map(k => after[k]), ...keyColumns.map(k => before[k])], expectedRows: 1 };
}
export function planIncremental(before, after) {
  if (Date.parse(after.manifest.referenceNow) < Date.parse(before.manifest.referenceNow)) throw new Error('SNAPSHOT_TIME_REGRESSION');
  for (const [id, previous] of before.rows.product_prices) {
    const next = after.rows.product_prices.get(id)?.row;
    if (next && previous.row.last_updated != null && (next.last_updated == null || Date.parse(next.last_updated) < Date.parse(previous.row.last_updated))) throw new Error('OBSERVATION_REGRESSION:' + id);
  }
  const { changes, affectedProductIds } = diffSnapshots(before, after), operations = [];
  const push = op => { if (op) { if (op.bindings.length >= 100 || Buffer.byteLength(op.sql) + Buffer.byteLength(JSON.stringify(op.bindings)) > 100000) throw new Error('STATEMENT_LIMIT'); operations.push(op); } };
  // Borrar dependientes antes de sus padres; altas en el orden inverso.
  const basisDeletes = [], basisWrites = [];
  for (const change of changes.catalog_price_summaries) {
    const a = change.before ? basis(change.before) : new Map(), b = change.after ? basis(change.after) : new Map();
    for (const [key, old] of a) if (!b.has(key)) basisDeletes.push(operation('price_basis', 'delete', old, null, ['product_id', 'kind', 'id']));
    for (const [key, next] of b) basisWrites.push(operation('price_basis', a.has(key) ? 'update' : 'insert', a.get(key), next, ['product_id', 'kind', 'id']));
  }
  basisDeletes.forEach(push);
  for (const table of ['catalog_price_summaries', 'product_prices', 'products', 'stores']) for (const change of changes[table].filter(c => c.kind === 'delete')) {
    if (table === 'products' && change.before.catalog_component) push(operation('product_substrings', 'delete', { id: change.id, document: change.before.catalog_document }, null, ['id']));
    push(operation(table === 'catalog_price_summaries' ? 'summaries' : table, 'delete', materialize(table, change.before), null, [KEYS[table]]));
  }
  for (const table of ['stores', 'products', 'product_prices', 'catalog_price_summaries']) for (const change of changes[table].filter(c => c.kind !== 'delete')) {
    push(operation(table === 'catalog_price_summaries' ? 'summaries' : table, change.kind, change.before ? materialize(table, change.before) : null, materialize(table, change.after), [KEYS[table]]));
    if (table === 'products') {
      const a = change.before?.catalog_component ? { id: change.id, document: change.before.catalog_document } : null;
      const b = change.after.catalog_component ? { id: change.id, document: change.after.catalog_document } : null;
      if (a || b) push(operation('product_substrings', !a ? 'insert' : !b ? 'delete' : 'update', a, b, ['id']));
    }
  }
  basisWrites.forEach(push);
  const checkpoint = rowHash({ before: before.generation, after: after.generation, changes });
  return { version: 1, localOnly: true, baseGeneration: before.generation, targetGeneration: after.generation, checkpoint, changes: Object.fromEntries(TABLES.map(t => [t, changes[t].map(({ id, kind, beforeHash, afterHash }) => ({ id, kind, beforeHash, afterHash }))])), affectedProductIds, operations,
    batches: Array.from({ length: Math.ceil(operations.length / 49) }, (_, i) => ({ ordinal: i, statements: operations.slice(i * 49, i * 49 + 49) })),
    remotePublishSafe: false, note: 'Los grupos describen límites; sólo la transacción SQLite completa publica atómicamente. No subir estos grupos a una generación D1 activa.' };
}
const identifier = value => '"' + value.replaceAll('"', '""') + '"';
function indexDefinitions(db) {
  const definitions = new Map();
  const definition = db.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND name=?");
  for (const { name } of db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all()) {
    const tableColumns = db.prepare('PRAGMA table_info(' + identifier(name) + ')').all().map(c => c.name.toLowerCase());
    definitions.set(name, db.prepare('PRAGMA index_list(' + identifier(name) + ')').all().map(index => {
      const fields = db.prepare('PRAGMA index_info(' + identifier(index.name) + ')').all();
      const columns = new Set(fields.filter(f => f.name != null).map(f => f.name.toLowerCase()));
      const sql = definition.get(index.name)?.sql ?? '';
      const expression = fields.some(f => f.name == null), predicate = index.partial ? sql.match(/\bWHERE\s+([\s\S]*)$/i)?.[1] : '';
      // Los nombres de columnas del esquema permiten incluir expresiones y la
      // pertenencia a índices parciales. Ante SQL desconocido, contar el índice.
      const tokens = new Set((expression ? sql : predicate ?? '').toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []);
      for (const column of tableColumns) if (tokens.has(column)) columns.add(column);
      return { name: index.name, columns, unknown: (expression && !sql) || (Boolean(index.partial) && predicate === undefined) };
    }));
  }
  return definitions;
}
function affectedIndexes(definitions, statement) {
  const match = statement.sql.match(/^\s*(INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/i);
  const table = statement.table ?? match?.[2], indexes = definitions.get(table) ?? [];
  const update = match?.[1].toLowerCase() === 'update';
  if (!update) return indexes.length; // altas/bajas/upsert: todos, conservador
  const set = statement.sql.match(/\bSET\s+([\s\S]+?)\s+WHERE\b/i)?.[1];
  if (!set) return indexes.length;
  const parsed = set.split(',').map(part => part.match(/^\s*([a-z_][a-z0-9_]*)\s*=/i)?.[1]?.toLowerCase());
  if (parsed.some(c => c === undefined)) return indexes.length;
  const changed = new Set([...parsed, ...(statement.changedColumns ?? []).map(c => c.toLowerCase())]);
  return indexes.filter(index => index.unknown || [...index.columns].some(c => changed.has(c))).length;
}
// Modelo de mantenimiento BTree, no contador de facturación Cloudflare.
export function estimateIndexMaintenance(db, statements) {
  const definitions = indexDefinitions(db);
  return statements.reduce((total, statement) => total + 2 * (statement.expectedRows ?? 1) * affectedIndexes(definitions, statement), 0);
}
export async function applyIncremental({ before, after, sqlite, expectedGeneration, projection, now, maxEstimatedRowsWritten = 80000 }) {
  if (!Number.isSafeInteger(maxEstimatedRowsWritten) || maxEstimatedRowsWritten < 0) throw new Error('INVALID_BUDGET');
  // Ambos hashes se verifican antes de abrir/escribir el destino.
  const old = await loadIncrementalSnapshot(before), next = await loadIncrementalSnapshot(after);
  if (typeof expectedGeneration !== 'string' || expectedGeneration !== old.generation) throw new Error('EXPECTED_GENERATION_CONFLICT');
  const clock = now ?? Date.parse(next.manifest.referenceNow);
  if (!Number.isFinite(clock)) throw new Error('INVALID_CLOCK');
  const plan = planIncremental(old, next);
  if (!existsSync(sqlite)) throw new Error('TARGET_DATABASE_MISSING');
  const db = new DatabaseSync(sqlite);
  let transaction = false;
  try {
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON'); transaction = true;
    const marker = JSON.parse(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()?.value ?? 'null');
    if (!marker) throw new Error('MISSING_BASE_MARKER');
    // Una generación proyectada exige actualizar/inutilizar su caché en la misma
    // transacción. El hash idéntico puede verificarse sin invocar la proyección.
    if (old.generation !== next.generation && (marker.projectionVersion === 1 || marker.cache != null) && typeof projection !== 'function') throw new Error('PROJECTION_CALLBACK_REQUIRED');
    const actualGeneration = rowHash({ counts: marker.counts, hashes: marker.hashes });
    const storedStateRow = db.prepare("SELECT value FROM pilot_meta WHERE key='sync_state'").get();
    const state = storedStateRow ? JSON.parse(storedStateRow.value) : null;
    if (state && state.generation !== actualGeneration) throw new Error('CHECKPOINT_MARKER_CONFLICT');
    // Reintento del mismo checkpoint ya confirmado: verificar destino, cero escrituras.
    if (actualGeneration === next.generation && (old.generation === next.generation || state?.checkpoint === plan.checkpoint)) {
      const localRowsScanned = verifyDatabase(db, next), dailyBudget = chargeDailyBudget(db, { now: clock, estimatedRowsWritten: 0 }); db.exec('COMMIT'); transaction = false;
      return { ...plan, batches: [], committedStatements: [], status: 'noop', baseRowsWritten: 0, sqlitePhysicalRowsChanged: 0, estimatedRowsWritten: 0, dailyBudget, localRowsScanned, d1RowsWritten: null, d1RowsRead: null, remoteVerified: false };
    }
    if (actualGeneration !== old.generation || (state && state.generation !== expectedGeneration)) throw new Error('STALE_BASE_GENERATION');
    const localRowsScanned = verifyDatabase(db, old);
    let baseRowsWritten = 0;
    const totalBefore = Number(db.prepare('SELECT total_changes() n').get().n);
    for (const op of plan.operations) {
      const result = db.prepare(op.sql).run(...op.bindings), count = Number(result.changes);
      if (count !== op.expectedRows) throw new Error('WRITE_CONFLICT:' + op.table);
      baseRowsWritten += count;
    }
    const meta = { ...marker, ...metadata(next.manifest) }, committedStatements = [...plan.operations];
    const markerStatement = { table: 'pilot_meta', sql: "UPDATE pilot_meta SET value=? WHERE key='snapshot'", bindings: [canonicalJson(meta)] };
    db.prepare(markerStatement.sql).run(...markerStatement.bindings); baseRowsWritten++; committedStatements.push(markerStatement);
    const projectionBefore = Number(db.prepare('SELECT total_changes() n').get().n);
    const projectionResult = projection ? projection(db, { now: clock, generation: next.generation, affectedProductIds: plan.affectedProductIds }) : null;
    if (projectionResult && typeof projectionResult.then === 'function') throw new Error('PROJECTION_MUST_BE_SYNCHRONOUS');
    for (const statement of projectionResult?.statements ?? []) {
      const bindings = statement.values ?? statement.bindings ?? [];
      if (bindings.length >= 100 || Buffer.byteLength(statement.sql) + Buffer.byteLength(JSON.stringify(bindings)) > 100000) throw new Error('PROJECTION_STATEMENT_LIMIT');
      committedStatements.push({ sql: statement.sql, bindings, kind: statement.kind, changedColumns: statement.changedColumns });
    }
    const projectionPhysicalChanges = Number(db.prepare('SELECT total_changes() n').get().n) - projectionBefore;
    baseRowsWritten += projectionResult?.baseRowsWritten ?? projectionPhysicalChanges;
    const checkpointState = { version: 1, generation: next.generation, previousGeneration: old.generation, checkpoint: plan.checkpoint, referenceNow: next.manifest.referenceNow };
    const checkpointStatement = { table: 'pilot_meta', sql: "INSERT INTO pilot_meta(key,value) VALUES('sync_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", bindings: [canonicalJson(checkpointState)] };
    db.prepare(checkpointStatement.sql).run(...checkpointStatement.bindings); baseRowsWritten++; committedStatements.push(checkpointStatement);
    const estimatedIndexRows = estimateIndexMaintenance(db, committedStatements);
    const sqlitePhysicalRowsChanged = Number(db.prepare('SELECT total_changes() n').get().n) - totalBefore;
    const estimatedRowsWritten = sqlitePhysicalRowsChanged + estimatedIndexRows;
    if (estimatedRowsWritten > maxEstimatedRowsWritten) throw new Error('ESTIMATED_WRITE_BUDGET_EXCEEDED:' + estimatedRowsWritten);
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('FOREIGN_KEY_CONFLICT');
    const dailyBudget = chargeDailyBudget(db, { now: clock, estimatedRowsWritten });
    if (dailyBudget.schemaStatement) committedStatements.push(dailyBudget.schemaStatement);
    if (dailyBudget.statement) committedStatements.push(dailyBudget.statement);
    baseRowsWritten += dailyBudget.ledgerBaseRowsWritten;
    db.exec('COMMIT'); transaction = false;
    const batches = Array.from({ length: Math.ceil(committedStatements.length / 49) }, (_, i) => ({ ordinal: i, statements: committedStatements.slice(i * 49, i * 49 + 49) }));
    return { ...plan, committedStatements, batches, status: 'applied', baseRowsWritten, sqlitePhysicalRowsChanged: sqlitePhysicalRowsChanged + dailyBudget.ledgerBaseRowsWritten, estimatedIndexRows, estimatedRowsWritten: dailyBudget.charge, estimatedDeltaRowsWritten: estimatedRowsWritten, dailyBudget, maxEstimatedRowsWritten, localRowsScanned, projection: projectionResult,
      d1RowsWritten: null, d1RowsRead: null, remoteVerified: false, budgetMethod: 'Cambios SQLite incluidos FTS/shadow medidos + 2 filas estimadas por índice afectado y fila cambiada; UPDATE sólo columnas SET/expresiones/predicados parciales. No es meta.rows_written de D1.' };
  } catch (error) { if (transaction) db.exec('ROLLBACK'); throw error; }
  finally { db.close(); }
}
