import { DECISION_IDS, PROVIDER_IDS, type DecisionId, type MeasurementCommand, type MeasurementReading, type ProviderId } from './types';
import { METRIC_KEYS } from './definitions';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}
function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** Importación acotada: sólo cifras y fechas conocidas; nunca credenciales ni URLs. */
export function parseManualReading(value: unknown, now = new Date()): MeasurementReading {
  if (!isRecord(value) || !exactKeys(value, ['provider', 'collectedAt', 'period', 'metrics'])) throw new Error('Usá el formato de lectura indicado; no incluyas claves ni otros campos.');
  if (!isProvider(value.provider) || !isRecord(value.period) || !isRecord(value.metrics)) throw new Error('La conexión, el período y las métricas son obligatorios.');
  const { start, end, timeZone } = value.period;
  if (!exactKeys(value.period, ['start', 'end', 'timeZone']) || !isDate(start) || !isDate(end) || start > end || end > now.toISOString().slice(0, 10) || Date.parse(end) - Date.parse(start) > 366 * 86400000) throw new Error('Indicá un período válido, de hasta un año y sin fechas futuras.');
  if (typeof timeZone !== 'string' || timeZone.length > 80 || !/^[A-Za-z_/-]+$/.test(timeZone)) throw new Error('Elegí una zona horaria admitida.');
  try { new Intl.DateTimeFormat('en', { timeZone }); } catch { throw new Error('Elegí una zona horaria admitida.'); }
  const at = typeof value.collectedAt === 'string' ? Date.parse(value.collectedAt) : NaN;
  if (!Number.isFinite(at) || at > now.getTime() + 60_000 || at < Date.parse(`${end}T00:00:00Z`)) throw new Error('La fecha de lectura debe ser posterior al período y no puede estar en el futuro.');
  if (!Object.keys(value.metrics).length || !exactKeys(value.metrics, [...METRIC_KEYS[value.provider]])) throw new Error('Hay métricas desconocidas o falta la lectura.');
  const metrics: Record<string, number | null> = {};
  for (const [key, number] of Object.entries(value.metrics)) {
    if (number !== null && (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1e12)) throw new Error('Las cifras deben ser números positivos, cero o null si no se conocen.');
    if ((key === 'ctr' && typeof number === 'number' && number > 100) || (key === 'approved' && number !== null && number !== 0 && number !== 1)) throw new Error('El porcentaje o el estado de aprobación no es válido.');
    metrics[key] = number as number | null;
  }
  if (typeof metrics.observed24h === 'number' && typeof metrics.total === 'number' && metrics.observed24h > metrics.total) throw new Error('Las observaciones no pueden superar el total de ofertas.');
  return { version: 1, provider: value.provider, origin: 'manual', collectedAt: new Date(at).toISOString(), period: { start, end, timeZone }, metrics, notes: ['Lectura cargada por el administrador. Contrastarla con el informe original de la cuenta.'] };
}

export function parseCommand(value: unknown): MeasurementCommand {
  if (!isRecord(value)) throw new Error('La solicitud no es válida.');
  if (value.action === 'sync' && exactKeys(value, ['action', 'provider']) && (value.provider === 'all' || isProvider(value.provider))) return { action: 'sync', provider: value.provider };
  if (value.action === 'decision' && exactKeys(value, ['action', 'id', 'status']) && typeof value.id === 'string' && (DECISION_IDS as readonly string[]).includes(value.id) && ['pending', 'in_progress', 'done'].includes(String(value.status))) return { action: 'decision', id: value.id as DecisionId, status: value.status as 'pending' | 'in_progress' | 'done' };
  throw new Error('Elegí una acción y una conexión válidas.');
}

export function dateInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function readingPeriod(provider: ProviderId, now = new Date()) {
  const timeZone = provider === 'ga4' ? 'America/Buenos_Aires' : provider === 'search-console' || provider === 'adsense' ? 'America/Los_Angeles' : 'UTC';
  const today = dateInZone(now, timeZone);
  const end = shiftDate(today, provider === 'search-console' ? -3 : -1);
  return { start: shiftDate(end, provider === 'ga4' || provider === 'adsense' ? -6 : provider === 'search-console' ? -27 : 0), end, timeZone };
}
