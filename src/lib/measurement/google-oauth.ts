import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeMeasurementRequest, hasSameOrigin, PRIVATE_HEADERS, privateJson, readBoundedJson } from './access';
import { GOOGLE_SCOPES, loadConnectionSecrets, openPrivateValue, saveCredential, sealPrivateValue } from './credentials';
import { saveMeasurements } from './store';
import { isRecord } from './validation';
import type { ProviderId } from './types';

const STATE_COOKIE = 'measurement-google-state';
const COOKIE_PATH = '/api/admin/measurement/google';
const scopes = Object.values(GOOGLE_SCOPES) as string[];

function oauthConfig() {
  const clientId = process.env.MEASUREMENT_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.MEASUREMENT_GOOGLE_CLIENT_SECRET?.trim();
  const url = new URL(process.env.MEASUREMENT_PUBLIC_URL || 'invalid:');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!clientId || !clientSecret || !['http:', 'https:'].includes(url.protocol) || (url.protocol !== 'https:' && !loopback) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (process.env.MEASUREMENT_GOOGLE_CLIENT_TYPE === 'installed' && !loopback)) throw new Error('Falta configurar una conexión de Google para el dominio de este panel.');
  return { clientId, clientSecret, origin: url.origin, redirectUri: `${url.origin}${COOKIE_PATH}/callback`, secure: url.protocol === 'https:' };
}
const random = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

export async function handleGoogleStart(request: NextRequest) {
  try {
    const admin = await authorizeMeasurementRequest(request);
    if (!admin) return privateJson({ error: 'No autorizado' }, 401);
    if (!hasSameOrigin(request)) return privateJson({ error: 'La solicitud debe salir desde esta página.' }, 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateJson({ error: 'Formato no válido.' }, 415);
    let body;
    try { body = await readBoundedJson(request, 1000); } catch { return privateJson({ error: 'La solicitud no es válida.' }, 400); }
    if (!isRecord(body) || Object.keys(body).some((key) => key !== 'provider') || typeof body.provider !== 'string' || !Object.hasOwn(GOOGLE_SCOPES, body.provider)) return privateJson({ error: 'Elegí una conexión de Google válida.' }, 400);
    const config = oauthConfig();
    if (request.headers.get('origin') !== config.origin) return privateJson({ error: `Abrí el panel en ${config.origin} para autorizar Google.` }, 403);
    const previous = await loadConnectionSecrets();
    const separate = body.provider === 'adsense' || body.provider === 'google-ads';
    const requested = separate ? [GOOGLE_SCOPES[body.provider as 'adsense' | 'google-ads']] : [GOOGLE_SCOPES.ga4, GOOGLE_SCOPES['search-console'], GOOGLE_SCOPES.adsense];
    const requestedScopes = [...new Set([...requested, ...(!separate ? previous.google?.scopes ?? [] : []).filter((scope) => scopes.includes(scope))])];
    const state = random(), verifier = random();
    const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
    const cookie = await sealPrivateValue({ state, verifier, adminId: admin.id, expires: Date.now() + 600_000, redirectUri: config.redirectUri, clientId: config.clientId, provider: body.provider, requestedScopes }, 'google-oauth-state');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [key, value] of Object.entries({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', scope: requestedScopes.join(' '), state, code_challenge: challenge, code_challenge_method: 'S256' })) url.searchParams.set(key, value);
    const response = privateJson({ url: url.toString() });
    response.cookies.set(STATE_COOKIE, cookie, { httpOnly: true, secure: config.secure, sameSite: 'lax', path: COOKIE_PATH, maxAge: 600 });
    return response;
  } catch { return privateJson({ error: 'No se pudo iniciar Google. Revisá la configuración privada y el guardado del panel.' }, 503); }
}

export async function handleGoogleCallback(request: NextRequest) {
  const finish = (origin: string, result: string) => {
    const response = NextResponse.redirect(`${origin}/admin/seguimiento?google=${result}`, { status: 303, headers: PRIVATE_HEADERS });
    response.cookies.set(STATE_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:'), path: COOKIE_PATH, maxAge: 0 });
    return response;
  };
  let config;
  try { config = oauthConfig(); } catch { return privateJson({ error: 'La conexión de Google no está configurada.' }, 503); }
  try {
    const admin = await authorizeMeasurementRequest(request);
    if (!admin) return finish(config.origin, 'admin');
    const raw = request.cookies.get(STATE_COOKIE)?.value;
    if (!raw) return finish(config.origin, 'expired');
    const state = await openPrivateValue(raw, 'google-oauth-state');
    if (!isRecord(state) || state.adminId !== admin.id || state.clientId !== config.clientId || state.redirectUri !== config.redirectUri || typeof state.expires !== 'number' || state.expires <= Date.now() || state.expires > Date.now() + 600_000 || typeof state.state !== 'string' || state.state !== request.nextUrl.searchParams.get('state') || typeof state.verifier !== 'string' || !Array.isArray(state.requestedScopes) || state.requestedScopes.some((scope) => typeof scope !== 'string' || !scopes.includes(scope))) return finish(config.origin, 'expired');
    if (typeof state.provider !== 'string' || !Object.hasOwn(GOOGLE_SCOPES, state.provider) || !state.requestedScopes.includes(GOOGLE_SCOPES[state.provider as keyof typeof GOOGLE_SCOPES])) return finish(config.origin, 'expired');
    if (request.nextUrl.searchParams.has('error')) return finish(config.origin, 'denied');
    const code = request.nextUrl.searchParams.get('code');
    if (!code || code.length > 2048) return finish(config.origin, 'expired');
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(12_000), body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, code_verifier: state.verifier }) });
    if (!response.ok) return finish(config.origin, 'failed');
    const token = await readBoundedJson(response);
    if (!isRecord(token) || typeof token.refresh_token !== 'string' || !token.refresh_token || token.refresh_token.length > 4096 || typeof token.scope !== 'string') return finish(config.origin, 'failed');
    const granted = token.scope.split(' ').filter((scope) => scopes.includes(scope));
    if (state.requestedScopes.some((scope) => !granted.includes(scope))) return finish(config.origin, 'denied');
    const credentialId = state.provider === 'adsense' ? 'google-adsense' : state.provider === 'google-ads' ? 'google-ads-oauth' : 'google';
    await saveCredential(credentialId, { refreshToken: token.refresh_token, clientId: config.clientId, scopes: granted });
    const checkedAt = new Date().toISOString();
    const connectedProviders = credentialId === 'google' ? Object.entries(GOOGLE_SCOPES).filter(([, scope]) => granted.includes(scope)).map(([id]) => id as ProviderId) : [state.provider as ProviderId];
    await saveMeasurements([], connectedProviders.map((id) => ({ id, state: 'ready', checkedAt, issue: null })));
    return finish(config.origin, 'connected');
  } catch { return finish(config.origin, 'failed'); }
}
