import { isRecord, parseManualReading } from './validation';
import type { MeasurementReading } from './types';

export function decodeStoredReading(value: unknown): MeasurementReading | null {
  if (!isRecord(value) || value.version !== 1 || !['api', 'audit', 'manual'].includes(String(value.origin))) return null;
  try {
    const parsed = parseManualReading({ provider: value.provider, collectedAt: value.collectedAt, period: value.period, metrics: value.metrics });
    const result: MeasurementReading = { ...parsed, origin: value.origin as MeasurementReading['origin'], notes: [] };
    if (Array.isArray(value.notes)) result.notes = value.notes.filter((note): note is string => typeof note === 'string' && note.length <= 500).slice(0, 8);
    if (Array.isArray(value.daily)) result.daily = value.daily.filter((row) => isRecord(row) && typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date >= result.period.start && row.date <= result.period.end && typeof row.value === 'number' && Number.isFinite(row.value) && row.value >= 0).slice(0, 31) as MeasurementReading['daily'];
    if (Array.isArray(value.breakdown)) result.breakdown = value.breakdown.filter((row) => isRecord(row) && typeof row.label === 'string' && row.label.length <= 100 && typeof row.value === 'number' && Number.isFinite(row.value) && row.value >= 0).slice(0, 12).map((row) => ({ label: row.label as string, value: row.value as number }));
    return result;
  } catch { return null; }
}
