import { hasAdminRole } from '../server/admin-role';
import { freshDocument } from '../server/public-document-cache';
import { decodeStoredReading } from './reading-decoder';
import { isProvider, isRecord, parseCommand } from './validation';
import { PROVIDER_IDS, DECISION_IDS, type MeasurementDashboard, type ProviderConnection, type TrackedDecision } from './types';

type EdgeEnv = {
  MEASUREMENT_COLLECTION_MODE?: string;
  MEASUREMENT_GOOGLE_CLIENT_TYPE?: string;
  MEASUREMENT_GOOGLE_CLIENT_ID?: string;
  MEASUREMENT_GOOGLE_CLIENT_SECRET?: string;
  MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY?: string;
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
};
const SCOPE = 'measurement-dashboard-v1';
const supabaseOrigin = (env: EdgeEnv) => env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' };
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: PRIVATE_HEADERS }); }

async function boundedJson(response: Response, maximum = 256_000): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('PRIVATE_READ_FAILED');
  const decoder = new TextDecoder(); let text = ''; let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > maximum) { await reader.cancel(); throw new Error('PRIVATE_READ_TOO_LARGE'); }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

function token(request: Request, page: boolean) {
  const authorization = page ? null : request.headers.get('authorization');
  const cookie = request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith('sb-access-token='))?.slice('sb-access-token='.length);
  const value = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : cookie;
  return value && value.length <= 8192 && /^[a-zA-Z0-9_.-]+$/.test(value) ? value : null;
}

async function authorize(request: Request, env: EdgeEnv, fetcher: typeof fetch, page: boolean) {
  const access = token(request, page);
  if (!access) return 'denied';
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const origin = supabaseOrigin(env);
  if (!key || !/^https:\/\/zyiyziubpcpgoqlkcrie\.supabase\.co\/?$/.test(origin ?? '')) return 'unavailable';
  try {
    // Igual que auth.getUser(token): valida la sesión con Supabase y recibe
    // app_metadata actual, sin confiar en el JWT decodificado por el cliente.
    const response = await fetcher(new URL('/auth/v1/user', origin), { headers: { apikey: key, Authorization: `Bearer ${access}` }, redirect: 'manual', signal: AbortSignal.timeout(8_000) });
    if (response.status === 401 || response.status === 403) return 'denied';
    if (!response.ok) return 'unavailable';
    const user = await boundedJson(response, 64_000);
    if (!isRecord(user) || typeof user.id !== 'string' || !isRecord(user.app_metadata)) return 'denied';
    return hasAdminRole({ app_metadata: user.app_metadata }) ? 'authorized' : 'denied';
  } catch { return 'unavailable'; }
}

function connection(value: unknown): ProviderConnection | null {
  if (!isRecord(value) || !isProvider(value.id) || !['connected', 'ready', 'needs_setup', 'manual', 'error'].includes(String(value.state))) return null;
  return { id: value.id, state: value.state as ProviderConnection['state'], checkedAt: typeof value.checkedAt === 'string' && Number.isFinite(Date.parse(value.checkedAt)) ? value.checkedAt : null, issue: typeof value.issue === 'string' ? value.issue.slice(0, 250) : null };
}
function decision(value: unknown): TrackedDecision | null {
  if (!isRecord(value) || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) return null;
  try {
    const parsed = parseCommand({ action: 'decision', id: value.id, status: value.status });
    return parsed.action === 'decision' ? { id: parsed.id, status: parsed.status, updatedAt: value.updatedAt } : null;
  } catch { return null; }
}

