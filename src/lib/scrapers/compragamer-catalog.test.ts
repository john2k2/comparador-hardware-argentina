import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

it('reutiliza la hora real hasta expirar la caché, y consulta nuevamente después', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id_producto: 1 }] });
  vi.stubGlobal('fetch', fetch);
  const { getCompraGamerCatalog } = await import('./compragamer-catalog');
  const first = await getCompraGamerCatalog();
  vi.setSystemTime(new Date('2026-09-29T12:04:00Z'));
  expect((await getCompraGamerCatalog())[0].observedAt).toEqual(first[0].observedAt);
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date('2026-09-29T12:06:00Z'));
  expect((await getCompraGamerCatalog())[0].observedAt).toEqual(new Date('2026-09-29T12:06:00Z'));
  expect(fetch).toHaveBeenCalledTimes(2);
});
