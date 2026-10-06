import 'server-only';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { isRecord, isProvider, parseCommand } from './validation';
import type { MeasurementDashboard, MeasurementReading, ProviderConnection, TrackedDecision } from './types';
import { decodeStoredReading } from './reading-decoder';
export { decodeStoredReading } from './reading-decoder';

export const MEASUREMENT_SCOPE = 'measurement-dashboard-v1';
export const MEASUREMENT_TABLE = 'measurement_dashboard_entries';
const HISTORY_SCOPE = `${MEASUREMENT_SCOPE}:history`;
export interface SavedMeasurements {
  readings: MeasurementReading[];
  connections: ProviderConnection[];
  decisions: TrackedDecision[];
  available: boolean;
  issue: string | null;
}


export async function readSavedMeasurements(): Promise<SavedMeasurements> {
  const empty: SavedMeasurements = { readings: [], connections: [], decisions: [], available: false, issue: 'Falta habilitar el guardado privado en este entorno.' };
  const client = getServerSupabaseServiceClient();
  if (!client) return empty;
  try {
    const load = (scope: string, limit: number) => client.from(MEASUREMENT_TABLE).select('entry_key,payload')
      .eq('scope', scope)
      .order('updated_at', { ascending: false }).limit(limit).abortSignal(AbortSignal.timeout(8_000));
    // Las decisiones y últimas lecturas no compiten con cientos de cortes históricos por el límite.
    const [current, history] = await Promise.all([load(MEASUREMENT_SCOPE, 40), load(HISTORY_SCOPE, 300)]);
    if (current.error || history.error || !Array.isArray(current.data) || !Array.isArray(history.data)) return { ...empty, issue: 'No se pudo leer el historial privado. Revisá la conexión antes de actualizar.' };
    const result: SavedMeasurements = { readings: [], connections: [], decisions: [], available: true, issue: null };
    const keys = new Set<string>();
    for (const row of [...current.data, ...history.data]) {
      const value: unknown = row.payload;
      if (!isRecord(value)) continue;
      if (value.kind === 'reading') {
        const reading = decodeStoredReading(value.reading);
        if (reading) {
          const key = `${reading.provider}:${reading.period.start}:${reading.period.end}:${reading.collectedAt}`;
          if (!keys.has(key)) { result.readings.push(reading); keys.add(key); }
        }
      } else if (value.kind === 'connection' && isProvider(value.id) && ['connected', 'ready', 'needs_setup', 'manual', 'error'].includes(String(value.state))) {
        const validDate = typeof value.checkedAt === 'string' && Number.isFinite(Date.parse(value.checkedAt));
        result.connections.push({ id: value.id, state: value.state as ProviderConnection['state'], checkedAt: validDate ? value.checkedAt as string : null, issue: typeof value.issue === 'string' ? value.issue.slice(0, 250) : null });
      } else if (value.kind === 'decision' && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))) {
        try {
          const command = parseCommand({ action: 'decision', id: value.id, status: value.status });
          if (command.action === 'decision') result.decisions.push({ id: command.id, status: command.status, updatedAt: value.updatedAt });
        } catch { /* Ignorar entradas fuera del contrato. */ }
      }
    }
    return result;
  } catch { return { ...empty, issue: 'No se pudo leer el historial privado. Revisá la conexión antes de actualizar.' }; }
}

export async function saveMeasurements(readings: MeasurementReading[], connections: ProviderConnection[] = [], decisions: TrackedDecision[] = []) {
  const client = getServerSupabaseServiceClient();
  if (!client) throw new Error('El guardado privado no está disponible en este entorno.');
  const now = new Date();
  const row = (key: string, payload: unknown, scope = MEASUREMENT_SCOPE) => ({ entry_key: `${scope}:${key}`, scope, payload, updated_at: now.toISOString() });
  const entries = [
    ...readings.flatMap((reading) => [row(`reading:${reading.provider}:${reading.period.start}:${reading.period.end}`, { kind: 'reading', reading }, HISTORY_SCOPE), row(`latest:${reading.provider}`, { kind: 'reading', reading })]),
    ...connections.map((connection) => row(`connection:${connection.id}`, { kind: 'connection', ...connection })),
    ...decisions.map((decision) => row(`decision:${decision.id}`, { kind: 'decision', ...decision })),
  ];
  if (!entries.length) return;
  const { error } = await client.from(MEASUREMENT_TABLE).upsert(entries, { onConflict: 'entry_key' }).abortSignal(AbortSignal.timeout(8_000));
  if (error) throw new Error('Se consultaron datos, pero no se pudieron guardar. No hay confirmación de seguimiento persistente.');
}

// Un resumen compacto permite leer el panel en el Worker sin descifrar accesos
// ni recorrer cientos de cortes en cada visita. No contiene autorizaciones.
export async function saveMeasurementView(dashboard: MeasurementDashboard) {
  const client = getServerSupabaseServiceClient();
  if (!client) throw new Error('Falta el guardado privado.');
  const view: MeasurementDashboard = {
    generatedAt: dashboard.generatedAt, readings: dashboard.readings,
    history: [...dashboard.history], connections: dashboard.connections,
    decisions: dashboard.decisions, storage: dashboard.storage, setup: dashboard.setup,
    demo: dashboard.demo, demoBaselineReal: dashboard.demoBaselineReal,
  };
  let payload = { kind: 'dashboard-view', dashboard: view };
  while (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 60_000 && view.history.length) {
    view.history.pop();
    payload = { kind: 'dashboard-view', dashboard: view };
  }
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 60_000) throw new Error('El resumen supera el tamaño privado permitido.');
  const { error } = await client.from(MEASUREMENT_TABLE).upsert({ entry_key: `${MEASUREMENT_SCOPE}:view`, scope: MEASUREMENT_SCOPE, payload, updated_at: new Date().toISOString() }, { onConflict: 'entry_key' }).abortSignal(AbortSignal.timeout(8_000));
  if (error) throw new Error('No se pudo guardar el resumen del panel.');
}
