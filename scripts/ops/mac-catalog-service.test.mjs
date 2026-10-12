import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { RequestBarrier, createServicePlan, hashFile, immutableDatabasePath, loadRuntimeConfig,
  readTransportSecret, transportAuthorized, validatePointer, verifyImmutableCandidate, TRANSPORT_HEADER } from './mac-catalog-service.mjs';

const fingerprint = 'a'.repeat(64), token = 'b'.repeat(48);
function folder(t) {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'mac-service-test-')));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
const pointer = () => ({ version: 1, generation: 'cut-1', database: 'snapshots/cut-1.sqlite', sha256: '1'.repeat(64), fingerprint });
const compiled = await build({ entryPoints: [resolve('scripts/mac-catalog-server.ts')], bundle: true, packages: 'external',
  platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
function loadServer(nextFactory) {
  const require = createRequire(resolve('scripts/mac-catalog-server.ts')), compiledModule = { exports: {} };
  // argv vacío evita ejecutar CLI; ningún secreto real ni servicio del usuario se toca.
  runInNewContext(compiled.outputFiles[0].text, { module: compiledModule, exports: compiledModule.exports,
    require: id => id === 'next' && nextFactory ? nextFactory : require(id),
    process: { env: {}, argv: [], getuid: () => process.getuid(), stdout: { write() {} },
      stderr: { write() {} }, once() {} }, globalThis: {}, Buffer, setTimeout, clearTimeout, setInterval, clearInterval });
  return compiledModule.exports;
}
async function fixture(t) {
  const root = folder(t); mkdirSync(join(root, 'snapshots'));
  const path = join(root, 'snapshots', 'cut-1.sqlite'), db = new DatabaseSync(path);
  db.exec('CREATE TABLE pilot_meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE products(id TEXT); CREATE TABLE product_prices(id TEXT); CREATE TABLE summaries(id TEXT); CREATE TABLE stores(id TEXT);');
  for (const table of ['products', 'product_prices', 'summaries', 'stores']) db.exec(`INSERT INTO ${table} VALUES('one')`);
  const counts = { products: 1, product_prices: 1, catalog_price_summaries: 1, stores: 1 };
  const catalog = { version: 1, fingerprint, counts };
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', JSON.stringify({ catalog, counts,
    clock_observations: { version: 1, validated: true, timestampPolicy: 'js-sql-ms-v1', offers: 1 } }));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog', JSON.stringify({ ...catalog, complete: true, countsVerified: true }));
  db.close(); chmodSync(path, 0o400);
  return { root, path, pointer: { ...pointer(), sha256: await hashFile(path) } };
}

