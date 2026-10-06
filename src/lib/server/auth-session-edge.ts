type SessionEnv = {
  MEASUREMENT_COLLECTION_MODE?: string;
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Origin', 'X-Content-Type-Options': 'nosniff' };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: PRIVATE_HEADERS });

async function readJson(stream: ReadableStream<Uint8Array> | null, maximum: number): Promise<unknown> {
  const reader = stream?.getReader();
  if (!reader) throw new Error('MISSING_BODY');
  const decoder = new TextDecoder(); let text = ''; let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > maximum) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

function cookie(response: Response, accessToken: string, maxAge: number) {
  response.headers.set('Set-Cookie', `sb-access-token=${accessToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
  return response;
}

// Evitar arrancar Next para sincronizar una sesión. Supabase valida el token;
// los endpoints privados vuelven a validar al usuario y su rol vigente.
export async function handleAuthSessionEdge(request: Request, env: SessionEnv, fetcher: typeof fetch): Promise<Response | null> {
  if (env.MEASUREMENT_COLLECTION_MODE !== 'external' || new URL(request.url).pathname !== '/api/auth/session') return null;
  if (!['POST', 'DELETE'].includes(request.method)) {
    const response = json({ error: 'Método no permitido' }, 405);
    response.headers.set('Allow', 'POST, DELETE');
    return response;
  }
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Origen no autorizado' }, 403);
  if (request.method === 'DELETE') return cookie(json({ ok: true }), '', 0);

  let body: unknown;
  try { body = await readJson(request.body, 12_000); }
  catch { return json({ error: 'Payload inválido' }, 400); }
  const accessToken = record(body) && typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
  if (!accessToken || accessToken.length > 8192 || !/^[a-zA-Z0-9_.-]+$/.test(accessToken)) return json({ error: 'accessToken inválido' }, 400);

  const origin = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key || !/^https:\/\/zyiyziubpcpgoqlkcrie\.supabase\.co\/?$/.test(origin ?? '')) return json({ error: 'No se pudo validar la sesión' }, 503);
  try {
    const response = await fetcher(new URL('/auth/v1/user', origin), {
      headers: { apikey: key, Authorization: `Bearer ${accessToken}` }, redirect: 'manual', signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 401 || response.status === 403) return json({ error: 'Sesión inválida' }, 401);
    if (!response.ok) return json({ error: 'No se pudo validar la sesión' }, 503);
    const user = await readJson(response.body, 64_000);
    if (!record(user) || typeof user.id !== 'string' || !user.id) return json({ error: 'No se pudo validar la sesión' }, 503);
  } catch { return json({ error: 'No se pudo validar la sesión' }, 503); }

  const expiresAt = record(body) && typeof body.expiresAt === 'number' && Number.isFinite(body.expiresAt) ? body.expiresAt : null;
  const maxAge = expiresAt ? Math.max(60, Math.trunc(expiresAt - Date.now() / 1000)) : 3600;
  return cookie(json({ ok: true }), accessToken, maxAge);
}
