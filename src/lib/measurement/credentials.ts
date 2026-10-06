import 'server-only';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { MEASUREMENT_SCOPE, MEASUREMENT_TABLE } from './store';
import { isRecord } from './validation';
import type { ProviderId } from './types';

const scope = `${MEASUREMENT_SCOPE}:credentials`;
type CredentialId = 'google' | 'google-adsense' | 'google-ads-oauth' | 'cloudflare' | 'database' | 'google-ads';
export const GOOGLE_SCOPES = {
  ga4: 'https://www.googleapis.com/auth/analytics.readonly',
  'search-console': 'https://www.googleapis.com/auth/webmasters.readonly',
  adsense: 'https://www.googleapis.com/auth/adsense.readonly',
  'google-ads': 'https://www.googleapis.com/auth/adwords',
} as const;

function encode(bytes: Uint8Array) { return Buffer.from(bytes).toString('base64url'); }
function decode(value: string) { return new Uint8Array(Buffer.from(value, 'base64url')); }
async function encryptionKey() {
  const value = process.env.MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY ?? '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Falta configurar el cifrado privado de las conexiones.');
  return crypto.subtle.importKey('raw', new Uint8Array(Buffer.from(value, 'hex')), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealPrivateValue(value: unknown, purpose: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(purpose) }, await encryptionKey(), new TextEncoder().encode(JSON.stringify(value)));
  return `${encode(iv)}.${encode(new Uint8Array(data))}`;
}
export async function openPrivateValue(value: string, purpose: string): Promise<unknown> {
  if (value.length > 16000) throw new Error('Autorización inválida.');
  const [iv, body, extra] = value.split('.');
  if (!iv || !body || extra || decode(iv).length !== 12) throw new Error('Autorización inválida.');
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: new TextEncoder().encode(purpose) }, await encryptionKey(), decode(body));
  return JSON.parse(new TextDecoder().decode(data));
}

async function loadCredential(id: CredentialId): Promise<Record<string, unknown> | null> {
  const client = getServerSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.from(MEASUREMENT_TABLE).select('payload').eq('scope', scope).eq('entry_key', `${scope}:${id}`).abortSignal(AbortSignal.timeout(8_000)).maybeSingle();
  if (error || !isRecord(data?.payload) || typeof data.payload.encrypted !== 'string') return null;
  try {
    const value = await openPrivateValue(data.payload.encrypted, `credential:${id}`);
    return isRecord(value) ? value : null;
  } catch { return null; }
}

export async function saveCredential(id: CredentialId, value: Record<string, unknown>) {
  const client = getServerSupabaseServiceClient();
  if (!client) throw new Error('Falta el guardado privado.');
  const encrypted = await sealPrivateValue(value, `credential:${id}`);
  const { error } = await client.from(MEASUREMENT_TABLE).upsert({ entry_key: `${scope}:${id}`, scope, payload: { encrypted, version: 1 }, updated_at: new Date().toISOString() }, { onConflict: 'entry_key' }).abortSignal(AbortSignal.timeout(8_000));
  if (error) throw new Error('No se pudo guardar la autorización privada.');
}

export interface GoogleAuthorization { clientId: string; clientSecret: string; refreshToken: string; scopes: string[] }
export interface ConnectionSecrets {
  google: GoogleAuthorization | null;
  adsenseGoogle?: GoogleAuthorization | null;
  adsGoogle?: GoogleAuthorization | null;
  cloudflare: { token: string; accountId: string; worker: string } | null;
  database: { token: string; projectId: string } | null;
  ads: { developerToken: string; customerId: string } | null;
}
export function googleAuthorizationFor(id: ProviderId, settings: ConnectionSecrets): GoogleAuthorization | null {
  if (id === 'adsense' && settings.adsenseGoogle) return settings.adsenseGoogle;
  if (id === 'google-ads' && settings.adsGoogle) return settings.adsGoogle;
  return settings.google;
}
const env = (name: string) => process.env[name]?.trim() ?? '';
export async function loadConnectionSecrets(): Promise<ConnectionSecrets> {
  const [google, cloudflare, database, ads, adsenseGoogle, adsGoogle] = await Promise.all(['google', 'cloudflare', 'database', 'google-ads', 'google-adsense', 'google-ads-oauth'].map((id) => loadCredential(id as CredentialId)));
  const clientId = env('MEASUREMENT_GOOGLE_CLIENT_ID'), clientSecret = env('MEASUREMENT_GOOGLE_CLIENT_SECRET');
  const separateGoogle = (value: Record<string, unknown> | null): GoogleAuthorization | null => value?.clientId === clientId && clientId && clientSecret && typeof value.refreshToken === 'string' && value.refreshToken && Array.isArray(value.scopes) ? { clientId, clientSecret, refreshToken: value.refreshToken, scopes: value.scopes.filter((item): item is string => typeof item === 'string') } : null;
  const refreshToken = google?.clientId === clientId && typeof google.refreshToken === 'string' ? google.refreshToken : env('MEASUREMENT_GOOGLE_REFRESH_TOKEN');
  const granted = google?.clientId === clientId && Array.isArray(google.scopes) ? google.scopes.filter((s): s is string => typeof s === 'string') : env('MEASUREMENT_GOOGLE_SCOPES').split(' ').filter(Boolean);
  const cfToken = typeof cloudflare?.token === 'string' ? cloudflare.token : env('MEASUREMENT_CLOUDFLARE_TOKEN');
  const cfAccount = typeof cloudflare?.accountId === 'string' ? cloudflare.accountId : env('MEASUREMENT_CLOUDFLARE_ACCOUNT_ID');
  const dbToken = typeof database?.token === 'string' ? database.token : env('MEASUREMENT_SUPABASE_ACCESS_TOKEN');
  const developerToken = typeof ads?.developerToken === 'string' ? ads.developerToken : env('MEASUREMENT_GOOGLE_ADS_DEVELOPER_TOKEN');
  return {
    google: clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken, scopes: granted } : null,
    adsenseGoogle: separateGoogle(adsenseGoogle),
    adsGoogle: separateGoogle(adsGoogle),
    cloudflare: cfToken && cfAccount ? { token: cfToken, accountId: cfAccount, worker: typeof cloudflare?.worker === 'string' ? cloudflare.worker : env('MEASUREMENT_CLOUDFLARE_WORKER') || 'comparador-hardware-argentina' } : null,
    database: dbToken ? { token: dbToken, projectId: typeof database?.projectId === 'string' ? database.projectId : 'zyiyziubpcpgoqlkcrie' } : null,
    ads: developerToken ? { developerToken, customerId: typeof ads?.customerId === 'string' ? ads.customerId : env('MEASUREMENT_GOOGLE_ADS_CUSTOMER_ID') || '5796164752' } : null,
  };
}
