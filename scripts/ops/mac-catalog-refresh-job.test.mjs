import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hashFile } from './mac-catalog-service.mjs';
import { acquireJobLock, checkStorage, cleanupWorking, pruneJobSnapshots, refreshJobPlan,
  runMacRefreshJob as runJob } from './mac-catalog-refresh-job.mjs';

const fingerprint = 'a'.repeat(64), nextFingerprint = 'b'.repeat(64);
const counts = { products: 1, product_prices: 1, catalog_price_summaries: 1, stores: 1 };
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const ackProbe = async (_runtime, pointer) => ({ readOnly: true, generation: pointer.generation, fingerprint: pointer.fingerprint });
const runMacRefreshJob = (path, dependencies = {}) => runJob(path, { probe: ackProbe, ...dependencies });
function directory(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mac-refresh-job-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true })); return root;
}
async function fixture(t, withBudget = false) {
  const root = directory(t), source = join(root, 'snapshots/old.sqlite'); mkdirSync(join(root, 'snapshots'));
  const db = new DatabaseSync(source); db.exec('CREATE TABLE pilot_meta(key TEXT PRIMARY KEY,value TEXT)');
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', JSON.stringify({ counts, catalog: { fingerprint } }));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog', JSON.stringify({ fingerprint, counts, complete: true, countsVerified: true }));
  if (withBudget) db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('mac_budget_local', '{}');
  db.close(); chmodSync(source, 0o400);
  const pointer = { version: 1, generation: 'old', database: 'snapshots/old.sqlite', sha256: await hashFile(source), fingerprint };
  writeFileSync(join(root, 'current.json'), JSON.stringify(pointer));
  const config = { version: 1, releaseDir: root, dataDir: root, transportSecretFile: join(root, 'unread-secret'),
    buildDir: '.next', port: 8825, refreshJob: { reserveFreeBytes: 0 } };
  const configFile = join(root, 'runtime.json'); writeFileSync(configFile, JSON.stringify(config));
  return { root, source, pointer, config, configFile };
}
function fakeRunner(f, callback = () => {}) {
  return async (config, context) => {
    assert.equal(config.source, f.source); assert.equal(config.sweep, true); assert.equal(config.maxTargets, 500);
    assert.deepEqual(config.storeIds, ['compragamer']); assert.equal(config.freshMinutes, 120); assert.equal(config.refreshCapture, true);
    mkdirSync(config.directory); copyFileSync(config.source, join(config.directory, 'working.sqlite'));
    const path = join(config.directory, 'candidate.sqlite'); copyFileSync(config.source, path); chmodSync(path, 0o600);
    const db = new DatabaseSync(path); db.prepare("UPDATE pilot_meta SET value=? WHERE key='production_catalog'")
      .run(JSON.stringify({ fingerprint: nextFingerprint, counts, complete: true, countsVerified: true })); db.close();
    const validUntil = new Date(Date.now() + 3600000).toISOString();
    const report = { version: 1, promotionReady: true, productionActivated: false, remoteRowsRead: 0, remoteRowsWritten: 0,
      source: { path: config.source, sha256: f.pointer.sha256, fingerprint },
      candidate: { path, sha256: await hashFile(path), fingerprint: nextFingerprint, counts,
        generation: 'mac-refresh-' + Date.now(), certificate: { version: 1, validated: true, timestampPolicy: 'js-sql-ms-v1', offers: 1 } },
      promotion: { expectedSourceSha256: f.pointer.sha256, expectedSourceFingerprint: fingerprint, validUntil },
      qc: { products: 1, offers: 1, validUntil, localOnly: true, productionActivated: false },
      selected: [{}], observation: { attempted: 1, observed: 1, results: [],
        sourceHttp: { compragamer: { requests: 3, bytes: 100, token: 'not-a-receipt-field' } },
        coverage: { asOf: new Date().toISOString(), freshMs: 86400000, totals: { observedRecent: 1 }, privateData: 'not-a-receipt-field' } },
      limits: { sweep: true, maxTargets: 500, refreshFreshMinutes: 120, maxHttp: 10 } };
    await callback({ config, context, report }); writeFileSync(join(config.directory, 'promotion.json'), JSON.stringify(report));
    return report;
  };
}
const validateCandidate = async (runtime, pointer) => {
  const path = join(runtime.dataDir, pointer.database);
  assert.equal(await hashFile(path), pointer.sha256);
  const db = new DatabaseSync(path, { readOnly: true });
  assert.equal(readFileSync(path).length > 0, true); assert.throws(() => db.exec('CREATE TABLE forbidden(id)'));
  db.close();
};

