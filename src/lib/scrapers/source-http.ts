import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

/** Transporte acotado para las fuentes del piloto; no utiliza sesiones del usuario. */
export type SourceFailure = 'not-found' | 'rate-limited' | 'blocked' | 'maintenance' | 'http-error' | 'invalid-response' | 'too-large' | 'inconsistent-source';
export class SourceHttpError extends Error {
  constructor(public readonly reason: SourceFailure, public readonly status?: number) { super(reason); }
}
type Metric = { requests: number; bytes: number; durationMs: number; conditionalHits: number; backoffSkips: number; failures: number; failureReasons: Record<string,number>; httpStatusCounts: Partial<Record<number, number>> };
const metrics = new Map<string, Metric>();
const state = new Map<string, { tail: Promise<void>; nextAt: number; blockedUntil: number; consecutiveFailures: number }>();
let active = 0;
let maxActive = 3;
const waiters: Array<() => void> = [];
/** Sólo el runner de catálogo lo amplía; el resto de los procesos conserva el tope de tres. */
export function setSourceFetchConcurrency(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16) throw new Error('SOURCE_INVALID_CONCURRENCY');
  const previous = maxActive;
  maxActive = limit;
  while (active < maxActive && waiters.length) { active++; waiters.shift()!(); }
  return previous;
}
export function sourceBlockedUntil(store: string): number {
  return state.get(store)?.blockedUntil ?? 0;
}
function metric(store: string): Metric {
  if (!metrics.has(store)) metrics.set(store, { requests: 0, bytes: 0, durationMs: 0, conditionalHits: 0, backoffSkips: 0, failures: 0, failureReasons: {}, httpStatusCounts: {} });
  return metrics.get(store)!;
}
export function sourceHttpMetrics(): Record<string, Metric> {
  return Object.fromEntries([...metrics].map(([key, value]) => [key, { ...value, failureReasons: { ...value.failureReasons }, httpStatusCounts: { ...value.httpStatusCounts } }]));
}
export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 60_000;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(1000, Math.min(delay, 24 * 60 * 60 * 1000)) : 60_000;
}

