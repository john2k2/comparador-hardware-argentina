import { decodeObservedHome, PUBLIC_HOME_KEY, PUBLIC_HOME_SCOPE } from './observed-snapshot';

type HomeReadEnv = { SUPABASE_URL?: string; NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string };
async function boundedRows(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('HOME_READ_FAILED');
  const decoder = new TextDecoder(); let text = ''; let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > 65_536) { await reader.cancel(); throw new Error('HOME_READ_TOO_LARGE'); }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

// Lee únicamente esta selección de catálogo público. La ruta no acepta claves
// ni scopes del navegador y jamás consulta las conexiones o informes privados.
export async function handleObservedHomeRead(request: Request, env: HomeReadEnv, fetcher: typeof fetch): Promise<Response | null> {
  if (request.method !== 'GET' || new URL(request.url).pathname !== '/api/home/observed-sections') return null;
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const failure = () => Response.json({ error: 'No hay un corte reciente verificable para esta selección. Podés consultar el catálogo.' }, { status: 503, headers });
  const origin = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  if (!env.SUPABASE_SECRET_KEY || !/^https:\/\/zyiyziubpcpgoqlkcrie\.supabase\.co\/?$/.test(origin ?? '')) return failure();
  try {
    const url = new URL('/rest/v1/measurement_dashboard_entries', origin);
    url.searchParams.set('scope', `eq.${PUBLIC_HOME_SCOPE}`);
    url.searchParams.set('entry_key', `eq.${PUBLIC_HOME_KEY}`);
    url.searchParams.set('select', 'payload'); url.searchParams.set('limit', '1');
    const response = await fetcher(url, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` }, redirect: 'manual', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return failure();
    const rows = await boundedRows(response);
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') return failure();
    const snapshot = decodeObservedHome(rows[0].payload);
    return snapshot ? Response.json(snapshot, { headers }) : failure();
  } catch { return failure(); }
}
