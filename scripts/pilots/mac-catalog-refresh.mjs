// Runner Mac: observa destinos conocidos en staging; jamás publica ni abre la DB servida para escribir.
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, realpathSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { initializeRotation, seedNextRotationBatch, coverageSnapshot } from './cloudflare-catalog/rotation-local.mjs';
import { enqueueKnownProducts } from './cloudflare-catalog/refresh-demand.mjs';
import { rebuildProjection } from './cloudflare-catalog/projection.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tables = ['products', 'product_prices', 'summaries', 'stores', 'price_basis', 'search_projection'];
const json = value => JSON.stringify(value);
export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}
export async function loadMacRefreshConsumer() {
  const result = await build({ stdin: { contents: `
    export { localStoreIds, localCategories, canRefreshLocalTarget } from './scripts/pilots/cloudflare-catalog/refresh-local';
    export { runGroupedLocalRefresh } from './scripts/pilots/cloudflare-catalog/refresh-grouped-local';
    export { runLocalSweep } from './scripts/pilots/cloudflare-catalog/sweep-local';
    export { listingReference } from './src/lib/scrapers/listing-reference';
    export { selectSharedCandidates } from './scripts/pilots/cloudflare-catalog/shared-catalog-cli';
    export { readAndStageCompraGamer } from './scripts/pilots/cloudflare-catalog/shared-catalog-local';
    export { certifyProductEvidence } from './scripts/pilots/cloudflare-catalog/certify-product-evidence';
    export { installObservationClockIndex } from './scripts/pilots/cloudflare-catalog/observation-clock-index';
  `, resolveDir: root, sourcefile: 'mac-refresh-consumer.ts' }, absWorkingDir: root,
    bundle: true, packages: 'external', write: false, platform: 'node', target: 'node22', format: 'esm', logLevel: 'silent' });
  // Guardar imports externos junto al proyecto, no dentro de un data: URL.
  const folder = join(root, 'outputs/produccion-preparacion-2026-10-12/mac-refresh-staging');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const content = result.outputFiles[0].text;
  const file = join(folder, 'consumer-' + createHash('sha256').update(content).digest('hex') + '.mjs');
  if (!existsSync(file)) writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
  return import(pathToFileURL(file).href);
}
function marker(db) {
  const value = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()?.value;
  if (typeof value !== 'string') throw Error('MAC_REFRESH_SNAPSHOT');
  return JSON.parse(value);
}
/** Misma secuencia y campos de identidad de production-load.mjs; precio/fecha se acreditan aparte. */
export function catalogIdentity(db) {
  const hash = createHash('sha256'), counts = {};
  for (const table of tables) counts[table] = Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n);
  for (const row of db.prepare('SELECT * FROM stores ORDER BY id').iterate()) hash.update(json(['stores', row.id, row.row_json]) + '\n');
  for (const row of db.prepare('SELECT * FROM products ORDER BY id').iterate()) {
    const raw = JSON.parse(row.row_json);
    if (raw.id !== row.id || raw.category !== row.category) throw Error('MAC_REFRESH_PRODUCT_COLUMNS');
    hash.update(json(['products', row.id, row.category, row.catalog_identity, row.catalog_name,
      row.catalog_document, row.catalog_component, raw.name, raw.canonical_product_key ?? null, raw.specs ?? null]) + '\n');
  }
  for (const row of db.prepare('SELECT * FROM product_prices ORDER BY id').iterate()) {
    const raw = JSON.parse(row.row_json);
    if (raw.id !== row.id || raw.product_id !== row.product_id || raw.store_id !== row.store_id || raw.price !== row.price || raw.url !== row.url)
      throw Error('MAC_REFRESH_OFFER_COLUMNS');
    hash.update(json(['product_prices', row.id, row.product_id, row.store_id, row.url, raw.source_identity ?? null]) + '\n');
  }
  return { version: 1, fingerprint: hash.digest('hex'), counts: { products: counts.products,
    product_prices: counts.product_prices, catalog_price_summaries: counts.summaries, stores: counts.stores }, physical: counts };
}
export function validateCatalog(db, { requireManifest = true } = {}) {
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length)
    throw Error('MAC_REFRESH_INTEGRITY');
  const identity = catalogIdentity(db), snapshot = marker(db);
  if (identity.counts.products !== identity.counts.catalog_price_summaries) throw Error('MAC_REFRESH_SUMMARY_COUNTS');
  if (json(snapshot.counts) !== json(identity.counts)) throw Error('MAC_REFRESH_COUNTS');
  const componentIds = db.prepare('SELECT id FROM products WHERE catalog_component=1 EXCEPT SELECT id FROM product_substrings').all();
  const extraIds = db.prepare('SELECT id FROM product_substrings EXCEPT SELECT id FROM products WHERE catalog_component=1').all();
  if (componentIds.length || extraIds.length || Number(db.prepare('SELECT COUNT(*) n FROM product_substrings').get().n)
    !== Number(db.prepare('SELECT COUNT(*) n FROM products WHERE catalog_component=1').get().n)) throw Error('MAC_REFRESH_FTS_COUNTS');
  if (requireManifest) {
    const raw = db.prepare("SELECT value FROM pilot_meta WHERE key='production_catalog'").get()?.value;
    const manifest = raw ? JSON.parse(raw) : null;
    if (!manifest?.complete || !manifest?.countsVerified || manifest.fingerprint !== identity.fingerprint
      || snapshot.catalog?.fingerprint !== identity.fingerprint || json(manifest.counts) !== json(identity.counts))
      throw Error('MAC_REFRESH_MANIFEST');
  }
  return identity;
}
function options(config) {
  const maxTargets = config.maxTargets ?? 2;
  if (!Number.isSafeInteger(maxTargets) || maxTargets < 2 || maxTargets > (config.sweep ? 500 : 20)) throw Error('MAC_REFRESH_LIMIT');
  const freshMinutes = config.freshMinutes ?? 1440;
  if (!Number.isSafeInteger(freshMinutes) || freshMinutes < 120 || freshMinutes > 1440) throw Error('MAC_REFRESH_WINDOWS');
  if (config.storeIds && (!Array.isArray(config.storeIds) || !config.storeIds.length || config.storeIds.length > 3
    || new Set(config.storeIds).size !== config.storeIds.length || config.storeIds.includes('fullh4rd'))) throw Error('MAC_REFRESH_STORES');
  if (config.offerIds && (!Array.isArray(config.offerIds) || !config.offerIds.length || config.offerIds.length > maxTargets
    || new Set(config.offerIds).size !== config.offerIds.length || config.offerIds.some(id => typeof id !== 'string' || !id))) throw Error('MAC_REFRESH_OFFERS');
  return maxTargets;
}
function capabilities(db, consumer, config) {
  const stores = config.storeIds ?? consumer.localStoreIds.filter(id => id !== 'fullh4rd');
  if (stores.some(id => !consumer.localStoreIds.includes(id) || id === 'fullh4rd')) throw Error('MAC_REFRESH_STORES');
  if (config.sweep && !stores.includes('compragamer')) throw Error('MAC_REFRESH_SWEEP_STORE');
  return { storeIds: config.sweep ? ['compragamer'] : stores,
    categories: db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all().map(r => r.category),
    version: 'mac-known-v1', validateTarget: consumer.canRefreshLocalTarget };
}
function budgetRows(db, table) {
  if (!['pilot_daily_write_budget', 'mac_inherited_d1_daily_write_budget'].includes(table)) throw Error('MAC_REFRESH_BUDGET_TABLE');
  if (!db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").get(table)) return null;
  const rows = db.prepare(`SELECT day,used,ceiling FROM ${table} ORDER BY day`).all();
  return { rows: rows.length, sha256: createHash('sha256').update(json(rows)).digest('hex') };
}
/** Corte único de presupuesto, sólo en staging. Jamás reiniciar el ledger de otro tick Mac. */
export function initializeMacBudget(db, { allowFirstCut = false, sourceSha256, now = Date.now() } = {}) {
  if (db.isTransaction) throw Error('MAC_REFRESH_BUDGET_TRANSACTION');
  const saved = db.prepare("SELECT value FROM pilot_meta WHERE key='mac_budget_local'").get();
  if (saved) {
    if (allowFirstCut) throw Error('MAC_REFRESH_BUDGET_ALREADY_LOCAL');
    const marker = JSON.parse(saved.value), inherited = budgetRows(db, 'mac_inherited_d1_daily_write_budget');
    if (marker.version !== 1 || marker.kind !== 'mac-local-estimate' || marker.ceiling !== 80000
      || json(marker.inheritedLedger) !== json(inherited)) throw Error('MAC_REFRESH_BUDGET_MARKER');
    return marker;
  }
  if (!allowFirstCut || !/^[0-9a-f]{64}$/.test(sourceSha256 ?? '')) throw Error('MAC_REFRESH_BUDGET_INITIALIZATION_REQUIRED');
  if (budgetRows(db, 'mac_inherited_d1_daily_write_budget')) throw Error('MAC_REFRESH_BUDGET_AMBIGUOUS');
  const inherited = budgetRows(db, 'pilot_daily_write_budget');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (inherited) db.exec('ALTER TABLE pilot_daily_write_budget RENAME TO mac_inherited_d1_daily_write_budget');
    const marker = { version: 1, kind: 'mac-local-estimate', ceiling: 80000, initializedAt: new Date(now).toISOString(),
      sourceSha256, inheritedLedger: inherited,
      note: 'Preserva estimaciones anteriores, posiblemente mixtas. El nuevo techo es local conservador; no mide D1.' };
    db.prepare("INSERT INTO pilot_meta(key,value) VALUES('mac_budget_local',?)").run(json(marker));
    db.exec('COMMIT'); return marker;
  } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
}
export function macTargetDenominator(db, consumer, now = Date.now()) {
  let offers = 0, compatibleOffers = 0;
  const references = new Set();
  for (const row of db.prepare('SELECT pp.store_id,pp.url,p.category,p.row_json FROM product_prices pp JOIN products p ON p.id=pp.product_id').iterate()) {
    offers++;
    const product = JSON.parse(row.row_json);
    if (row.store_id === 'fullh4rd' || !consumer.canRefreshLocalTarget(row.store_id, row.url, row.category, product.name, product.specs)) continue;
    compatibleOffers++;
    const reference = consumer.listingReference(row.store_id, row.url);
    if (reference) references.add(reference);
  }
  return { asOf: new Date(now).toISOString(), offers, compatibleOffers, compatibleReferences: references.size,
    basis: 'Contratos locales y metadata de destinos; no demuestra presencia actual, precio, stock ni comparabilidad observada.' };
}
export function selectMacTargets(db, config, consumer, now) {
  const maxTargets = options(config), spec = capabilities(db, consumer, config);
  // Capacidad del destino no prueba que hoy exista en el feed. La captura sólo
  // selecciona; runLocalSweep reserva antes de obtener una observación nueva.
  const capturedCandidates = config.sweep ? new Set(consumer.selectSharedCandidates(db, now, maxTargets).map(row => row.offerId)) : null;
  const requested = config.offerIds ? new Set(config.offerIds) : null, selected = [], stores = new Set();
  const filteredIds = requested ?? capturedCandidates;
  const state = db.prepare("SELECT name FROM sqlite_schema WHERE name='mac_refresh_state'").get()
    ? db.prepare('SELECT category FROM mac_refresh_state WHERE id=1').get() : null;
  const categories = spec.categories, offset = state ? (categories.indexOf(state.category) + 1) % categories.length : 0;
  const rotated = [...categories.slice(offset), ...categories.slice(0, offset)];
  const hasQueue = db.prepare("SELECT name FROM sqlite_schema WHERE name='pilot_refresh_demand'").get();
  const query = filteredIds
    ? 'SELECT pp.*,p.category,p.row_json product_json FROM product_prices pp JOIN products p ON p.id=pp.product_id WHERE pp.id IN(SELECT value FROM json_each(?)) ORDER BY pp.id'
    : !hasQueue ? 'SELECT pp.*,p.category,p.row_json product_json FROM product_prices pp JOIN products p ON p.id=pp.product_id ORDER BY pp.id'
    : `SELECT pp.*,p.category,p.row_json product_json FROM product_prices pp JOIN products p ON p.id=pp.product_id
       LEFT JOIN pilot_refresh_demand q ON q.offer_id=pp.id
       WHERE (q.offer_id IS NULL OR(q.expires_at>? AND q.due_at<=? AND(q.status IN('pending','backoff') OR(q.status='leased' AND q.lease_until<=?))))
       AND NOT EXISTS(SELECT 1 FROM pilot_cycle_store_pause s WHERE s.store_id=pp.store_id AND s.until_at>?) ORDER BY pp.id`;
  const rows = db.prepare(query).all(...(filteredIds ? [json([...filteredIds])] : hasQueue ? [now, now, now, now] : []));
  const rank = new Map(rotated.map((category, index) => [category, index]));
  rows.sort((a, b) => (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99) || a.id.localeCompare(b.id));
  for (const row of rows) {
    const product = JSON.parse(row.product_json);
    if (capturedCandidates && !capturedCandidates.has(row.id)) continue;
    if (!spec.storeIds.includes(row.store_id) || !consumer.canRefreshLocalTarget(row.store_id, row.url, row.category, product.name, product.specs)) continue;
    if (!stores.has(row.store_id) && stores.size === 3) continue;
    stores.add(row.store_id);
    selected.push({ offerId: row.id, productId: row.product_id, storeId: row.store_id, url: row.url,
      category: row.category, title: product.name, observedAt: JSON.parse(row.row_json).last_updated ?? null });
    if (selected.length === maxTargets) break;
  }
  if (requested && selected.length !== requested.size) throw Error(config.sweep ? 'MAC_REFRESH_SWEEP_CAPTURE_OR_PROOF_REQUIRED' : 'MAC_REFRESH_UNSUPPORTED_EXPLICIT_TARGET');
  return selected;
}
export async function runMacCatalogRefresh(config, dependencies = {}) {
  options(config);
  const clock = dependencies.clock ?? Date.now, startedAt = clock();
  const source = realpathSync(resolve(config.source));
  if (!statSync(source).isFile()) throw Error('MAC_REFRESH_SOURCE_FILE');
  const activeWal = () => existsSync(source + '-wal') && statSync(source + '-wal').size > 0;
  if (activeWal()) throw Error('MAC_REFRESH_SOURCE_WAL_ACTIVE');
  const sourceStat = statSync(source), sourceSha256 = await hashFile(source);
  const consumer = dependencies.consumer ?? await loadMacRefreshConsumer();
  const original = new DatabaseSync(source, { readOnly: true });
  let identity, selected, working, directory;
  try {
    original.exec('BEGIN');
    identity = validateCatalog(original);
    // El plan no modifica cola ni abre HTTP; inicializar tablas sólo en una copia.
    if (config.dryRun) {
      selected = selectMacTargets(original, config, consumer, startedAt);
      original.exec('COMMIT');
      if (activeWal() || await hashFile(source) !== sourceSha256) throw Error('MAC_REFRESH_SOURCE_CHANGED');
      return { dryRun: true, writes: 0, httpRequests: 0, source, sourceSha256, identity, selected,
        promotion: 'Coordinador: verificar candidato, reabrir SQLite readonly y cambiar fingerprint/handle juntos; conservar origen anterior.' };
    }
    if (!config.directory || existsSync(resolve(config.directory))) throw Error('MAC_REFRESH_NEW_DIRECTORY');
    directory = resolve(config.directory);
    if (directory === source || source.startsWith(directory + '/')) throw Error('MAC_REFRESH_DESTINATION');
    mkdirSync(directory, { recursive: false, mode: 0o700 });
    working = join(directory, 'working.sqlite');
    // backup conserva el corte de lectura; VACUUM INTO no admite BEGIN activo.
    await backup(original, working);
    original.exec('COMMIT');
  } finally { original.close(); }
  if (activeWal() || await hashFile(source) !== sourceSha256 || statSync(source).ino !== sourceStat.ino) throw Error('MAC_REFRESH_SOURCE_CHANGED');
  if (statSync(working).ino === sourceStat.ino) throw Error('MAC_REFRESH_DESTINATION_INODE');
  const db = new DatabaseSync(working);
  let observation, localBudget, denominator, capture;
  try {
    const before = marker(db);
    const hasPreparedTable = db.prepare("SELECT name FROM sqlite_schema WHERE name='catalog_prepared_products'").get();
    if ((before.prepared_views || hasPreparedTable) && !config.discardPrepared) throw Error('MAC_REFRESH_PREPARED_COPY_REQUIRES_OPT_IN');
    delete before.prepared_views; delete before.clock_observations;
    db.exec('BEGIN IMMEDIATE');
    db.prepare("DELETE FROM pilot_meta WHERE key='production_catalog'").run();
    db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(json(before));
    if (config.discardPrepared) db.exec('DROP TABLE IF EXISTS catalog_prepared_products');
    db.exec('COMMIT');
    // Validar todas las fechas heredadas antes de gastar una lectura a un comercio.
    consumer.installObservationClockIndex(db);
    localBudget = initializeMacBudget(db, { allowFirstCut: config.initializeMacBudget, sourceSha256, now: clock() });
    denominator = macTargetDenominator(db, consumer, clock());
    initializeRotation(db);
    if (config.refreshCapture) {
      if (!config.sweep) throw Error('MAC_REFRESH_CAPTURE_REQUIRES_SWEEP');
      const pause = db.prepare("SELECT name FROM sqlite_schema WHERE name='pilot_cycle_store_pause'").get();
      if (pause && db.prepare('SELECT 1 FROM pilot_cycle_store_pause WHERE store_id=? AND until_at>?').get('compragamer', clock()))
        capture = { skipped: true, reason: 'store-paused', sourceHttp: { requests: 0, bytes: 0 } };
      else capture = await consumer.readAndStageCompraGamer(db);
    }
    const spec = capabilities(db, consumer, config);
    const rotation = [];
    if (!config.offerIds) for (let i = 0; i < 30; i++) {
      const seeded = seedNextRotationBatch(db, { now: clock(), capabilities: spec, clock, deadlineAt: startedAt + 180000 });
      rotation.push(seeded);
      if (seeded.complete || seeded.status === 'waiting' || seeded.status === 'deadline') break;
    }
    selected = selectMacTargets(db, config, consumer, clock());
    for (const target of selected) enqueueKnownProducts(db, { productIds: [target.productId], offerIds: [target.offerId],
      storeIds: [target.storeId], now: clock(), freshMs: (config.freshMinutes ?? 1440) * 60000 });
    // Proyección diferida: esta copia nunca sirve búsquedas. Rehacer todo tras finalizar el lote.
    const writer = { clock, projection: () => ({ statements: [], baseRowsWritten: 0, changedProjectionRows: 0 }), estimateIndexes: () => 0 };
    const reader = dependencies.reader ? { reader: dependencies.reader } : {};
    observation = !selected.length ? { attempted: 0, observed: 0, comparable: 0, results: [], sourceHttp: { requests: 0, bytes: 0 } }
      : config.sweep ? await consumer.runLocalSweep(db, writer, { offerIds: selected.map(t => t.offerId), limit: config.maxTargets ?? 2,
        maxHttp: config.refreshCapture ? 7 : 10, leaseMs: 300000, clock, ...reader })
      : await consumer.runGroupedLocalRefresh(db, { offerIds: selected.map(t => t.offerId), ...writer, ...reader });
    for (const result of observation.results) {
      const receipt = result.receipt ?? result;
      if (receipt.budget) {
        const { statement, schemaStatement, schemaSql, ...budget } = receipt.budget;
        void statement; void schemaStatement; void schemaSql;
        receipt.budget = { ...budget, kind: 'mac-local-estimate', remoteVerified: false,
          note: 'Ledger Mac posterior al corte explícito. Techo conservador local80000; no consumo ni cuota Cloudflare.' };
      }
    }
    db.exec('CREATE TABLE IF NOT EXISTS mac_refresh_state(id INTEGER PRIMARY KEY CHECK(id=1),category TEXT,last_tick_at INTEGER)');
    if (selected.length) db.prepare('INSERT INTO mac_refresh_state VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET category=excluded.category,last_tick_at=excluded.last_tick_at')
      .run(selected.at(-1).category, clock());
    observation.rotation = rotation;
  } finally { db.close(); }
  const candidate = join(directory, 'candidate.sqlite'), certifiedAt = clock();
  const qc = consumer.certifyProductEvidence(working, candidate, { now: certifiedAt, generation: 'mac-refresh-' + certifiedAt, rebuildProjection });
  const next = new DatabaseSync(candidate);
  let nextIdentity, certificate;
  try {
    nextIdentity = catalogIdentity(next);
    if (json(nextIdentity.counts) !== json(identity.counts)) throw Error('MAC_REFRESH_SCOPE_CHANGED');
    const snapshot = marker(next); delete snapshot.prepared_views;
    const catalog = { version: nextIdentity.version, fingerprint: nextIdentity.fingerprint, counts: nextIdentity.counts };
    snapshot.catalog = catalog; snapshot.counts = catalog.counts;
    // Los hashes de la exportación original dejan de describir ofertas modificadas.
    delete snapshot.hashes;
    next.exec('BEGIN IMMEDIATE');
    next.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(json(snapshot));
    next.prepare("INSERT INTO pilot_meta(key,value) VALUES('production_catalog',?)").run(json({ ...catalog, complete: true, countsVerified: true,
      localOnly: true, sourceCutSha256: sourceSha256, qcValidUntil: qc.validUntil }));
    next.exec('COMMIT');
    certificate = consumer.installObservationClockIndex(next);
    validateCatalog(next);
    initializeRotation(next);
    observation.coverage = coverageSnapshot(next, { now: clock(), capabilities: capabilities(next, consumer, config), sinceStartedAt: startedAt });
  } finally { next.close(); }
  if (clock() >= Date.parse(qc.validUntil) || activeWal() || await hashFile(source) !== sourceSha256 || statSync(source).ino !== sourceStat.ino)
    throw Error('MAC_REFRESH_SOURCE_OR_CERTIFICATE_CHANGED');
  const candidateSha256 = await hashFile(candidate);
  const report = { version: 1, startedAt: new Date(startedAt).toISOString(), completedAt: new Date(clock()).toISOString(),
    source: { path: source, sha256: sourceSha256, fingerprint: identity.fingerprint, immutable: true },
    candidate: { path: candidate, sha256: candidateSha256, fingerprint: nextIdentity.fingerprint,
      generation: 'mac-refresh-' + certifiedAt, counts: nextIdentity.counts, certificate },
    selected, observation, ...(capture ? { capture } : {}), qc, denominator, localBudget, promotionReady: true, productionActivated: false, remoteRowsRead: 0, remoteRowsWritten: 0,
    limits: { maxTargets: config.maxTargets ?? 2, maxStores: 3, refreshFreshMinutes: config.freshMinutes ?? 1440,
      offerEligibilityHours: 24, sweep: Boolean(config.sweep), maxHttp: config.sweep ? 10 : null,
      readerDeadlineMs: config.sweep ? 300000 : 180000, fullh4rd: 'deferred', discovery: false,
      note: 'Ledger Mac sólo local y separado; nunca cargar esteSQLite como D1. Full QC costs must be measured before scheduling.' },
    promotion: { expectedSourceSha256: sourceSha256, expectedSourceFingerprint: identity.fingerprint,
      validUntil: qc.validUntil, action: 'Reabrir candidato readonly; cambiar handle, fingerprint y caché juntos. No renombrar bajo un handle abierto.' } };
  writeFileSync(join(directory, 'promotion.json'), json(report) + '\n', { flag: 'wx', mode: 0o600 });
  return report;
}
export function parseMacRefreshArgs(args) {
  const [mode, source, ...flags] = args;
  if (!['--dry-run', '--execute'].includes(mode) || !source) throw Error('MAC_REFRESH_USAGE');
  const config = { source, dryRun: mode === '--dry-run', offerIds: [], storeIds: [] };
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === '--discard-prepared-copy') { config.discardPrepared = true; continue; }
    if (flag === '--refresh-capture') { config.refreshCapture = true; continue; }
    if (flag === '--sweep') { config.sweep = true; continue; }
    if (flag === '--initialize-mac-budget') { config.initializeMacBudget = true; continue; }
    const value = flags[++i];
    if (!value) throw Error('MAC_REFRESH_USAGE');
    if (flag === '--directory') config.directory = value;
    else if (flag === '--max-targets') config.maxTargets = Number(value);
    else if (flag === '--fresh-minutes') config.freshMinutes = Number(value);
    else if (flag === '--offer-id') config.offerIds.push(value);
    else if (flag === '--store-id') config.storeIds.push(value);
    else throw Error('MAC_REFRESH_USAGE');
  }
  if (!config.offerIds.length) delete config.offerIds;
  if (!config.storeIds.length) delete config.storeIds;
  return config;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMacCatalogRefresh(parseMacRefreshArgs(process.argv.slice(2))).then(report => process.stdout.write(json(report) + '\n'))
    .catch(error => { process.stderr.write((/^MAC_REFRESH_[A-Z_]+$/.test(error.message) ? error.message : 'MAC_REFRESH_FAILED') + '\n'); process.exitCode = 1; });
}