test('tick promueve sólo copia immutable y conserva previous, fuente y receipt compacta', async t => {
  const f = await fixture(t); let initialized;
  const receipt = await runMacRefreshJob(f.configFile, { runner: fakeRunner(f, ({ config }) => { initialized = config.initializeMacBudget; }), validateCandidate });
  assert.equal(initialized, true); assert.equal(receipt.status, 'promoted'); assert.equal(receipt.remoteRowsWritten, 0);
  assert.deepEqual(read(join(f.root, 'previous.json')), f.pointer); assert.deepEqual(read(join(f.root, 'current.json')), receipt.current);
  assert.equal(await hashFile(f.source), f.pointer.sha256); assert.equal(existsSync(f.source), true);
  assert.deepEqual(receipt.observation.sourceHttp, { compragamer: { requests: 3, bytes: 100 } });
  assert.equal(JSON.stringify(receipt).includes('not-a-receipt-field'), false);
  assert.equal(readdirSync(join(f.root, 'jobs')).length, 0); assert.equal(existsSync(join(f.root, 'refresh.lock')), false);
  assert.equal(readdirSync(join(f.root, 'snapshots')).length, 2);
  assert.equal(read(join(f.root, 'receipts', receipt.id + '.json')).status, 'promoted');
});
test('marker de presupuesto existente nunca solicita reinicialización', async t => {
  const f = await fixture(t, true); let initialized;
  await runMacRefreshJob(f.configFile, { runner: fakeRunner(f, ({ config }) => { initialized = config.initializeMacBudget; }), validateCandidate });
  assert.equal(initialized, false);
});

test('puente explícito transmite sólo ruta pública y conserva lecturas reales en receipt', async t => {
  const f = await fixture(t);
  f.config.envFile = join(f.root, 'public.env'); f.config.refreshJob.syncUpstream = true;
  writeFileSync(f.configFile, JSON.stringify(f.config));
  const receipt = await runMacRefreshJob(f.configFile, { validateCandidate, runner: fakeRunner(f, ({ config, report }) => {
    assert.equal(config.upstreamEnvFile, f.config.envFile);
    report.remoteRowsRead = 12;
    report.upstream = { read: 12, receivedRows: 12, accepted: 3, rejected: 9, requests: 1, capped: false,
      remoteRowsWritten: 0, productionActivated: false, publicKey: 'must-not-appear' };
  }) });
  assert.equal(receipt.remoteRowsRead, 12); assert.equal(receipt.observation.upstream.accepted, 3);
  assert.equal(JSON.stringify(receipt).includes('must-not-appear'), false);
});

