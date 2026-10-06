import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeasurementReading } from './types';
import fixtureBaseline from '../../../e2e/fixtures/measurement-audit.json';
const mocked = vi.hoisted(() => ({ saved: vi.fn(), save: vi.fn(), reader: vi.fn(), configuration: vi.fn(), collect: vi.fn() }));
vi.mock('./collection', async (original) => ({ ...await original<typeof import('./collection')>(), requestMeasurementCollection: mocked.collect }));
vi.mock('server-only', () => ({}));
vi.mock('./store', async (original) => ({ ...await original<typeof import('./store')>(), readSavedMeasurements: mocked.saved, saveMeasurements: mocked.save }));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: () => null }));
vi.mock('./credentials', () => ({ loadConnectionSecrets: async () => ({ google: null, cloudflare: null, database: null, ads: null }) }));
vi.mock('./providers', () => ({
  getConnection: mocked.configuration, createProviderReader: () => mocked.reader,
  ProviderReadError: class extends Error { constructor(public kind: string, message: string) { super(message); } },
}));
import { executeMeasurementCommand, getMeasurementDashboard } from './service';
import { ProviderReadError } from './providers';

describe('historial y decisiones del panel', () => {
  beforeEach(() => {
    vi.stubEnv('MEASUREMENT_AUDIT_BASELINE_JSON', JSON.stringify(fixtureBaseline));
    mocked.saved.mockResolvedValue({ readings: [], decisions: [], connections: [], available: true, issue: null });
    mocked.configuration.mockImplementation((id: string) => ({ id, state: 'ready', issue: null, checkedAt: null }));
    mocked.save.mockReset().mockResolvedValue(undefined); mocked.reader.mockReset();
    vi.stubEnv('MEASUREMENT_COLLECTION_MODE', 'inline'); mocked.collect.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  it('una visita muestra el corte de auditoría sin consultar cuentas ni escribir', async () => {
    const data = await getMeasurementDashboard();
    expect(data.readings).toHaveLength(5);
    expect(data.readings.find((reading) => reading.provider === 'ga4')).toMatchObject({ origin: 'audit', collectedAt: '2026-10-05T00:00:00.000Z', metrics: { users: 12, outboundClicks: null } });
    expect(mocked.save).not.toHaveBeenCalled(); expect(mocked.reader).not.toHaveBeenCalled();
  });
  it('una consulta fallida conserva cifras, período y fecha previos', async () => {
    mocked.reader.mockRejectedValue(new ProviderReadError('error', 'La consulta falló.'));
    const old = (await getMeasurementDashboard()).readings.find((reading) => reading.provider === 'cloudflare');
    const result = await executeMeasurementCommand({ action: 'sync', provider: 'cloudflare' });
    expect(result.dashboard.readings.find((reading) => reading.provider === 'cloudflare')).toEqual(old);
    expect(mocked.save).toHaveBeenCalledWith([], [expect.objectContaining({ id: 'cloudflare', state: 'error' })]);
    expect(result.message).toContain('se conserva el dato anterior');
  });
  it('no afirma guardado cuando la persistencia devuelve error', async () => {
    mocked.reader.mockRejectedValue(new ProviderReadError('error', 'Error de cuenta'));
    mocked.save.mockRejectedValue(new Error('No se guardó'));
    await expect(executeMeasurementCommand({ action: 'sync', provider: 'cloudflare' })).rejects.toThrow('No se guardó');
  });
  it('marcar una decisión no reescribe métricas ni repara el catálogo', async () => {
    await executeMeasurementCommand({ action: 'decision', id: 'catalog', status: 'done' });
    expect(mocked.save).toHaveBeenCalledWith([], [], [expect.objectContaining({ id: 'catalog', status: 'done' })]);
    expect(mocked.reader).not.toHaveBeenCalled();
  });
  it('en el servidor público sólo solicita la tarea externa y lee resultados guardados', async () => {
    vi.stubEnv('MEASUREMENT_COLLECTION_MODE', 'external');
    mocked.collect.mockResolvedValue('Consulta solicitada.');
    const result = await executeMeasurementCommand({ action: 'sync', provider: 'all' });
    expect(mocked.collect).toHaveBeenCalledWith('all');
    expect(mocked.reader).not.toHaveBeenCalled(); expect(mocked.save).not.toHaveBeenCalled();
    expect(result.message).toBe('Consulta solicitada.'); expect(result.dashboard.setup.externalCollector).toBe(true);
  });
  it('una lectura posterior reemplaza el resumen, conservando el punto de partida en el historial', async () => {
    const reading: MeasurementReading = { version: 1, provider: 'ga4', origin: 'api', collectedAt: '2026-10-06T12:00:00Z', period: { start: '2026-09-29', end: '2026-10-05', timeZone: 'America/Buenos_Aires' }, metrics: { users: 50 }, notes: [] };
    mocked.saved.mockResolvedValue({ readings: [reading], decisions: [], connections: [], available: true, issue: null });
    const result = await getMeasurementDashboard();
    expect(result.readings.find((item) => item.provider === 'ga4')).toEqual(reading);
    expect(result.history.filter((item) => item.provider === 'ga4')).toHaveLength(2);
  });
});
