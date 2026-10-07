/** Comparte sólo lecturas pendientes dentro de este proceso, sin TTL de resultados. */
export function createCoalescedRead<T>(maxPending = 200) {
  const pending = new Map<string, Promise<T>>();

  return (key: string, read: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    // No expulsar una lectura pendiente para admitir otra clave.
    if (pending.size >= maxPending) return Promise.resolve().then(read);

    const flight = Promise.resolve().then(read).finally(() => {
      if (pending.get(key) === flight) pending.delete(key);
    });
    pending.set(key, flight);
    return flight;
  };
}