test('plan estable sólo devuelve configuración y plist, sin secretos ni instalaciones', () => {
  const plan = createServicePlan({ stableRoot: '/Users/test/Library/Application Support/Comparador', nodeBinary: '/usr/local/bin/node' });
  assert.equal(plan.installsService, false); assert.equal(plan.runtimeConfig.port, 8825);
  assert.match(plan.plist, /<key>KeepAlive<\/key><true\/>/); assert.match(plan.plist, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(plan.plist, /Application Support/); assert.match(plan.gates.join('\n'), /login/);
  for (const path of ['/tmp/outputs/app', '/Users/test/.codex/worktrees/app'])
    assert.throws(() => createServicePlan({ stableRoot: path, nodeBinary: '/usr/bin/node' }), /UNSTABLE_ROOT/);
});
test('config rechaza rutas relativas, puerto inválido y directorio build desconocido', t => {
  const root = folder(t), file = join(root, 'config.json');
  const config = createServicePlan({ stableRoot: root, nodeBinary: '/usr/bin/node' }).runtimeConfig;
  writeFileSync(file, JSON.stringify(config)); assert.equal(loadRuntimeConfig(file).port, 8825);
  for (const changes of [{ releaseDir: '.' }, { port: 80 }, { buildDir: 'standalone' }, { pollMilliseconds: 1 }]) {
    writeFileSync(file, JSON.stringify({ ...config, ...changes })); assert.throws(() => loadRuntimeConfig(file), /MAC_SERVICE/);
  }
});
test('secreto ausente, permisos amplios y enlaces fallan cerrado sin aceptar Authorization', t => {
  const root = folder(t), file = join(root, 'secret');
  assert.throws(() => readTransportSecret(file));
  writeFileSync(file, token, { mode: 0o600 }); assert.equal(readTransportSecret(file), token);
  assert.equal(transportAuthorized({ authorization: 'Bearer ' + token }, token), false);
  assert.equal(transportAuthorized({ [TRANSPORT_HEADER]: token }, token), true);
  assert.equal(transportAuthorized({ [TRANSPORT_HEADER]: [token, token] }, token), false);
  assert.equal(transportAuthorized({ [TRANSPORT_HEADER]: token + 'x' }, token), false);
  chmodSync(file, 0o644); assert.throws(() => readTransportSecret(file), /PERMISSIONS/);
  symlinkSync(file, join(root, 'link')); assert.throws(() => readTransportSecret(join(root, 'link')), /PERMISSIONS/);
});
test('pointer admite un archivo immutable dentro snapshots y rechaza traversal o metadatos incompletos', () => {
  assert.deepEqual(validatePointer(pointer()), pointer());
  for (const changes of [{ database: '../x.sqlite' }, { database: '/x.sqlite' }, { database: 'snapshots/nested/x.sqlite' },
    { sha256: 'x' }, { fingerprint: '' }, { generation: '' }, { version: 2 }])
    assert.throws(() => validatePointer({ ...pointer(), ...changes }), /POINTER/);
});
test('hash, symlink, permisos de escritura y sidecars rechazan copias no listas', async t => {
  const f = await fixture(t);
  assert.equal((await verifyImmutableCandidate(f.root, f.pointer)).path, f.path);
  await assert.rejects(verifyImmutableCandidate(f.root, { ...f.pointer, sha256: '0'.repeat(64) }), /HASH/);
  chmodSync(f.path, 0o600); assert.throws(() => immutableDatabasePath(f.root, f.pointer), /MUTABLE/);
  chmodSync(f.path, 0o400); writeFileSync(f.path + '-wal', ''); assert.throws(() => immutableDatabasePath(f.root, f.pointer), /SIDECAR/);
  rmSync(f.path + '-wal'); symlinkSync(f.path, join(f.root, 'snapshots', 'linked.sqlite'));
  assert.throws(() => immutableDatabasePath(f.root, { ...f.pointer, database: 'snapshots/linked.sqlite' }), /PATH/);
});
test('candidato certificado se abre readonly y rechaza datos distintos del manifest', async t => {
  const f = await fixture(t), { openCandidate } = loadServer();
  const candidate = await openCandidate(f.root, f.pointer);
  assert.throws(() => candidate.db.exec("INSERT INTO products VALUES('forbidden')"), /readonly/);
  candidate.db.close();
  await assert.rejects(openCandidate(f.root, { ...f.pointer, fingerprint: 'c'.repeat(64) }), /CERTIFICATE/);
  chmodSync(f.path, 0o600);
  const db = new DatabaseSync(f.path); db.exec("DELETE FROM summaries"); db.close(); chmodSync(f.path, 0o400);
  await assert.rejects(openCandidate(f.root, { ...f.pointer, sha256: await hashFile(f.path) }), /COUNTS/);
});
test('candidato sin certificado de reloj no puede activar el servicio', async t => {
  const f = await fixture(t), { openCandidate } = loadServer(); chmodSync(f.path, 0o600);
  const db = new DatabaseSync(f.path), row = JSON.parse(String(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value));
  delete row.clock_observations; db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify(row));
  db.close(); chmodSync(f.path, 0o400);
  await assert.rejects(openCandidate(f.root, { ...f.pointer, sha256: await hashFile(f.path) }), /CLOCK/);
});
test('barrera espera todas las respuestas, rechaza nuevas y release es idempotente', async () => {
  const barrier = new RequestBarrier(), first = barrier.enter(), second = barrier.enter();
  let drained = false; const done = barrier.drain().then(() => { drained = true; });
  assert.equal(barrier.enter(), null); first(); first(); await Promise.resolve(); assert.equal(drained, false);
  second(); await done; assert.equal(barrier.active, 0); assert.equal(drained, true);
  barrier.resume(); const third = barrier.enter(); assert.equal(typeof third, 'function'); third();
});
test('arranque con DB/secreto faltante falla antes de preparar Next', async t => {
  const root = folder(t), config = createServicePlan({ stableRoot: root, nodeBinary: '/usr/bin/node' }).runtimeConfig;
  let prepared = false;
  const { startMacCatalogServer } = loadServer(() => ({ prepare: async () => { prepared = true; } }));
  const file = join(root, 'runtime.json'); writeFileSync(file, JSON.stringify(config));
  await assert.rejects(startMacCatalogServer(file)); assert.equal(prepared, false);
  mkdirSync(join(root, 'private')); writeFileSync(config.transportSecretFile, token, { mode: 0o600 });
  delete config.envFile; writeFileSync(file, JSON.stringify(config));
  await assert.rejects(startMacCatalogServer(file)); assert.equal(prepared, false);
});

