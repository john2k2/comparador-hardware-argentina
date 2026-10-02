import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCatalogScheduler } from './scheduler';

const now = Date.parse('2026-10-01T23:00:00Z');
const env = { CATALOG_SCHEDULER_ENABLED: '1', GITHUB_ACTIONS_DISPATCH_TOKEN: 'github-test',
  SUPABASE_URL: 'https://project.example', SUPABASE_SECRET_KEY: 'database-test' };
const runs = (status = 'completed', ageMinutes = 90) => new Response(JSON.stringify({ workflow_runs: [
  { status, created_at: new Date(now - ageMinutes * 60000).toISOString() },
] }));
afterEach(() => vi.unstubAllGlobals());

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
