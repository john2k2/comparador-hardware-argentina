// Credenciales montadas exclusivamente en el proceso actualizador.
import { lstatSync, readFileSync } from 'node:fs';
import { runCatalogCommand } from '../run-catalog-refresh.mjs';
const [mode, output] = process.argv.slice(2);
if (!['adaptive', 'guides', 'priority', 'requested'].includes(mode) || !/^\/receipts\/[a-z0-9_-]+\.json$/.test(output ?? ''))
  throw Error('VPS_RUNNER_ARGUMENTS');
const file = '/run/private/runner-runtime.json', stat = lstatSync(file);
if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600)
  throw Error('VPS_RUNNER_PERMISSIONS');
const env = JSON.parse(readFileSync(file, 'utf8'));
const allowed = new Set(['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY']);
if (!env.SUPABASE_SECRET_KEY || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw Error('VPS_RUNNER_CONFIG');
for (const [key, value] of Object.entries(env)) {
  if (!allowed.has(key) || typeof value !== 'string') throw Error('VPS_RUNNER_CONFIG');
  process.env[key] = value;
}
Object.assign(process.env, { CATALOG_REQUESTED_RUNNER: '1', CATALOG_RUN_TRIGGER: 'vps-schedule',
  CATALOG_ADAPTIVE_MAX_OFFERS: '2500', CATALOG_ADAPTIVE_CONCURRENCY: '4', CATALOG_INVENTORY_DISCOVERY: '1',
  ENABLE_JEV_OFFER_REVIEW: '0', DISABLE_INTERNAL_BACKGROUND_REFRESH: '1', LOG_LEVEL: 'warn' });
process.exitCode = await runCatalogCommand([mode, output]);
