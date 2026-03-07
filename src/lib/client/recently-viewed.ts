import type { Product } from '@/lib/types';

const RECENTLY_VIEWED_STORAGE_KEY = 'recently-viewed:v1';
const MAX_RECENTLY_VIEWED = 16;

type RecentlyViewedEntry = {
  viewedAt: number;
  product: Product;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function parseEntries(raw: string | null): RecentlyViewedEntry[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is RecentlyViewedEntry => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as RecentlyViewedEntry;
        return typeof candidate.viewedAt === 'number'
          && !!candidate.product
          && typeof candidate.product.id === 'string';
      })
      .slice(0, MAX_RECENTLY_VIEWED);
  } catch {
    return [];
  }
}

function readEntries(): RecentlyViewedEntry[] {
  if (!canUseStorage()) return [];
  return parseEntries(window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY));
}

function writeEntries(entries: RecentlyViewedEntry[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota errors.
  }
}

export function saveRecentlyViewedProduct(product: Product): void {
  if (!canUseStorage()) return;

  const current = readEntries();
  const next: RecentlyViewedEntry[] = [
    {
      product,
      viewedAt: Date.now(),
    },
    ...current.filter((entry) => entry.product.id !== product.id),
  ].slice(0, MAX_RECENTLY_VIEWED);

  writeEntries(next);
}

export function readRecentlyViewedProducts(limit = 4): Product[] {
  return readEntries()
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.product);
}
