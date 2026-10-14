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

  it('conserva códigos repetidos por respuesta HTTP sin cambiar intentos ni errores', async () => {
    const { sourceFetch, sourceHttpMetrics } = await loadSourceHttp();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(null, { status: 400 })));
    await expect(sourceFetch('mexx', 'https://store.example/first')).rejects.toMatchObject({ reason: 'http-error', status: 400 });
    const second = expect(sourceFetch('mexx', 'https://store.example/second')).rejects.toMatchObject({ reason: 'http-error', status: 400 });
    await vi.advanceTimersByTimeAsync(2000);
    await second;
    expect(sourceHttpMetrics().mexx).toMatchObject({ requests: 2, failures: 2, failureReasons: { 'http-error': 2 }, httpStatusCounts: { '400': 2 } });
  });

  it.each([100, 199, 200, 304, 401, 403, 404, 410, 418, 429, 500, 503, 599])('registra sólo el código HTTP entero válido %s de la respuesta', async status => {
    const { sourceFetch, sourceHttpMetrics } = await loadSourceHttp();
    // Informativos: doble sintético para ejercer el contrato100–599; fetch normalmente entrega la respuesta final.
    const response = new Response(null, { status: status < 200 ? 400 : status });
    if (status < 200) Object.defineProperty(response, 'status', { value: status });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await sourceFetch('codes', 'https://store.example/item').catch(() => undefined);
    expect(sourceHttpMetrics().codes).toMatchObject({ requests: 1, httpStatusCounts: { [status]: 1 } });
  });

  it.each([0, 99, 600, NaN, Infinity, 200.5, '500', null, undefined, 'PRIVATE_HTTP_VALUE'])('omite status malformado %s sin copiar su valor', async status => {
    const { sourceFetch, sourceHttpMetrics } = await loadSourceHttp();
    const response = new Response(null, { status: 400 });
    Object.defineProperty(response, 'status', { value: status });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await sourceFetch('invalid', 'https://store.example/item').catch(() => undefined);
    expect(sourceHttpMetrics().invalid).toMatchObject({ requests: 1, failures: 1, httpStatusCounts: {} });
    expect(JSON.stringify(sourceHttpMetrics())).not.toContain('PRIVATE_HTTP_VALUE');
  });

  it('cuenta redirects y 304 separados por tienda sin duplicar backoff skips', async () => {
    const { sourceFetch, sourceHttpMetrics } = await loadSourceHttp();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/final' } }))
      .mockResolvedValueOnce(new Response('ok')).mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '10' } }));
    vi.stubGlobal('fetch', fetchMock);
    await sourceFetch('redirects', 'https://store.example/start', {}, 100, ['store.example']);
    await sourceFetch('conditional', 'https://store.example/item');
    await expect(sourceFetch('paused', 'https://store.example/item')).rejects.toMatchObject({ reason: 'rate-limited' });
    await expect(sourceFetch('paused', 'https://store.example/item')).rejects.toMatchObject({ reason: 'rate-limited' });
    expect(sourceHttpMetrics().redirects).toMatchObject({ requests: 2, failures: 0, httpStatusCounts: { '302': 1, '200': 1 } });
    expect(sourceHttpMetrics().conditional).toMatchObject({ requests: 1, conditionalHits: 1, failures: 0, httpStatusCounts: { '304': 1 } });
    expect(sourceHttpMetrics().paused).toMatchObject({ requests: 1, failures: 2, backoffSkips: 1, httpStatusCounts: { '429': 1 } });
  });

  it.each(['TypeError', 'TimeoutError', 'AbortError'])('un %s de transporte no fabrica código desde el mensaje o status del error', async name => {
    const { sourceFetch, sourceHttpMetrics } = await loadSourceHttp();
    const error = Object.assign(new Error('PRIVATE_ERROR HTTP 500'), { name, status: 500 });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    await expect(sourceFetch('transport', 'https://store.example/item')).rejects.toBe(error);
    expect(sourceHttpMetrics().transport).toMatchObject({ requests: 1, failures: 1, failureReasons: { [name === 'TypeError' ? 'network' : 'timeout']: 1 }, httpStatusCounts: {} });
    expect(JSON.stringify(sourceHttpMetrics())).not.toContain('PRIVATE_ERROR');
  });

  it('el snapshot copia contadores y excluye URL cuerpo headers y valores privados', async () => {
    const { sourceFetch, sourceHttpMetrics } = await loadSourceHttp();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('PRIVATE_BODY', { status: 400, headers: { 'Set-Cookie': 'PRIVATE_COOKIE', 'X-Private': 'PRIVATE_HEADER' } })));
    await sourceFetch('safe', 'https://store.example/PRIVATE_URL?token=PRIVATE_TOKEN', { headers: { Authorization: 'Bearer PRIVATE_AUTH' } }).catch(() => undefined);
    const snapshot = sourceHttpMetrics();
    expect(snapshot.safe.httpStatusCounts).toEqual({ '400': 1 });
    snapshot.safe.httpStatusCounts['400'] = 999;
    snapshot.safe.httpStatusCounts['500'] = 1;
    expect(sourceHttpMetrics().safe.httpStatusCounts).toEqual({ '400': 1 });
    expect(JSON.stringify(sourceHttpMetrics())).not.toMatch(/PRIVATE_|https:|Authorization|Set-Cookie/);
  });

  // Fragmento del400 real de Mexx14Oct15:51UTC; no fixture de oferta disponible.
  const mexxMaintenance = '<html><head><title>MEXX | Mantenimiento</title></head><body><header>MEXX EN MANTENIMIENTO</header><main><p>ESTAMOS REALIZANDO TAREAS DE MANTENIMIENTO</p><p>Volvemos en breve, gracias por su paciencia.</p></main></body></html>';
  const maintenanceResponse = (body = mexxMaintenance) => new Response(body, { status: 400, headers: { 'Content-Type': 'text/html' } });

  it('clasifica mantenimiento Mexx sin perder400 y pausa sólo la tienda con una petición', async () => {
    const { sourceFetch, sourceHttpMetrics, sourceBlockedUntil } = await loadSourceHttp();
    const fetchMock = vi.fn().mockResolvedValueOnce(maintenanceResponse()).mockResolvedValueOnce(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(sourceFetch('mexx', 'https://www.mexx.com.ar/productos-rubro/procesadores/44152-item.html')).rejects.toMatchObject({ reason: 'maintenance', status: 400 });
    expect(sourceBlockedUntil('mexx') - Date.now()).toBe(60000);
    await expect(sourceFetch('mexx', 'https://www.mexx.com.ar/productos-rubro/procesadores/44153-item.html')).rejects.toMatchObject({ reason: 'rate-limited' });
    expect(sourceHttpMetrics().mexx).toMatchObject({ requests: 1, failures: 2, backoffSkips: 1, httpStatusCounts: { '400': 1 }, failureReasons: { maintenance: 1, 'rate-limited': 1 } });
    expect(await (await sourceFetch('other', 'https://other.example/item')).text()).toBe('ok');
    expect(sourceBlockedUntil('other')).toBe(0);expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(sourceHttpMetrics())).not.toContain('Volvemos');
  });

  it('vuelve a consultar después de vencer la pausa sin convertir mantenimiento en stock', async () => {
    const { sourceFetch, sourceHttpMetrics } = await loadSourceHttp();
    const fetchMock = vi.fn().mockResolvedValueOnce(maintenanceResponse()).mockResolvedValueOnce(new Response('recovered-document'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(sourceFetch('mexx', 'https://www.mexx.com.ar/item')).rejects.toMatchObject({ reason: 'maintenance' });
    await vi.advanceTimersByTimeAsync(60000);
    expect(await (await sourceFetch('mexx', 'https://www.mexx.com.ar/item')).text()).toBe('recovered-document');
    expect(sourceHttpMetrics().mexx).toMatchObject({ requests: 2, failures: 1, httpStatusCounts: { '400': 1, '200': 1 } });
  });

  it.each([
    ['400 ordinario', '<title>Bad Request</title><main>Invalid request</main>'],
    ['sin mensaje principal', mexxMaintenance.replace('ESTAMOS REALIZANDO TAREAS DE MANTENIMIENTO', 'Error del producto')],
    ['sólo script', '<title>MEXX | Mantenimiento</title><main>Error</main><script>ESTAMOS REALIZANDO TAREAS DE MANTENIMIENTO</script>'],
    ['sólo CSS', '<title>MEXX | Mantenimiento</title><main><style>ESTAMOS REALIZANDO TAREAS DE MANTENIMIENTO</style></main>'],
    ['con principal de producto', mexxMaintenance.replace('</body>', '<section id="prod_desc_edit"><h1 class="title">Ryzen7600X</h1></section></body>')],
    ['con Product schema', mexxMaintenance.replace('</body>', '<section itemscope itemtype="https://schema.org/Product"></section></body>')],
    ['con principal sin comillas', mexxMaintenance.replace('</body>', '<section id=prod_desc_edit><h1 class=title>Ryzen7600X</h1></section></body>')],
    ['con Product schema sin comillas', mexxMaintenance.replace('</body>', '<section itemscope itemtype=https://schema.org/Product></section></body>')],
    ...['template', 'noscript'].map(tag => [`aviso sólo en ${tag}`, mexxMaintenance.replace('<p>ESTAMOS REALIZANDO TAREAS DE MANTENIMIENTO</p>', `<${tag}>ESTAMOS REALIZANDO TAREAS DE MANTENIMIENTO</${tag}>`)]),
    ...['hidden', 'aria-hidden="true"', 'style="display:none"', 'style="visibility: hidden !important"'].map(attribute => [`aviso oculto con ${attribute}`, mexxMaintenance.replace('<p>ESTAMOS REALIZANDO TAREAS DE MANTENIMIENTO</p>', `<p ${attribute}>ESTAMOS REALIZANDO TAREAS DE MANTENIMIENTO</p>`)]),
    ['main oculto por ancestro', mexxMaintenance.replace('<main>', '<div hidden><main>').replace('</main>', '</main></div>')],
    ['cuerpo incompleto', mexxMaintenance.replace('</main>', '')],
    ['cuerpo mayor al límite', mexxMaintenance + 'x'.repeat(8192)],
  ])('preserva http-error y no pausa Mexx para %s', async (_, body) => {
    const { sourceFetch, sourceBlockedUntil } = await loadSourceHttp();vi.stubGlobal('fetch', vi.fn().mockResolvedValue(maintenanceResponse(body)));
    await expect(sourceFetch('mexx', 'https://www.mexx.com.ar/item')).rejects.toMatchObject({ reason: 'http-error', status: 400 });
    expect(sourceBlockedUntil('mexx')).toBe(0);
  });

  it('no clasifica ni lee cuerpos400 de otra tienda por compartir el texto', async () => {
    const { sourceFetch, sourceBlockedUntil } = await loadSourceHttp();const pull = vi.fn();const cancel = vi.fn();
    const stream = new ReadableStream({ pull, cancel });vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 400, headers: { 'Content-Type': 'text/html' } })));
    await expect(sourceFetch('other', 'https://other.example/item')).rejects.toMatchObject({ reason: 'http-error' });
    expect(sourceBlockedUntil('other')).toBe(0);expect(cancel).toHaveBeenCalled();
  });

  it('cancela una respuesta que supera8KiB sin usar un marcador temprano como prueba', async () => {
    const { sourceFetch, sourceBlockedUntil } = await loadSourceHttp();const cancel = vi.fn();const encoder = new TextEncoder();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(mexxMaintenance));controller.enqueue(encoder.encode('x'.repeat(8192))); }, cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 400, headers: { 'Content-Type': 'text/html' } })));
    await expect(sourceFetch('mexx', 'https://www.mexx.com.ar/item')).rejects.toMatchObject({ reason: 'http-error' });
    expect(cancel).toHaveBeenCalledTimes(1);expect(sourceBlockedUntil('mexx')).toBe(0);
  });

  it('el timeout real cancela un cuerpo de mantenimiento que nunca termina', async () => {
    vi.useRealTimers();const { sourceFetch, sourceHttpMetrics } = await loadSourceHttp();const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(20));const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 400, headers: { 'Content-Type': 'text/html' } })));
    await expect(sourceFetch('mexx', 'https://www.mexx.com.ar/item')).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(cancel).toHaveBeenCalledTimes(1);expect(sourceHttpMetrics().mexx).toMatchObject({ requests: 1, failures: 1, httpStatusCounts: { '400': 1 }, failureReasons: { timeout: 1 } });
  });
  it('el carril difiere otras ofertas Mexx después de mantenimiento mientras otra tienda avanza', async () => {
    const { sourceFetch, sourceBlockedUntil } = await loadSourceHttp();const { createStoreLanes, STORE_LANE_SKIPPED } = await import('@/lib/catalog/store-lanes');
    const fetchMock = vi.fn().mockImplementation(async (url: string) => String(url).includes('mexx.com.ar') ? maintenanceResponse() : new Response('other-ok'));
    vi.stubGlobal('fetch', fetchMock);const lanes = createStoreLanes({ concurrency: 2, spacingMs: 0 });
    const first = lanes.run('mexx', async () => sourceFetch('mexx', 'https://www.mexx.com.ar/first').catch((error: { reason: string }) => error.reason));
    const second = lanes.run('mexx', async () => sourceFetch('mexx', 'https://www.mexx.com.ar/second'), () => sourceBlockedUntil('mexx') > Date.now());
    const other = lanes.run('other', async () => (await sourceFetch('other', 'https://other.example/item')).text());
    expect(await Promise.all([first, second, other])).toEqual(['maintenance', STORE_LANE_SKIPPED, 'other-ok']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['https://other.example/item', 'http://www.mexx.com.ar/item'])('no aplica mantenimiento a un destino fuera del contrato Mexx: %s', async url => {
    const { sourceFetch, sourceBlockedUntil } = await loadSourceHttp();vi.stubGlobal('fetch', vi.fn().mockResolvedValue(maintenanceResponse()));
    await expect(sourceFetch('mexx', url)).rejects.toMatchObject({ reason: 'http-error', status: 400 });
    expect(sourceBlockedUntil('mexx')).toBe(0);
  });
});
