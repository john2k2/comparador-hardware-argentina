import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { JOB_ID_PATTERN, parseRefreshTargets, readSmallJson, type RefreshJob } from './contracts';
import { dispatchRequestedRefresh } from './dispatch';

const respond = (body: unknown, status = 200, extra: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
function publicJob(job: RefreshJob): RefreshJob {
  return { id: job.id, status: ['queued', 'running'].includes(job.status) && Date.parse(job.expires_at) <= Date.now() ? 'failed' : job.status,
    targets: job.targets, results: job.results, created_at: job.created_at, started_at: job.started_at, finished_at: job.finished_at, expires_at: job.expires_at };
}
export async function POST(request: NextRequest) {
  if (process.env.ENABLE_ON_DEMAND_REFRESH !== '1') return respond({ error: 'La actualización a pedido todavía no está habilitada.' }, 503);
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin || request.headers.get('sec-fetch-site') === 'cross-site') return respond({ error: 'Solicitud no permitida.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return respond({ error: 'Formato de solicitud inválido.' }, 415);
  const supabase = getServerSupabaseServiceClient();
  const salt = process.env.CATALOG_REFRESH_CRON_SECRET || process.env.CRON_SECRET;
  if (!supabase || !salt) return respond({ error: 'No se pudo conectar con el servicio de actualización.' }, 503);
  let targets;
  try {
    const body = await readSmallJson(request) as { targets?: unknown };
    targets = parseRefreshTargets(body?.targets);
  } catch (error) { return respond({ error: 'Solicitud inválida o demasiado grande.' }, error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400); }
  if (!targets) return respond({ error: 'Elegí entre una y ocho ofertas válidas para actualizar.' }, 400);
  const ip = request.headers.get('cf-connecting-ip') || (process.env.NODE_ENV === 'production' ? 'shared-fallback' : 'local-development');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  const requesterHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  try {
    const { data, error } = await supabase.rpc('request_offer_refresh', { p_targets: targets, p_requester_hash: requesterHash });
    if (error) {
      if (error.message.includes('REFRESH_RATE_LIMIT')) return respond({ error: 'Hay varias actualizaciones en curso. Volvé a intentarlo en unos minutos.' }, 429, { 'Retry-After': '600' });
      if (error.message.includes('REFRESH_OFFER_NOT_FOUND')) return respond({ error: 'Una oferta ya no está en el catálogo. Volvé a cargar las piezas.' }, 409);
      return respond({ error: 'No se pudo registrar la actualización. Tus precios siguen con su fecha anterior.' }, 503);
    }
    if (!data) return respond({ error: 'No se pudo registrar la actualización.' }, 503);
    const job = publicJob(data as RefreshJob);
    const dispatch = job.status === 'queued' ? await dispatchRequestedRefresh(supabase) : 'deferred';
    return respond({ job, dispatch }, 202);
  } catch { return respond({ error: 'El servicio de actualización no respondió. Intentá nuevamente.' }, 503); }
}
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!JOB_ID_PATTERN.test(id)) return respond({ error: 'Solicitud inválida.' }, 400);
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return respond({ error: 'Servicio no disponible.' }, 503);
  try {
    const { data, error } = await supabase.from('requested_offer_refreshes')
      .select('id,status,targets,results,created_at,started_at,finished_at,expires_at').eq('id', id).maybeSingle();
    if (error) return respond({ error: 'No se pudo consultar el estado.' }, 503);
    return data ? respond({ job: publicJob(data as RefreshJob) }) : respond({ error: 'Esta solicitud ya no está disponible.' }, 404);
  } catch { return respond({ error: 'No se pudo consultar el estado.' }, 503); }
}
