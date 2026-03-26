type StoreLike = {
  id: string;
};

export function selectStoresByIds<T extends StoreLike>(
  stores: T[],
  storeIds?: Iterable<string>,
): T[] {
  if (!storeIds) return stores;

  const selected = new Set<string>();
  for (const id of storeIds) {
    const normalized = String(id ?? '').trim().toLowerCase();
    if (normalized) selected.add(normalized);
  }

  if (selected.size === 0) return stores;
  return stores.filter((store) => selected.has(store.id.toLowerCase()));
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = [];
  let currentIndex = 0;

  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const index = currentIndex;
      currentIndex += 1;
      if (index >= items.length) break;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}