test('HTTP preserva auth/cookies, protege salud y drena solicitudes antes de promoción', { timeout: 20000 }, async t => {
  const f = await fixture(t), config = createServicePlan({ stableRoot: f.root, nodeBinary: '/usr/bin/node' }).runtimeConfig;
  const reservation = createServer();
  await new Promise(done => reservation.listen(0, '127.0.0.1', done));
  config.port = reservation.address().port;
  await new Promise(done => reservation.close(done));
  config.dataDir = f.root; config.pollMilliseconds = 5000; delete config.envFile;
  mkdirSync(join(f.root, 'private')); writeFileSync(config.transportSecretFile, token, { mode: 0o600 });
  const manifest = join(f.root, 'current.json'); writeFileSync(manifest, JSON.stringify(f.pointer));
  const file = join(f.root, 'runtime.json'); writeFileSync(file, JSON.stringify(config));
  let releaseHeld, heldStarted;
  const held = new Promise(done => { releaseHeld = done; }), started = new Promise(done => { heldStarted = done; });
  const { startMacCatalogServer } = loadServer(() => ({ prepare: async () => {}, close: async () => {},
    getRequestHandler: () => async (req, res) => {
      if (req.url === '/held') { heldStarted(); await held; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authorization: req.headers.authorization, cookie: req.headers.cookie, transport: req.headers[TRANSPORT_HEADER],
        ...(req.headers['x-forwarded-host'] ? { forwardedHost: req.headers['x-forwarded-host'], host: req.headers.host,
          protocol: req.headers['x-forwarded-proto'], privateHost: req.headers['x-comparador-forwarded-host'] } : {}) }));
    } }));
  const service = await startMacCatalogServer(file); t.after(async () => { releaseHeld(); await service.stop(); });
  const base = 'http://127.0.0.1:' + config.port, headers = { [TRANSPORT_HEADER]: token };
  assert.equal((await fetch(base + '/__mac_catalog/health')).status, 401);
  const response = await fetch(base + '/account', { headers: { ...headers, authorization: 'Bearer user-session', cookie: 'sb-session=user-cookie' } });
  assert.deepEqual(await response.json(), { authorization: 'Bearer user-session', cookie: 'sb-session=user-cookie' });
  const forwarded = await fetch(base + '/account', { headers: { ...headers, 'x-comparador-forwarded-host': 'www.comparador-hardware.com.ar' } });
  assert.deepEqual(await forwarded.json(), { forwardedHost: 'www.comparador-hardware.com.ar', host: 'www.comparador-hardware.com.ar', protocol: 'https' });
  assert.equal((await fetch(base + '/account', { headers: { ...headers, 'x-comparador-forwarded-host': 'attacker.example' } })).status, 400);
  const heldResponse = fetch(base + '/held', { headers }); await started;
  copyFileSync(f.path, join(f.root, 'snapshots', 'cut-2.sqlite')); chmodSync(join(f.root, 'snapshots', 'cut-2.sqlite'), 0o400);
  writeFileSync(manifest, JSON.stringify({ ...f.pointer, generation: 'cut-2', database: 'snapshots/cut-2.sqlite' }));
  await new Promise(done => setTimeout(done, 5500));
  assert.equal((await fetch(base + '/__mac_catalog/health', { headers }).then(r => r.json())).generation, 'cut-1');
  assert.equal((await fetch(base + '/account', { headers })).status, 503);
  releaseHeld(); assert.equal((await heldResponse).status, 200);
  await new Promise(done => setTimeout(done, 100));
  assert.equal((await fetch(base + '/__mac_catalog/health', { headers }).then(r => r.json())).generation, 'cut-2');
  writeFileSync(manifest, JSON.stringify({ ...f.pointer, generation: 'invalid', database: 'snapshots/absent.sqlite' }));
  await new Promise(done => setTimeout(done, 5000));
  assert.equal((await fetch(base + '/__mac_catalog/health', { headers }).then(r => r.json())).generation, 'cut-2');
  assert.equal((await fetch(base + '/account', { headers })).status, 200);
});
