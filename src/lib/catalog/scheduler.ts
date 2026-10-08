import { logger } from '@/lib/logger';

const WORKFLOW_BASE = 'https://api.github.com/repos/john2k2/comparador-hardware-argentina/actions/workflows/';
const WORKFLOWS = [
  { file: 'catalog-adaptive-refresh.yml', target: 'adaptive', inputs: { max_offers: '2500', trigger: 'cloudflare-fallback' } },
  { file: 'catalog-refresh.yml', target: 'guides', inputs: { mode: 'guides', trigger: 'cloudflare-fallback' } },
] as const;
const COOLDOWN_MS = 75 * 60_000;
const GUIDES_URGENT_MS = 120 * 60_000;
const RUN_STATUSES = new Set(['completed', 'queued', 'in_progress', 'waiting', 'pending', 'requested']);
export type CatalogSchedulerEnv = {
  CATALOG_SCHEDULER_ENABLED?: string;
  GITHUB_ACTIONS_DISPATCH_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
};
export type SchedulerResult = 'disabled' | 'busy' | 'recent' | 'deferred' | 'sent';
type SchedulerRecovery = { clock?: () => number; sleep?: (ms: number) => Promise<void> };
const RECOVERY_BUDGET_MS = 60_000;
const MAX_RECOVERY_WAIT_MS = 10_000;

async function request(stage: 'READ' | 'GATE' | 'DISPATCH', fetcher: typeof fetch, url: string | URL, init: RequestInit, remainingMs = 8000): Promise<Response> {
  try { return await fetcher(url, { ...init, signal: AbortSignal.timeout(Math.min(8000, Math.ceil(remainingMs))) }); }
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

function parseRuns(data: unknown, now: number): { busy: boolean; latestStart: number } {
  if (!data || typeof data !== 'object' || !('workflow_runs' in data) || !Array.isArray(data.workflow_runs)
    || data.workflow_runs.length > 10) throw new Error('CATALOG_SCHEDULER_INVALID_RESPONSE');
  let busy = false, latestStart = -Infinity;
  for (const run of data.workflow_runs) {
    if (!run || typeof run !== 'object' || typeof run.status !== 'string' || !RUN_STATUSES.has(run.status)
      || typeof run.event !== 'string' || !/^[a-z_]{1,64}$/.test(run.event))
      throw new Error('CATALOG_SCHEDULER_INVALID_RESPONSE');
    const dates = [run.created_at, run.run_started_at];
    if (dates.some(date => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(date)
      || !Number.isFinite(Date.parse(date)) || Date.parse(date) > now
      || new Date(Date.parse(date)).toISOString().slice(0, 19) + 'Z' !== date))
      throw new Error('CATALOG_SCHEDULER_INVALID_RESPONSE');
    const requested = Date.parse(run.created_at), started = Date.parse(run.run_started_at);
    if (started < requested) throw new Error('CATALOG_SCHEDULER_INVALID_RESPONSE');
    // Una solicitud manual/fallida o un rerun reciente también frena reintentos.
    latestStart = Math.max(latestStart, requested, started);
    busy ||= run.status !== 'completed';
  }
  return { busy, latestStart };
}

// Respaldo del cron de GitHub. Sólo despacha: nunca consulta tiendas ni precios.
export async function runCatalogScheduler(env: CatalogSchedulerEnv, now = Date.now(), fetcher: typeof fetch = globalThis.fetch, recovery: SchedulerRecovery = {}): Promise<SchedulerResult> {
  if (env.CATALOG_SCHEDULER_ENABLED !== '1') return 'disabled';
  const token = env.GITHUB_ACTIONS_DISPATCH_TOKEN?.trim();
  const database = env.SUPABASE_URL?.trim();
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  if (!token || !database || !secret) throw new Error('CATALOG_SCHEDULER_CREDENTIALS_MISSING');
  const headers = {
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'comparador-catalog-scheduler',
  };
  const clock = recovery.clock ?? (() => performance.now());
  const sleep = recovery.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const started = clock();
  const elapsed = () => Math.max(0, clock() - started);
  const remaining = () => RECOVERY_BUDGET_MS - elapsed();
  let waited = false;
  for (;;) {
    if (remaining() <= 0) return 'deferred';
    const snapshots = [];
    for (const workflow of WORKFLOWS) {
      if (remaining() <= 0) return 'deferred';
      const listed = await request('READ', fetcher, `${WORKFLOW_BASE}${workflow.file}/runs?branch=main&per_page=10`, {
        headers, redirect: 'manual',
      }, remaining());
      if (!listed.ok) throw new Error('CATALOG_SCHEDULER_READ_FAILED');
      snapshots.push({ workflow, ...parseRuns(await readJson('READ', listed), now + elapsed()) });
    }
    // Validar ambos listados completos antes de decidir, incluso si uno está ocupado.
    if (snapshots.some(snapshot => snapshot.busy)) return 'busy';
    const current = now + elapsed();
    const eligible = snapshots.filter(snapshot => current - snapshot.latestStart >= COOLDOWN_MS);
    if (!eligible.length) return 'recent';
    const urgentGuides = eligible.find(snapshot => snapshot.workflow.target === 'guides'
      && current - snapshot.latestStart >= GUIDES_URGENT_MS);
    // Ventana de guías: dar oportunidad antes de 3 h; GitHub aún puede demorarla.
    const selected = urgentGuides ?? eligible.sort((a, b) => a.latestStart - b.latestStart
      || (a.workflow.target === 'guides' ? -1 : 1))[0];
    if (remaining() <= 0) return 'deferred';
    // El límite distribuido también cubre reentregas del mismo evento de Cloudflare.
    const gate = await request('GATE', fetcher, new URL('/rest/v1/rpc/check_api_rate_limit', database), {
      method: 'POST', redirect: 'manual',
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bucket_key: 'catalog-scheduler-dispatch-hour', p_limit: 1, p_window_seconds: 3600 }),
    }, remaining());
    if (!gate.ok) throw new Error('CATALOG_SCHEDULER_GATE_FAILED');
    const limit = await readJson('GATE', gate);
    if (!limit || typeof limit !== 'object' || !('allowed' in limit) || typeof limit.allowed !== 'boolean')
      throw new Error('CATALOG_SCHEDULER_INVALID_GATE');
    if (!limit.allowed) {
      const retry = 'retryAfterSeconds' in limit ? limit.retryAfterSeconds : undefined;
      if (waited || typeof retry !== 'number' || !Number.isInteger(retry) || retry <= 0 || retry > 10) return 'deferred';
      // Pequeño margen para la RPC; nunca esperar más de diez segundos ni reiniciar el bucket.
      const waitMs = Math.min(MAX_RECOVERY_WAIT_MS, retry * 1000 + 100);
      if (remaining() <= waitMs) return 'deferred';
      waited = true;
      await sleep(waitMs);
      continue; // Releer GitHub antes de volver a adquirir el mismo permiso distribuido.
    }
    if (remaining() <= 0) return 'deferred';
    // Un rechazo o una respuesta perdida conserva la guarda: jamás repetir este POST.
    const sent = await request('DISPATCH', fetcher, `${WORKFLOW_BASE}${selected.workflow.file}/dispatches`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      redirect: 'manual',
      body: JSON.stringify({ ref: 'main', inputs: selected.workflow.inputs }),
    }, remaining());
    if (sent.status !== 200 && sent.status !== 204) throw new Error('CATALOG_SCHEDULER_DISPATCH_FAILED');
    return 'sent';
  }
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
