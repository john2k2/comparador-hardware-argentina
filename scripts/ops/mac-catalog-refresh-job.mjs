// Job Mac local. La activación de launchd y cualquier prueba HTTP real pertenecen al coordinador.
import { randomUUID } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync,
  realpathSync, readdirSync, renameSync, rmdirSync, statSync, statfsSync, unlinkSync, writeFileSync, chmodSync, fsyncSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { hashFile, loadRuntimeConfig, validatePointer, immutableDatabasePath,
  readTransportSecret, TRANSPORT_HEADER } from './mac-catalog-service.mjs';
import { hasObservationClockCertificate } from '../pilots/cloudflare-catalog/observation-time.mjs';

const GiB = 1024 ** 3, MiB = 1024 ** 2;
const fail = code => { throw Error(code); };
const codeOf = error => /^MAC_JOB_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'MAC_JOB_FAILED';
const json = value => JSON.stringify(value);
const hex = /^[a-f0-9]{64}$/;
const producer = 'mac-catalog-refresh-job-v1';
const scope = '500 ofertas conocidas CompraGamer por tick; no acredita catálogo entero ni otras tiendas.';
const upstreamScope = scope + ' Además, hasta1000 observaciones existentes del productor público, con cursor y control de identidad.';
// Sólo códigos conocidos: un mensaje en mayúsculas también puede contener secretos.
const RUNNER_CODES = new Set(`
 MAC_REFRESH_FAILED RUNNER_TIMEOUT RUNNER_ABORTED
 MAC_REFRESH_BUDGET_ALREADY_LOCAL MAC_REFRESH_BUDGET_AMBIGUOUS MAC_REFRESH_BUDGET_INITIALIZATION_REQUIRED
 MAC_REFRESH_BUDGET_LEGACY_INVALID MAC_REFRESH_BUDGET_LIMIT MAC_REFRESH_BUDGET_MARKER
 MAC_REFRESH_BUDGET_MIGRATION_OPTIONS MAC_REFRESH_BUDGET_POLICY_CHANGE MAC_REFRESH_BUDGET_TABLE MAC_REFRESH_BUDGET_TRANSACTION
 MAC_REFRESH_CAPTURE_REQUIRES_SWEEP MAC_REFRESH_COUNTS MAC_REFRESH_DESTINATION MAC_REFRESH_DESTINATION_INODE
 MAC_REFRESH_FTS_COUNTS MAC_REFRESH_INTEGRITY MAC_REFRESH_LIMIT MAC_REFRESH_MANIFEST MAC_REFRESH_NEW_DIRECTORY
 MAC_REFRESH_OFFERS MAC_REFRESH_OFFER_COLUMNS MAC_REFRESH_PREPARED_COPY_REQUIRES_OPT_IN MAC_REFRESH_PRODUCT_COLUMNS
 MAC_REFRESH_SCOPE_CHANGED MAC_REFRESH_SNAPSHOT MAC_REFRESH_SOURCE_CHANGED MAC_REFRESH_SOURCE_FILE
 MAC_REFRESH_SOURCE_OR_CERTIFICATE_CHANGED MAC_REFRESH_SOURCE_WAL_ACTIVE MAC_REFRESH_STORES MAC_REFRESH_SUMMARY_COUNTS
 MAC_REFRESH_SWEEP_STORE MAC_REFRESH_SWEEP_CAPTURE_OR_PROOF_REQUIRED MAC_REFRESH_UNSUPPORTED_EXPLICIT_TARGET
 MAC_REFRESH_UPSTREAM_CONFIG MAC_REFRESH_USAGE MAC_REFRESH_WINDOWS MAC_DAILY_BUDGET_POLICY_REQUIRED
 UPSTREAM_CURSOR_INVALID UPSTREAM_CURSOR_STALLED UPSTREAM_DUPLICATE_CONFLICT UPSTREAM_HISTORY_CONFLICT UPSTREAM_INPUT_INVALID
 UPSTREAM_LOCAL_COLUMNS_INVALID UPSTREAM_PAGE_INVALID UPSTREAM_PRIORITY_INVALID UPSTREAM_PRIORITY_RESPONSE
 UPSTREAM_PUBLIC_CONFIG_INVALID UPSTREAM_PUBLIC_KEY_REQUIRED UPSTREAM_READ_FAILED UPSTREAM_RESPONSE_TOO_LARGE
 UPSTREAM_ROW_DUPLICATE_OR_INVALID UPSTREAM_STAGING_REQUIRED UPSTREAM_WRITE_CONFLICT
 OBSERVATION_CLOCK_COUNTS OBSERVATION_CLOCK_DATE_MISMATCH OBSERVATION_CLOCK_DATE_TYPE OBSERVATION_CLOCK_TRANSACTION_ACTIVE
 CATALOG_QC_CLOCK_OR_PROJECTION_INVALID CATALOG_QC_CLOCK_TRANSITION_DURING_COPY CATALOG_QC_NEW_COPY_REQUIRED
 CATALOG_QC_OFFERS_CHANGED CATALOG_QC_OFFER_BINDING_FAILED CATALOG_QC_OFFER_COLUMNS_INVALID
 CATALOG_QC_PRODUCT_COLUMNS_INVALID CATALOG_QC_SUMMARY_MISSING
 DAILY_BUDGET_CLOCK_REGRESSION DAILY_BUDGET_INVALID_CLOCK DAILY_BUDGET_INVALID_ESTIMATE DAILY_BUDGET_INVALID_LIMIT
 DAILY_BUDGET_LIMIT_BELOW_USAGE DAILY_BUDGET_LIMIT_INCREASE DAILY_BUDGET_TRANSACTION_REQUIRED DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED
 ERR_SQLITE_ERROR ERR_MODULE_NOT_FOUND MODULE_NOT_FOUND ERR_INVALID_ARG_TYPE
 EACCES ENOENT ENOSPC EMFILE ENOMEM EIO EPIPE ECONNRESET ECONNREFUSED ENOTFOUND ETIMEDOUT
 UND_ERR_CONNECT_TIMEOUT UND_ERR_HEADERS_TIMEOUT UND_ERR_BODY_TIMEOUT UND_ERR_SOCKET
`.trim().split(/\s+/));
const RUNNER_ERROR_MARKER = 'COMPARADOR_RUNNER_ERROR:';
const MAX_RUNNER_STDERR_BYTES = 4096;
export function safeRunnerCode(error) {
  for (const value of [error?.code, error?.cause?.code, error?.message]) {
    if (typeof value !== 'string') continue;
    if (value.length <= 96 && /^[A-Z][A-Z_]+$/.test(value) && RUNNER_CODES.has(value)) return value;
    if (/^DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED:\d{1,10}\/\d{1,10}$/.test(value)) return 'DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED';
  }
  return error?.name === 'TimeoutError' ? 'RUNNER_TIMEOUT' : error?.name === 'AbortError' ? 'RUNNER_ABORTED' : 'MAC_REFRESH_FAILED';
}
/** Drena stderr con una cola limitada; jamás devuelve texto, stack ni líneas arbitrarias. */
export function createRunnerDiagnosticReader() {
  let tail = Buffer.alloc(0);
  return {
    write(bytes) {
      const chunk = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      tail = Buffer.concat([tail, chunk.subarray(Math.max(0, chunk.length - MAX_RUNNER_STDERR_BYTES))]);
      if (tail.length > MAX_RUNNER_STDERR_BYTES) tail = tail.subarray(tail.length - MAX_RUNNER_STDERR_BYTES);
    },
    code() {
      let code = 'MAC_REFRESH_FAILED';
      for (const line of tail.toString('utf8').split('\n').slice(0, -1)) {
        if (!line.startsWith(RUNNER_ERROR_MARKER)) continue;
        const value = line.slice(RUNNER_ERROR_MARKER.length);
        if (value.length <= 96 && /^[A-Z][A-Z_]+$/.test(value) && RUNNER_CODES.has(value)) code = value;
      }
      return code;
    },
  };
}
function runnerFailure(code) { return Object.assign(Error('MAC_JOB_RUNNER_FAILED'), { runnerCode: safeRunnerCode({ code }) }); }
function owner(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
    || typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail('MAC_JOB_LOCK_INVALID');
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (value.version !== 1 || !Number.isSafeInteger(value.pid) || value.pid < 1
    || !/^[a-f0-9-]{36}$/.test(value.nonce) || !Number.isFinite(Date.parse(value.createdAt))) fail('MAC_JOB_LOCK_INVALID');
  return value;
}
export function processIsDead(pid, kill = process.kill) {
  try { kill(pid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; }
}
function writeOwner(file, value) {
  const fd = openSync(file, 'wx', 0o600);
  try { writeFileSync(fd, json(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}
/** Reclaim serializado. Un guard abandonado exige revisión: nunca se elimina a ciegas. */
export function acquireJobLock(root, { kill = process.kill, now = Date.now() } = {}) {
  const path = join(root, 'refresh.lock'), recovery = join(root, 'refresh-recovery.lock');
  const ours = { version: 1, pid: process.pid, nonce: randomUUID(), createdAt: new Date(now).toISOString() };
  const assertOwned = () => { if (owner(path).nonce !== ours.nonce) fail('MAC_JOB_LOCK_LOST'); };
  const release = () => { assertOwned(); unlinkSync(path); };
  if (existsSync(recovery)) fail('MAC_JOB_RECOVERY_REQUIRES_REVIEW');
  try {
    writeOwner(path, ours);
    if (existsSync(recovery)) { release(); fail('MAC_JOB_BUSY'); }
    return { assertOwned, release, nonce: ours.nonce };
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  try { writeOwner(recovery, ours); } catch (error) { if (error.code === 'EEXIST') fail('MAC_JOB_BUSY'); throw error; }
  try {
    const previous = owner(path);
    if (!processIsDead(previous.pid, kill)) fail('MAC_JOB_BUSY');
    // Otros arranques detectan recovery antes y después de crear su lock.
    if (owner(path).nonce !== previous.nonce) fail('MAC_JOB_LOCK_CHANGED');
    unlinkSync(path);
    try { writeOwner(path, ours); } catch (error) { if (error.code === 'EEXIST') fail('MAC_JOB_BUSY'); throw error; }
    return { assertOwned, release, nonce: ours.nonce };
  } finally {
    if (owner(recovery).nonce !== ours.nonce) fail('MAC_JOB_LOCK_LOST');
    unlinkSync(recovery);
  }
}

export function jobSettings(runtime) {
  const value = runtime.refreshJob ?? {};
  const settings = { deadlineMs: value.deadlineMs ?? 540000, maxStorageBytes: value.maxStorageBytes ?? 8 * GiB,
    reserveFreeBytes: value.reserveFreeBytes ?? 2 * GiB, ackTimeoutMs: value.ackTimeoutMs ?? 30000,
    syncUpstream: value.syncUpstream ?? false };
  if (typeof settings.syncUpstream !== 'boolean' || settings.syncUpstream && !runtime.envFile) fail('MAC_JOB_UPSTREAM_CONFIG');
  for (const [key, min, max] of [['deadlineMs', 1000, 600000], ['maxStorageBytes', MiB, 100 * GiB],
    ['reserveFreeBytes', 0, 100 * GiB], ['ackTimeoutMs', 1, 30000]])
    if (!Number.isSafeInteger(settings[key]) || settings[key] < min || settings[key] > max) fail('MAC_JOB_SETTINGS');
  return settings;
}
export function directoryBytes(root) {
  let total = 0;
  for (const item of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, item.name), stat = lstatSync(path);
    if (stat.isSymbolicLink()) fail('MAC_JOB_STORAGE_SYMLINK');
    if (stat.isDirectory()) total += directoryBytes(path);
    else if (stat.isFile()) total += stat.size;
    else fail('MAC_JOB_STORAGE_FILE_TYPE');
  }
  return total;
}
export function checkStorage(dataDir, sourceBytes, settings, disk = statfsSync(dataDir)) {
  const used = directoryBytes(dataDir), growth = sourceBytes * 3 + 128 * MiB;
  const free = Number(disk.bavail) * Number(disk.bsize);
  if (!Number.isSafeInteger(used + growth) || used + growth > settings.maxStorageBytes) fail('MAC_JOB_STORAGE_LIMIT');
  if (free < growth + settings.reserveFreeBytes) fail('MAC_JOB_DISK_RESERVE');
  return { usedBytes: used, estimatedPeakGrowthBytes: growth, freeBytes: free,
    maxStorageBytes: settings.maxStorageBytes, reserveFreeBytes: settings.reserveFreeBytes };
}
function readSourceFacts(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const snapshot = JSON.parse(String(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()?.value));
    const manifest = JSON.parse(String(db.prepare("SELECT value FROM pilot_meta WHERE key='production_catalog'").get()?.value));
    if (!manifest.complete || !manifest.countsVerified || !hex.test(manifest.fingerprint)
      || manifest.fingerprint !== snapshot.catalog?.fingerprint || json(manifest.counts) !== json(snapshot.counts)) fail('MAC_JOB_SOURCE_CERTIFICATE');
    return { fingerprint: manifest.fingerprint, counts: manifest.counts,
      initializeMacBudget: !db.prepare("SELECT value FROM pilot_meta WHERE key='mac_budget_local'").get() };
  } finally { db.close(); }
}
function validRemoteReadCount(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 1000; }
export function validatePromotionReport(report, { source, pointer, facts, directory, now, syncUpstream = false }) {
  const candidate = report?.candidate, promotion = report?.promotion;
  if (syncUpstream && (!report?.upstream || report.upstream.receivedRows !== report.remoteRowsRead
    || report.upstream.accepted + report.upstream.rejected !== report.upstream.read
    || report.upstream.remoteRowsWritten !== 0 || report.upstream.productionActivated !== false
    || !Number.isSafeInteger(report.upstream.requests) || report.upstream.requests < 1 || report.upstream.requests > 5))
    fail('MAC_JOB_UPSTREAM_REPORT');
  if (report?.version !== 1 || report.promotionReady !== true || report.productionActivated !== false
    || !validRemoteReadCount(report.remoteRowsRead) || !syncUpstream && report.remoteRowsRead !== 0 || report.remoteRowsWritten !== 0
    || report.source?.path !== source || report.source.sha256 !== pointer.sha256 || report.source.fingerprint !== pointer.fingerprint
    || promotion?.expectedSourceSha256 !== pointer.sha256 || promotion.expectedSourceFingerprint !== pointer.fingerprint
    || candidate?.path !== join(directory, 'candidate.sqlite') || !hex.test(candidate.sha256) || !hex.test(candidate.fingerprint)
    || !/^mac-refresh-\d+$/.test(candidate.generation) || json(candidate.counts) !== json(facts.counts)
    || !hasObservationClockCertificate(candidate.certificate, facts.counts.product_prices)
    || report.qc?.productionActivated !== false || report.qc?.localOnly !== true
    || report.qc.products !== facts.counts.products || report.qc.offers !== facts.counts.product_prices
    || !Number.isFinite(Date.parse(promotion.validUntil)) || Date.parse(promotion.validUntil) <= now
    || promotion.validUntil !== report.qc.validUntil || !report.limits?.sweep || report.limits.maxTargets !== 500
    || report.limits.refreshFreshMinutes !== 120 || !Number.isSafeInteger(report.limits.maxHttp) || report.limits.maxHttp > 10)
    fail('MAC_JOB_PROMOTION_REPORT');
  return candidate;
}
/** Sólo elimina nombres creados por el runner en el directorio propio de este tick. */
export function cleanupWorking(root, directory, nonce) {
  if (dirname(directory) !== root || !/^tick-[a-f0-9-]{36}$/.test(directory.slice(root.length + 1))) fail('MAC_JOB_CLEANUP_SCOPE');
  const stamp = directory + '.owner.json';
  if (JSON.parse(readFileSync(stamp, 'utf8')).nonce !== nonce) fail('MAC_JOB_CLEANUP_OWNER');
  let retainedUnknownFiles = false;
  if (existsSync(directory)) {
    if (realpathSync(directory) !== directory || !lstatSync(directory).isDirectory()) fail('MAC_JOB_CLEANUP_PATH');
    const allow = /^(working|candidate)\.sqlite(-(wal|shm|journal))?$|^promotion\.json$/;
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), stat = lstatSync(path);
      if (!allow.test(name) || !stat.isFile() || stat.isSymbolicLink()) { retainedUnknownFiles = true; continue; }
      unlinkSync(path);
    }
    if (!retainedUnknownFiles) rmdirSync(directory);
  }
  if (!retainedUnknownFiles) unlinkSync(stamp);
  return { retainedUnknownFiles };
}
function atomicJson(path, value, nonce) {
  const temp = path + '.tmp-' + nonce;
  const fd = openSync(temp, 'wx', 0o600);
  try { writeFileSync(fd, json(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  try { renameSync(temp, path); } catch (error) { unlinkSync(temp); throw error; }
  const parent = openSync(dirname(path), 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
}
async function defaultRunner(config, { signal, runtime }) {
  const entry = join(runtime.releaseDir, 'scripts/pilots/mac-catalog-refresh.mjs');
  // El import también queda protegido. No dejar que Node imprima la excepción completa.
  const script = `const RUNNER_CODES=new Set(${json([...RUNNER_CODES])});const safeRunnerCode=${safeRunnerCode.toString()};
    try {const {runMacCatalogRefresh}=await import(${json(pathToFileURL(entry).href)});let input='';for await(const bytes of process.stdin)input+=bytes;await runMacCatalogRefresh(JSON.parse(input));}
    catch(error){process.stderr.write(${json('\n' + RUNNER_ERROR_MARKER)}+safeRunnerCode(error)+${json('\n')});process.exitCode=1;}`;
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: runtime.releaseDir, stdio: ['pipe', 'ignore', 'pipe'], env: process.env });
    const diagnostic = createRunnerDiagnosticReader();
    child.stderr.on('data', bytes => diagnostic.write(bytes));
    let killTimer, aborted = false;
    const abort = () => { aborted = true; child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 3000); };
    signal.addEventListener('abort', abort, { once: true });
    child.once('error', error => reject(runnerFailure(safeRunnerCode(error))));
    child.once('close', code => {
      clearTimeout(killTimer); signal.removeEventListener('abort', abort);
      if (aborted) reject(Error('MAC_JOB_DEADLINE')); else if (code !== 0) reject(runnerFailure(diagnostic.code())); else done();
    });
    child.stdin.on('error', () => {}); child.stdin.end(json(config));
    if (signal.aborted) abort();
  });
  return JSON.parse(readFileSync(join(config.directory, 'promotion.json'), 'utf8'));
}
async function defaultValidate(runtime, pointer) {
  const { openCandidate } = await import(pathToFileURL(join(runtime.releaseDir, 'mac-catalog-server.mjs')).href);
  const candidate = await openCandidate(runtime.dataDir, pointer); candidate.db.close();
}
/** Se ejecuta únicamente en el job real: el secreto nunca entra en recibos ni logs. */
async function defaultProbe(runtime, _pointer, { timeoutMs }) {
  const secret = readTransportSecret(runtime.transportSecretFile);
  const response = await fetch('http://127.0.0.1:' + runtime.port + '/__mac_catalog/health', {
    headers: { [TRANSPORT_HEADER]: secret }, redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.min(2000, timeoutMs))) });
  if (response.status !== 200) { await response.body?.cancel(); return null; }
  return response.json();
}
const acknowledges = (health, pointer) => health?.readOnly === true && health.generation === pointer.generation
  && health.fingerprint === pointer.fingerprint;
