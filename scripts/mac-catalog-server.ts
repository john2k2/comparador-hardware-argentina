// Launcher Node: SQLite queda readonly; Cloudflare autentica el transporte en un header independiente.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import next from 'next';
import { config as dotenv } from 'dotenv';
import { registerMacCatalogBinding } from '../src/lib/catalog/mac-catalog-binding';
import { loadRuntimeConfig, readTransportSecret, transportAuthorized, TRANSPORT_HEADER,
  RequestBarrier, verifyImmutableCandidate } from './ops/mac-catalog-service.mjs';

type Pointer = { version: number; generation: string; database: string; sha256: string; fingerprint: string };
type Candidate = { pointer: Pointer; path: string; db: DatabaseSync };
const tables = { products: 'products', product_prices: 'product_prices', catalog_price_summaries: 'summaries', stores: 'stores' };

/** Certificados y conteos se contrastan en el archivo que efectivamente se abrirá. */
export function validateDatabase(db: DatabaseSync, fingerprint: string) {
  if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length)
    throw Error('MAC_SERVICE_DATABASE_INTEGRITY');
  const parse = (key: string) => JSON.parse(String(db.prepare('SELECT value FROM pilot_meta WHERE key=?').get(key)?.value));
  const snapshot = parse('snapshot'), certificate = parse('production_catalog');
  if (snapshot.catalog?.version !== 1 || snapshot.catalog.fingerprint !== fingerprint
    || certificate.version !== 1 || certificate.fingerprint !== fingerprint || certificate.complete !== true || certificate.countsVerified !== true)
    throw Error('MAC_SERVICE_DATABASE_CERTIFICATE');
  for (const [key, table] of Object.entries(tables)) {
    const count = Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n);
    if (!Number.isSafeInteger(count) || count < 0 || snapshot.counts?.[key] !== count
      || snapshot.catalog.counts?.[key] !== count || certificate.counts?.[key] !== count)
      throw Error('MAC_SERVICE_DATABASE_COUNTS');
  }
  const clock = snapshot.clock_observations;
  if (clock?.version !== 1 || clock.validated !== true || clock.timestampPolicy !== 'js-sql-ms-v1'
    || clock.offers !== snapshot.counts.product_prices) throw Error('MAC_SERVICE_DATABASE_CLOCK');
  if (db.prepare("SELECT value FROM pilot_meta WHERE key='prepared_view_manifest'").get())
    throw Error('MAC_SERVICE_PREPARED_NOT_SUPPORTED');
}

export async function openCandidate(dataDir: string, value: unknown): Promise<Candidate> {
  const { pointer, path } = await verifyImmutableCandidate(dataDir, value);
  const db = new DatabaseSync(path, { readOnly: true });
  try { validateDatabase(db, pointer.fingerprint); return { pointer, path, db }; }
  catch (error) { db.close(); throw error; }
}

function activate(candidate: Candidate) {
  // Pasos síncronos: ninguna solicitud observa una combinación de dos generaciones.
  registerMacCatalogBinding({ prepare: (sql: string) => ({ bind: (...values: unknown[]) => ({ all: async () => ({
    success: true, results: candidate.db.prepare(sql).all(...values as never[]), meta: { rows_written: 0 },
  }) }) }) });
  process.env.CATALOG_FINGERPRINT = candidate.pointer.fingerprint;
  process.env.CATALOG_RUNTIME_GENERATION = candidate.pointer.generation;
}