test('puente habilitado sin recibo o conteo acotado no cambia pointer', async t => {
  const f = await fixture(t);
  f.config.envFile = join(f.root, 'public.env'); f.config.refreshJob.syncUpstream = true;
  writeFileSync(f.configFile, JSON.stringify(f.config));
  await assert.rejects(runMacRefreshJob(f.configFile, { validateCandidate, runner: fakeRunner(f) }), /UPSTREAM_REPORT/);
  assert.deepEqual(read(join(f.root, 'current.json')), f.pointer);
});
test('receipt suma HTTP captura y sweep plano, sin copiar matched[] ni datos crudos', async t => {
  const f = await fixture(t);
  const receipt = await runMacRefreshJob(f.configFile, { runner: fakeRunner(f, ({ report }) => {
    report.observation.sourceHttp = { requests: 3, bytes: 200 };
    report.capture = { sourceRecords: 10, sourceListings: 8, stagedWrites: 8,
      sourceHttp: { requests: 3, bytes: 100 }, matched: [{ private: 'not-a-receipt-field' }] };
  }), validateCandidate });
  assert.equal(receipt.observation.httpRequests, 6);
  assert.deepEqual(receipt.observation.sourceHttp, { compragamer: { requests: 3, bytes: 200 } });
  assert.equal(JSON.stringify(receipt).includes('not-a-receipt-field'), false);
});
test('reporte sin reloj válido no cambia pointer ni crea snapshot servido', async t => {
  const f = await fixture(t);
  await assert.rejects(runMacRefreshJob(f.configFile, { runner: fakeRunner(f, ({ report }) => { report.candidate.certificate.validated = false; }), validateCandidate }), /PROMOTION_REPORT/);
  assert.deepEqual(read(join(f.root, 'current.json')), f.pointer); assert.equal(readdirSync(join(f.root, 'snapshots')).length, 1);
  assert.equal(readdirSync(join(f.root, 'jobs')).length, 0);
});
test('checksum del candidato y scope del reporte deben coincidir', async t => {
  for (const mode of ['hash', 'scope']) {
    const f = await fixture(t);
    await assert.rejects(runMacRefreshJob(f.configFile, { runner: fakeRunner(f, ({ report }) => {
      if (mode === 'hash') report.candidate.sha256 = '0'.repeat(64);
      else report.candidate.counts = { ...counts, products: 2 };
    }), validateCandidate }), mode === 'hash' ? /CANDIDATE_HASH/ : /PROMOTION_REPORT/);
    assert.deepEqual(read(join(f.root, 'current.json')), f.pointer);
  }
});
test('pointer cambiado mientras lee el runner impide reemplazar la nueva decisión', async t => {
  const f = await fixture(t), replacement = { ...f.pointer, generation: 'manual-new' };
  await assert.rejects(runMacRefreshJob(f.configFile, { runner: fakeRunner(f, () => {
    writeFileSync(join(f.root, 'current.json'), JSON.stringify(replacement));
  }), validateCandidate }), /SOURCE_POINTER_CHANGED/);
  assert.deepEqual(read(join(f.root, 'current.json')), replacement); assert.equal(existsSync(join(f.root, 'previous.json')), false);
});
test('timeout aborta runner propietario y nunca promueve un tick tardío', async t => {
  const f = await fixture(t); f.config.refreshJob.deadlineMs = 1000; writeFileSync(f.configFile, JSON.stringify(f.config));
  let aborted = false;
  const runner = async (_config, { signal }) => new Promise((_done, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(Error('MAC_JOB_DEADLINE')); });
  });
  await assert.rejects(runMacRefreshJob(f.configFile, { runner, validateCandidate }), /DEADLINE/);
  assert.equal(aborted, true); assert.deepEqual(read(join(f.root, 'current.json')), f.pointer);
});
test('storage gate detiene crecimiento y reserva disco antes de invocar lectores', async t => {
  const f = await fixture(t); f.config.refreshJob.maxStorageBytes = 1024 ** 2; writeFileSync(f.configFile, JSON.stringify(f.config));
  let called = false; await assert.rejects(runMacRefreshJob(f.configFile, { runner: async () => { called = true; } }), /STORAGE_LIMIT/);
  assert.equal(called, false);
  assert.throws(() => checkStorage(f.root, 100, { maxStorageBytes: 1024 ** 3, reserveFreeBytes: 100 }, { bavail: 0, bsize: 4096 }), /DISK_RESERVE/);
});
test('lock vivo o PID sin permiso jamás se considera muerto', t => {
  const root = directory(t), first = acquireJobLock(root);
  assert.throws(() => acquireJobLock(root, { kill: () => {} }), /BUSY/);
  assert.throws(() => acquireJobLock(root, { kill: () => { throw Object.assign(Error('permission'), { code: 'EPERM' }); } }), /BUSY/);
  first.assertOwned(); first.release();
});
test('lock stale sólo se recupera tras ESRCH, guard abandonado exige revisión', t => {
  const root = directory(t); writeFileSync(join(root, 'refresh.lock'), JSON.stringify({ version: 1, pid: 999999, nonce: randomUUID(), createdAt: new Date().toISOString() }), { mode: 0o600 });
  const lock = acquireJobLock(root, { kill: () => { throw Object.assign(Error('dead'), { code: 'ESRCH' }); } });
  lock.assertOwned(); lock.release();
  writeFileSync(join(root, 'refresh-recovery.lock'), '{}', { mode: 0o600 });
  assert.throws(() => acquireJobLock(root), /RECOVERY_REQUIRES_REVIEW/);
});
test('dos ticks concurrentes no comparten la fuente ni sobrescriben promoción', async t => {
  const f = await fixture(t); let release, entered;
  const enteredPromise = new Promise(done => { entered = done; }), hold = new Promise(done => { release = done; });
  const first = runMacRefreshJob(f.configFile, { runner: fakeRunner(f, async () => { entered(); await hold; }), validateCandidate });
  await enteredPromise;
  await assert.rejects(runMacRefreshJob(f.configFile, { runner: fakeRunner(f), validateCandidate }), /BUSY/);
  release(); assert.equal((await first).status, 'promoted');
});
test('cleanup sólo borra archivos allowlisted y conserva desconocidos/snapshots', t => {
  const root = directory(t), nonce = randomUUID(), path = join(root, 'tick-' + randomUUID()); mkdirSync(path);
  writeFileSync(path + '.owner.json', JSON.stringify({ nonce })); writeFileSync(join(path, 'working.sqlite'), 'owned');
  writeFileSync(join(path, 'unknown.txt'), 'preserve');
  assert.deepEqual(cleanupWorking(root, path, nonce), { retainedUnknownFiles: true });
  assert.equal(existsSync(join(path, 'working.sqlite')), false); assert.equal(existsSync(join(path, 'unknown.txt')), true);
  assert.throws(() => cleanupWorking(root, path, randomUUID()), /CLEANUP_OWNER/);
});
test('plan launchd fija StartInterval900 y no instala ni admite worktrees', () => {
  const plan = refreshJobPlan({ stableRoot: '/Users/test/Library/Application Support/Comparador', nodeBinary: '/usr/bin/node' });
  assert.equal(plan.installsService, false); assert.match(plan.plist, /<key>StartInterval<\/key><integer>900<\/integer>/);
  assert.throws(() => refreshJobPlan({ stableRoot: '/tmp/outputs/app', nodeBinary: '/usr/bin/node' }), /UNSTABLE/);
});