export async function waitForRuntimeAck(runtime, pointer, { probe = defaultProbe, clock = Date.now, deadline,
  timeoutMs = 30000, sleep = milliseconds => new Promise(done => setTimeout(done, milliseconds)) } = {}) {
  const until = Math.min(deadline, clock() + timeoutMs);
  while (clock() < until) {
    try {
      const health = await probe(runtime, pointer, { timeoutMs: until - clock() });
      if (clock() <= until && acknowledges(health, pointer)) return { confirmed: true,
        generation: pointer.generation, fingerprint: pointer.fingerprint, at: new Date(clock()).toISOString() };
    } catch { /* Una caída o respuesta inválida conserva snapshots y previous. */ }
    if (clock() >= until) break;
    await sleep(Math.min(250, until - clock()));
  }
  return { confirmed: false, generation: pointer.generation, fingerprint: pointer.fingerprint, code: 'MAC_JOB_ACK_TIMEOUT' };
}

function recognizedReceipt(value, filename) {
  if (value?.version !== 1 || value.producer !== producer || value.status !== 'promoted' || value.promoted !== true
    || !/^tick-[a-f0-9-]{36}$/.test(value.id) || filename !== value.id + '.json'
    || !validRemoteReadCount(value.remoteRowsRead) || value.remoteRowsWritten !== 0
    || ![scope, upstreamScope].includes(value.scope) || value.scope === scope && value.remoteRowsRead !== 0
    || !Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.completedAt))
    || Date.parse(value.completedAt) < Date.parse(value.startedAt) || !Number.isSafeInteger(value.durationMs) || value.durationMs < 0 || value.durationMs > 600000
    || !Number.isFinite(Date.parse(value.runtimeAck?.at)) || Date.parse(value.runtimeAck.at) < Date.parse(value.startedAt)
    || Date.parse(value.runtimeAck.at) > Date.parse(value.completedAt) || !acknowledges({ readOnly: value.runtimeAck?.confirmed,
      generation: value.runtimeAck?.generation, fingerprint: value.runtimeAck?.fingerprint }, value.current)) return null;
  const pointer = validatePointer(value.current);
  validatePointer(value.previous);
  if (!/^mac-refresh-\d+$/.test(pointer.generation) || pointer.database !== 'snapshots/' + pointer.generation + '.sqlite') return null;
  return pointer;
}
/** Sólo snapshots derivados acreditados por recibo propio + ACK; nunca fuentes o copias manuales. */
export async function pruneJobSnapshots(runtime, expected, { lock, probe = defaultProbe, clock = Date.now, deadline }) {
  const root = resolve(runtime.dataDir), manifest = join(root, 'current.json'), previousFile = join(root, 'previous.json');
  const snapshotDir = join(root, 'snapshots'), receipts = join(root, 'receipts');
  const result = { status: 'complete', removedSnapshots: 0, removedBytes: 0, preservedUnrecognized: 0,
    preservedProtected: 0, rejectedSnapshots: 0, rejectedReceipts: 0 };
  if (realpathSync(snapshotDir) !== snapshotDir || realpathSync(receipts) !== receipts) fail('MAC_JOB_RETENTION_PATH');
  const before = readFileSync(manifest, 'utf8'), previousText = readFileSync(previousFile, 'utf8');
  const current = validatePointer(JSON.parse(before)), previous = validatePointer(JSON.parse(previousText));
  if (json(current) !== json(expected)) return { ...result, status: 'stopped-pointer-changed' };
  const protectedFiles = new Set([current.database, previous.database]), protectedHashes = new Set([current.sha256, previous.sha256]);
  const known = new Map(), conflicts = new Set();
  for (const entry of readdirSync(receipts, { withFileTypes: true })) {
    if (!/^tick-[a-f0-9-]{36}\.json$/.test(entry.name)) continue;
    try {
      const file = join(receipts, entry.name), stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
        || typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw Error('receipt');
      const pointer = recognizedReceipt(JSON.parse(readFileSync(file, 'utf8')), entry.name);
      if (!pointer) { result.rejectedReceipts++; continue; }
      if (known.has(pointer.database) && json(known.get(pointer.database)) !== json(pointer)) conflicts.add(pointer.database);
      known.set(pointer.database, pointer);
    } catch { result.rejectedReceipts++; }
  }
  for (const entry of readdirSync(snapshotDir, { withFileTypes: true })) {
    const database = 'snapshots/' + entry.name, pointer = known.get(database);
    if (protectedFiles.has(database) || pointer && protectedHashes.has(pointer.sha256)) { result.preservedProtected++; continue; }
    if (!pointer || conflicts.has(database)) { result.preservedUnrecognized++; continue; }
    if (clock() >= deadline) return { ...result, status: 'stopped-deadline' };
    try {
      const file = immutableDatabasePath(root, pointer), stat = lstatSync(file);
      if ((stat.mode & 0o777) !== 0o400 || stat.nlink !== 1 || typeof process.getuid === 'function' && stat.uid !== process.getuid()
        || await hashFile(file) !== pointer.sha256) { result.rejectedSnapshots++; continue; }
      try { lock.assertOwned(); } catch { return { ...result, status: 'stopped-lock-lost' }; }
      if (readFileSync(manifest, 'utf8') !== before || readFileSync(previousFile, 'utf8') !== previousText)
        return { ...result, status: 'stopped-pointer-changed' };
      let health;
      try { health = await probe(runtime, current, { timeoutMs: Math.max(1, Math.min(2000, deadline - clock())) }); }
      catch { return { ...result, status: 'stopped-no-ack' }; }
      if (clock() >= deadline || !acknowledges(health, current)) return { ...result, status: 'stopped-no-ack' };
      try { lock.assertOwned(); } catch { return { ...result, status: 'stopped-lock-lost' }; }
      if (readFileSync(manifest, 'utf8') !== before || readFileSync(previousFile, 'utf8') !== previousText)
        return { ...result, status: 'stopped-pointer-changed' };
      const finalStat = lstatSync(immutableDatabasePath(root, pointer));
      if (finalStat.ino !== stat.ino || finalStat.dev !== stat.dev || finalStat.size !== stat.size || finalStat.mtimeMs !== stat.mtimeMs
        || finalStat.ctimeMs !== stat.ctimeMs || (finalStat.mode & 0o777) !== 0o400 || finalStat.nlink !== 1)
        { result.rejectedSnapshots++; continue; }
      // No await entre última comprobación del pointer/lock y eliminación de este derivado.
      unlinkSync(file); result.removedSnapshots++; result.removedBytes += stat.size;
    } catch (error) {
      if (['MAC_JOB_LOCK_LOST', 'MAC_JOB_LOCK_INVALID'].includes(error.message)) return { ...result, status: 'stopped-lock-lost' };
      result.rejectedSnapshots++;
    }
  }
  return result;
}
function compactObservation(report) {
  const observation = report?.observation ?? {}, failures = {};
  for (const result of observation.results ?? []) if (result.status === 'failed') {
    const raw = result.outcome ?? result.code;
    const code = /^[a-zA-Z0-9_-]{1,96}$/.test(raw ?? '') ? raw : 'unknown'; failures[code] = (failures[code] ?? 0) + 1;
  }
  const numeric = object => Object.fromEntries(Object.entries(object ?? {}).filter(([, value]) => Number.isFinite(value) && value >= 0));
  const http = Number.isFinite(observation.sourceHttp?.requests) ? { compragamer: numeric(observation.sourceHttp) }
    : Object.fromEntries(Object.entries(observation.sourceHttp ?? {}).slice(0, 40)
    .filter(([store]) => /^[a-z0-9-]{1,64}$/.test(store)).map(([store, values]) => [store, numeric(values)]));
  const capture = report?.capture ? { sourceRecords: report.capture.sourceRecords,
    sourceListings: report.capture.sourceListings, stagedWrites: report.capture.stagedWrites,
    sourceHttp: numeric(report.capture.sourceHttp) } : null;
  const httpRequests = Number.isFinite(http.compragamer?.requests) && (capture === null || Number.isFinite(capture.sourceHttp.requests))
    ? http.compragamer.requests + (capture?.sourceHttp.requests ?? 0) : null;
  const coverage = observation.coverage ? { asOf: observation.coverage.asOf, freshMs: observation.coverage.freshMs,
    totals: numeric(observation.coverage.totals) } : null;
  return { selected: report?.selected?.length ?? null, attempted: observation.attempted ?? null,
    observed: observation.observed ?? null, comparable: observation.comparable ?? null,
    deferred: observation.deferred ?? null, failures, sourceHttp: report ? http : null, capture, httpRequests,
    scope: report?.candidate?.counts ?? null, coverage,
    upstream: report?.upstream ? { ...numeric({ read: report.upstream.read, receivedRows: report.upstream.receivedRows, accepted: report.upstream.accepted,
      rejected: report.upstream.rejected, requests: report.upstream.requests }), capped: report.upstream.capped === true } : null };
}