async function readView(env: EdgeEnv, fetcher: typeof fetch): Promise<MeasurementDashboard> {
  const origin = supabaseOrigin(env);
  if (!env.SUPABASE_SECRET_KEY || !origin) throw new Error('PRIVATE_VIEW_NOT_CONFIGURED');
  const url = new URL('/rest/v1/measurement_dashboard_entries', origin);
  url.searchParams.set('select', 'payload');
  url.searchParams.set('scope', `eq.${SCOPE}`);
  url.searchParams.set('entry_key', `in.(${[`${SCOPE}:view`, ...PROVIDER_IDS.map((id) => `${SCOPE}:connection:${id}`), ...DECISION_IDS.map((id) => `${SCOPE}:decision:${id}`)].join(',')})`);
  url.searchParams.set('limit', '16');
  const response = await fetcher(url, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` }, redirect: 'manual', signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error('PRIVATE_VIEW_READ_FAILED');
  const rows = await boundedJson(response);
  if (!Array.isArray(rows)) throw new Error('PRIVATE_VIEW_INVALID');
  const entries = rows.flatMap((row) => isRecord(row) && isRecord(row.payload) ? [row.payload] : []);
  const view = entries.find((entry) => entry.kind === 'dashboard-view')?.dashboard;
  if (!isRecord(view) || view.demo !== false || !Array.isArray(view.readings) || !Array.isArray(view.history)) throw new Error('PRIVATE_VIEW_MISSING');
  const readings = view.readings.slice(0, 10).flatMap((item) => { const reading = decodeStoredReading(item); return reading ? [reading] : []; });
  const history = view.history.slice(0, 80).flatMap((item) => { const reading = decodeStoredReading(item); return reading ? [reading] : []; });
  const storedConnections = entries.filter((entry) => entry.kind === 'connection').flatMap((entry) => { const value = connection(entry); return value ? [value] : []; });
  const previousConnections = Array.isArray(view.connections) ? view.connections.flatMap((item) => { const value = connection(item); return value ? [value] : []; }) : [];
  const decisions = entries.filter((entry) => entry.kind === 'decision').flatMap((entry) => { const value = decision(entry); return value ? [value] : []; });
  return {
    generatedAt: new Date().toISOString(), readings, history, decisions,
    connections: PROVIDER_IDS.map((id) => storedConnections.find((item) => item.id === id) ?? previousConnections.find((item) => item.id === id) ?? { id, state: 'needs_setup', checkedAt: null, issue: null }),
    storage: { available: true, issue: null }, setup: { externalCollector: true, encryption: /^[a-f0-9]{64}$/i.test(env.MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY ?? ''), google: Boolean(env.MEASUREMENT_GOOGLE_CLIENT_TYPE === 'web' && env.MEASUREMENT_GOOGLE_CLIENT_ID && env.MEASUREMENT_GOOGLE_CLIENT_SECRET) },
    demo: false, demoBaselineReal: false,
  };
}

// Camino ligero para lecturas. Las escrituras y OAuth conservan los handlers
// administrativos de Next, sus validaciones de origen y su cifrado.
export async function handleMeasurementEdgeRead(request: Request, env: EdgeEnv, fetcher: typeof fetch): Promise<Response | null> {
  if (env.MEASUREMENT_COLLECTION_MODE !== 'external' || request.method !== 'GET') return null;
  const path = new URL(request.url).pathname;
  const page = path === '/admin/seguimiento';
  if (!page && path !== '/api/admin/measurement') return null;
  // Los fragmentos siguen la ruta de Next, que también valida administrador.
  if (page && request.headers.has('rsc')) return null;
  const auth = await authorize(request, env, fetcher, page);
  if (auth === 'unavailable') return page ? new Response('No se pudo validar tu sesión. Volvé a cargar la página.', { status: 503, headers: PRIVATE_HEADERS }) : json({ error: 'No se pudo validar tu sesión. Volvé a intentar.' }, 503);
  if (auth !== 'authorized') return page ? new Response(null, { status: 307, headers: { ...PRIVATE_HEADERS, Location: '/auth?next=%2Fadmin%2Fseguimiento' } }) : json({ error: 'No autorizado' }, 401);
  if (page) {
    if (!env.ASSETS) return null;
    try {
      const asset = await env.ASSETS.fetch(new Request('https://assets.local/__public-documents/measurement-shell-build.json'));
      if (!asset.ok) return null;
      const document = await boundedJson(asset, 512_000);
      if (!isRecord(document) || document.version !== 1 || document.route !== '/measurement-shell-build' || typeof document.html !== 'string' || !isRecord(document.headers)) return null;
      const response = freshDocument(document.html, new Headers(document.headers as Record<string, string>), 'private-document');
      for (const [key, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(key, value);
      return response;
    } catch { return null; }
  }
  try { return json(await readView(env, fetcher)); }
  catch { return json({ error: 'No se pudo leer el resumen privado. La actualización externa debe guardar un resultado válido.' }, 503); }
}
