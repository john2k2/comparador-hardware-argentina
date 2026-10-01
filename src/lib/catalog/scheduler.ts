import { logger } from '@/lib/logger';

const WORKFLOW_URL = 'https://api.github.com/repos/john2k2/comparador-hardware-argentina/actions/workflows/catalog-adaptive-refresh.yml';
export type CatalogSchedulerEnv = {
  CATALOG_SCHEDULER_ENABLED?: string;
  GITHUB_ACTIONS_DISPATCH_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
};
export type SchedulerResult = 'disabled' | 'busy' | 'recent' | 'deferred' | 'sent';

// Respaldo del cron de GitHub. Sólo despacha: nunca consulta tiendas ni precios.
export async function runCatalogScheduler(env: CatalogSchedulerEnv, now = Date.now()): Promise<SchedulerResult> {
  if (env.CATALOG_SCHEDULER_ENABLED !== '1') return 'disabled';
  const token = env.GITHUB_ACTIONS_DISPATCH_TOKEN?.trim();
  const database = env.SUPABASE_URL?.trim();
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  if (!token || !database || !secret) throw new Error('CATALOG_SCHEDULER_CREDENTIALS_MISSING');
  const headers = {
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'comparador-catalog-scheduler',
  };
  const listed = await fetch(`${WORKFLOW_URL}/runs?branch=main&per_page=10`, {
    headers, signal: AbortSignal.timeout(8000), redirect: 'error',
  });
  if (!listed.ok) throw new Error('CATALOG_SCHEDULER_READ_FAILED');
  const data: unknown = await listed.json();
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
  const gate = await fetch(new URL('/rest/v1/rpc/check_api_rate_limit', database), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_bucket_key: 'catalog-scheduler-dispatch-hour', p_limit: 1, p_window_seconds: 3600 }),
  });
  if (!gate.ok) throw new Error('CATALOG_SCHEDULER_GATE_FAILED');
  const limit: unknown = await gate.json();
  if (!limit || typeof limit !== 'object' || !('allowed' in limit) || typeof limit.allowed !== 'boolean')
    throw new Error('CATALOG_SCHEDULER_INVALID_GATE');
  if (!limit.allowed) return 'deferred';
  const sent = await fetch(`${WORKFLOW_URL}/dispatches`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ ref: 'main', inputs: { max_offers: '2500', trigger: 'cloudflare-fallback' } }),
  });
  if (sent.status !== 200 && sent.status !== 204) throw new Error('CATALOG_SCHEDULER_DISPATCH_FAILED');
  return 'sent';
}

export async function observeCatalogSchedule(env: CatalogSchedulerEnv): Promise<void> {
  try {
    const result = await runCatalogScheduler(env);
    logger.info('Catalog scheduler completed', { result });
  } catch (error) {
    // No registrar cuerpos de respuestas, cabeceras ni mensajes externos con secretos.
    const code = error instanceof Error && /^CATALOG_SCHEDULER_[A-Z_]+$/.test(error.message)
      ? error.message : 'CATALOG_SCHEDULER_REQUEST_FAILED';
    logger.error('Catalog scheduler failed', { code });
    throw new Error(code);
  }
}
