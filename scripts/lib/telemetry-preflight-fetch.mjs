// Capacidad de red limitada a una lectura de metadatos del proyecto asignado.
export function createTelemetryPreflightFetch(origin, transport = globalThis.fetch) {
  return (target, init) => {
    const requestUrl = new URL(String(target));
    const method = (init?.method || 'GET').toUpperCase();
    if (method !== 'GET' || requestUrl.origin !== origin || requestUrl.pathname !== '/rest/v1/api_cache_entries'
      || requestUrl.username || requestUrl.password) {
      throw new Error('RETENTION_PREFLIGHT_NETWORK_WRITE_FORBIDDEN');
    }
    const signal = init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000);
    // Sin redirects: el origen y ruta controlados no pueden cambiar durante la lectura.
    return transport(target, { ...init, signal, redirect: 'error' });
  };
}
