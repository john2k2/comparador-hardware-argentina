import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type MeasurementDashboard, type MeasurementReading } from './types';
const db = vi.hoisted(() => ({ client: vi.fn(), from: vi.fn(), query: { select: vi.fn(), eq: vi.fn(), gt: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), upsert: vi.fn() } }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: db.client }));
import { decodeStoredReading, MEASUREMENT_TABLE, MEASUREMENT_SCOPE, readSavedMeasurements, saveMeasurements, saveMeasurementView } from './store';
const reading: MeasurementReading = { version: 1, provider: 'cloudflare', origin: 'api', collectedAt: '2026-10-05T01:00:00Z', period: { start: '2026-10-04', end: '2026-10-04', timeZone: 'UTC' }, metrics: { requests: 100, resourceErrors: 2 }, notes: [] };

describe('guardado privado separado de telemetría y feeds', () => {
  beforeEach(() => {
    vi.clearAllMocks(); db.client.mockReturnValue({ from: db.from }); db.from.mockReturnValue(db.query);
    for (const key of ['select', 'eq', 'gt', 'order', 'limit', 'upsert'] as const) db.query[key].mockReturnValue(db.query);
    db.query.abortSignal.mockResolvedValue({ data: [], error: null });
  });
  it('guarda un corte y una última lectura independiente del límite de historial', async () => {
    await saveMeasurements([reading]);
    const entries = db.query.upsert.mock.calls[0][0];
    expect(db.from).toHaveBeenCalledWith(MEASUREMENT_TABLE);
    expect(entries).toHaveLength(2);
    expect(entries.map((row: { scope: string }) => row.scope)).toEqual([`${MEASUREMENT_SCOPE}:history`, MEASUREMENT_SCOPE]);
    expect(entries.every((row: { entry_key: string }) => row.entry_key.startsWith(MEASUREMENT_SCOPE))).toBe(true);
    expect(db.query.upsert.mock.calls[0][1]).toEqual({ onConflict: 'entry_key' });
  });
  it('no escribe al leer, limita las consultas y no duplica el último corte', async () => {
    db.query.abortSignal.mockResolvedValue({ data: [{ payload: { kind: 'reading', reading } }], error: null });
    const saved = await readSavedMeasurements();
    expect(saved.readings).toHaveLength(1); expect(saved.available).toBe(true);
    expect(db.query.eq).toHaveBeenCalledWith('scope', MEASUREMENT_SCOPE);
    expect(db.query.eq).toHaveBeenCalledWith('scope', `${MEASUREMENT_SCOPE}:history`);
    expect(db.query.limit).toHaveBeenCalledWith(300);
    expect(db.query.upsert).not.toHaveBeenCalled();
  });
  it('expone una falla del guardado y no ignora errores de Supabase', async () => {
    db.query.abortSignal.mockResolvedValue({ data: null, error: { message: 'private db diagnostic' } });
    await expect(saveMeasurements([reading])).rejects.toThrow('no se pudieron guardar');
    expect(await readSavedMeasurements()).toMatchObject({ available: false, readings: [] });
  });
  it('no devuelve campos ajenos ni acepta métricas que esconden claves', () => {
    expect(decodeStoredReading({ ...reading, privateCredential: 'never-return' })).not.toHaveProperty('privateCredential');
    expect(decodeStoredReading({ ...reading, metrics: { token: 'private' } })).toBeNull();
  });
  it('acota el resumen por bytes sin perder las últimas lecturas ni mutar el historial', async () => {
    const history = Array.from({ length: 80 }, () => ({ ...reading, notes: ['á'.repeat(1800)] }));
    const dashboard: MeasurementDashboard = { generatedAt: '2026-10-06T00:00:00Z', readings: [reading], history, connections: [], decisions: [], storage: { available: true, issue: null }, setup: { encryption: true, google: false }, demo: false, demoBaselineReal: false };
    await saveMeasurementView(Object.assign(dashboard, { privateCredential: 'never-save' }));
    const saved = db.query.upsert.mock.calls[0][0];
    expect(saved.entry_key).toBe(`${MEASUREMENT_SCOPE}:view`);
    expect(Buffer.byteLength(JSON.stringify(saved.payload), 'utf8')).toBeLessThanOrEqual(60_000);
    expect(saved.payload.dashboard.readings).toEqual([reading]); expect(history).toHaveLength(80);
    expect(saved.payload.dashboard.history.length).toBeLessThan(80);
    expect(JSON.stringify(saved.payload)).not.toContain('never-save');
  });
});