export async function startMacCatalogServer(configFile: string) {
  const settings = loadRuntimeConfig(configFile), secret = readTransportSecret(settings.transportSecretFile);
  if (settings.envFile) {
    const result = dotenv({ path: settings.envFile, quiet: true });
    if (result.error) throw Error('MAC_SERVICE_ENV_REQUIRED');
  }
  // No borramos claves del usuario; sólo desactivamos ejecución automática de lectores.
  Object.assign(process.env, { NODE_ENV: 'production', CATALOG_READ_BACKEND: 'mac',
    CATALOG_PREPARED_VIEWS: '', CATALOG_RESPONSE_CACHE: '', DISABLE_INTERNAL_BACKGROUND_REFRESH: '1',
    DISABLE_LIVE_SCRAPING: '1', ENABLE_ON_DEMAND_REFRESH: '0',
    COMPARADOR_QA_ISOLATED_BUILD: settings.buildDir === '.next-qa' ? '1' : '' });
  const manifestFile = resolve(settings.dataDir, 'current.json');
  let manifestText = readFileSync(manifestFile, 'utf8');
  let current = await openCandidate(settings.dataDir, JSON.parse(manifestText));
  activate(current);
  const barrier = new RequestBarrier();
  const app = next({ dev: false, dir: settings.releaseDir, hostname: '127.0.0.1', port: settings.port });
  try { await app.prepare(); } catch (error) { current.db.close(); throw error; }
  const handler = app.getRequestHandler();
  let closing = false, promoting = false;
  const log = (status: string, detail: Record<string, unknown> = {}) => process.stdout.write(JSON.stringify({ at: new Date().toISOString(), status, ...detail }) + '\n');
  const server = createServer(async (req, res) => {
    if (!transportAuthorized(req.headers, secret)) { res.writeHead(401, { 'Cache-Control': 'no-store' }).end(); return; }
    delete req.headers[TRANSPORT_HEADER]; // Authorization y cookies de usuario permanecen intactos.
    const forwardedHost = req.headers['x-comparador-forwarded-host'];
    delete req.headers['x-comparador-forwarded-host'];
    if (forwardedHost !== undefined) {
      if (typeof forwardedHost !== 'string' || !['www.comparador-hardware.com.ar', 'comparador-hardware.com.ar'].includes(forwardedHost)) {
        res.writeHead(400, { 'Cache-Control': 'no-store' }).end(); return;
      }
      req.headers.host = forwardedHost;
      req.headers['x-forwarded-host'] = forwardedHost;
      req.headers['x-forwarded-proto'] = 'https';
    }
    if (req.url === '/__mac_catalog/health' && req.method === 'GET') {
      res.writeHead(closing ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ readOnly: true, generation: current.pointer.generation, fingerprint: current.pointer.fingerprint })); return;
    }
    const release = closing ? null : barrier.enter();
    if (!release) { res.writeHead(503, { 'Cache-Control': 'no-store', 'Retry-After': '1' }).end(); return; }
    res.once('finish', release); res.once('close', release);
    try { await handler(req, res); }
    catch {
      if (!res.headersSent) res.writeHead(503, { 'Cache-Control': 'no-store' }).end();
      else res.destroy();
      log('request-failed');
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  try {
    await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(settings.port, '127.0.0.1', done); });
  } catch (error) { await app.close(); current.db.close(); throw error; }
  log('mac-catalog-ready', { port: settings.port, readOnly: true, generation: current.pointer.generation, fingerprint: current.pointer.fingerprint });
  let rejectedText: string | undefined;
  const poll = setInterval(async () => {
    if (closing || promoting) return;
    promoting = true;
    let candidate: Candidate | undefined, text: string | undefined;
    try {
      text = readFileSync(manifestFile, 'utf8');
      if (text === manifestText || text === rejectedText) return;
      const pointer = JSON.parse(text);
      if (pointer.database === current.pointer.database || pointer.generation === current.pointer.generation)
        throw Error('MAC_SERVICE_GENERATION_REUSED');
      candidate = await openCandidate(settings.dataDir, pointer);
      if (readFileSync(manifestFile, 'utf8') !== text) throw Error('MAC_SERVICE_POINTER_SUPERSEDED');
      await barrier.drain();
      if (closing) return;
      if (readFileSync(manifestFile, 'utf8') !== text) throw Error('MAC_SERVICE_POINTER_SUPERSEDED');
      const previous = current;
      activate(candidate); current = candidate; candidate = undefined;
      manifestText = text; rejectedText = undefined;
      previous.db.close();
      log('mac-catalog-promoted', { generation: current.pointer.generation, fingerprint: current.pointer.fingerprint });
    } catch {
      if (text !== rejectedText) log('mac-catalog-promotion-rejected');
      rejectedText = text;
    } finally { candidate?.db.close(); if (!closing) barrier.resume(); promoting = false; }
  }, settings.pollMilliseconds);
  poll.unref();
  const stop = async () => {
    if (closing) return;
    closing = true; clearInterval(poll);
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exitCode = 1; }, 35000);
    deadline.unref();
    await new Promise<void>(done => server.close(() => done()));
    await barrier.drain();
    // Espera una validación en curso antes de cerrar SQLite.
    while (promoting) await new Promise(done => setTimeout(done, 10));
    await app.close(); current.db.close(); clearTimeout(deadline);
    log('mac-catalog-stopped');
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void stop(); });
  return { server, stop };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--config') throw Error('MAC_SERVICE_CONFIG_ARGUMENT');
  startMacCatalogServer(resolve(process.argv[3])).catch((error: unknown) => {
    const code = error instanceof Error && /^MAC_SERVICE_[A-Z_]+$/.test(error.message) ? error.message : 'MAC_SERVICE_START_FAILED';
    process.stderr.write(code + '\n'); process.exitCode = 1;
  });
}
