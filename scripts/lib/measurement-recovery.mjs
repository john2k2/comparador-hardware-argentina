// La lectura privada no debe depender de que dos cron de GitHub se ejecuten en orden.
// Sólo el runner puede recuperar una muestra ausente/vencida mediante el productor oficial.
export function classifyEnebaCache(response, now = Date.now()) {
  if (!response || response.error) return 'unavailable';
  if (response.data === null) return 'missing';
  const { payload, expires_at: expiresAt } = response.data ?? {};
  const expiry = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(expiry) || !payload || !['ready', 'empty'].includes(payload.status)) return 'unavailable';
  return expiry <= now ? 'expired' : 'current';
}

export async function collectMeasurementsWithRecovery(provider, dependencies) {
  let result = await dependencies.collect({ action: 'sync', provider });
  let recovery = 'not-needed';
  const failed = result.dashboard.connections.some(item => item.id === 'eneba' && item.state === 'error');
  if ((provider !== 'all' && provider !== 'eneba') || !failed) return { result, recovery };
  if (!result.dashboard.storage.available || !dependencies.enebaEnabled) return { result, recovery: 'disabled' };
  let cache;
  try { cache = await dependencies.inspectEnebaCache(); }
  catch { return { result, recovery: 'cache-unavailable' }; }
  if (!['missing', 'expired'].includes(cache)) return { result, recovery: 'cache-' + (cache === 'current' ? 'current' : 'unavailable') };
  try {
    // El productor valida la fecha del feed, ventana de seis horas y ACK/readback.
    await dependencies.refreshEneba();
    recovery = 'refreshed';
  } catch {
    // Conservar el error y dato anterior. Nunca registrar mensajes/SDK/credenciales.
    return { result, recovery: 'producer-failed' };
  }
  // Las otras nueve fuentes ya se consultaron y guardaron; no repetir sync all.
  result = await dependencies.collect({ action: 'sync', provider: 'eneba' });
  return { result, recovery };
}

export function measurementCollectionOutcome(result, provider) {
  const selected = result.dashboard.connections.filter(item => provider === 'all' || item.id === provider);
  const failed = selected.filter(item => item.state === 'error').map(item => item.id);
  return { verified: selected.filter(item => item.state === 'connected').length,
    needsSetup: selected.filter(item => item.state === 'needs_setup').length, failed, exitCode: failed.length ? 1 : 0 };
}
