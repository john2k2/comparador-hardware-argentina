import { describe, expect, it, vi } from 'vitest';
import { handleAuthSessionEdge } from './auth-session-edge';

const root = 'https://www.comparador-hardware.com.ar';
const env = { MEASUREMENT_COLLECTION_MODE: 'external', SUPABASE_URL: 'https://zyiyziubpcpgoqlkcrie.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-fixture' };
const validUser = () => Response.json({ id: 'verified-user', app_metadata: { role: 'user' } });
function request(body: unknown = { accessToken: 'valid-fixture' }, extraHeaders: Record<string, string> = {}) {
  return new Request(`${root}/api/auth/session`, { method: 'POST', headers: { Origin: root, 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) });
}

describe('sesión nativa validada sin render de Next', () => {
  it('una cuenta normal conserva el ingreso; validar la sesión no concede el rol de administrador', async () => {
    const fetcher = vi.fn().mockImplementation(validUser);
    const response = await handleAuthSessionEdge(request(), env, fetcher);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ ok: true });
    expect(response?.headers.get('set-cookie')).toBe('sb-access-token=valid-fixture; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax');
    expect(response?.headers.get('cache-control')).toBe('private, no-store');
    expect(String(fetcher.mock.calls[0][0])).toBe(`${env.SUPABASE_URL}/auth/v1/user`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'manual', headers: { apikey: 'public-fixture', Authorization: 'Bearer valid-fixture' } });
  });
  it('cierra sesión sin consultar proveedores y conserva Secure aunque el proxy informe HTTP', async () => {
    const fetcher = vi.fn();
    const response = await handleAuthSessionEdge(new Request(`${root}/api/auth/session`, { method: 'DELETE', headers: { Origin: root, 'X-Forwarded-Proto': 'http' } }), env, fetcher);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('set-cookie')).toBe('sb-access-token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['https://other.example', 'null', ''])('rechaza escrituras desde otro origen o sin origen: %s', async (origin) => {
    const fetcher = vi.fn();
    for (const method of ['POST', 'DELETE']) {
      const headers = new Headers(); if (origin) headers.set('Origin', origin);
      const response = await handleAuthSessionEdge(new Request(`${root}/api/auth/session`, { method, headers }), env, fetcher);
      expect(response?.status).toBe(403); expect(response?.headers.has('set-cookie')).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{}, null, { accessToken: 'bad; cookie=injected' }, { accessToken: 'x'.repeat(8193) }, { accessToken: 123 }])('no consulta Auth para un token inválido o demasiado largo', async (body) => {
    const fetcher = vi.fn(); const response = await handleAuthSessionEdge(request(body), env, fetcher);
    expect(response?.status).toBe(400); expect(response?.headers.has('set-cookie')).toBe(false); expect(fetcher).not.toHaveBeenCalled();
  });
  it('rechaza JSON inválido y cuerpos demasiado grandes sin guardar una cookie', async () => {
    for (const body of ['not-json', JSON.stringify({ accessToken: 'fixture', extra: 'x'.repeat(12_000) })]) {
      const fetcher = vi.fn();
      const response = await handleAuthSessionEdge(new Request(`${root}/api/auth/session`, { method: 'POST', headers: { Origin: root }, body }), env, fetcher);
      expect(response?.status).toBe(400); expect(response?.headers.has('set-cookie')).toBe(false); expect(fetcher).not.toHaveBeenCalled();
    }
  });
  it.each([401, 403, 500, 302])('no guarda el token si Auth devuelve %s ni expone el error privado', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('private-upstream-error', { status, headers: { Location: 'https://other.example' } }));
    const response = await handleAuthSessionEdge(request(), env, fetcher);
    expect(response?.status).toBe([401, 403].includes(status) ? 401 : 503);
    expect(response?.headers.has('set-cookie')).toBe(false); expect(await response?.text()).not.toContain('private-upstream-error');
    expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
  });
  it('no guarda la cookie ante fallas de red, respuestas inválidas o demasiado grandes', async () => {
    for (const result of [() => { throw new Error('private-network-error'); }, () => Response.json({}), () => Response.json({ id: 'fixture', extra: 'x'.repeat(64_000) })]) {
      const response = await handleAuthSessionEdge(request(), env, vi.fn().mockImplementation(result));
      expect(response?.status).toBe(503); expect(response?.headers.has('set-cookie')).toBe(false);
      expect(await response?.text()).not.toContain('private-network-error');
    }
  });
  it('no envía sesiones a un proyecto distinto o sin configuración', async () => {
    const fetcher = vi.fn();
    for (const setting of [{ ...env, SUPABASE_URL: 'https://other.example' }, { ...env, SUPABASE_PUBLISHABLE_KEY: '' }]) {
      expect((await handleAuthSessionEdge(request(), setting, fetcher))?.status).toBe(503);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('conserva la expiración de la cookie y el mínimo de un minuto', async () => {
    const response = await handleAuthSessionEdge(request({ accessToken: 'fixture', expiresAt: Date.now() / 1000 + 7200 }), env, vi.fn().mockImplementation(validUser));
    const maxAge = Number(response?.headers.get('set-cookie')?.match(/Max-Age=(\d+)/)?.[1]);
    expect(maxAge).toBeGreaterThan(7190); expect(maxAge).toBeLessThanOrEqual(7200);
    const past = await handleAuthSessionEdge(request({ accessToken: 'fixture', expiresAt: Date.now() / 1000 - 100 }), env, vi.fn().mockImplementation(validUser));
    expect(past?.headers.get('set-cookie')).toContain('Max-Age=60');
  });
  it('se limita al endpoint y modo definidos; no activa un render para otros métodos de sesión', async () => {
    const fetcher = vi.fn();
    expect(await handleAuthSessionEdge(new Request(`${root}/api/other`), env, fetcher)).toBeNull();
    expect(await handleAuthSessionEdge(request(), { ...env, MEASUREMENT_COLLECTION_MODE: 'inline' }, fetcher)).toBeNull();
    const response = await handleAuthSessionEdge(new Request(`${root}/api/auth/session`), env, fetcher);
    expect(response?.status).toBe(405); expect(response?.headers.get('allow')).toBe('POST, DELETE'); expect(fetcher).not.toHaveBeenCalled();
  });
});
