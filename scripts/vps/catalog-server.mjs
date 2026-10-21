// Origen privado de lectura: el proxy público conserva Auth y operaciones de cuenta.
import { createServer } from 'node:http';
import { lstatSync, readFileSync } from 'node:fs';
import { readTransportSecret, transportAuthorized } from '../ops/mac-catalog-service.mjs';

const envFile = '/run/private/web-runtime.json';
const stat = lstatSync(envFile);
if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid())
  throw Error('VPS_RUNTIME_PERMISSIONS');
const env = JSON.parse(readFileSync(envFile, 'utf8'));
const allowed = new Set(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_AUTH_URL',
  'SUPABASE_AUTH_PUBLISHABLE_KEY', 'SITE_URL', 'ENEBA_AFFILIATE_PILOT_ENABLED']);
for (const [key, value] of Object.entries(env)) {
  if (!allowed.has(key) || typeof value !== 'string') throw Error('VPS_RUNTIME_CONFIG');
  process.env[key] = value;
}
// El proceso web no tiene la clave service_role ni ejecuta scraping.
process.env.DISABLE_INTERNAL_BACKGROUND_REFRESH = '1';
process.env.DISABLE_LIVE_SCRAPING = '1';
process.env.ENABLE_ON_DEMAND_REFRESH = '0';
process.env.CATALOG_SCHEDULER_ENABLED = '0';
process.env.SUPABASE_SECRET_KEY = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.CATALOG_READ_BACKEND = 'supabase';
process.env.CATALOG_NODE_ORIGIN = '1';
const secret = readTransportSecret('/run/private/origin-token');
const { default: next } = await import('next');
const app = next({ dev: false, hostname: '0.0.0.0', port: 3100 });
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer((req, res) => {
  if (!transportAuthorized(req.headers, secret)) {
    res.writeHead(403, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }).end();
    return;
  }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/__vps_health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      .end(JSON.stringify({ status: 'ready', readOnly: true }));
    return;
  }
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin') || pathname.startsWith('/api/auth')) {
    res.writeHead(404, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  handle(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500, { 'Cache-Control': 'no-store' });
    res.end();
  });
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.maxRequestsPerSocket = 100;
server.listen(3100, '0.0.0.0', () => console.info('VPS_WEB_READY'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 30000).unref();
});
