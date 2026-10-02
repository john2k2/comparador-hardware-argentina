import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ENEBA_REVIEWED_GAMES, type EnebaSnapshot } from './pilot';
const source = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('./fetch', () => ({ fetchEnebaSnapshot: source }));
import { persistEnebaSnapshot, refreshEnebaPilot } from './producer';
const now = new Date('2026-10-02T18:00:00.000Z');
const game = ENEBA_REVIEWED_GAMES[0];
const snapshot: EnebaSnapshot = { status: 'ready', fetchedAt: now.toISOString(), feedUpdatedAt: '2026-10-02T17:55:00.000Z',
  offers: [{ ...game, price: 1000.5, currency: 'ARS', observedAt: '2026-10-02T17:55:00.000Z',
    url: `https://www.eneba.com/latam/${game.id}?af_id=Comparador_Hardware_Argentina&currency=ARS` }] };
function database() {
  const read = vi.fn().mockResolvedValue({ data: { payload: snapshot, expires_at: '2026-10-02T23:55:00Z' }, error: null });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn().mockReturnValue({ single: read });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ upsert, select });
  return { client: { from } as unknown as SupabaseClient, from, upsert, select, eq, read };
}
describe('productor privado del piloto Eneba', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); source.mockReset().mockResolvedValue(snapshot); });
  afterEach(() => { vi.useRealTimers(); });
  it('guarda sólo la muestra y comprueba su persistencia; vence seis horas desde el origen', async () => {
    const db = database(); const result = await refreshEnebaPilot(db.client);
    expect(source).toHaveBeenCalledTimes(1); expect(db.from.mock.calls.every(([table]) => table === 'api_cache_entries')).toBe(true);
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ scope: 'eneba-affiliate-pilot', payload: snapshot,
      expires_at: '2026-10-02T23:55:00.000Z', updated_at: now.toISOString() }), { onConflict: 'cache_key' });
    expect(db.eq).toHaveBeenCalledWith('cache_key', db.upsert.mock.calls[0][0].cache_key);
    expect(result).toMatchObject({ status: 'ready', offers: 1, expiresAt: '2026-10-02T23:55:00.000Z' });
  });
  it('preserva la muestra anterior cuando no puede leer el origen', async () => {
    const db = database(); source.mockResolvedValue({ status: 'error', offers: [], fetchedAt: now.toISOString(), feedUpdatedAt: null });
    await expect(refreshEnebaPilot(db.client)).rejects.toThrow('ENEBA_FEED_UNVERIFIED_PREVIOUS_SNAPSHOT_PRESERVED');
    expect(db.from).not.toHaveBeenCalled();
  });
  it.each([
    ['fecha de descarga ausente', { ...snapshot, fetchedAt: null }],
    ['fecha de descarga futura', { ...snapshot, fetchedAt: '2026-10-02T18:01:00Z' }],
    ['precio vencido', { ...snapshot, feedUpdatedAt: '2026-10-02T10:00:00Z', offers: [{ ...snapshot.offers[0], observedAt: '2026-10-02T10:00:00Z' }] }],
    ['identidad contradictoria', { ...snapshot, offers: [{ ...snapshot.offers[0], sku: 'OTHER' }] }],
    ['destino no permitido', { ...snapshot, offers: [{ ...snapshot.offers[0], url: 'https://example.com/' }] }],
  ])('no escribe ante %s', async (_, input) => {
    const db = database(); await expect(persistEnebaSnapshot(db.client, input as EnebaSnapshot)).rejects.toThrow();
    expect(db.from).not.toHaveBeenCalled();
  });
  it('no declara persistencia si la escritura falla', async () => {
    const db = database(); db.upsert.mockResolvedValue({ error: { message: 'private' } });
    await expect(refreshEnebaPilot(db.client)).rejects.toThrow('ENEBA_SNAPSHOT_PERSIST_FAILED');
    expect(db.read).not.toHaveBeenCalled();
  });
  it('no declara persistencia si la lectura posterior difiere', async () => {
    const db = database(); db.read.mockResolvedValue({ data: { payload: snapshot, expires_at: '2026-10-03T18:00:00Z' }, error: null });
    await expect(refreshEnebaPilot(db.client)).rejects.toThrow('ENEBA_SNAPSHOT_READBACK_FAILED');
  });
});
