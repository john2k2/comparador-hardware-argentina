import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeCatalogSchedule, runCatalogScheduler } from './scheduler';
import { logger } from '@/lib/logger';

const now = Date.parse('2026-10-01T23:00:00Z');
const env = { CATALOG_SCHEDULER_ENABLED: '1', GITHUB_ACTIONS_DISPATCH_TOKEN: 'github-test',
  SUPABASE_URL: 'https://project.example', SUPABASE_SECRET_KEY: 'database-test' };
const runs = (status = 'completed', ageMinutes = 90) => new Response(JSON.stringify({ workflow_runs: [
  { status, created_at: new Date(now - ageMinutes * 60000).toISOString() },
] }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('catalog scheduler recovery', () => {
  it('identifica la etapa fallida sin exponer mensajes de transporte ni credenciales', async () => {
    const native = vi.fn().mockRejectedValue(new TypeError('Illegal invocation'));
    await expect(runCatalogScheduler(env, now, native)).rejects.toThrow('CATALOG_SCHEDULER_READ_INVOCATION_FAILED');
    expect(native).toHaveBeenCalledTimes(1);
  });
  it('requiere habilitación explícita y credenciales privadas', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await runCatalogScheduler({}, now)).toBe('disabled');
    await expect(runCatalogScheduler({ CATALOG_SCHEDULER_ENABLED: '1' }, now))
      .rejects.toThrow('CATALOG_SCHEDULER_CREDENTIALS_MISSING');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['queued', 'in_progress', 'waiting', 'pending'])('no añade otro trabajo cuando hay uno %s', async status => {
    const fetcher = vi.fn().mockResolvedValue(runs(status, 500)); vi.stubGlobal('fetch', fetcher);
    expect(await runCatalogScheduler(env, now)).toBe('busy');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('espera 75 minutos desde el último inicio, incluso manual o fallido', async () => {
    const fetcher = vi.fn().mockResolvedValue(runs('completed', 74)); vi.stubGlobal('fetch', fetcher);
    expect(await runCatalogScheduler(env, now)).toBe('recent');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('respeta el límite distribuido ante una reentrega del reloj', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(new Response('{"allowed":false}'));
    vi.stubGlobal('fetch', fetcher);
    expect(await runCatalogScheduler(env, now)).toBe('deferred');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('despacha sólo el flujo autorizado en main con límites y origen registrables', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(new Response('{"allowed":true}'))
      .mockResolvedValueOnce(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetcher);
    expect(await runCatalogScheduler(env, now)).toBe('sent');
    const [url, request] = fetcher.mock.calls[2];
    expect(url).toBe('https://api.github.com/repos/john2k2/comparador-hardware-argentina/actions/workflows/catalog-adaptive-refresh.yml/dispatches');
    expect(JSON.parse(request.body)).toEqual({ ref: 'main', inputs: { max_offers: '2500', trigger: 'cloudflare-fallback' } });
    expect(request.redirect).toBe('manual');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ p_bucket_key: 'catalog-scheduler-dispatch-hour', p_limit: 1, p_window_seconds: 3600 });
  });
  it.each([new Response(null, { status: 403 }), new Response('{}'), new Response('{"workflow_runs":[{"status":"completed","created_at":"invalid"}]}')])('no despacha si no puede comprobar el estado previo', async response => {
    const fetcher = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetcher);
    await expect(runCatalogScheduler(env, now)).rejects.toThrow('CATALOG_SCHEDULER_');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('no interpreta un error de permisos del despacho como éxito', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(new Response('{"allowed":true}'))
      .mockResolvedValueOnce(new Response(null, { status: 403 })); vi.stubGlobal('fetch', fetcher);
    await expect(runCatalogScheduler(env, now)).rejects.toThrow('CATALOG_SCHEDULER_DISPATCH_FAILED');
  });
  it('rechaza una redirección sin reenviar credenciales a otro destino', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://other.example' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(runCatalogScheduler(env, now)).rejects.toThrow('CATALOG_SCHEDULER_READ_FAILED');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
  });
  it('identifica JSON ilegible sin copiar el contenido externo al log', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('external-sensitive-content')); vi.stubGlobal('fetch', fetcher);
    await expect(runCatalogScheduler(env, now)).rejects.toThrow('CATALOG_SCHEDULER_READ_JSON_FAILED');
  });
  it.each([new Response(null, { status: 500 }), new Response('{"allowed":"true"}')])('falla cerrado si la base no confirma el límite', async response => {
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(response); vi.stubGlobal('fetch', fetcher);
    await expect(runCatalogScheduler(env, now)).rejects.toThrow('CATALOG_SCHEDULER_');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

function recoveryClock() {
  let elapsed = 0;
  return { clock: () => elapsed, sleep: vi.fn(async (ms: number) => { elapsed += ms; }),
    advance(ms: number) { elapsed += ms; } };
}
const gate = (allowed: boolean, retryAfterSeconds?: unknown) => Response.json({ allowed,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) });

describe('bounded catalog scheduler recovery', () => {
  it.each([6, 10])('recupera un vencimiento de %s segundos con una sola espera y relectura', async seconds => {
    const recovery = recoveryClock();
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(gate(false, seconds))
      .mockResolvedValueOnce(runs()).mockResolvedValueOnce(gate(true))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('sent');
    expect(recovery.sleep).toHaveBeenCalledExactlyOnceWith(Math.min(10_000, seconds * 1000 + 100));
    expect(fetcher.mock.calls.map(([url]) => String(url).includes('/runs?') ? 'read'
      : String(url).includes('/rpc/') ? 'gate' : 'dispatch')).toEqual(['read', 'gate', 'read', 'gate', 'dispatch']);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/dispatches'))).toHaveLength(1);
    for (const call of [fetcher.mock.calls[1], fetcher.mock.calls[3]]) {
      expect(JSON.parse(call[1]!.body as string)).toEqual({ p_bucket_key: 'catalog-scheduler-dispatch-hour', p_limit: 1, p_window_seconds: 3600 });
    }
  });

  it.each([11, undefined, null, '6', 0, -1, 1.5, NaN, Infinity])('no espera ni despacha con metadata %s', async retry => {
    const recovery = recoveryClock();
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(gate(false, retry));
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('deferred');
    expect(recovery.sleep).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['in_progress', 'completed'])('omite el despacho si aparece un run %s durante la espera', async status => {
    const recovery = recoveryClock();
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(gate(false, 6))
      .mockResolvedValueOnce(runs(status, 0));
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe(status === 'completed' ? 'recent' : 'busy');
    expect(recovery.sleep).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('conserva deferred si la segunda guarda vuelve a negar, sin otra espera', async () => {
    const recovery = recoveryClock();
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(gate(false, 6))
      .mockResolvedValueOnce(runs()).mockResolvedValueOnce(gate(false, 1));
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('deferred');
    expect(recovery.sleep).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('no espera cuando los diez segundos no caben en el presupuesto total de sesenta', async () => {
    const recovery = recoveryClock();
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockImplementationOnce(async () => {
      recovery.advance(50_000); return gate(false, 10);
    });
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('deferred');
    expect(recovery.sleep).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('un timer demorado agota el presupuesto sin comenzar nuevas solicitudes', async () => {
    const recovery = recoveryClock();
    recovery.sleep.mockImplementationOnce(async () => { recovery.advance(60_000); });
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(gate(false, 6));
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('deferred');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('no inicia un POST si se agota el presupuesto durante la lectura o la guarda', async () => {
    for (const stage of ['read', 'gate']) {
      const recovery = recoveryClock();
      const fetcher = vi.fn().mockImplementation(async (url: string | URL) => {
        const read = String(url).includes('/runs?');
        if (stage === (read ? 'read' : 'gate')) recovery.advance(60_000);
        return read ? runs() : gate(true);
      });
      expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('deferred');
      expect(fetcher).toHaveBeenCalledTimes(stage === 'read' ? 1 : 2);
    }
  });

  it('conserva el máximo de ocho segundos por request y acota el último al tiempo restante', async () => {
    const recovery = recoveryClock();
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(gate(false, 6))
      .mockResolvedValueOnce(runs()).mockImplementationOnce(async () => {
        recovery.advance(53_000); return gate(true);
      }).mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await runCatalogScheduler(env, now, fetcher, recovery)).toBe('sent');
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([8000, 8000, 8000, 8000, 900]);
  });

  it('dos eventos que esperaron adquieren el mismo gate y sólo uno despacha', async () => {
    const waits: (() => void)[] = [];
    let elapsed = 0, gateCalls = 0, dispatches = 0;
    const recovery = { clock: () => elapsed, sleep: vi.fn(() => new Promise<void>(resolve => {
      waits.push(resolve);
      if (waits.length === 2) { elapsed = 6100; waits.forEach(release => release()); }
    })) };
    const fetcher = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/runs?')) return runs();
      if (String(url).includes('/rpc/')) { gateCalls++; return gate(gateCalls === 3, 6); }
      dispatches++; return new Response(null, { status: 204 });
    });
    const results = await Promise.all([runCatalogScheduler(env, now, fetcher, recovery), runCatalogScheduler(env, now, fetcher, recovery)]);
    expect(results.sort()).toEqual(['deferred', 'sent']);
    expect(gateCalls).toBe(4);
    expect(dispatches).toBe(1);
    expect(recovery.sleep).toHaveBeenCalledTimes(2); // Una espera por evento.
  });

  it.each(['rejected', 'timeout'])('un dispatch %s no libera el gate, reintenta ni registra la respuesta', async scenario => {
    const sensitive = 'fixture-private-response';
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(gate(true))
      .mockImplementationOnce(async () => {
        if (scenario === 'timeout') throw new Error(`aborted ${sensitive}`);
        return new Response(sensitive, { status: 403 });
      });
    vi.stubGlobal('fetch', fetcher);
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const code = scenario === 'timeout' ? 'CATALOG_SCHEDULER_DISPATCH_TIMEOUT_FAILED' : 'CATALOG_SCHEDULER_DISPATCH_FAILED';
    await expect(observeCatalogSchedule(env)).rejects.toThrow(code);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(logged).toHaveBeenCalledExactlyOnceWith('Catalog scheduler failed', { code });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(sensitive);
  });

  it('un fallo de relectura tras esperar falla cerrado sin segunda guarda ni despacho', async () => {
    const recovery = recoveryClock();
    const fetcher = vi.fn().mockResolvedValueOnce(runs()).mockResolvedValueOnce(gate(false, 6))
      .mockResolvedValueOnce(new Response('fixture-private-response', { status: 403 }));
    await expect(runCatalogScheduler(env, now, fetcher, recovery)).rejects.toThrow('CATALOG_SCHEDULER_READ_FAILED');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(recovery.sleep).toHaveBeenCalledTimes(1);
  });
});
