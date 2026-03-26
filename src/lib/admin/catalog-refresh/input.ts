import { NextRequest } from 'next/server';
import type { HardwareCategory } from '@/lib/types';
import {
  ALL_CATEGORIES,
  DEFAULT_MAX_QUERIES,
  DEFAULT_STALE_MINUTES,
  MAX_QUERIES_LIMIT,
  MAX_STALE_MINUTES,
  type RefreshInput,
  type RefreshMode,
} from '@/lib/admin/catalog-refresh/types';

export function isHardwareCategory(value: unknown): value is HardwareCategory {
  return typeof value === 'string' && ALL_CATEGORIES.includes(value as HardwareCategory);
}

export function parseCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseStringArray(value: unknown): string[] {
  if (typeof value === 'string') return parseCsv(value);
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
}

export function parseStores(value: unknown): string[] {
  return parseStringArray(value)
    .map((entry) => entry.toLowerCase())
    .filter(Boolean);
}

export function parseInteger(value: unknown, fallback: number, min: number, max: number): number {
  const raw = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(raw)) return fallback;
  const rounded = Math.floor(raw);
  return Math.min(max, Math.max(min, rounded));
}

export function parseMode(value: unknown): RefreshMode | null {
  if (value === 'cleanup-history' || value === 'custom' || value === 'full' || value === 'hot' || value === 'tracked') {
    return value;
  }
  return null;
}

export function dedupeCategories(values: HardwareCategory[]): HardwareCategory[] {
  const seen = new Set<HardwareCategory>();
  const unique: HardwareCategory[] = [];

  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }

  return unique;
}

export function parseCategories(value: unknown): HardwareCategory[] {
  const candidates = parseStringArray(value);
  return dedupeCategories(candidates.filter(isHardwareCategory));
}

export function parseInputFromSearchParams(request: NextRequest): RefreshInput {
  const searchParams = request.nextUrl.searchParams;
  const modeFromParams = parseMode(searchParams.get('mode'));
  const query = (searchParams.get('query') ?? searchParams.get('q') ?? '').trim();
  const categoryFromParam = searchParams.get('category');

  const categories = dedupeCategories([
    ...parseCategories(searchParams.get('categories')),
    ...(isHardwareCategory(categoryFromParam) ? [categoryFromParam] : []),
  ]);

  const mode = modeFromParams ?? (query || categories.length > 0 ? 'custom' : 'full');

  return {
    mode,
    query: query || undefined,
    categories,
    stores: parseStores(searchParams.get('stores')),
    maxQueries: parseInteger(searchParams.get('maxQueries'), DEFAULT_MAX_QUERIES, 1, MAX_QUERIES_LIMIT),
    staleMinutes: parseInteger(searchParams.get('staleMinutes'), DEFAULT_STALE_MINUTES, 5, MAX_STALE_MINUTES),
  };
}

export async function parseRefreshInput(request: NextRequest): Promise<RefreshInput> {
  const baseInput = parseInputFromSearchParams(request);
  if (request.method !== 'POST') return baseInput;

  const body = await request.json().catch(() => ({}));
  const mode = parseMode(body?.mode) ?? baseInput.mode;
  const bodyQuery = typeof body?.query === 'string' ? body.query.trim() : '';
  const bodyCategory = isHardwareCategory(body?.category) ? [body.category] : [];
  const bodyCategories = parseCategories(body?.categories);
  const bodyStores = parseStores(body?.stores);

  return {
    mode,
    query: bodyQuery || baseInput.query,
    categories: dedupeCategories([
      ...bodyCategory,
      ...bodyCategories,
      ...baseInput.categories,
    ]),
    stores: bodyStores.length > 0 ? bodyStores : baseInput.stores,
    maxQueries: parseInteger(body?.maxQueries, baseInput.maxQueries, 1, MAX_QUERIES_LIMIT),
    staleMinutes: parseInteger(body?.staleMinutes, baseInput.staleMinutes, 5, MAX_STALE_MINUTES),
  };
}
