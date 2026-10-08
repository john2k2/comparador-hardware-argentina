import 'server-only';
import { logger } from '@/lib/logger';
import { parseEnebaFeed } from './feed';
import { buildEnebaFeedUrl, ENEBA_PRICE_MAX_AGE_MS, type EnebaSnapshot } from './pilot';
export const ENEBA_MAX_FEED_BYTES = 384 * 1024;
async function readBoundedFeed(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length')) > ENEBA_MAX_FEED_BYTES || !response.body) {
    await response.body?.cancel(); throw new Error('oversized-feed');
  }
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
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
  const fetchedAt = new Date().toISOString(), diagnostic: Record<string, string | number | null> = {};
  try {
    const response = await fetch(buildEnebaFeedUrl(), {
      cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'application/xml, text/xml' },
    });
    diagnostic.httpStatus = response.status;
    diagnostic.contentType = (response.headers.get('content-type') ?? '').split(';')[0].slice(0, 80);
    if (!response.ok || !/^(application|text)\/xml\b/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel(); throw new Error('feed-unavailable');
    }
    const modified = Date.parse(response.headers.get('last-modified') ?? ''), age = Date.now() - modified;
    diagnostic.feedUpdatedAt = Number.isFinite(modified) ? new Date(modified).toISOString() : null;
    diagnostic.feedAgeMs = Number.isFinite(age) ? age : null;
    if (!Number.isFinite(modified) || age < 0 || age >= ENEBA_PRICE_MAX_AGE_MS) {
      await response.body?.cancel(); throw new Error('feed-date-unverified');
    }
    const feedUpdatedAt = new Date(modified).toISOString();
    const offers = parseEnebaFeed(await readBoundedFeed(response), feedUpdatedAt);
    return { status: offers.length ? 'ready' : 'empty', offers, fetchedAt, feedUpdatedAt };
  } catch (error) {
    const known = ['oversized-feed', 'feed-unavailable', 'feed-date-unverified'];
    const reason = error instanceof Error && known.includes(error.message) ? error.message
      : error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'feed-read-or-parse-error';
    logger.warn('No se pudo verificar la muestra de Eneba', { reason, ...diagnostic });
    return { status: 'error', offers: [], fetchedAt, feedUpdatedAt: null };
  }
}
