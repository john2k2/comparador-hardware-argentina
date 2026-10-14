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

it('revalida por HTTP una caché anterior al lease y comparte esa lectura posterior', async () => {
  vi.useFakeTimers();
  const before = new Date('2026-09-29T12:00:00Z');
  vi.setSystemTime(before);
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json([{ id_producto: 1, precioEspecial: 123 }], { headers: { ETag: '"prices-v1"' } }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }));
  vi.stubGlobal('fetch', fetch);
  const { getCompraGamerCatalog } = await import('./compragamer-catalog');
  const cached = await getCompraGamerCatalog();
  const leasedAt = new Date('2026-09-29T12:01:00Z').valueOf();
  vi.setSystemTime(leasedAt);
  const refreshed = await getCompraGamerCatalog(undefined, { observedAfter: leasedAt });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][1].headers['If-None-Match']).toBe('"prices-v1"');
  expect(cached[0].observedAt).toEqual(before);
  expect(refreshed[0].observedAt).toEqual(new Date(leasedAt));
  vi.setSystemTime(leasedAt + 1000);
  expect(await getCompraGamerCatalog(undefined, { observedAfter: leasedAt })).toBe(refreshed);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(refreshed[0].observedAt).toEqual(new Date(leasedAt));
});

it('comparte la petición en curso y acredita la recepción real a leases concurrentes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  let release!: (response: Response) => void;
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json([{ id_producto: 1 }]))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
  vi.stubGlobal('fetch', fetch);
  const { getCompraGamerCatalog } = await import('./compragamer-catalog');
  await getCompraGamerCatalog();
  const leasedAt = new Date('2026-09-29T12:01:00Z').valueOf();
  vi.setSystemTime(leasedAt);
  const first = getCompraGamerCatalog(undefined, { observedAfter: leasedAt });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  vi.setSystemTime(leasedAt + 1000);
  const second = getCompraGamerCatalog(undefined, { observedAfter: leasedAt + 1000 });
  release(Response.json([{ id_producto: 1, precioEspecial: 456 }]));
  const [a, b] = await Promise.all([first, second]);
  expect(a).toBe(b);
  expect(a[0]).toMatchObject({ precioEspecial: 456, observedAt: new Date(leasedAt + 1000) });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('un error HTTP al revalidar no rejuvenece ni devuelve la caché anterior para el lease', async () => {
  vi.useFakeTimers();
  const before = new Date('2026-09-29T12:00:00Z');
  vi.setSystemTime(before);
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json([{ id_producto: 1, stock: 1 }]))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  vi.stubGlobal('fetch', fetch);
  const { getCompraGamerCatalog } = await import('./compragamer-catalog');
  const cached = await getCompraGamerCatalog();
  const leasedAt = new Date('2026-09-29T12:01:00Z').valueOf();
  vi.setSystemTime(leasedAt);
  await expect(getCompraGamerCatalog(undefined, { observedAfter: leasedAt })).rejects.toMatchObject({ reason: 'not-found', status: 404 });
  expect(await getCompraGamerCatalog()).toBe(cached);
  expect(cached[0].observedAt).toEqual(before);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('rechaza requisitos futuros o inválidos antes de consultar la fuente', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { getCompraGamerCatalog } = await import('./compragamer-catalog');
  for (const observedAfter of [-1, NaN, 0.5, Date.now() + 1]) {
    await expect(getCompraGamerCatalog(undefined, { observedAfter })).rejects.toMatchObject({ reason: 'invalid-response' });
  }
  expect(fetch).not.toHaveBeenCalled();
});
