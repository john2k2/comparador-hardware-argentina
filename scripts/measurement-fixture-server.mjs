// Backend de pruebas ligado a loopback. No cambia la autorización de la aplicación.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPort = 3132, databasePort = 3133, nextPort = 3134;
const build = process.argv.includes('--build');
const adminId = '00000000-0000-4000-8000-000000000001';
const rows = new Map();
let writeFailure = false;
const json = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3132');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://127.0.0.1:${databasePort}`);
  if (url.pathname === '/health') return json(res, { ready: true });
  if (url.pathname === '/preview') {
    res.writeHead(302, { 'Set-Cookie': 'sb-access-token=fixture-admin; HttpOnly; SameSite=Lax; Path=/', Location: `http://127.0.0.1:${appPort}/admin/seguimiento`, 'Cache-Control': 'no-store' }); return res.end();
  }
  if (url.pathname === '/__fixture/reset' && req.method === 'POST') { rows.clear(); writeFailure = false; return json(res, { reset: true }); }
  if (url.pathname === '/__fixture/fail-write' && req.method === 'POST') { writeFailure = url.searchParams.get('on') === '1'; return json(res, { writeFailure }); }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.email !== 'fixture@example.invalid' || body.password !== 'solo-prueba-local') return json(res, { message: 'Only the local fixture account is available' }, 401);
    return json(res, { access_token: 'fixture-admin', refresh_token: 'fixture-refresh', expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, token_type: 'bearer', user: { id: adminId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: { is_admin: true }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } });
  }
  if (url.pathname === '/auth/v1/user') {
    const token = req.headers.authorization;
    if (!['Bearer fixture-admin', 'Bearer fixture-member', 'Bearer fixture-forged'].includes(token)) return json(res, { message: 'Invalid fixture token' }, 401);
    return json(res, { id: token === 'Bearer fixture-admin' ? adminId : '00000000-0000-4000-8000-000000000002', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: token === 'Bearer fixture-admin' ? { is_admin: true } : {}, user_metadata: token === 'Bearer fixture-forged' ? { is_admin: true, role: 'admin' } : {}, created_at: '2026-01-01T00:00:00Z' });
  }
  if (url.pathname === '/rest/v1/rpc/catalog_refresh_coverage') return json(res, [{ reason: 'components', store_id: 'fixture-store', total: 100, observed_24h: 20, observed_3h: 5, never_attempted: 10 }]);
  if (['/rest/v1/api_cache_entries', '/rest/v1/measurement_dashboard_entries'].includes(url.pathname)) {
    if (req.headers.apikey !== 'sb_secret_measurement_fixture_only') return json(res, { message: 'RLS denied fixture public access' }, 403);
    if (req.method === 'POST') {
      if (writeFailure) return json(res, { message: 'Fixture storage failure' }, 503);
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const values = JSON.parse(Buffer.concat(chunks).toString());
      for (const row of Array.isArray(values) ? values : [values]) rows.set(row.entry_key || row.cache_key, row);
      return json(res, null, 201);
    }
    let result = [...rows.values()];
    for (const key of ['scope', 'cache_key', 'entry_key']) if (url.searchParams.get(key)?.startsWith('eq.')) result = result.filter((row) => row[key] === url.searchParams.get(key).slice(3));
    const after = url.searchParams.get('expires_at');
    if (after?.startsWith('gt.')) result = result.filter((row) => row.expires_at > after.slice(3));
    result.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    result = result.slice(0, Number(url.searchParams.get('limit') || 1000));
    if (req.headers.accept?.includes('vnd.pgrst.object')) return json(res, result[0] || null);
    return json(res, result);
  }
  if (url.pathname.startsWith('/rest/v1/')) return json(res, []);
  return json(res, { message: 'Fixture endpoint unavailable' }, 404);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(databasePort, '127.0.0.1', resolve); });
// Mismo origen para el SDK del navegador: respetar el connect-src 'self' del producto.
// El proxy existe sólo en el proceso de pruebas; no añade rutas ni excepciones al producto.
const proxy = http.createServer((req, res) => {
  const port = /^\/(auth|rest)\/v1\//.test(req.url) ? databasePort : nextPort;
  const upstream = http.request({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, (reply) => {
    res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('El entorno de prueba está iniciando.'); });
  req.pipe(upstream);
});
if (!build) await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(appPort, '127.0.0.1', resolve); });
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1', DISABLE_INTERNAL_BACKGROUND_REFRESH: '1', DISABLE_LIVE_SCRAPING: '1', ENABLE_ON_DEMAND_REFRESH: '0', E2E_STABLE_MODE: '1', CI_E2E: '1', MEASUREMENT_FIXTURE_MODE: '1',
  SUPABASE_URL: `http://127.0.0.1:${databasePort}`, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${appPort}`,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_measurement_fixture', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_measurement_fixture', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_measurement_fixture',
  SUPABASE_SECRET_KEY: 'sb_secret_measurement_fixture_only', SUPABASE_SERVICE_ROLE_KEY: '', CRON_SECRET: '', CATALOG_REFRESH_CRON_SECRET: '', NEXT_PUBLIC_GA4_MEASUREMENT_ID: '', ENEBA_AFFILIATE_PILOT_ENABLED: '0',
  MEASUREMENT_GOOGLE_CLIENT_ID: 'fixture-client', MEASUREMENT_GOOGLE_CLIENT_SECRET: 'fixture-private-google', MEASUREMENT_GOOGLE_REFRESH_TOKEN: 'fixture-private-refresh', MEASUREMENT_GA4_PROPERTY_ID: '553934279',
  MEASUREMENT_CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), MEASUREMENT_CLOUDFLARE_TOKEN: 'fixture-private-cloudflare', MEASUREMENT_GITHUB_TOKEN: '',
  MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64), MEASUREMENT_PUBLIC_URL: 'http://127.0.0.1:3132', MEASUREMENT_GOOGLE_CLIENT_TYPE: 'web', MEASUREMENT_COLLECTION_MODE: 'inline',
  MEASUREMENT_GOOGLE_SCOPES: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
  MEASUREMENT_SUPABASE_ACCESS_TOKEN: '', MEASUREMENT_GOOGLE_ADS_DEVELOPER_TOKEN: '',
};
const auditPath = process.env.MEASUREMENT_LOCAL_AUDIT_PATH;
const baseline = JSON.parse(await readFile(auditPath ? path.resolve(root, auditPath) : path.join(root, 'e2e/fixtures/measurement-audit.json'), 'utf8'));
env.MEASUREMENT_AUDIT_BASELINE_JSON = JSON.stringify(baseline);
env.MEASUREMENT_FIXTURE_BASELINE_REAL = auditPath ? '1' : '0';
const child = spawn(process.execPath, ['--import', path.join(root, 'scripts/measurement-fixture-fetch.mjs'), path.join(root, 'node_modules/next/dist/bin/next'), ...(build ? ['build'] : ['start', '-p', String(nextPort), '-H', '127.0.0.1'])], { cwd: root, env, stdio: 'inherit' });
function stop() { child.kill('SIGTERM'); server.close(); proxy.close(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
child.on('exit', (code) => { server.close(); proxy.close(); process.exit(code ?? 0); });
console.log(build ? 'Build aislado con fuentes de prueba.' : `Vista local de prueba: http://127.0.0.1:${databasePort}/preview`);
