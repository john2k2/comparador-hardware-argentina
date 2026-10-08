import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function flushMicrotasks() {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}

async function loadSourceHttp() {
  vi.resetModules();
  return import('./source-http');
}

describe('source-http', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('limits concurrent source requests to three globally', async () => {
    const { sourceFetch } = await loadSourceHttp();
    const pending = [deferred<Response>(), deferred<Response>(), deferred<Response>()];
    let started = 0;
    const fetchMock = vi.fn(() => {
      const index = started++;
      return index < pending.length ? pending[index].promise : Promise.resolve(new Response(`body-${index}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const requests = ['store-a', 'store-b', 'store-c', 'store-d'].map((store) => sourceFetch(store, `https://${store}.example/item`));
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    pending[0].resolve(new Response('body-0'));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    pending[1].resolve(new Response('body-1'));
    pending[2].resolve(new Response('body-2'));
    await Promise.all(requests);
  });

  it('admite ampliar el tope global y despierta solicitudes en espera', async () => {
    const { sourceFetch, setSourceFetchConcurrency } = await loadSourceHttp();
    const pending = Array.from({ length: 5 }, () => deferred<Response>());
    let started = 0;
    const fetchMock = vi.fn(() => pending[started++].promise);
    vi.stubGlobal('fetch', fetchMock);

    const requests = ['a', 'b', 'c', 'd', 'e'].map((store) => sourceFetch(store, `https://${store}.example/item`));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(setSourceFetchConcurrency(5)).toBe(3);
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    pending.forEach((item, index) => item.resolve(new Response(`body-${index}`)));
    await Promise.all(requests);
    expect(() => setSourceFetchConcurrency(0)).toThrow('SOURCE_INVALID_CONCURRENCY');
  });

  it('informa hasta cuándo una tienda queda pausada tras 429', async () => {
    const { sourceFetch, sourceBlockedUntil } = await loadSourceHttp();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '10' } })));
    expect(sourceBlockedUntil('paused-store')).toBe(0);
    await expect(sourceFetch('paused-store', 'https://paused-store.example/item')).rejects.toMatchObject({ reason: 'rate-limited' });
    expect(sourceBlockedUntil('paused-store') - Date.now()).toBe(10_000);
  });

  it('serializes requests for one store and waits two seconds between them', async () => {
    const { sourceFetch } = await loadSourceHttp();
    const fetchMock = vi.fn().mockImplementation(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    const first = sourceFetch('same-store', 'https://same-store.example/one');
    const second = sourceFetch('same-store', 'https://same-store.example/two');
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await Promise.all([first, second]);
  });

  it('pauses a store after 429 Retry-After without making a second request', async () => {
    const { sourceFetch, sourceHttpMetrics } = await loadSourceHttp();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 429,
      headers: { 'Retry-After': '10' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sourceFetch('limited-store', 'https://limited-store.example/item')).rejects.toMatchObject({ reason: 'rate-limited', status: 429 });
    await expect(sourceFetch('limited-store', 'https://limited-store.example/item')).rejects.toMatchObject({ reason: 'rate-limited' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sourceHttpMetrics()['limited-store']).toMatchObject({ requests: 1, backoffSkips: 1, failures: 2 });
  });

  it('rejects a response whose body exceeds the configured limit', async () => {
    const { sourceFetch, sourceHttpMetrics, SourceHttpError } = await loadSourceHttp();
    const fetchMock = vi.fn().mockResolvedValue(new Response('12345'));
    vi.stubGlobal('fetch', fetchMock);

    const error = await sourceFetch('large-store', 'https://large-store.example/item', {}, 4).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SourceHttpError);
    expect(error).toMatchObject({ reason: 'too-large' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sourceHttpMetrics()['large-store']).toMatchObject({ requests: 1, bytes: 5, failures: 1 });
  });

  it('returns 304 without consuming a body and records a conditional hit', async () => {
    const { sourceFetch, sourceHttpMetrics } = await loadSourceHttp();
    const response = new Response(null, { status: 304, headers: { ETag: '"item-v1"' } });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await sourceFetch('conditional-store', 'https://conditional-store.example/item');

    expect(result).toBe(response);
    expect(result.status).toBe(304);
    expect(result.body).toBeNull();
    expect(sourceHttpMetrics()['conditional-store']).toMatchObject({ requests: 1, bytes: 0, conditionalHits: 1, failures: 0 });
  });

  it('follows same-host redirects manually for at most three hops', async () => {
    const { sourceFetch } = await loadSourceHttp();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/second' } }))
      .mockResolvedValueOnce(new Response(null, { status: 303, headers: { location: '/third' } }))
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: '/fourth' } }))
      .mockResolvedValueOnce(new Response('final body'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sourceFetch('redirect-store', 'https://redirect-store.example/first', {}, 8_000_000, ['redirect-store.example']);

    expect(await result.text()).toBe('final body');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.every(([, options]) => options?.redirect === 'manual')).toBe(true);
  });

  it.each([
    ['offhost', 'https://other.example/next'],
    ['http', 'http://trusted.example/next'],
    ['credentials', 'https://user:password@trusted.example/next'],
    ['port', 'https://trusted.example:8443/next'],
  ])('rejects %s redirects without a second fetch', async (label, location) => {
    const { sourceFetch } = await loadSourceHttp();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sourceFetch(`redirect-${label}`, 'https://trusted.example/first', {}, 8_000_000, ['trusted.example']))
      .rejects.toMatchObject({ reason: 'invalid-response' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mantiene redirect:error cuando no se habilita la lista de hosts confiables', async () => {
    const { sourceFetch } = await loadSourceHttp();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: '/next' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sourceFetch('legacy-redirect-store', 'https://legacy-redirect-store.example/first'))
      .rejects.toMatchObject({ reason: 'http-error', status: 302 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });

  it('parses Retry-After as seconds or an HTTP date', async () => {
    const { retryAfterMs } = await loadSourceHttp();
    const now = Date.parse('2026-09-29T12:00:00.000Z');
    const future = new Date(now + 90_000).toUTCString();

    expect(retryAfterMs('3', now)).toBe(3_000);
    expect(retryAfterMs(future, now)).toBe(90_000);
    expect(retryAfterMs(new Date(now - 1_000).toUTCString(), now)).toBe(1_000);
  });
});