async function recognizedSnapshot(f, generation, options = {}) {
  const file = join(f.root, 'snapshots', generation + '.sqlite');
  writeFileSync(file, 'derived-' + generation, { mode: 0o400 });
  const pointer = { version: 1, generation, database: 'snapshots/' + generation + '.sqlite', sha256: await hashFile(file), fingerprint };
  const id = 'tick-' + randomUUID(), at = new Date().toISOString(); mkdirSync(join(f.root, 'receipts'), { recursive: true });
  const receipt = { version: 1, producer: 'mac-catalog-refresh-job-v1', id, status: 'promoted', promoted: true,
    current: pointer, previous: f.pointer, startedAt: at, completedAt: at, durationMs: 1,
    runtimeAck: { confirmed: true, generation, fingerprint, at }, remoteRowsRead: 0, remoteRowsWritten: 0,
    scope: '500 ofertas conocidas CompraGamer por tick; no acredita catálogo entero ni otras tiendas.', ...options };
  const receiptFile = join(f.root, 'receipts', id + '.json'); writeFileSync(receiptFile, JSON.stringify(receipt), { mode: 0o600 });
  return { file, pointer, receipt, receiptFile };
}
test('ACK timeout informa pointer ya promovido y conserva previous y todos los snapshots', async t => {
  const f = await fixture(t); f.config.refreshJob.ackTimeoutMs = 5; writeFileSync(f.configFile, JSON.stringify(f.config));
  const stale = await recognizedSnapshot(f, 'mac-refresh-100');
  const receipt = await runMacRefreshJob(f.configFile, { runner: fakeRunner(f), validateCandidate, probe: async () => null });
  assert.equal(receipt.status, 'promoted-unconfirmed'); assert.equal(receipt.promoted, true); assert.equal(receipt.runtimeAck.confirmed, false);
  assert.equal(receipt.retention.status, 'skipped-no-ack'); assert.equal(existsSync(stale.file), true);
  assert.deepEqual(read(join(f.root, 'current.json')), receipt.current); assert.deepEqual(read(join(f.root, 'previous.json')), f.pointer);
});
test('retención elimina sólo derivado confirmado y mantiene current, previous, manuales y recibos', async t => {
  const f = await fixture(t), stale = await recognizedSnapshot(f, 'mac-refresh-101');
  const manual = join(f.root, 'snapshots/manual.sqlite'); writeFileSync(manual, 'manual', { mode: 0o400 });
  const receipt = await runMacRefreshJob(f.configFile, { runner: fakeRunner(f), validateCandidate });
  assert.equal(receipt.runtimeAck.confirmed, true); assert.equal(receipt.retention.removedSnapshots, 1);
  assert.equal(existsSync(stale.file), false); assert.equal(existsSync(stale.receiptFile), true);
  assert.equal(existsSync(manual), true); assert.equal(existsSync(f.source), true); assert.equal(existsSync(join(f.root, receipt.current.database)), true);
});
test('recibo corrupto, sin ACK o hash diferente no autoriza poda', async t => {
  const f = await fixture(t);
  const missingAck = await recognizedSnapshot(f, 'mac-refresh-102', { runtimeAck: { confirmed: false } });
  const wrongHash = await recognizedSnapshot(f, 'mac-refresh-103');
  wrongHash.receipt.current.sha256 = '0'.repeat(64); writeFileSync(wrongHash.receiptFile, JSON.stringify(wrongHash.receipt));
  const corrupt = await recognizedSnapshot(f, 'mac-refresh-104'); writeFileSync(corrupt.receiptFile, '{broken');
  const receipt = await runMacRefreshJob(f.configFile, { runner: fakeRunner(f), validateCandidate });
  assert.equal(receipt.retention.removedSnapshots, 0); assert.equal(receipt.retention.rejectedSnapshots, 1);
  for (const file of [missingAck.file, wrongHash.file, corrupt.file]) assert.equal(existsSync(file), true);
});
test('poda aborta al cambiar pointer durante ACK, conservando DB que podía estar en uso', async t => {
  const f = await fixture(t), stale = await recognizedSnapshot(f, 'mac-refresh-105'); let calls = 0;
  const receipt = await runMacRefreshJob(f.configFile, { runner: fakeRunner(f), validateCandidate,
    probe: async (runtime, pointer) => {
      if (++calls === 2) writeFileSync(join(runtime.dataDir, 'current.json'), JSON.stringify({ ...pointer, generation: 'manual-switch' }));
      return ackProbe(runtime, pointer);
    } });
  assert.equal(receipt.retention.status, 'stopped-pointer-changed'); assert.equal(receipt.retention.removedSnapshots, 0);
  assert.equal(existsSync(stale.file), true); assert.equal(read(join(f.root, 'current.json')).generation, 'manual-switch');
});
test('poda conserva archivos y hashes current/previous aunque tengan recibo propio', async t => {
  const f = await fixture(t), current = await recognizedSnapshot(f, 'mac-refresh-106'), previous = await recognizedSnapshot(f, 'mac-refresh-107');
  writeFileSync(join(f.root, 'current.json'), JSON.stringify(current.pointer)); writeFileSync(join(f.root, 'previous.json'), JSON.stringify(previous.pointer));
  const sameHash = await recognizedSnapshot(f, 'mac-refresh-108');
  chmodSync(sameHash.file, 0o600); copyFileSync(current.file, sameHash.file); chmodSync(sameHash.file, 0o400);
  sameHash.receipt.current.sha256 = current.pointer.sha256; writeFileSync(sameHash.receiptFile, JSON.stringify(sameHash.receipt));
  const lock = acquireJobLock(f.root);
  try {
    const result = await pruneJobSnapshots(f.config, current.pointer, { lock, probe: ackProbe, clock: Date.now, deadline: Date.now() + 1000 });
    assert.equal(result.removedSnapshots, 0); assert.equal(result.preservedProtected, 3);
    for (const file of [current.file, previous.file, sameHash.file]) assert.equal(existsSync(file), true);
  } finally { lock.release(); }
});
test('poda se detiene sin ACK actual aunque la promoción ya estuviera confirmada', async t => {
  const f = await fixture(t), stale = await recognizedSnapshot(f, 'mac-refresh-109'); let probes = 0;
  const receipt = await runMacRefreshJob(f.configFile, { runner: fakeRunner(f), validateCandidate,
    probe: async (runtime, pointer) => ++probes === 1 ? ackProbe(runtime, pointer) : null });
  assert.equal(receipt.runtimeAck.confirmed, true); assert.equal(receipt.retention.status, 'stopped-no-ack');
  assert.equal(existsSync(stale.file), true); assert.equal(receipt.retention.removedSnapshots, 0);
});
test('snapshot con WAL o hardlink y pérdida de lock no autorizan eliminación', async t => {
  const f = await fixture(t), current = await recognizedSnapshot(f, 'mac-refresh-110'), wal = await recognizedSnapshot(f, 'mac-refresh-111'),
    linked = await recognizedSnapshot(f, 'mac-refresh-112'), ordinary = await recognizedSnapshot(f, 'mac-refresh-113');
  writeFileSync(join(f.root, 'current.json'), JSON.stringify(current.pointer)); writeFileSync(join(f.root, 'previous.json'), JSON.stringify(f.pointer));
  writeFileSync(wal.file + '-wal', 'pending'); linkSync(linked.file, join(f.root, 'outside-hardlink'));
  const result = await pruneJobSnapshots(f.config, current.pointer, { lock: { assertOwned() { throw Error('lost'); } },
    probe: ackProbe, clock: Date.now, deadline: Date.now() + 1000 });
  assert.equal(result.removedSnapshots, 0); assert.equal(result.status, 'stopped-lock-lost');
  for (const file of [wal.file, linked.file, ordinary.file]) assert.equal(existsSync(file), true);
});
