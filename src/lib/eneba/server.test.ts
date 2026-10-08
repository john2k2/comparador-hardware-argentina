import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENEBA_REVIEWED_GAMES, ENEBA_PRICE_MAX_AGE_MS, type EnebaSnapshot } from './pilot';

const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), read: vi.fn(), client: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: db.client }));
const now = new Date('2026-10-09T18:00:00.000Z');
const modified = new Date('2026-10-09T17:55:00.000Z');
const game = ENEBA_REVIEWED_GAMES[0];
const snapshot: EnebaSnapshot = { status: 'ready', fetchedAt: now.toISOString(), feedUpdatedAt: modified.toISOString(),
  offers: [{ ...game, price: 1000.5, currency: 'ARS', observedAt: modified.toISOString(),
    url: `https://www.eneba.com/latam/${game.id}?af_id=Comparador_Hardware_Argentina&currency=ARS` }] };
function row(payload: unknown = snapshot) {
  return { data: { payload, expires_at: new Date(modified.getTime() + ENEBA_PRICE_MAX_AGE_MS).toISOString() }, error: null };
}

describe('lector público de la muestra Eneba', () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
    vi.stubEnv('ENEBA_AFFILIATE_PILOT_ENABLED', '1'); vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('E2E_STABLE_MODE', ''); vi.stubEnv('CI_E2E', '');
    db.client.mockReset().mockReturnValue({ from: db.from });
    db.from.mockReset().mockReturnValue({ select: db.select });
    db.select.mockReset().mockReturnValue({ eq: db.eq });
    db.eq.mockReset().mockReturnValue({ maybeSingle: db.read });
    db.read.mockReset().mockResolvedValue(row());
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('desactivado responde 404 sin leer la base ni Eneba', async () => {
    vi.stubEnv('ENEBA_AFFILIATE_PILOT_ENABLED', '0');
    const { handleEnebaGamesGet } = await import('./server');
    const result = await handleEnebaGamesGet();
    expect(result.status).toBe(404); expect((await result.json()).status).toBe('disabled');
    expect(db.client).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('el servidor estable devuelve datos sintéticos sin acceso a la caché privada o la tienda', async () => {
    vi.stubEnv('E2E_STABLE_MODE', '1');
    const { handleEnebaGamesGet } = await import('./server');
    const result = await handleEnebaGamesGet();
    const data = await result.json();
    expect(result.headers.get('x-qa-fixture')).toBe('eneba-synthetic');
    expect(data.status).toBe('ready'); expect(data.offers).toHaveLength(ENEBA_REVIEWED_GAMES.length);
    expect(data.offers[0]).toMatchObject({ price: 1000, reviewedAt: game.reviewedAt });
    expect(db.client).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('el fixture no renueva precios ni la revisión editorial cuando vencen', async () => {
    vi.stubEnv('CI_E2E', '1');
    const { getEnebaSnapshot } = await import('./server');
    const first = await getEnebaSnapshot();
    vi.advanceTimersByTime(ENEBA_PRICE_MAX_AGE_MS);
    expect(await getEnebaSnapshot()).toMatchObject({ status: 'empty', offers: [], feedUpdatedAt: first.feedUpdatedAt });
    expect(db.client).not.toHaveBeenCalled();
  });

  it('agrupa visitas concurrentes, conserva las fechas y sólo lee la fila privada del piloto', async () => {
    const { getEnebaSnapshot } = await import('./server');
    const snapshots = await Promise.all(Array.from({ length: 4 }, () => getEnebaSnapshot()));
    expect(snapshots[0]).toEqual(snapshot); expect(db.read).toHaveBeenCalledTimes(1);
    expect(db.from).toHaveBeenCalledWith('api_cache_entries');
    expect(db.eq).toHaveBeenCalledWith('cache_key', expect.stringContaining('eneba-affiliate-pilot:'));
    await getEnebaSnapshot(); expect(db.read).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  });

  it('consulta otra muestra al minuto sin prolongar la fecha del precio', async () => {
    const { getEnebaSnapshot } = await import('./server');
    await getEnebaSnapshot();
    const next = { ...snapshot, offers: [{ ...snapshot.offers[0], price: 1200 }] };
    db.read.mockResolvedValue(row(next)); vi.setSystemTime(new Date(now.getTime() + 60_000));
    expect(await getEnebaSnapshot()).toEqual(next); expect(db.read).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('revalida la edad dentro del minuto aunque una fila declare una expiración más larga', async () => {
    vi.setSystemTime(new Date(modified.getTime() + ENEBA_PRICE_MAX_AGE_MS - 10_000));
    db.read.mockResolvedValue({ data: { payload: snapshot, expires_at: '2026-10-10T00:00:00Z' }, error: null });
    const { handleEnebaGamesGet } = await import('./server');
    expect((await (await handleEnebaGamesGet()).json()).offers).toHaveLength(1);
    vi.advanceTimersByTime(10_000);
    const result = await handleEnebaGamesGet();
    expect(await result.json()).toMatchObject({ status: 'empty', offers: [], feedUpdatedAt: modified.toISOString() });
    expect(result.headers.get('cache-control')).toBe('no-store'); expect(db.read).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['fila ausente', { data: null, error: null }],
    ['error de lectura', { data: null, error: { message: 'private diagnostic' } }],
    ['contrato inválido', row({ status: 'ready', offers: 'invalid' })],
    ['fila vencida', { data: { payload: snapshot, expires_at: now.toISOString() }, error: null }],
  ])('ante %s conserva el modo sólo lectura y no consulta la tienda', async (_, data) => {
    db.read.mockResolvedValue(data); const { getEnebaSnapshot } = await import('./server');
    expect(await getEnebaSnapshot()).toMatchObject({ status: 'error', offers: [], feedUpdatedAt: null });
    await getEnebaSnapshot(); expect(db.read).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  });
});