export async function runMacRefreshJob(configFile, dependencies = {}) {
  const clock = dependencies.clock ?? Date.now, runtime = loadRuntimeConfig(configFile), settings = jobSettings(runtime);
  const root = resolve(runtime.dataDir);
  if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) fail('MAC_JOB_DATA_ROOT');
  const lock = acquireJobLock(root, { kill: dependencies.kill, now: clock() });
  const startedAt = clock(), deadline = startedAt + settings.deadlineMs, id = 'tick-' + randomUUID();
  const jobs = join(root, 'jobs'), receipts = join(root, 'receipts'), manifest = join(root, 'current.json');
  let directory, report, receipt, promoted = false, controller, timer, newPointer;
  try {
    mkdirSync(jobs, { recursive: true, mode: 0o700 }); mkdirSync(receipts, { recursive: true, mode: 0o700 });
    if (realpathSync(jobs) !== jobs || realpathSync(receipts) !== receipts) fail('MAC_JOB_STORAGE_SYMLINK');
    const sourceText = readFileSync(manifest, 'utf8'), pointer = validatePointer(JSON.parse(sourceText));
    const source = immutableDatabasePath(root, pointer);
    if (await hashFile(source) !== pointer.sha256) fail('MAC_JOB_SOURCE_HASH');
    const facts = readSourceFacts(source);
    if (facts.fingerprint !== pointer.fingerprint) fail('MAC_JOB_SOURCE_CERTIFICATE');
    const storage = checkStorage(root, statSync(source).size, settings, dependencies.disk?.());
    directory = join(jobs, id);
    writeFileSync(directory + '.owner.json', json({ nonce: lock.nonce, id }), { flag: 'wx', mode: 0o600 });
    controller = new AbortController();
    timer = setTimeout(() => controller.abort(), Math.max(1, deadline - clock() - 3000));
    const runnerConfig = { source, directory, sweep: true, maxTargets: 500, storeIds: ['compragamer'],
      freshMinutes: 120, refreshCapture: true, initializeMacBudget: facts.initializeMacBudget,
      ...(settings.syncUpstream ? { upstreamEnvFile: runtime.envFile } : {}) };
    report = await (dependencies.runner ?? defaultRunner)(runnerConfig, { signal: controller.signal, runtime });
    clearTimeout(timer);
    if (controller.signal.aborted || clock() >= deadline) fail('MAC_JOB_DEADLINE');
    const candidate = validatePromotionReport(report, { source, pointer, facts, directory, now: clock(), syncUpstream: settings.syncUpstream });
    if (realpathSync(candidate.path) !== candidate.path || !lstatSync(candidate.path).isFile()
      || ['-wal', '-shm', '-journal'].some(suffix => existsSync(candidate.path + suffix))) fail('MAC_JOB_CANDIDATE_FILE');
    if (await hashFile(candidate.path) !== candidate.sha256) fail('MAC_JOB_CANDIDATE_HASH');
    const next = validatePointer({ version: 1, generation: candidate.generation, database: 'snapshots/' + candidate.generation + '.sqlite',
      sha256: candidate.sha256, fingerprint: candidate.fingerprint });
    newPointer = next;
    const finalPath = join(root, next.database);
    copyFileSync(candidate.path, finalPath, constants.COPYFILE_EXCL); chmodSync(finalPath, 0o400);
    await (dependencies.validateCandidate ?? defaultValidate)(runtime, next);
    if (await hashFile(finalPath) !== next.sha256) fail('MAC_JOB_CANDIDATE_HASH');
    if (clock() >= deadline || clock() >= Date.parse(report.promotion.validUntil)) fail('MAC_JOB_DEADLINE');
    lock.assertOwned();
    if (await hashFile(source) !== pointer.sha256) fail('MAC_JOB_SOURCE_POINTER_CHANGED');
    lock.assertOwned();
    // La espera del hash también puede coincidir con un rollback manual.
    if (readFileSync(manifest, 'utf8') !== sourceText) fail('MAC_JOB_SOURCE_POINTER_CHANGED');
    // Ambos pasos son síncronos y el lock excluye otros jobs. El servidor drena sus lecturas.
    atomicJson(join(root, 'previous.json'), pointer, lock.nonce);
    atomicJson(manifest, next, lock.nonce);
    promoted = true;
    const runtimeAck = await waitForRuntimeAck(runtime, next, { probe: dependencies.probe, clock, deadline,
      timeoutMs: settings.ackTimeoutMs, sleep: dependencies.sleep });
    const retention = runtimeAck.confirmed ? await pruneJobSnapshots(runtime, next, { lock, probe: dependencies.probe, clock, deadline })
      : { status: 'skipped-no-ack', removedSnapshots: 0, removedBytes: 0 };
    receipt = { version: 1, producer, id, status: runtimeAck.confirmed ? 'promoted' : 'promoted-unconfirmed', promoted,
      runtimeAck, retention, startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date(clock()).toISOString(), durationMs: clock() - startedAt, previous: pointer, current: next,
      observation: compactObservation(report), storage, remoteRowsRead: report.remoteRowsRead, remoteRowsWritten: 0,
      rollback: 'Restaurar previous.json mediante rename atómico; no editar una SQLite abierta.',
      scope: settings.syncUpstream ? upstreamScope : scope };
    return receipt;
  } catch (error) {
    // Un error de fsync posterior al rename no debe ocultar un pointer ya cambiado.
    if (newPointer) try { promoted = json(JSON.parse(readFileSync(manifest, 'utf8'))) === json(newPointer); } catch { /* Conserva estado conocido. */ }
    receipt = { version: 1, producer, id, status: 'failed', code: codeOf(error), promoted,
      ...(error?.message === 'MAC_JOB_RUNNER_FAILED' ? { runnerCode: safeRunnerCode({ code: error.runnerCode }) } : {}),
      startedAt: new Date(startedAt).toISOString(), completedAt: new Date(clock()).toISOString(), durationMs: clock() - startedAt,
      observation: compactObservation(report), remoteRowsRead: report?.remoteRowsRead ?? (settings.syncUpstream ? null : 0), remoteRowsWritten: 0 };
    throw Object.assign(Error(receipt.code), { receipt });
  } finally {
    clearTimeout(timer);
    if (directory) {
      try { receipt.cleanup = cleanupWorking(jobs, directory, lock.nonce); }
      catch { if (receipt) receipt.cleanup = { status: 'retained-for-review' }; }
    }
    try { if (receipt) atomicJson(join(receipts, id + '.json'), receipt, lock.nonce); }
    finally { lock.release(); }
  }
}

