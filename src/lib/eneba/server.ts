import 'server-only';
import { logger } from '@/lib/logger';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import { parseEnebaFeed } from './feed';
import {
  buildEnebaFeedUrl, ENEBA_PRICE_MAX_AGE_MS, ENEBA_REVIEW_VERSION,
  isEnebaOfferFresh, readEnebaSnapshot, type EnebaSnapshot,
} from './pilot';

const CACHE_SCOPE = 'eneba-affiliate-pilot';
const CACHE_KEY = `${ENEBA_REVIEW_VERSION}:ar:ars:game:6`;
const ERROR_TTL_MS = 60 * 60 * 1000;
export const ENEBA_MAX_FEED_BYTES = 256 * 1024;
let pending: Promise<EnebaSnapshot> | undefined;

export function isEnebaPilotEnabled(): boolean {
  return process.env.ENEBA_AFFILIATE_PILOT_ENABLED === '1';
}

async function readBoundedFeed(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length')) > ENEBA_MAX_FEED_BYTES || !response.body) {
    await response.body?.cancel();
    throw new Error('oversized-feed');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > ENEBA_MAX_FEED_BYTES) throw new Error('oversized-feed');
      text += decoder.decode(value, { stream: true });
    }
  } finally { await reader.cancel(); }
}

export async function fetchEnebaSnapshot(): Promise<EnebaSnapshot> {
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetch(buildEnebaFeedUrl(), {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'application/xml, text/xml' },
    });
    if (!response.ok || !/^(application|text)\/xml\b/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel();
      throw new Error('feed-unavailable');
    }
    // El feed no fecha cada precio. Conservamos Last-Modified del origen,
    // nunca la hora de lectura de una caché como una nueva actualización.
    const modified = Date.parse(response.headers.get('last-modified') ?? '');
    const age = Date.now() - modified;
    if (!Number.isFinite(modified) || age < 0 || age >= ENEBA_PRICE_MAX_AGE_MS) {
      await response.body?.cancel();
      throw new Error('feed-date-unverified');
    }
    const feedUpdatedAt = new Date(modified).toISOString();
    const offers = parseEnebaFeed(await readBoundedFeed(response), feedUpdatedAt);
    return { status: offers.length ? 'ready' : 'empty', offers, fetchedAt, feedUpdatedAt };
  } catch {
    logger.warn('No se pudo verificar la muestra de Eneba');
    return { status: 'error', offers: [], fetchedAt, feedUpdatedAt: null };
  }
}

async function readCachedSnapshot(): Promise<EnebaSnapshot> {
  let cached: EnebaSnapshot | undefined;
  try { cached = await getSharedCache<EnebaSnapshot>(CACHE_SCOPE, CACHE_KEY, { allowStale: false }); }
  catch { logger.warn('No se pudo leer la caché del piloto Eneba'); }
  if (cached) {
    const verified = readEnebaSnapshot(cached);
    if (verified) return verified;
  }
  const snapshot = await fetchEnebaSnapshot();
  const ttl = snapshot.feedUpdatedAt
    ? Math.max(1_000, ENEBA_PRICE_MAX_AGE_MS - (Date.now() - Date.parse(snapshot.feedUpdatedAt)))
    : ERROR_TTL_MS;
  try {
    await setSharedCache(CACHE_SCOPE, CACHE_KEY, snapshot, ttl);
  } catch { logger.warn('No se pudo guardar la caché del piloto Eneba'); }
  return snapshot;
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
