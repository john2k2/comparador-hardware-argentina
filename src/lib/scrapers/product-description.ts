import * as cheerio from 'cheerio';
import { withAbortTimeout } from '@/lib/async/with-abort-timeout';

const DESCRIPTION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DESCRIPTION_TIMEOUT_MS = 9000;

const SCRAPE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const DESCRIPTION_SELECTORS = [
  '.woocommerce-product-details__short-description',
  '[itemprop="description"]',
  '.product-short-description',
  '.short-description',
  '#tab-description',
  '#description',
  '.product-description',
  '.descripcion',
  '.descripcion-producto',
  '.detalle-producto .descripcion',
  '.summary p',
  '.product-detail p',
];

const descriptionCache = new Map<string, { expiresAt: number; value: string | null }>();
const inFlightDescriptionByUrl = new Map<string, Promise<string | null>>();

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForComparison(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '');
}

function normalizeUrlKey(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      '_ga',
    ].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return null;
  }
}

function isUsefulDescription(candidate: string, fallbackName?: string): boolean {
  const normalizedCandidate = normalizeForComparison(candidate);
  if (!normalizedCandidate || normalizedCandidate.length < 24) return false;
  if (!fallbackName) return true;
  const normalizedName = normalizeForComparison(fallbackName);
  return normalizedCandidate !== normalizedName;
}

function clampDescription(value: string, maxLength = 700): string {
  const compact = normalizeWhitespace(value);
  if (compact.length <= maxLength) return compact;

  const sliced = compact.slice(0, maxLength);
  const lastPeriod = sliced.lastIndexOf('.');
  if (lastPeriod > 120) {
    return sliced.slice(0, lastPeriod + 1).trim();
  }

  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > 120) {
    return sliced.slice(0, lastSpace).trim();
  }

  return sliced.trim();
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function descriptionFromJsonLdNode(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const candidate = descriptionFromJsonLdNode(item);
      if (candidate) return candidate;
    }
    return null;
  }

  const record = node as Record<string, unknown>;
  const nodeType = String(record['@type'] ?? '').toLowerCase();

  if (record.description && typeof record.description === 'string') {
    if (!nodeType || nodeType.includes('product')) {
      return record.description;
    }
  }

  if (record['@graph']) {
    const graphCandidate = descriptionFromJsonLdNode(record['@graph']);
    if (graphCandidate) return graphCandidate;
  }

  for (const value of Object.values(record)) {
    const candidate = descriptionFromJsonLdNode(value);
    if (candidate) return candidate;
  }

  return null;
}

function extractDescriptionFromHtml(html: string, fallbackName?: string): string | null {
  const $ = cheerio.load(html);

  for (const selector of DESCRIPTION_SELECTORS) {
    const text = normalizeWhitespace($(selector).first().text() || '');
    if (isUsefulDescription(text, fallbackName)) {
      return clampDescription(text);
    }
  }

  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i += 1) {
    const raw = scripts.eq(i).contents().text() || scripts.eq(i).html() || '';
    if (!raw.trim()) continue;
    const parsed = tryParseJson(raw);
    if (!parsed) continue;
    const jsonLdDescription = descriptionFromJsonLdNode(parsed);
    if (jsonLdDescription && isUsefulDescription(jsonLdDescription, fallbackName)) {
      return clampDescription(jsonLdDescription);
    }
  }

  const metaCandidates = [
    $('meta[property="og:description"]').attr('content') || '',
    $('meta[name="description"]').attr('content') || '',
    $('meta[name="twitter:description"]').attr('content') || '',
  ];

  for (const metaText of metaCandidates) {
    const normalized = normalizeWhitespace(metaText);
    if (isUsefulDescription(normalized, fallbackName)) {
      return clampDescription(normalized);
    }
  }

  return null;
}

function pruneExpiredCache(now = Date.now()): void {
  for (const [key, entry] of descriptionCache.entries()) {
    if (entry.expiresAt <= now) {
      descriptionCache.delete(key);
    }
  }
}

export async function fetchProductDescriptionFromUrl(
  rawUrl: string,
  fallbackName?: string,
): Promise<string | null> {
  const key = normalizeUrlKey(rawUrl);
  if (!key) return null;

  const now = Date.now();
  pruneExpiredCache(now);

  const cached = descriptionCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = inFlightDescriptionByUrl.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const res = await withAbortTimeout(
        (signal) => fetch(key, {
          headers: SCRAPE_HEADERS,
          signal,
        }),
        DESCRIPTION_TIMEOUT_MS,
        'description',
      );
      if (!res.ok) {
        descriptionCache.set(key, {
          value: null,
          expiresAt: Date.now() + DESCRIPTION_CACHE_TTL_MS,
        });
        return null;
      }

      const html = await res.text();
      const description = extractDescriptionFromHtml(html, fallbackName);
      descriptionCache.set(key, {
        value: description,
        expiresAt: Date.now() + DESCRIPTION_CACHE_TTL_MS,
      });
      return description;
    } catch {
      descriptionCache.set(key, {
        value: null,
        expiresAt: Date.now() + 2 * 60 * 1000,
      });
      return null;
    } finally {
      inFlightDescriptionByUrl.delete(key);
    }
  })();

  inFlightDescriptionByUrl.set(key, task);
  return task;
}

export function isWeakProductDescription(description: string | undefined, name: string): boolean {
  const normalizedDescription = normalizeWhitespace(description ?? '');
  if (!normalizedDescription) return true;
  if (normalizedDescription.length < 24) return true;
  return normalizeForComparison(normalizedDescription) === normalizeForComparison(name);
}
