import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeCatalogSchedule, runCatalogScheduler } from './scheduler';
import { logger } from '@/lib/logger';

const now = Date.parse('2026-10-08T12:11:00Z');
const minute = 60_000;
const env = { CATALOG_SCHEDULER_ENABLED: '1', GITHUB_ACTIONS_DISPATCH_TOKEN: 'github-test',
  SUPABASE_URL: 'https://project.example', SUPABASE_SECRET_KEY: 'database-test' };
type Target = 'adaptive' | 'guides';
const file = (target: Target) => target === 'adaptive' ? 'catalog-adaptive-refresh.yml' : 'catalog-refresh.yml';
const run = (age: number, extra = {}) => ({ status: 'completed', event: 'schedule', conclusion: 'success',
  created_at: new Date(now - age * minute).toISOString().replace('.000Z', 'Z'),
  run_started_at: new Date(now - age * minute).toISOString().replace('.000Z', 'Z'), ...extra });
const list = (...runs: unknown[]) => Response.json({ workflow_runs: runs });
const gate = (allowed: boolean, retryAfterSeconds?: unknown) => Response.json({ allowed,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) });
function recoveryClock() {
  let elapsed = 0;
  return { clock: () => elapsed, sleep: vi.fn(async (ms: number) => { elapsed += ms; }),
    advance(ms: number) { elapsed += ms; } };
}
function transport(options: {
  adaptive?: () => Response | Promise<Response>; guides?: () => Response | Promise<Response>;
  gate?: () => Response | Promise<Response>; dispatch?: () => Response | Promise<Response>;
} = {}) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const value = String(url);
    if (value.includes('/runs?')) return value.includes(file('adaptive'))
      ? (options.adaptive?.() ?? list(run(90))) : (options.guides?.() ?? list(run(60)));
    if (value.includes('/rpc/')) return options.gate?.() ?? gate(true);
    expect(value).toMatch(/\/dispatches$/);
    expect(init?.method).toBe('POST');
    return options.dispatch?.() ?? new Response(null, { status: 204 });
  });
}
const dispatched = (fetcher: ReturnType<typeof transport>) => fetcher.mock.calls.filter(([url]) => String(url).includes('/dispatches'));
const stages = (fetcher: ReturnType<typeof transport>) => fetcher.mock.calls.map(([url]) => String(url).includes('/runs?')
  ? String(url).includes(file('adaptive')) ? 'adaptive' : 'guides' : String(url).includes('/rpc/') ? 'gate' : 'dispatch');
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('catalog scheduler recovery', () => {
  it('requiere habilitación explícita y credenciales privadas', async () => {
    const fetcher = transport();
    expect(await runCatalogScheduler({}, now, fetcher)).toBe('disabled');
    await expect(runCatalogScheduler({ CATALOG_SCHEDULER_ENABLED: '1' }, now, fetcher))
      .rejects.toThrow('CATALOG_SCHEDULER_CREDENTIALS_MISSING');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('identifica transporte sin exponer mensajes o credenciales', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Illegal invocation private-response'));
    await expect(runCatalogScheduler(env, now, fetcher)).rejects.toThrow('CATALOG_SCHEDULER_READ_INVOCATION_FAILED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  for (const target of ['adaptive', 'guides'] as const) {
    it.each(['queued', 'in_progress', 'waiting', 'pending', 'requested'])(`valida ambos y omite despachos cuando ${target} está %s`, async status => {
      const fetcher = transport({ [target]: () => list(run(500, { status, conclusion: null })) });
      expect(await runCatalogScheduler(env, now, fetcher)).toBe('busy');
      expect(stages(fetcher)).toEqual(['adaptive', 'guides']);
    });
    it.each([
      {}, { workflow_runs: null }, { workflow_runs: [null] },
      { workflow_runs: [run(90, { status: 'unknown' })] },
      { workflow_runs: [run(90, { event: null })] },
      { workflow_runs: [run(90, { created_at: 'invalid' })] },
      { workflow_runs: [run(90, { run_started_at: null })] },
      { workflow_runs: [run(90, { created_at: '2026-02-30T01:00:00Z' })] },
      { workflow_runs: [run(90, { run_started_at: '2026-10-08T12:11:01Z' })] },
      { workflow_runs: [run(-1)] },
      { workflow_runs: [run(60), run(90, { run_started_at: 'invalid' })] },
      { workflow_runs: Array.from({ length: 11 }, () => run(90)) },
    ])(`falla cerrado ante listado ${target} dudoso sin adquirir permiso`, async payload => {
      const fetcher = transport({ [target]: () => Response.json(payload) });
      await expect(runCatalogScheduler(env, now, fetcher)).rejects.toThrow('CATALOG_SCHEDULER_INVALID_RESPONSE');
      expect(stages(fetcher)).not.toContain('gate');
      expect(dispatched(fetcher)).toHaveLength(0);
    });
    it.each([302, 403, 500])(`no sigue redirección ni error HTTP de ${target}: %s`, async status => {
      const fetcher = transport({ [target]: () => new Response(null, { status, headers: { Location: 'https://other.example' } }) });
      await expect(runCatalogScheduler(env, now, fetcher)).rejects.toThrow('CATALOG_SCHEDULER_READ_FAILED');
      expect(stages(fetcher)).not.toContain('gate');
      fetcher.mock.calls.forEach(([, init]) => expect(init?.redirect).toBe('manual'));
    });
  }
  it('un ocupado o reciente no oculta una fila inválida del segundo listado', async () => {
    for (const status of ['completed', 'in_progress']) {
      const fetcher = transport({ adaptive: () => list(run(1, { status })), guides: () => list(run(500), null) });
      await expect(runCatalogScheduler(env, now, fetcher)).rejects.toThrow('CATALOG_SCHEDULER_INVALID_RESPONSE');
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });
  it('no copia JSON externo ilegible', async () => {
    const fetcher = transport({ guides: () => new Response('private-response') });
    await expect(runCatalogScheduler(env, now, fetcher)).rejects.toThrow('CATALOG_SCHEDULER_READ_JSON_FAILED');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('manuales y fallidos recientes conservan cooldown; un rerun reciente cuenta', async () => {
    const fetcher = transport({ adaptive: () => list(run(74, { event: 'workflow_dispatch', conclusion: 'failure' })),
      guides: () => list(run(500, { run_started_at: run(74).run_started_at })) });
    expect(await runCatalogScheduler(env, now, fetcher)).toBe('recent');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('calcula el último inicio sobre todas las filas, sin confiar en el orden', async () => {
    const fetcher = transport({ adaptive: () => list(run(500), run(74), run(100)), guides: () => list(run(1)) });
    expect(await runCatalogScheduler(env, now, fetcher)).toBe('recent');
    expect(dispatched(fetcher)).toHaveLength(0);
  });
  it.each([
    [75, 74, 'adaptive'], [500, 119, 'adaptive'], [500, 120, 'guides'],
    [76, 90, 'guides'], [90, 90, 'guides'], [74, 75, 'guides'],
  ] as const)('selección adaptive=%s / guides=%s minutos => %s', async (adaptive, guides, target) => {
    const fetcher = transport({ adaptive: () => list(run(adaptive)), guides: () => list(run(guides)) });
    expect(await runCatalogScheduler(env, now, fetcher)).toBe('sent');
    expect(stages(fetcher)).toEqual(['adaptive', 'guides', 'gate', 'dispatch']);
    const [url, request] = dispatched(fetcher)[0];
    expect(url).toContain(file(target) + '/dispatches');
    expect(JSON.parse(request!.body as string)).toEqual({ ref: 'main', inputs: target === 'adaptive'
      ? { max_offers: '2500', trigger: 'cloudflare-fallback' } : { mode: 'guides', trigger: 'cloudflare-fallback' } });
    expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string))
      .toEqual({ p_bucket_key: 'catalog-scheduler-dispatch-hour', p_limit: 1, p_window_seconds: 3600 });
    fetcher.mock.calls.forEach(([, init]) => expect(init?.redirect).toBe('manual'));
  });
  it('sin historial recupera sólo guías primero, nunca muestra ni priority', async () => {
    const fetcher = transport({ adaptive: () => list(), guides: () => list() });
    expect(await runCatalogScheduler(env, now, fetcher)).toBe('sent');
    expect(JSON.parse(dispatched(fetcher)[0][1]!.body as string).inputs).toEqual({ mode: 'guides', trigger: 'cloudflare-fallback' });
  });
  it('fase adversaria: guides de 125min gana sobre adaptive de 180min', async () => {
    const fetcher = transport({ adaptive: () => list(run(180)), guides: () => list(run(125)) });
    expect(await runCatalogScheduler(env, now, fetcher)).toBe('sent');
    expect(dispatched(fetcher)[0][0]).toContain(file('guides'));
  });
  it('48 ticks ideales sin cron nativo alternan 24/24 sin hambre y sin superar un envío por tick', async () => {
    const starts = { adaptive: now - 600 * minute, guides: now - 600 * minute };
    const sent: { target: Target; at: number }[] = [];
    for (let tick = 0; tick < 48; tick++) {
      const at = now + tick * 60 * minute;
      const snapshot = (target: Target) => () => list(run((now - starts[target]) / minute));
      const fetcher = transport({ adaptive: snapshot('adaptive'), guides: snapshot('guides') });
      expect(await runCatalogScheduler(env, at, fetcher, recoveryClock())).toBe('sent');
      expect(dispatched(fetcher)).toHaveLength(1);
      const target = String(dispatched(fetcher)[0][0]).includes(file('adaptive')) ? 'adaptive' : 'guides';
      starts[target] = at; sent.push({ target, at });
    }
    for (const target of ['adaptive', 'guides'] as const) {
      const times = sent.filter(item => item.target === target).map(item => item.at);
      expect(times).toHaveLength(24);
      expect(times.slice(1).every((at, i) => at - times[i] === 120 * minute)).toBe(true);
    }
  });
});

describe('bounded shared scheduler gate', () => {
  it.each([6, 10])('espera una vez %ss, relee ambos y mantiene bucket/cupo', async seconds => {
    const recovery = recoveryClock(); let gates = 0;
    const fetcher = transport({ gate: () => gate(++gates === 2, seconds) });
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('sent');
    expect(recovery.sleep).toHaveBeenCalledExactlyOnceWith(Math.min(10_000, seconds * 1000 + 100));
    expect(stages(fetcher)).toEqual(['adaptive', 'guides', 'gate', 'adaptive', 'guides', 'gate', 'dispatch']);
    for (const [, init] of fetcher.mock.calls.filter(([url]) => String(url).includes('/rpc/'))) {
      expect(JSON.parse(init!.body as string)).toEqual({ p_bucket_key: 'catalog-scheduler-dispatch-hour', p_limit: 1, p_window_seconds: 3600 });
    }
    expect(dispatched(fetcher)).toHaveLength(1);
  });
  it.each([11, undefined, null, '6', 0, -1, 1.5, NaN, Infinity])('no espera con retry metadata %s', async retry => {
    const recovery = recoveryClock(), fetcher = transport({ gate: () => gate(false, retry) });
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('deferred');
    expect(recovery.sleep).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('una segunda negativa no causa otra espera', async () => {
    const recovery = recoveryClock(), fetcher = transport({ gate: () => gate(false, 6) });
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('deferred');
    expect(recovery.sleep).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('recalcula el destino tras la espera si guías cruzan 120 minutos', async () => {
    const recovery = recoveryClock(); let gates = 0;
    const fetcher = transport({ adaptive: () => list(run(500)), guides: () => list(run(119.95)),
      gate: () => gate(++gates === 2, 6) });
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('sent');
    expect(dispatched(fetcher)[0][0]).toContain(file('guides'));
  });
  it.each(['in_progress', 'completed'])('un run %s nuevo durante espera impide duplicación', async status => {
    const recovery = recoveryClock(); let reads = 0;
    // Primera lectura debe poder avanzar hasta la guarda.
    const adaptive = () => list(run(++reads === 1 ? 90 : 0, { status: reads === 1 ? 'completed' : status }));
    const actual = transport({ adaptive, gate: () => gate(false, 6) });
    expect(await runCatalogScheduler(env, now, actual, recovery)).toBe(status === 'in_progress' ? 'busy' : 'recent');
    expect(actual).toHaveBeenCalledTimes(5); expect(recovery.sleep).toHaveBeenCalledTimes(1);
    expect(dispatched(actual)).toHaveLength(0);
  });
  it('un listado de guías inválido en relectura conserva el primer permiso sin despacho', async () => {
    const recovery = recoveryClock(); let reads = 0;
    const fetcher = transport({ guides: () => ++reads === 1 ? list(run(60)) : new Response('private-response'), gate: () => gate(false, 6) });
    await expect(runCatalogScheduler(env, now, fetcher, recovery)).rejects.toThrow('CATALOG_SCHEDULER_READ_JSON_FAILED');
    expect(fetcher).toHaveBeenCalledTimes(5); expect(dispatched(fetcher)).toHaveLength(0);
  });
  it.each(['adaptive', 'guides', 'gate'] as const)('agotar 60s durante %s no empieza la solicitud siguiente', async stage => {
    const recovery = recoveryClock();
    const action = () => { recovery.advance(60_000); return stage === 'gate' ? gate(true) : list(run(90)); };
    const fetcher = transport({ [stage]: action });
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('deferred');
    expect(fetcher).toHaveBeenCalledTimes(stage === 'adaptive' ? 1 : stage === 'guides' ? 2 : 3);
  });
  it('conserva ocho segundos por request y usa sólo el segundo restante al despachar', async () => {
    const recovery = recoveryClock(), timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetcher = transport({ gate: () => { recovery.advance(59_000); return gate(true); } });
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('sent');
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([8000, 8000, 8000, 1000]);
  });
  it('no espera si la espera no cabe, ni relee cuando el timer agota el presupuesto', async () => {
    for (const exhausted of [false, true]) {
      const recovery = recoveryClock();
      if (exhausted) recovery.sleep.mockImplementationOnce(async () => { recovery.advance(60_000); });
      const fetcher = transport({ gate: () => { if (!exhausted) recovery.advance(50_000); return gate(false, 10); } });
      expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('deferred');
      expect(fetcher).toHaveBeenCalledTimes(3);
    }
  });
  it('dos eventos compiten por el mismo gate tras esperar: sólo uno envía', async () => {
    let elapsed = 0, gates = 0; const waits: (() => void)[] = [];
    const recovery = { clock: () => elapsed, sleep: vi.fn(() => new Promise<void>(resolve => {
      waits.push(resolve); if (waits.length === 2) { elapsed = 6100; waits.forEach(release => release()); }
    })) };
    const fetcher = transport({ gate: () => gate(++gates === 3, 6) });
    const results = await Promise.all([runCatalogScheduler(env, now, fetcher, recovery), runCatalogScheduler(env, now, fetcher, recovery)]);
    expect(results.sort()).toEqual(['deferred', 'sent']); expect(gates).toBe(4);
    expect(dispatched(fetcher)).toHaveLength(1); expect(recovery.sleep).toHaveBeenCalledTimes(2);
  });
  it.each([() => new Response(null, { status: 500 }), () => Response.json({ allowed: 'true' })])('guarda no confirmada falla cerrado', async response => {
    const fetcher = transport({ gate: response });
    await expect(runCatalogScheduler(env, now, fetcher)).rejects.toThrow('CATALOG_SCHEDULER_');
    expect(fetcher).toHaveBeenCalledTimes(3); expect(dispatched(fetcher)).toHaveLength(0);
  });
  it.each(['rejected', 'timeout'])('POST %s no reintenta ni libera el permiso ni registra datos externos', async scenario => {
    const fetcher = transport({ dispatch: () => {
      if (scenario === 'timeout') throw new Error('aborted private-response');
      return new Response('private-response', { status: 403 });
    } });
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const code = scenario === 'timeout' ? 'CATALOG_SCHEDULER_DISPATCH_TIMEOUT_FAILED' : 'CATALOG_SCHEDULER_DISPATCH_FAILED';
    await expect(observeCatalogSchedule(env, fetcher)).rejects.toThrow(code);
    expect(fetcher).toHaveBeenCalledTimes(4); expect(dispatched(fetcher)).toHaveLength(1);
    expect(logged).toHaveBeenCalledExactlyOnceWith('Catalog scheduler failed', { code });
    expect(JSON.stringify(logged.mock.calls)).not.toContain('private-response');
  });
});
