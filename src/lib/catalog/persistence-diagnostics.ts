import { stores } from '@/lib/scrapers/static-data';

type Outcome = 'confirmed' | 'returnedFalse' | 'ackUnconfirmed' | 'invalidResponse';
type Counts = Record<Outcome, number> & { errorCodes: Record<string, number> };
export type PersistenceDiagnostic = { version: 1; logicalObservations: number; global: Counts; byStore: Record<string, Counts> };
export type PersistenceObservation = { last: Outcome | null; hadUncertainty: boolean; hadError: boolean; codes: Set<string>; recorded: boolean };

const storeIds = new Set(stores.map(store => store.id));
// Vocabulario fijo: un código desconocido no introduce claves arbitrarias.
const safeCodes = new Set(['57014', '55P03', '40001', '40P01', '23505', '23503', '23514',
  '22003', '22023', '42501', '42883', '42P01', 'PGRST202', 'PGRST204', 'PGRST301', 'PGRST302']);
const emptyCounts = (): Counts => ({ confirmed: 0, returnedFalse: 0, ackUnconfirmed: 0, invalidResponse: 0, errorCodes: {} });

export function createPersistenceDiagnostic(): PersistenceDiagnostic {
  return { version: 1, logicalObservations: 0, global: emptyCounts(), byStore: {} };
}

export function createPersistenceObservation(): PersistenceObservation {
  return { last: null, hadUncertainty: false, hadError: false, codes: new Set(), recorded: false };
}

export function observePersistenceError(observation: PersistenceObservation, error: unknown): void {
  observation.last = 'ackUnconfirmed';
  observation.hadUncertainty = observation.hadError = true;
  let code = 'unknown';
  try {
    const candidate = error && typeof error === 'object' ? (error as { code?: unknown }).code : null;
    if (typeof candidate === 'string' && safeCodes.has(candidate)) code = candidate;
  } catch { /* Un getter no puede filtrar contenido privado al diagnóstico. */ }
  observation.codes.add(code);
}

export function observePersistenceResponse(observation: PersistenceObservation, response: unknown): void {
  try {
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      const { data, error } = response as { data?: unknown; error?: unknown };
      if (error) { observePersistenceError(observation, error); return; }
      if (data === true) { observation.last = 'confirmed'; return; }
      if (data === false) { observation.last = 'returnedFalse'; return; }
    }
  } catch { /* Un ACK ilegible conserva incertidumbre; no se copia el payload. */ }
  observation.last = 'invalidResponse';
  observation.hadUncertainty = true;
}

export function recordPersistenceDiagnostic(diagnostic: PersistenceDiagnostic, storeId: string, observation: PersistenceObservation): void {
  if (observation.recorded || observation.last === null) return;
  observation.recorded = true;
  const outcome: Outcome = observation.last === 'confirmed' ? 'confirmed'
    : observation.last === 'returnedFalse' && !observation.hadUncertainty ? 'returnedFalse'
      : observation.last === 'invalidResponse' && !observation.hadError ? 'invalidResponse' : 'ackUnconfirmed';
  const key = storeIds.has(storeId) ? storeId : 'unknown-store';
  const store = diagnostic.byStore[key] ??= emptyCounts();
  diagnostic.logicalObservations++;
  for (const counts of [diagnostic.global, store]) {
    counts[outcome]++;
    // Cada código cuenta como máximo una vez por observación lógica.
    for (const code of observation.codes) counts.errorCodes[code] = (counts.errorCodes[code] ?? 0) + 1;
  }
}

/** Los resúmenes progresivos no comparten referencias mutables con el final. */
export function snapshotPersistenceDiagnostic(diagnostic: PersistenceDiagnostic): PersistenceDiagnostic {
  const clone = (counts: Counts): Counts => ({ ...counts, errorCodes: { ...counts.errorCodes } });
  return { version: 1, logicalObservations: diagnostic.logicalObservations, global: clone(diagnostic.global),
    byStore: Object.fromEntries(Object.entries(diagnostic.byStore).map(([key, counts]) => [key, clone(counts)])) };
}
