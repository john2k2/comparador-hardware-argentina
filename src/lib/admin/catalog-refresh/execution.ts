import type { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import {
  INTERNAL_REFRESH_MAX_ATTEMPTS,
  INTERNAL_REFRESH_TIMEOUT_MS,
  REFRESH_CONCURRENCY,
  type RefreshSummary,
  type RefreshTarget,
} from '@/lib/admin/catalog-refresh/types';

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));
}

function shouldRetryStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function shouldRetryError(error: unknown): boolean {
  return isAbortError(error) || error instanceof TypeError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
  const targetLabel = searchParams.get('category') || searchParams.get('q') || path;

  let lastError: unknown = null;
  let lastStatus = 500;
  let lastProductCount = 0;

  for (let attempt = 1; attempt <= INTERNAL_REFRESH_MAX_ATTEMPTS; attempt += 1) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), INTERNAL_REFRESH_TIMEOUT_MS);

    try {
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
      const responseProducts = Array.isArray(payload?.products) ? payload.products : [];
      lastStatus = response.status;
      lastProductCount = responseProducts.length;

      if (response.ok || attempt >= INTERNAL_REFRESH_MAX_ATTEMPTS || !shouldRetryStatus(response.status)) {
        return {
          target: targetLabel,
          kind: target.kind,
          status: response.status,
          productCount: responseProducts.length,
          ok: response.ok,
          error: response.ok
            ? undefined
            : (typeof payload?.error === 'string' ? payload.error : `HTTP_${response.status}`),
        };
      }

      logger.warn('Catalog refresh target retry scheduled after HTTP error', {
        endpoint: '/api/admin/catalog-refresh',
        target: targetLabel,
        kind: target.kind,
        attempt,
        status: response.status,
      });
      await sleep(250 * attempt);
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      lastStatus = isAbortError(error) ? 504 : 500;

      if (attempt >= INTERNAL_REFRESH_MAX_ATTEMPTS || !shouldRetryError(error)) {
        break;
      }

      logger.warn('Catalog refresh target retry scheduled after fetch failure', {
        endpoint: '/api/admin/catalog-refresh',
        target: targetLabel,
        kind: target.kind,
        attempt,
        error,
      });
      await sleep(250 * attempt);
    }
  }

  return {
    target: targetLabel,
    kind: target.kind,
    status: lastStatus,
    productCount: lastProductCount,
    ok: false,
    error: isAbortError(lastError)
      ? `TIMEOUT_${INTERNAL_REFRESH_TIMEOUT_MS}MS`
      : lastError instanceof Error
        ? lastError.message
        : 'UNKNOWN_REFRESH_ERROR',
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
          logger.error('Catalog refresh target execution failed', {
            endpoint: '/api/admin/catalog-refresh',
            target: target.value,
            kind: target.kind,
            error,
          });
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
