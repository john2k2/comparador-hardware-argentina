import type { Product } from '@/lib/types';

const SNAPSHOT_TTL_MS = 30 * 60 * 1000;

const snapshotById = new Map<string, { expiresAt: number; product: Product }>();

function normalizeId(value: string): string {
  let decoded = value.trim();
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded
    .toLowerCase()
    .replace(/%2e/gi, '.')
    .replace(/\+/g, '-')
    .replace(/_/g, '-')
    .replace(/\./g, '-')
    .replace(/\/+$/g, '')
    .replace(/-+/g, '-')
    .trim();
}

function extractPrefixAndCode(id: string): { prefix: string; code?: string } {
  const normalized = normalizeId(id);
  const parts = normalized.split('-').filter(Boolean);
  const prefix = parts[0] ?? '';
  const second = parts[1];
  return {
    prefix,
    code: second && /^\d+$/.test(second) ? second : undefined,
  };
}

function pruneExpired(now = Date.now()) {
  for (const [key, cached] of snapshotById.entries()) {
    if (cached.expiresAt <= now) {
      snapshotById.delete(key);
    }
  }
}

export function snapshotProducts(products: Product[]) {
  if (products.length === 0) return;

  const now = Date.now();
  pruneExpired(now);

  for (const product of products) {
    snapshotById.set(normalizeId(product.id), {
      product,
      expiresAt: now + SNAPSHOT_TTL_MS,
    });
  }
}

export function getSnapshotProductById(id: string): Product | null {
  const now = Date.now();
  pruneExpired(now);

  const normalizedId = normalizeId(id);
  const exact = snapshotById.get(normalizedId);
  if (exact && exact.expiresAt > now) {
    return exact.product;
  }

  const target = extractPrefixAndCode(normalizedId);
  for (const cached of snapshotById.values()) {
    if (cached.expiresAt <= now) continue;
    const current = extractPrefixAndCode(cached.product.id);

    if (target.prefix && target.prefix === current.prefix) {
      if (target.code && current.code && target.code === current.code) {
        return cached.product;
      }
      if (!target.code && normalizeId(cached.product.id).includes(normalizedId)) {
        return cached.product;
      }
    }
  }

  return null;
}
