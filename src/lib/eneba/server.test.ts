import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENEBA_REVIEWED_GAMES, ENEBA_PRICE_MAX_AGE_MS } from './pilot';

const cache = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache: cache.get, setSharedCache: cache.set }));

const now = new Date('2026-10-02T18:00:00.000Z');
const modified = new Date('2026-10-02T17:55:00.000Z');
const fetchMock = vi.fn();
const game = ENEBA_REVIEWED_GAMES[0];
const xml = `<rss><channel><item><g:id>${game.id}</g:id><sku>${game.sku}</sku><title>${game.feedTitle}</title>
  <region>${game.region}</region><g:availability>in stock</g:availability><g:price>1000.50 ARS</g:price>
  <g:product_type>Software &gt; Video Game Software</g:product_type>
  <link>https://www.eneba.com/latam/${game.id}?af_id=Comparador_Hardware_Argentina&amp;currency=ARS</link></item></channel></rss>`;

function response(body = xml, headers: Record<string, string> = {}) {
  return new Response(body, { headers: { 'Content-Type': 'text/xml', 'Last-Modified': modified.toUTCString(), ...headers } });
}

describe('muestra Eneba en servidor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv('ENEBA_AFFILIATE_PILOT_ENABLED', '1');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    cache.get.mockReset().mockResolvedValue(undefined);
    cache.set.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('desactivado responde 404 sin leer caché ni feed', async () => {
    vi.stubEnv('ENEBA_AFFILIATE_PILOT_ENABLED', '0');
    const { handleEnebaGamesGet } = await import('./server');
    const result = await handleEnebaGamesGet();
    expect(result.status).toBe(404);
    expect((await result.json()).status).toBe('disabled');
    expect(cache.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('conserva la fecha del origen y reúne lecturas simultáneas en una sola consulta', async () => {
    fetchMock.mockResolvedValue(response());
    const { getEnebaSnapshot } = await import('./server');
    const snapshots = await Promise.all(Array.from({ length: 4 }, () => getEnebaSnapshot()));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.get).toHaveBeenCalledTimes(1);
    expect(snapshots[0]).toMatchObject({ status: 'ready', fetchedAt: now.toISOString(), feedUpdatedAt: modified.toISOString() });
    expect(snapshots[0].offers[0].observedAt).toBe(modified.toISOString());
    expect(cache.set).toHaveBeenCalledWith('eneba-affiliate-pilot', expect.any(String), snapshots[0], ENEBA_PRICE_MAX_AGE_MS - (now.getTime() - modified.getTime()));
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(url).searchParams.get('size')).toBe('6');
    expect(options).toMatchObject({ redirect: 'error', cache: 'no-store' });
  });

  it('una caché vencida no entrega precios ni cambia la fecha ni dispara un refresh forzado', async () => {
    const { getEnebaSnapshot, handleEnebaGamesGet } = await import('./server');
    fetchMock.mockResolvedValue(response());
    const snapshot = await getEnebaSnapshot();
    cache.get.mockResolvedValue(snapshot);
    vi.setSystemTime(new Date(modified.getTime() + ENEBA_PRICE_MAX_AGE_MS));
    const result = await handleEnebaGamesGet();
    expect(await result.json()).toMatchObject({ status: 'empty', offers: [], feedUpdatedAt: modified.toISOString() });
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['HTTP 503', () => new Response('unavailable', { status: 503 })],
    ['HTML', () => response('<html>error</html>', { 'Content-Type': 'text/html' })],
    ['XML truncado', () => response('<rss><channel>')],
    ['sin fecha verificable', () => response(xml, { 'Last-Modified': '' })],
    ['fecha vieja', () => response(xml, { 'Last-Modified': new Date(now.getTime() - ENEBA_PRICE_MAX_AGE_MS).toUTCString() })],
    ['fecha futura', () => response(xml, { 'Last-Modified': new Date(now.getTime() + 1000).toUTCString() })],
    ['tamaño declarado excesivo', () => response(xml, { 'Content-Length': '300000' })],
    ['stream excesivo', () => response(' '.repeat(300000))],
  ])('oculta precios ante %s y limita reintentos con la caché de error', async (_, makeResponse) => {
    fetchMock.mockResolvedValue(makeResponse());
    const { getEnebaSnapshot } = await import('./server');
    const snapshot = await getEnebaSnapshot();
    expect(snapshot).toMatchObject({ status: 'error', offers: [], feedUpdatedAt: null });
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), snapshot, 60 * 60 * 1000);
    cache.get.mockResolvedValue(snapshot);
    await getEnebaSnapshot();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('una falla de red no vuelve a consultar ni fabrica precios', async () => {
    fetchMock.mockRejectedValue(new DOMException('Timeout', 'TimeoutError'));
    const { getEnebaSnapshot } = await import('./server');
    expect(await getEnebaSnapshot()).toMatchObject({ status: 'error', offers: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
