// ============================================
// Concurrency — Semáforo para limitar concurrencia
// ============================================
// Permite ejecutar un máximo de N promesas simultáneas,
// evitando sobrecargar el servidor con demasiados requests
// al mismo tiempo.
// ============================================

export async function withConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  if (tasks.length === 0) return [];
  if (limit >= tasks.length) return Promise.all(tasks.map((task) => task()));

  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      if (currentIndex >= tasks.length) return;
      nextIndex += 1;

      const task = tasks[currentIndex];
      results[currentIndex] = await task();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
