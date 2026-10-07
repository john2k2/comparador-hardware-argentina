// Entrada del scheduler existente. Sólo lee credenciales server al ejecutar el comando.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { processTelemetryMaintenance, validateTelemetryMaintenanceOptions, TELEMETRY_METADATA_FIELDS, TELEMETRY_SCOPES } from './lib/telemetry-maintenance.mjs';
import { createTelemetryMaintenanceDataFetch, createTelemetryMaintenanceStorageFetch, readTelemetryJson,
  storeTelemetryMaintenanceArchive, telemetryMaintenanceObjectKeys, TELEMETRY_SELECT_RPC, TELEMETRY_RETIRE_RPC } from './lib/telemetry-maintenance-network.mjs';

const PROJECT_ID = 'zyiyziubpcpgoqlkcrie';
const ORIGIN = `https://${PROJECT_ID}.supabase.co`;
const fail = code => { throw new Error(`TELEMETRY_MAINTENANCE_CLI_${code}`); };

export function parseTelemetryMaintenanceArguments(args, now) {
  const flags = { '--batch-size': 'batchSize', '--max-batches': 'maxBatches', '--deadline-ms': 'deadlineMs',
    '--max-stored-bytes': 'maxStoredBytes', '--cutoff': 'cutoff', '--approval-id': 'approvalId', '--out': 'out' };
  const options = { mode: 'inspect', projectId: PROJECT_ID, now,
    cutoff: new Date(Date.parse(now) - 5 * 60 * 1000).toISOString() };
  let index = 0;
  if (args[0] && !args[0].startsWith('--')) options.mode = args[index++];
  const supplied = new Set();
  for (; index < args.length; index++) {
    const flag = args[index];
    if (!Object.hasOwn(flags, flag) || supplied.has(flag)) fail('ARGUMENT');
    supplied.add(flag);
    const value = args[++index];
    if (!value || value.startsWith('--')) fail('VALUE');
    if (['--batch-size', '--max-batches', '--deadline-ms', '--max-stored-bytes'].includes(flag)) {
      if (!/^[1-9]\d*$/.test(value)) fail('NUMBER');
      options[flags[flag]] = Number(value);
    } else options[flags[flag]] = value;
  }
  const { out, ...config } = options;
  if (!out) fail('OUTPUT_REQUIRED');
  return { config: validateTelemetryMaintenanceOptions(config), out: path.resolve(out) };
}

export async function runTelemetryMaintenanceCli(args, { env = process.env, transport = globalThis.fetch,
  now = () => new Date().toISOString(), output = console.log,
  writeSummary = async (file, summary) => fs.writeFile(file, JSON.stringify(summary) + '\n', { flag: 'wx', mode: 0o600 }) } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) fail('NODE_22_REQUIRED');
  const { config, out } = parseTelemetryMaintenanceArguments(args, now());
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || new URL(url).href !== ORIGIN + '/') fail('PROJECT');
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) fail('SERVER_KEY_REQUIRED');
  const deadline = AbortSignal.timeout(config.deadlineMs);
  const dataFetch = createTelemetryMaintenanceDataFetch(ORIGIN, { allowRetire: config.mode === 'archive-retire', transport, signal: deadline });
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  async function metadata(params) {
    const target = new URL('/rest/v1/api_cache_entries', ORIGIN);
    target.searchParams.set('select', TELEMETRY_METADATA_FIELDS.join(','));
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, String(value));
    return readTelemetryJson(await dataFetch(target, { headers }), 1024 ** 2);
  }
  async function rpc(name, body) {
    return readTelemetryJson(await dataFetch(`${ORIGIN}/rest/v1/rpc/${name}`,
      { method: 'POST', headers, body: JSON.stringify(body) }));
  }
  const callbacks = {
    inspectMetadata: (cutoff, limit) => metadata({ scope: `in.(${TELEMETRY_SCOPES.join(',')})`, expires_at: `lt.${cutoff}`,
      updated_at: `lte.${cutoff}`, order: 'expires_at.asc,cache_key.asc', limit }),
    selectSnapshot: (cutoff, limit) => rpc(TELEMETRY_SELECT_RPC, { p_cutoff: cutoff, p_limit: limit }),
    retireSnapshot: (cutoff, snapshot) => rpc(TELEMETRY_RETIRE_RPC, { p_cutoff: cutoff, p_snapshot: snapshot }),
    reconcileMetadata: async keys => {
      const rows = [];
      for (let offset = 0; offset < keys.length; offset += 50) {
        const page = keys.slice(offset, offset + 50);
        const literals = page.map(value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"');
        const result = await metadata({ cache_key: `in.(${literals.join(',')})`, order: 'cache_key.asc', limit: page.length });
        if (!Array.isArray(result) || result.length > page.length) fail('METADATA_PAGE');
        rows.push(...result);
      }
      return rows;
    },
    storeArchive: async archive => {
      const guarded = createTelemetryMaintenanceStorageFetch(ORIGIN, telemetryMaintenanceObjectKeys(archive),
        { allowUpload: true, transport, signal: deadline });
      const client = createClient(ORIGIN, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: guarded } });
      return storeTelemetryMaintenanceArchive(client.storage, archive);
    },
  };
  const summary = await processTelemetryMaintenance(callbacks, config);
  // stdout conserva el resumen incluso si falla su escritura al artefacto; nunca contiene claves ni payloads.
  output(JSON.stringify(summary));
  await writeSummary(out, summary);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await runTelemetryMaintenanceCli(process.argv.slice(2));
    if (!result.success) process.exitCode = 1;
  } catch (error) {
    const reason = error instanceof Error && /^TELEMETRY_MAINTENANCE_[A-Z_]+$/.test(error.message) ? error.message : 'TELEMETRY_MAINTENANCE_CLI_FAILED';
    console.error(JSON.stringify({ success: false, reason, outcomeRequiresSummary: true }));
    process.exitCode = 1;
  }
}
