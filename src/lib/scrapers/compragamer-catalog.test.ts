import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

it('reutiliza la hora real hasta expirar la caché, y consulta nuevamente después', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  const fetch = vi.fn().mockImplementation(async () => Response.json([{ id_producto: 1 }]));
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

it('valida el JSON de precios con ETag sin volver a descargarlo', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json([{ id_producto: 1, precioEspecial: 123, stock: 1 }], { headers: { ETag: '"catalog-v1"' } }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }));
  vi.stubGlobal('fetch', fetch);
  const { getCompraGamerCatalog } = await import('./compragamer-catalog');
  await getCompraGamerCatalog();
  vi.setSystemTime(new Date('2026-09-29T12:06:00Z'));
  const items = await getCompraGamerCatalog();
  expect(fetch.mock.calls[1][1].headers['If-None-Match']).toBe('"catalog-v1"');
  expect(items[0]).toMatchObject({ precioEspecial: 123, stock: 1, observedAt: new Date('2026-09-29T12:06:00Z') });
});
