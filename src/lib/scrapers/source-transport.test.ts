import { afterEach, expect, it, vi } from 'vitest';
import { sourceTransport } from './source-transport';
afterEach(() => vi.unstubAllEnvs());
it('mantiene las demás tiendas y configuraciones fuera del transporte privado', () => {
  const options = { headers: { Accept: 'text/html' } };
  expect(sourceTransport('other', 'https://example.com', options)).toEqual({ url: 'https://example.com', options });
});
it('usa sólo la conexión VPS completa del runner, sin reenviar cookies ni cabeceras al destino', () => {
  vi.stubEnv('CATALOG_KATECH_VPS_TRANSPORT', '1'); vi.stubEnv('CATALOG_REQUESTED_RUNNER', '1');
  vi.stubEnv('SUPABASE_URL', 'https://catalog-api.comparador-hardware.com.ar'); vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-private');
  const original = 'https://katech.com.ar/producto/memoria/';
  const result = sourceTransport('katech', original, { headers: { Cookie: 'do-not-forward', Accept: 'text/html' } });
  expect(new URL(result.url).searchParams.get('target')).toBe(original);
  expect(result.options.headers).toEqual({ Authorization: 'Bearer fixture-private', Accept: 'text/html' });
  expect(result.url).not.toContain('fixture-private');
  vi.stubEnv('SUPABASE_URL', 'https://other.example');
  expect(() => sourceTransport('katech', original, {})).toThrow('REFRESH_SOURCE_TRANSPORT_CONFIG');
});
