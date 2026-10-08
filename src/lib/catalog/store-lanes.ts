/** Planificador de lecturas: un carril serial por tienda y un tope global de solicitudes en curso. */
export const STORE_LANE_SKIPPED = Symbol('store-lane-skipped');

type Lane = { tail: Promise<void>; nextAt: number };
export type StoreLaneOptions = {
  concurrency: number;
  spacingMs: number;
  isExempt?: (storeId: string) => boolean;
};

export function createStoreLanes({ concurrency, spacingMs, isExempt = () => false }: StoreLaneOptions) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('REFRESH_INVALID_CONCURRENCY');
  const lanes = new Map<string, Lane>();
  const waiting: Array<() => void> = [];
  let active = 0;
  const acquire = () => {
    if (active < concurrency) { active++; return Promise.resolve(); }
    return new Promise<void>(resolve => waiting.push(resolve));
  };
  const releaseSlot = () => { const next = waiting.shift(); if (next) next(); else active--; };

  /**
   * La espera de turno y de espaciado ocurre fuera del cupo global: una tienda
   * lenta o recién consultada no impide que otras tiendas usen ese cupo.
   */
  async function run<T>(storeId: string, task: () => Promise<T>, shouldSkip: () => boolean = () => false): Promise<T | typeof STORE_LANE_SKIPPED> {
    let lane = lanes.get(storeId);
    if (!lane) { lane = { tail: Promise.resolve(), nextAt: 0 }; lanes.set(storeId, lane); }
    const previous = lane.tail;
    let releaseLane!: () => void;
    lane.tail = new Promise<void>(resolve => { releaseLane = resolve; });
    await previous;
    let requested = false;
    try {
      if (shouldSkip()) return STORE_LANE_SKIPPED;
      const delay = lane.nextAt - Date.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      await acquire();
      try {
        if (shouldSkip()) return STORE_LANE_SKIPPED;
        requested = true;
        return await task();
      } finally {
        releaseSlot();
      }
    } finally {
      if (requested && !isExempt(storeId)) lane.nextAt = Date.now() + spacingMs;
      releaseLane();
    }
  }

  return { run, activeCount: () => active };
}
