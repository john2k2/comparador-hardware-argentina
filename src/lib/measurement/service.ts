import 'server-only';
import { PROVIDER_IDS, type MeasurementDashboard, type MeasurementCommand, type ProviderConnection } from './types';
import { createProviderReader, getConnection, ProviderReadError } from './providers';
import { decodeStoredReading, readSavedMeasurements, saveMeasurements } from './store';
import { loadConnectionSecrets } from './credentials';
import { requestMeasurementCollection, usesExternalCollector } from './collection';

function auditReadings() {
  const raw = process.env.MEASUREMENT_AUDIT_BASELINE_JSON;
  if (!raw || raw.length > 16384) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.slice(0, 10).flatMap((value) => {
      const reading = decodeStoredReading(value);
      return reading?.origin === 'audit' ? [reading] : [];
    });
  } catch { return []; }
}

export async function getMeasurementDashboard(): Promise<MeasurementDashboard> {
  const [saved, settings] = await Promise.all([readSavedMeasurements(), loadConnectionSecrets()]);
  const history = [...saved.readings, ...auditReadings()].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt) || b.period.end.localeCompare(a.period.end));
  const readings = PROVIDER_IDS.flatMap((id) => {
    const latest = history.find((reading) => reading.provider === id);
    return latest ? [latest] : [];
  });
  const connections = PROVIDER_IDS.map((id): ProviderConnection => {
    const configured = getConnection(id, settings);
    // Quitar credenciales vuelve a requerir configuración aunque antes haya habido una consulta exitosa.
    if (configured.state === 'needs_setup' || configured.state === 'manual') return configured;
    const previous = saved.connections.find((connection) => connection.id === id);
    if (previous?.state === 'needs_setup') return { ...previous, state: 'ready' };
    return previous ?? configured;
  });
  const googleUrl = process.env.MEASUREMENT_PUBLIC_URL ?? '';
  const googleAllowed = process.env.MEASUREMENT_GOOGLE_CLIENT_TYPE !== 'installed' || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(googleUrl);
  return { generatedAt: new Date().toISOString(), readings, history: history.slice(0, 80), connections, decisions: saved.decisions, storage: { available: saved.available, issue: saved.issue }, setup: { google: Boolean(googleAllowed && process.env.MEASUREMENT_GOOGLE_CLIENT_ID && process.env.MEASUREMENT_GOOGLE_CLIENT_SECRET && googleUrl), encryption: /^[a-f0-9]{64}$/i.test(process.env.MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY ?? ''), externalCollector: usesExternalCollector() }, demo: process.env.MEASUREMENT_FIXTURE_MODE === '1', demoBaselineReal: process.env.MEASUREMENT_FIXTURE_BASELINE_REAL === '1' };
}

export async function executeMeasurementCommand(command: MeasurementCommand): Promise<{ dashboard: MeasurementDashboard; message: string }> {
  if (command.action === 'decision') {
    await saveMeasurements([], [], [{ id: command.id, status: command.status, updatedAt: new Date().toISOString() }]);
    return { dashboard: await getMeasurementDashboard(), message: 'Decisión guardada. Marcarla como revisada no verifica ni repara el problema.' };
  }
  if (usesExternalCollector()) {
    const message = await requestMeasurementCollection(command.provider);
    return { dashboard: await getMeasurementDashboard(), message };
  }
  const ids = command.provider === 'all' ? PROVIDER_IDS : [command.provider];
  const reader = createProviderReader();
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(ids.map(async (id) => {
    try {
      const reading = await reader(id);
      return { reading, connection: { id, state: 'connected', checkedAt, issue: null } as ProviderConnection };
    } catch (error) {
      const issue = error instanceof ProviderReadError ? error.message : 'No se pudo verificar la lectura.';
      const state = error instanceof ProviderReadError ? error.kind : 'error';
      return { reading: null, connection: { id, state, checkedAt, issue } as ProviderConnection };
    }
  }));
  const readings = results.flatMap(({ reading }) => reading ? [reading] : []);
  await saveMeasurements(readings, results.map(({ connection }) => connection));
  const errors = results.filter(({ connection }) => connection.state === 'error').length;
  const missing = results.filter(({ connection }) => connection.state === 'needs_setup').length;
  const message = `${readings.length} lectura${readings.length === 1 ? '' : 's'} actualizada${readings.length === 1 ? '' : 's'} y guardada${readings.length === 1 ? '' : 's'}.${errors ? ` ${errors} ${errors === 1 ? 'consulta falló' : 'consultas fallaron'}; se conserva el dato anterior.` : ''}${missing ? ` ${missing} ${missing === 1 ? 'conexión requiere' : 'conexiones requieren'} autorización.` : ''}`;
  return { dashboard: await getMeasurementDashboard(), message };
}
