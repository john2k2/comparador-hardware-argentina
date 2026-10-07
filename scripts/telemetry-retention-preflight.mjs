// Inspección manual de hasta 250 eventos vencidos. La red sólo permite GET.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { processTelemetryRetentionPlan } from './lib/telemetry-retention.mjs';
import { createTelemetryPreflightFetch } from './lib/telemetry-preflight-fetch.mjs';

const PROJECT_ID = 'zyiyziubpcpgoqlkcrie';
const CUTOFF = '2026-10-07T20:10:00.000000Z';

try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('RETENTION_NODE_22_REQUIRED');
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--server-config', '--out'].includes(key) || key in options) throw new Error('RETENTION_PREFLIGHT_ARGUMENT');
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('RETENTION_PREFLIGHT_VALUE');
    options[key] = args[++i];
  }
  if (!options['--server-config'] || !options['--out']) throw new Error('RETENTION_PREFLIGHT_CONFIG_REQUIRED');
  const now = new Date().toISOString();
  if (Date.parse(CUTOFF) > Date.parse(now)) throw new Error('RETENTION_CUTOFF_FUTURE');
  const env = parse(await fs.readFile(options['--server-config']));
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const origin = `https://${PROJECT_ID}.supabase.co`;
  if (!url || new URL(url).href !== `${origin}/`) throw new Error('RETENTION_PROJECT_MISMATCH');
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('RETENTION_SERVER_KEY_MISSING');

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createTelemetryPreflightFetch(origin) },
  });
  const result = await processTelemetryRetentionPlan(client, { mode: 'dry-run', cutoff: CUTOFF, now, limit: 250 });
  if (!result.success || result.removed !== 0 || result.unknown !== 0) throw new Error('RETENTION_PREFLIGHT_FAILED');
  const receipt = {
    projectId: PROJECT_ID, observedAt: new Date().toISOString(), networkGetOnly: true, redirectsAllowed: false,
    publicOperations: 0, physicalSavingProven: false, globallyComplete: false,
    ...result,
  };
  const out = path.resolve(options['--out']);
  await fs.mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
  await fs.writeFile(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ action: 'inspect-expired-telemetry', selected: result.selected, removed: 0, networkGetOnly: true, globallyComplete: false }));
} catch (error) {
  const reason = error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'RETENTION_PREFLIGHT_FAILED';
  console.error(JSON.stringify({ success: false, reason, writesAllowed: false }));
  process.exitCode = 1;
}
