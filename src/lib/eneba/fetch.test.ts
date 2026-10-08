import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENEBA_REVIEWED_GAMES, ENEBA_PRICE_MAX_AGE_MS, ENEBA_SAMPLE_SIZE } from './pilot';
vi.mock('server-only', () => ({}));
import { ENEBA_MAX_FEED_BYTES, fetchEnebaSnapshot } from './fetch';
const now = new Date('2026-10-09T18:00:00.000Z'), modified = new Date('2026-10-09T17:55:00.000Z');
const fetchMock = vi.fn(), game = ENEBA_REVIEWED_GAMES[0];
const xml = `<rss><channel><item><g:id>${game.id}</g:id><sku>${game.sku}</sku><title>${game.feedTitle}</title>
  <region>${game.region}</region><g:availability>in stock</g:availability><g:price>1000.50 ARS</g:price>
  <g:product_type>Software &gt; Video Game Software</g:product_type>
  <link>https://www.eneba.com/latam/${game.id}?af_id=Comparador_Hardware_Argentina&amp;currency=ARS</link></item></channel></rss>`;
function response(body = xml, headers: Record<string, string> = {}) {
  return new Response(body, { headers: { 'Content-Type': 'text/xml', 'Last-Modified': modified.toUTCString(), ...headers } });
}
describe('descarga acotada del feed oficial', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('descarga una página acotada una sola vez sin redirecciones, paginación ni renovación de fecha', async () => {
    fetchMock.mockResolvedValue(response()); const result = await fetchEnebaSnapshot();
    expect(result).toMatchObject({ status: 'ready', fetchedAt: now.toISOString(), feedUpdatedAt: modified.toISOString() });
    expect(result.offers[0].observedAt).toBe(modified.toISOString()); expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]; expect(new URL(url).searchParams.get('size')).toBe(String(ENEBA_SAMPLE_SIZE));
    expect(options).toMatchObject({ redirect: 'manual', cache: 'no-store' });
  });
  it.each([
    ['redirección', () => new Response(null, { status: 302, headers: { Location: 'https://example.com/' } })],
    ['bloqueo 403', () => new Response('private body', { status: 403 })],
    ['HTTP 503', () => new Response('unavailable', { status: 503 })],
    ['HTML', () => response('<html>error</html>', { 'Content-Type': 'text/html' })],
    ['XML truncado', () => response('<rss><channel>')],
    ['sin fecha', () => response(xml, { 'Last-Modified': '' })],
    ['fecha vieja', () => response(xml, { 'Last-Modified': new Date(now.getTime() - ENEBA_PRICE_MAX_AGE_MS).toUTCString() })],
    ['fecha futura', () => response(xml, { 'Last-Modified': new Date(now.getTime() + 1000).toUTCString() })],
    ['tamaño declarado excesivo', () => response(xml, { 'Content-Length': String(ENEBA_MAX_FEED_BYTES + 1) })],
    ['stream excesivo', () => response(' '.repeat(ENEBA_MAX_FEED_BYTES + 1))],
  ])('rechaza %s sin reintentos ni datos fabricados', async (_, makeResponse) => {
    fetchMock.mockResolvedValue(makeResponse());
    expect(await fetchEnebaSnapshot()).toMatchObject({ status: 'error', offers: [], feedUpdatedAt: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('no reintenta una falla de red', async () => {
    fetchMock.mockRejectedValue(new DOMException('Timeout', 'TimeoutError'));
    expect(await fetchEnebaSnapshot()).toMatchObject({ status: 'error', offers: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
