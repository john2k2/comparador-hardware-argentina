import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { HardwareCategory } from '@/lib/types';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import { cleanupPriceHistory } from '@/lib/persistence/price-history-maintenance';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';

export const dynamic = 'force-dynamic';

const ALL_CATEGORIES: HardwareCategory[] = [
  'procesadores',
  'tarjetas-graficas',
  'motherboards',
  'memoria-ram',
  'almacenamiento',
  'fuentes-alimentacion',
  'gabinetes',
  'refrigeracion',
  'perifericos',
];

const REFRESH_CONCURRENCY = 2;
const DEFAULT_MAX_QUERIES = 40;
const DEFAULT_STALE_MINUTES = 180;
const MAX_QUERIES_LIMIT = 200;
const MAX_STALE_MINUTES = 60 * 24 * 7;
const INTERNAL_REFRESH_TIMEOUT_MS = 90_000;

type RefreshMode = 'cleanup-history' | 'custom' | 'full' | 'hot' | 'tracked';
type AccessMode = 'admin' | 'cron';

type RefreshInput = {
  mode: RefreshMode;
  query?: string;
  categories: HardwareCategory[];
  stores: string[];
  maxQueries: number;
  staleMinutes: number;
};

type RefreshTarget = {
  kind: 'category' | 'query';
  value: string;
  category?: HardwareCategory;
};

type RefreshSummary = {
  target: string;
  kind: 'category' | 'query';
  status: number;
  productCount: number;
  ok: boolean;
  error?: string;
};

type RefreshPlan = {
  source: string;
  targets: RefreshTarget[];
  fallbackApplied: boolean;
  fallbackReason: string | null;
};

function isHardwareCategory(value: unknown): value is HardwareCategory {
  return typeof value === 'string' && ALL_CATEGORIES.includes(value as HardwareCategory);
}

function parseCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseStringArray(value: unknown): string[] {
  if (typeof value === 'string') return parseCsv(value);
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
}

function parseStores(value: unknown): string[] {
  return parseStringArray(value)
    .map((entry) => entry.toLowerCase())
    .filter(Boolean);
}

function parseInteger(value: unknown, fallback: number, min: number, max: number): number {
  const raw = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(raw)) return fallback;
  const rounded = Math.floor(raw);
  return Math.min(max, Math.max(min, rounded));
}

function parseMode(value: unknown): RefreshMode | null {
  if (value === 'cleanup-history' || value === 'custom' || value === 'full' || value === 'hot' || value === 'tracked') {
    return value;
  }
  return null;
}

function dedupeCategories(values: HardwareCategory[]): HardwareCategory[] {
  const seen = new Set<HardwareCategory>();
  const unique: HardwareCategory[] = [];

  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }

  return unique;
}

function parseCategories(value: unknown): HardwareCategory[] {
  const candidates = parseStringArray(value);
  return dedupeCategories(candidates.filter(isHardwareCategory));
}

function parseInputFromSearchParams(request: NextRequest): RefreshInput {
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
    staleMinutes: parseInteger(
      searchParams.get('staleMinutes'),
      DEFAULT_STALE_MINUTES,
      5,
      MAX_STALE_MINUTES,
    ),
  };
}

