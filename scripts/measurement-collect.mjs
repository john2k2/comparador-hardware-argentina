// Colector fuera de Cloudflare. Sólo guarda informes resumidos; no hace scraping.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
const provider = process.env.MEASUREMENT_PROVIDER || 'all';
const task = process.env.MEASUREMENT_TASK || 'measurements';
const allowed = ['all', 'ga4', 'search-console', 'cloudflare', 'catalog', 'operations', 'github', 'eneba', 'database', 'adsense', 'google-ads'];
if (!['home', 'measurements'].includes(task) || !allowed.includes(provider) || process.env.MEASUREMENT_FIXTURE_MODE === '1') throw new Error('Se requiere una fuente real válida.');
if (!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) || (task === 'measurements' && (!process.env.MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY || !process.env.MEASUREMENT_GOOGLE_CLIENT_SECRET))) throw new Error('Falta la configuración privada del colector.');
process.env.MEASUREMENT_COLLECTION_MODE = 'inline';
const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'comparador-measurement-'));
const outfile = path.join(folder, 'collector.mjs');
try {
  const entry = task === 'home' ? "export { saveObservedHomeSnapshot } from './src/lib/home/save-observed-snapshot';" : "export { executeMeasurementCommand } from './src/lib/measurement/service'; export { saveMeasurementView } from './src/lib/measurement/store'; export { saveObservedHomeSnapshot } from './src/lib/home/save-observed-snapshot';";
  await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, outfile, platform: 'node', format: 'esm', bundle: true, packages: 'external',
    plugins: [{ name: 'server-only-node', setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'collector' }));
      builder.onLoad({ filter: /.*/, namespace: 'collector' }, () => ({ contents: 'export {};', loader: 'js' }));
    } }] });
  // Los paquetes externos se resuelven desde el proyecto, también en un runner efímero.
  await fs.symlink(path.join(root, 'node_modules'), path.join(folder, 'node_modules'), 'dir');
  await fs.chmod(outfile, 0o600);
  const { executeMeasurementCommand, saveMeasurementView, saveObservedHomeSnapshot } = await import(pathToFileURL(outfile).href);
  if (task === 'home') {
    console.log(JSON.stringify({ completedAt: await saveObservedHomeSnapshot(), task, publicHomePersisted: true }));
  } else {
    const result = await executeMeasurementCommand({ action: 'sync', provider });
    if (!result.dashboard.storage.available) throw new Error('No se confirmó el guardado privado.');
    await saveMeasurementView(result.dashboard);
    await saveObservedHomeSnapshot();
    const selected = result.dashboard.connections.filter((item) => provider === 'all' || item.id === provider);
    const failed = selected.filter((item) => item.state === 'error');
    console.log(JSON.stringify({ completedAt: new Date().toISOString(), task, provider, verified: selected.filter((item) => item.state === 'connected').length, needsSetup: selected.filter((item) => item.state === 'needs_setup').length, failed: failed.map((item) => item.id), persisted: true, publicHomePersisted: true }));
    if (failed.length) process.exitCode = 1;
  }
} finally { await fs.rm(folder, { recursive: true, force: true }); }
