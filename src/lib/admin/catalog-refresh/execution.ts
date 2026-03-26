import type { NextRequest } from 'next/server';
import {
  INTERNAL_REFRESH_TIMEOUT_MS,
  REFRESH_CONCURRENCY,
  type RefreshSummary,
  type RefreshTarget,
} from '@/lib/admin/catalog-refresh/types';

export async function runInternalRefresh(
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

export async function runTargets(
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