async function parseRefreshInput(request: NextRequest): Promise<RefreshInput> {
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

function dedupeTargets(targets: RefreshTarget[]): RefreshTarget[] {
  const seen = new Set<string>();
  const unique: RefreshTarget[] = [];

  for (const target of targets) {
    const key = target.kind === 'category'
      ? `category:${target.value}`
      : `query:${target.category ?? ''}:${target.value.toLowerCase()}`;

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(target);
  }

  return unique;
}

function toCategoryTargets(categories: HardwareCategory[]): RefreshTarget[] {
  const selected = categories.length > 0 ? categories : ALL_CATEGORIES;
  return selected.map((category) => ({
    kind: 'category',
    value: category,
    category,
  }));
}

function toSafeQuery(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function toQueryTarget(product: { name: string; category: string | null }): RefreshTarget | null {
  const query = toSafeQuery(product.name);
  if (!query) return null;
  const category = isHardwareCategory(product.category) ? product.category : undefined;

  return {
    kind: 'query',
    value: query,
    category,
  };
}

async function loadTrackedTargets(maxQueries: number): Promise<RefreshTarget[]> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return [];

  const [favoritesResult, alertsResult] = await Promise.all([
    supabase
      .from('user_favorites')
      .select('product_id')
      .limit(Math.max(maxQueries * 4, 100)),
    supabase
      .from('price_alerts')
      .select('product_id')
      .eq('is_active', true)
      .limit(Math.max(maxQueries * 4, 100)),
  ]);

  const trackedIds = new Set<string>();

  for (const row of favoritesResult.data ?? []) {
    const id = String(row.product_id ?? '').trim();
    if (id) trackedIds.add(id);
  }

  for (const row of alertsResult.data ?? []) {
    const id = String(row.product_id ?? '').trim();
    if (id) trackedIds.add(id);
  }

  if (trackedIds.size === 0) return [];

  const ids = Array.from(trackedIds).slice(0, Math.max(maxQueries * 2, 50));
  const { data: products, error } = await supabase
    .from('products')
    .select('id,name,category')
    .in('id', ids)
    .limit(Math.max(maxQueries * 2, 50));

  if (error || !products) {
    console.warn('[Catalog Refresh] Error cargando tracked targets:', error?.message ?? 'unknown');
    return [];
  }

  const targets = products
    .map((row) => toQueryTarget({
      name: String(row.name ?? ''),
      category: typeof row.category === 'string' ? row.category : null,
    }))
    .filter((target): target is RefreshTarget => Boolean(target))
    .slice(0, maxQueries);

  return dedupeTargets(targets);
}

async function loadHotTargets(maxQueries: number, staleMinutes: number): Promise<RefreshTarget[]> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return [];

  const staleCutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from('products')
    .select('id,name,category,last_scraped_at,refresh_priority')
    .in('refresh_priority', ['hot', 'tracked'])
    .lt('last_scraped_at', staleCutoff)
    .order('last_scraped_at', { ascending: true })
    .limit(Math.max(maxQueries * 2, 50));

  if (error || !data) {
    console.warn('[Catalog Refresh] Error cargando hot targets:', error?.message ?? 'unknown');
    return [];
  }

  const targets = data
    .map((row) => toQueryTarget({
      name: String(row.name ?? ''),
      category: typeof row.category === 'string' ? row.category : null,
    }))
    .filter((target): target is RefreshTarget => Boolean(target))
    .slice(0, maxQueries);

  return dedupeTargets(targets);
}

async function buildRefreshPlan(input: RefreshInput): Promise<RefreshPlan> {
  if (input.mode === 'cleanup-history') {
    return {
      source: 'cleanup-history',
      targets: [],
      fallbackApplied: false,
      fallbackReason: null,
    };
  }

  if (input.mode === 'full') {
    return {
      source: 'full-categories',
      targets: toCategoryTargets(input.categories),
      fallbackApplied: false,
      fallbackReason: null,
    };
  }

  if (input.mode === 'custom') {
    if (input.query) {
      return {
        source: 'custom-query',
        targets: dedupeTargets([{
          kind: 'query',
          value: input.query,
          category: input.categories[0],
        }]),
        fallbackApplied: false,
        fallbackReason: null,
      };
    }

    return {
      source: 'custom-categories',
      targets: toCategoryTargets(input.categories),
      fallbackApplied: false,
      fallbackReason: null,
    };
  }

  if (input.mode === 'tracked') {
    const trackedTargets = await loadTrackedTargets(input.maxQueries);
    if (trackedTargets.length > 0) {
      return {
        source: 'tracked-db',
        targets: trackedTargets,
        fallbackApplied: false,
        fallbackReason: null,
      };
    }

    return {
      source: 'tracked-fallback-categories',
      targets: toCategoryTargets(input.categories),
      fallbackApplied: true,
      fallbackReason: 'tracked_targets_empty_or_unavailable',
    };
  }

  const hotTargets = await loadHotTargets(input.maxQueries, input.staleMinutes);
  if (hotTargets.length > 0) {
    return {
      source: 'hot-db',
      targets: hotTargets,
      fallbackApplied: false,
      fallbackReason: null,
    };
  }

  return {
    source: 'hot-fallback-categories',
    targets: toCategoryTargets(input.categories),
    fallbackApplied: true,
    fallbackReason: 'hot_targets_empty_or_unavailable',
  };
}

function isValidCronRequest(request: NextRequest): boolean {
  const cronSecret = (
    process.env.CATALOG_REFRESH_CRON_SECRET
    || process.env.CRON_SECRET
    || ''
  ).trim();

  if (!cronSecret) return false;

  const authorization = request.headers.get('authorization') ?? '';
  if (authorization === `Bearer ${cronSecret}`) return true;

  const headerSecret = request.headers.get('x-cron-secret')?.trim() ?? '';
  return headerSecret === cronSecret;
}

