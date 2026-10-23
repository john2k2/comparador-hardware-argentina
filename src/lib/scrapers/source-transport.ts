/** Transporte privado del runner; sólo Katech usa la salida estable del VPS. */
export function sourceTransport(store: string, originalUrl: string, options: RequestInit): { url: string; options: RequestInit } {
  if (store !== 'katech' || process.env.CATALOG_KATECH_VPS_TRANSPORT !== '1') return { url: originalUrl, options };
  if (typeof window !== 'undefined' || process.env.CATALOG_REQUESTED_RUNNER !== '1'
    || process.env.SUPABASE_URL !== 'https://catalog-api.comparador-hardware.com.ar'
    || !process.env.SUPABASE_SECRET_KEY) throw new Error('REFRESH_SOURCE_TRANSPORT_CONFIG');
  const url = new URL('/__sources/katech', process.env.SUPABASE_URL);
  url.searchParams.set('target', originalUrl);
  return { url: url.href, options: { signal: options.signal, method: 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`, Accept: new Headers(options.headers).get('accept') ?? 'text/html' } } };
}