export function refreshJobPlan({ stableRoot, nodeBinary, label = 'ar.com.comparador.mac-catalog-refresh' }) {
  if (typeof stableRoot !== 'string' || typeof nodeBinary !== 'string' || !isAbsolute(stableRoot)
    || !isAbsolute(nodeBinary) || !/^[a-z0-9.-]+$/.test(label)) fail('MAC_JOB_PLAN');
  const root = resolve(stableRoot), escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  if (/(^|\/)(outputs|\.codex|worktrees)(\/|$)/.test(root)) fail('MAC_JOB_PLAN_UNSTABLE');
  const args = [nodeBinary, join(root, 'release/scripts/ops/mac-catalog-refresh-job.mjs'), '--config', join(root, 'runtime.json')];
  return { status: 'plan-only', installsService: false, intervalSeconds: 900, label,
    plist: `<?xml version="1.0"?><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(arg => '<string>' + escape(arg) + '</string>').join('')}</array><key>WorkingDirectory</key><string>${escape(join(root, 'release'))}</string><key>RunAtLoad</key><true/><key>StartInterval</key><integer>900</integer><key>StandardOutPath</key><string>${escape(join(root, 'logs/refresh.log'))}</string><key>StandardErrorPath</key><string>${escape(join(root, 'logs/refresh-error.log'))}</string></dict></plist>`,
    gates: ['Probar tick real y promoción observada por servidor antes de activar.',
      'Retiene current/previous/manuales; poda sólo derivados con recibo propio confirmado y hash verificado.',
      'Sin ACK o con pointer cambiado no poda. Datos no reconocidos se conservan y pueden detener el storage gate.',
      'Lock de recuperación abandonado falla cerrado y necesita revisión del coordinador.',
      'StartInterval requiere login y Mac despierta; no promete cobertura de otras tiendas.'] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === 'plan' && args.length === 3) process.stdout.write(json(refreshJobPlan({ stableRoot: args[1], nodeBinary: args[2] })) + '\n');
  else if (args[0] === '--config' && args.length === 2) runMacRefreshJob(resolve(args[1])).then(receipt => {
    process.stdout.write(json(receipt) + '\n');
    if (receipt.status !== 'promoted') process.exitCode = 1;
  }).catch(error => { process.stderr.write(json(error.receipt ?? { status: 'failed', code: codeOf(error) }) + '\n'); process.exitCode = 1; });
  else fail('MAC_JOB_ARGUMENTS');
}
