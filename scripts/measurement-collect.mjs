// Colector fuera de Cloudflare: guarda informes resumidos y, sólo si venció,
// recupera una muestra del feed público oficial de Eneba mediante su productor.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import dotenv from 'dotenv';
import { collectMeasurementsWithRecovery, classifyEnebaCache, measurementCollectionOutcome } from './lib/measurement-recovery.mjs';
import { nodeServerBuildOptions } from './lib/node-server-build.mjs';

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
  const entry = task === 'home' ? "export { saveObservedHomeSnapshot } from './src/lib/home/save-observed-snapshot';" : `
    export { executeMeasurementCommand } from './src/lib/measurement/service';
    export { saveMeasurementView } from './src/lib/measurement/store';
    export { saveObservedHomeSnapshot } from './src/lib/home/save-observed-snapshot';
    import { getServerSupabaseServiceClient } from './src/lib/server/supabase-server';
    import { refreshEnebaPilot } from './src/lib/eneba/producer';
    import { ENEBA_CACHE_SCOPE, ENEBA_CACHE_KEY } from './src/lib/eneba/snapshot-cache';
    export async function inspectEnebaCache() {
      const client = getServerSupabaseServiceClient();
      if (!client) return { data: null, error: true };
      return client.from('api_cache_entries').select('payload,expires_at')
        .eq('cache_key', ENEBA_CACHE_SCOPE + ':' + ENEBA_CACHE_KEY)
        .abortSignal(AbortSignal.timeout(8_000)).maybeSingle();
    }
    export async function refreshEneba() {
      const client = getServerSupabaseServiceClient();
      if (!client) throw new Error('ENEBA_DATABASE_UNAVAILABLE');
      return refreshEnebaPilot(client);
    }
  `;
  await build(nodeServerBuildOptions({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, outfile }));
  // Los paquetes externos se resuelven desde el proyecto, también en un runner efímero.
  await fs.symlink(path.join(root, 'node_modules'), path.join(folder, 'node_modules'), 'dir');
  await fs.chmod(outfile, 0o600);
  const { executeMeasurementCommand, saveMeasurementView, saveObservedHomeSnapshot, inspectEnebaCache, refreshEneba } = await import(pathToFileURL(outfile).href);
  if (task === 'home') {
    console.log(JSON.stringify({ completedAt: await saveObservedHomeSnapshot(), task, publicHomePersisted: true }));
  } else {
    const { result, recovery } = await collectMeasurementsWithRecovery(provider, {
      collect: executeMeasurementCommand, enebaEnabled: process.env.ENEBA_AFFILIATE_PILOT_ENABLED === '1',
      inspectEnebaCache: async () => classifyEnebaCache(await inspectEnebaCache()), refreshEneba,
    });
    if (!result.dashboard.storage.available) throw new Error('No se confirmó el guardado privado.');
    await saveMeasurementView(result.dashboard);
    await saveObservedHomeSnapshot();
    const { verified, needsSetup, failed, exitCode } = measurementCollectionOutcome(result, provider);
    console.log(JSON.stringify({ completedAt: new Date().toISOString(), task, provider, verified, needsSetup, failed, enebaRecovery: recovery, persisted: true, publicHomePersisted: true }));
    process.exitCode = exitCode;
  }
} finally { await fs.rm(folder, { recursive: true, force: true }); }
