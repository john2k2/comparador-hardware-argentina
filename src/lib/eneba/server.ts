import 'server-only';
import { logger } from '@/lib/logger';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { ENEBA_CACHE_SCOPE, ENEBA_CACHE_KEY } from './snapshot-cache';
import {
  isEnebaOfferFresh, readEnebaSnapshot, type EnebaSnapshot,
} from './pilot';

let pending: Promise<EnebaSnapshot> | undefined;
let local: { snapshot: EnebaSnapshot; expiresAt: number } | undefined;

export function isEnebaPilotEnabled(): boolean {
  return process.env.ENEBA_AFFILIATE_PILOT_ENABLED === '1';
}

async function readCachedSnapshot(): Promise<EnebaSnapshot> {
  const unavailable: EnebaSnapshot = { status: 'error', offers: [], fetchedAt: null, feedUpdatedAt: null };
  const now = Date.now();
  if (local && local.expiresAt > now) return readEnebaSnapshot(local.snapshot, now) ?? unavailable;
  try {
    const client = getServerSupabaseServiceClient();
    if (client) {
      const { data, error } = await client.from('api_cache_entries').select('payload,expires_at')
        .eq('cache_key', `${ENEBA_CACHE_SCOPE}:${ENEBA_CACHE_KEY}`).maybeSingle();
      const expires = Date.parse(String(data?.expires_at));
      const verified = !error && expires > now ? readEnebaSnapshot(data?.payload, now) : null;
      if (verified) {
        // Ver las nuevas muestras en un minuto sin borrar filas vencidas ni escribir desde una visita.
        local = { snapshot: verified, expiresAt: Math.min(expires, now + 60_000) };
        return verified;
      }
    }
  } catch { logger.warn("No se pudo leer la caché del piloto Eneba"); }
  // Sólo el productor Node consulta Eneba. Una visita no renueva precios o fechas.
  local = { snapshot: unavailable, expiresAt: now + 60_000 };
  return unavailable;
}

export async function getEnebaSnapshot(): Promise<EnebaSnapshot> {
  if (!isEnebaPilotEnabled()) return { status: 'disabled', offers: [], fetchedAt: null, feedUpdatedAt: null };
  // Comparte la lectura en curso dentro del proceso; no hay refresh público forzado.
  pending ??= readCachedSnapshot().finally(() => { pending = undefined; });
  return pending;
}

export async function handleEnebaGamesGet(): Promise<Response> {
  const snapshot = await getEnebaSnapshot();
  const offers = snapshot.offers.filter((offer) => isEnebaOfferFresh(offer));
  return Response.json({ ...snapshot, offers, status: snapshot.status === 'ready' && offers.length === 0 ? 'empty' : snapshot.status }, {
    status: snapshot.status === 'disabled' ? 404 : 200,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