async function ensureAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const tokenFromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const cookieStore = await cookies();
  const tokenFromCookie = cookieStore.get('sb-access-token')?.value ?? null;
  return resolveAdminAccessFromToken(tokenFromHeader || tokenFromCookie);
}

async function ensureAccess(request: NextRequest): Promise<AccessMode | null> {
  if (isValidCronRequest(request)) return 'cron';
  const admin = await ensureAdmin(request);
  return admin ? 'admin' : null;
}

async function runInternalRefresh(
  request: NextRequest,
  target: RefreshTarget,
  stores: string[],
): Promise<RefreshSummary> {
  const isCategoryRefresh = target.kind === 'category';
  const path = isCategoryRefresh ? '/api/products' : '/api/search';
  const searchParams = new URLSearchParams();
  searchParams.set('bypassDb', '1');
  searchParams.set('refresh', '1');

  if (stores.length > 0) {
    searchParams.set('stores', stores.join(','));
  }

  if (isCategoryRefresh) {
    searchParams.set('category', target.category ?? target.value);
  } else {
    searchParams.set('q', target.value);
    if (target.category) {
      searchParams.set('category', target.category);
    }
  }

  const url = new URL(path, request.nextUrl.origin);
  url.search = searchParams.toString();

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), INTERNAL_REFRESH_TIMEOUT_MS);

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'x-internal-refresh': '1',
    },
    signal: timeoutController.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  const payload = await response.json().catch(() => ({}));
  const products = Array.isArray(payload?.products) ? payload.products : [];
  const targetLabel = searchParams.get('category') || searchParams.get('q') || path;

  return {
    target: targetLabel,
    kind: target.kind,
    status: response.status,
    productCount: products.length,
    ok: response.ok,
    error: response.ok
      ? undefined
      : (typeof payload?.error === 'string' ? payload.error : `HTTP_${response.status}`),
  };
}

async function runTargets(
  request: NextRequest,
  targets: RefreshTarget[],
  stores: string[],
): Promise<RefreshSummary[]> {
  if (targets.length === 0) return [];

  const workers = Math.min(REFRESH_CONCURRENCY, targets.length);
  const queue = [...targets];
  const results: RefreshSummary[] = [];

  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (queue.length > 0) {
        const target = queue.shift();
        if (!target) return;
        try {
          results.push(await runInternalRefresh(request, target, stores));
        } catch (error) {
          results.push({
            target: target.value,
            kind: target.kind,
            status: 500,
            productCount: 0,
            ok: false,
            error: error instanceof Error ? error.message : 'UNKNOWN_REFRESH_ERROR',
          });
        }
      }
    }),
  );

  return results;
}

async function handleRefresh(request: NextRequest) {
  const access = await ensureAccess(request);
  if (!access) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const input = await parseRefreshInput(request);
    if (input.mode === 'cleanup-history') {
      const cleanup = await cleanupPriceHistory();

      return NextResponse.json({
        refreshedAt: new Date().toISOString(),
        requestedBy: access,
        mode: input.mode,
        source: 'price-history-retention',
        cleanup,
      });
    }

    const plan = await buildRefreshPlan(input);
    const targets = plan.targets.slice(0, input.maxQueries);
    const results = await runTargets(request, targets, input.stores);

    return NextResponse.json({
      refreshedAt: new Date().toISOString(),
      requestedBy: access,
      mode: input.mode,
      source: plan.source,
      fallbackApplied: plan.fallbackApplied,
      fallbackReason: plan.fallbackReason,
      totalTargets: results.length,
      okTargets: results.filter((item) => item.ok).length,
      failedTargets: results.filter((item) => !item.ok).length,
      input: {
        query: input.query ?? null,
        categories: input.categories,
        stores: input.stores,
        maxQueries: input.maxQueries,
        staleMinutes: input.staleMinutes,
      },
      results,
    });
  } catch (error) {
    console.error('Admin catalog refresh API error:', error);
    return NextResponse.json(
      { error: 'Error al refrescar el catalogo' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleRefresh(request);
}

export async function POST(request: NextRequest) {
  return handleRefresh(request);
}

export async function OPTIONS() {
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        Allow: 'GET,POST,OPTIONS',
      },
    },
  );
}
