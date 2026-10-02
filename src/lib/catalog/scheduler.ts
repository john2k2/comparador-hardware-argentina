import { logger } from '@/lib/logger';

const WORKFLOW_URL = 'https://api.github.com/repos/john2k2/comparador-hardware-argentina/actions/workflows/catalog-adaptive-refresh.yml';
export type CatalogSchedulerEnv = {
  CATALOG_SCHEDULER_ENABLED?: string;
  GITHUB_ACTIONS_DISPATCH_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
};
export type SchedulerResult = 'disabled' | 'busy' | 'recent' | 'deferred' | 'sent';

async function request(stage: 'READ' | 'GATE' | 'DISPATCH', fetcher: typeof fetch, url: string | URL, init: RequestInit): Promise<Response> {
  try { return await fetcher(url, { ...init, signal: AbortSignal.timeout(8000) }); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    const reason = /cloudflare.*context|request.*context|different request|I\/O.*context/i.test(message) ? 'CONTEXT'
      : /illegal invocation|invalid.*this|this.*context/i.test(message) ? 'INVOCATION'
      : /AbortSignal.*timeout.*not.*function/i.test(message) ? 'TIMEOUT_API'
      : /header|ByteString|character/i.test(message) ? 'HEADER'
      : /redirect/i.test(message) ? 'REDIRECT'
      : /timeout|aborted/i.test(message) ? 'TIMEOUT' : 'TRANSPORT';
    throw new Error(`CATALOG_SCHEDULER_${stage}_${reason}_FAILED`);
  }
}

async function readJson(stage: 'READ' | 'GATE', response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { throw new Error(`CATALOG_SCHEDULER_${stage}_JSON_FAILED`); }
}

// Respaldo del cron de GitHub. Sólo despacha: nunca consulta tiendas ni precios.
export async function runCatalogScheduler(env: CatalogSchedulerEnv, now = Date.now(), fetcher: typeof fetch = globalThis.fetch): Promise<SchedulerResult> {
  if (env.CATALOG_SCHEDULER_ENABLED !== '1') return 'disabled';
  const token = env.GITHUB_ACTIONS_DISPATCH_TOKEN?.trim();
  const database = env.SUPABASE_URL?.trim();
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  if (!token || !database || !secret) throw new Error('CATALOG_SCHEDULER_CREDENTIALS_MISSING');
  const headers = {
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'comparador-catalog-scheduler',
  };
  const listed = await request('READ', fetcher, `${WORKFLOW_URL}/runs?branch=main&per_page=10`, {
    headers, redirect: 'manual',
  });
  if (!listed.ok) throw new Error('CATALOG_SCHEDULER_READ_FAILED');
  const data = await readJson('READ', listed);
  if (!data || typeof data !== 'object' || !('workflow_runs' in data) || !Array.isArray(data.workflow_runs))
    throw new Error('CATALOG_SCHEDULER_INVALID_RESPONSE');
  for (const run of data.workflow_runs) {
    if (!run || typeof run !== 'object' || !('status' in run) || !('created_at' in run)
      || typeof run.created_at !== 'string' || !Number.isFinite(Date.parse(run.created_at)))
      throw new Error('CATALOG_SCHEDULER_INVALID_RESPONSE');
    if (run.status !== 'completed') return 'busy';
    // El último inicio, incluso manual o fallido, evita una ráfaga de reintentos.
    if (now - Date.parse(run.created_at) < 75 * 60000) return 'recent';
  }
  // El límite distribuido también cubre reentregas del mismo evento de Cloudflare.
  const gate = await request('GATE', fetcher, new URL('/rest/v1/rpc/check_api_rate_limit', database), {
    method: 'POST', redirect: 'manual',
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_bucket_key: 'catalog-scheduler-dispatch-hour', p_limit: 1, p_window_seconds: 3600 }),
  });
  if (!gate.ok) throw new Error('CATALOG_SCHEDULER_GATE_FAILED');
  const limit = await readJson('GATE', gate);
  if (!limit || typeof limit !== 'object' || !('allowed' in limit) || typeof limit.allowed !== 'boolean')
    throw new Error('CATALOG_SCHEDULER_INVALID_GATE');
  if (!limit.allowed) return 'deferred';
  const sent = await request('DISPATCH', fetcher, `${WORKFLOW_URL}/dispatches`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    redirect: 'manual',
    body: JSON.stringify({ ref: 'main', inputs: { max_offers: '2500', trigger: 'cloudflare-fallback' } }),
  });
  if (sent.status !== 200 && sent.status !== 204) throw new Error('CATALOG_SCHEDULER_DISPATCH_FAILED');
  return 'sent';
}

export async function observeCatalogSchedule(env: CatalogSchedulerEnv, fetcher: typeof fetch = globalThis.fetch): Promise<void> {
  try {
    const result = await runCatalogScheduler(env, Date.now(), fetcher);
    logger.info('Catalog scheduler completed', { result });
  } catch (error) {
    // No registrar cuerpos de respuestas, cabeceras ni mensajes externos con secretos.
    const code = error instanceof Error && /^CATALOG_SCHEDULER_[A-Z_]+$/.test(error.message)
      ? error.message : 'CATALOG_SCHEDULER_REQUEST_FAILED';
    logger.error('Catalog scheduler failed', { code });
    throw new Error(code);
  }
}