function mexxUrl(raw: string): boolean {
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password && !url.port
    && ['mexx.com.ar', 'www.mexx.com.ar'].includes(url.hostname); } catch { return false; }
}
/** Sólo el400 de mantenimiento constatado; sin guardar ni registrar el cuerpo. */
async function isMexxMaintenance(response: Response, signal: AbortSignal): Promise<boolean> {
  if (!/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return false;
  const reader = response.body?.getReader();
  if (!reader) return false;
  const chunks: Uint8Array[] = [];
  let bytes = 0, onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), aborted]);
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 8192) return false;
      chunks.push(next.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const $ = cheerio.load(new TextDecoder().decode(body), { sourceCodeLocationInfo: true });
    // Un principal de producto no es mantenimiento, con atributos citados o no.
    if ($('#prod_desc_edit, [itemtype$="/Product"]').length > 0) return false;
    $('script, style, template, noscript').remove();
    $('*').filter((_, element) => {
      const node = $(element), style = (node.attr('style') ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
      return node.attr('hidden') !== undefined || node.attr('aria-hidden')?.trim().toLowerCase() === 'true'
        || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test(style);
    }).remove();
    const title = $('title'), main = $('main'), mainNode = main.get(0), pieces: string[] = [];
    const collectText = (node: AnyNode) => {
      if (node.type === 'text') pieces.push(node.data);
      else if ('children' in node) node.children.forEach(collectText);
    };
    if (mainNode) collectText(mainNode);
    const text = (value: string) => value.replace(/\s+/g, ' ').trim();
    const mainText = text(pieces.join(' '));
    // parse5 repara tags incompletos: exigir el cierre real del main observado.
    return title.length === 1 && /^MEXX\s*\|\s*Mantenimiento$/i.test(text(title.text())) && main.length === 1
      && Boolean(mainNode?.sourceCodeLocation?.endTag)
      && /\bESTAMOS REALIZANDO TAREAS DE MANTENIMIENTO\b/i.test(mainText)
      && /\bVolvemos en breve\b/i.test(mainText);
  } finally {
    signal.removeEventListener('abort', onAbort);
    // Cancelar sin esperar un cancel() remoto que podría quedar colgado.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export async function sourceFetch(store: string, url: string, options: RequestInit = {}, maxBytes = 8_000_000, redirectHosts: string[] = []): Promise<Response> {
  if (!state.has(store)) state.set(store, { tail: Promise.resolve(), nextAt: 0, blockedUntil: 0, consecutiveFailures: 0 });
  const gate = state.get(store)!;
  const previous = gate.tail;
  let release!: () => void;
  gate.tail = new Promise(resolve => { release = resolve; });
  await previous;
  let acquired = false;
  const stats = metric(store);
  const startedAt = Date.now();
  try {
    options.signal?.throwIfAborted();
    if (gate.blockedUntil > Date.now()) { stats.backoffSkips++; throw new SourceHttpError('rate-limited'); }
    const delay = gate.nextAt - Date.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    options.signal?.throwIfAborted();
    if (active >= maxActive) await new Promise<void>(resolve => waiters.push(resolve));
    else active++;
    acquired = true;
    options.signal?.throwIfAborted();
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000);
    let current = url;
    let response: Response;
    for (let hop = 0; ; hop++) {
      stats.requests++;
      response = await fetch(current, { ...options, redirect: redirectHosts.length ? 'manual' : 'error', signal });
      // Una entrada por respuesta HTTP, incluidos redirects/304. Un error de
      // transporte o un backoff sin respuesta nunca fabrica un código.
      const status = response.status;
      if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599)
        stats.httpStatusCounts[status] = (stats.httpStatusCounts[status] ?? 0) + 1;
      if (!redirectHosts.length || ![301,302,303,307,308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || hop >= 3) throw new SourceHttpError('invalid-response');
      const next = new URL(location,current);
      if (next.protocol !== 'https:' || next.username || next.password || next.port
        || !redirectHosts.includes(next.hostname.replace(/^www\./,''))) throw new SourceHttpError('invalid-response');
      current = next.href;
    }
    gate.nextAt = Date.now() + 2000;
    const maintenance = store === 'mexx' && response.status === 400 && mexxUrl(current) && await isMexxMaintenance(response, signal);
    if (response.status === 429 || response.status >= 500 || response.status === 403 || maintenance) {
      gate.consecutiveFailures++;
      const retry = response.headers.get('retry-after');
      gate.blockedUntil = Date.now() + (retry ? retryAfterMs(retry) : Math.min(15 * 60_000, 60_000 * 2 ** Math.min(gate.consecutiveFailures - 1, 4)));
    } else if (response.ok || response.status === 304) gate.consecutiveFailures = 0;
    if (!response.ok && response.status !== 304) {
      await response.body?.cancel();
      throw new SourceHttpError(maintenance ? 'maintenance' : response.status === 404 || response.status === 410 ? 'not-found' : response.status === 429 || response.status === 503 ? 'rate-limited' : response.status === 403 ? 'blocked' : 'http-error', response.status);
    }
    if (response.status === 304) { stats.conditionalHits++; return response; }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      if (reader) while (true) {
        const next = await reader.read(); if (next.done) break;
        bytes += next.value.byteLength; stats.bytes += next.value.byteLength;
        if (bytes > maxBytes) throw new SourceHttpError('too-large');
        chunks.push(next.value);
      }
    } finally { await reader?.cancel().catch(() => undefined); }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(body, { status: response.status, headers: response.headers });
  } catch (error) {
    stats.failures++;
    const reason = error instanceof SourceHttpError ? error.reason
      : error instanceof Error && ['TimeoutError','AbortError'].includes(error.name) ? 'timeout' : 'network';
    stats.failureReasons[reason] = (stats.failureReasons[reason] ?? 0)+1;
    throw error;
  }
  finally {
    stats.durationMs += Date.now() - startedAt;
    gate.nextAt = Math.max(gate.nextAt, Date.now() + 2000);
    if (acquired) { const next = active <= maxActive ? waiters.shift() : undefined; if (next) next(); else active--; }
    release();
  }
}
