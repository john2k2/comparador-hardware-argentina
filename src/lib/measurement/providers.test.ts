import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), operations: vi.fn(), eneba: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: mocked.client }));
vi.mock('@/lib/telemetry/operational-metrics', () => ({ getOperationalMetricsSnapshot: mocked.operations }));
vi.mock('@/lib/eneba/pilot', async (original) => ({ ...await original<typeof import('@/lib/eneba/pilot')>(), readEnebaSnapshot: mocked.eneba }));
vi.mock('./credentials', async (original) => ({ ...await original<typeof import('./credentials')>(), loadConnectionSecrets: async () => ({
  google: process.env.MEASUREMENT_GOOGLE_REFRESH_TOKEN ? { clientId: 'fixture-client', clientSecret: 'fixture-secret', refreshToken: process.env.MEASUREMENT_GOOGLE_REFRESH_TOKEN, scopes: ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/adsense.readonly', 'https://www.googleapis.com/auth/adwords'] } : null,
  cloudflare: process.env.MEASUREMENT_CLOUDFLARE_TOKEN ? { token: process.env.MEASUREMENT_CLOUDFLARE_TOKEN, accountId: process.env.MEASUREMENT_CLOUDFLARE_ACCOUNT_ID, worker: 'comparador-hardware-argentina' } : null,
  database: process.env.MEASUREMENT_SUPABASE_ACCESS_TOKEN ? { token: process.env.MEASUREMENT_SUPABASE_ACCESS_TOKEN, projectId: 'zyiyziubpcpgoqlkcrie' } : null,
  ads: process.env.MEASUREMENT_GOOGLE_ADS_DEVELOPER_TOKEN ? { developerToken: process.env.MEASUREMENT_GOOGLE_ADS_DEVELOPER_TOKEN, customerId: '5796164752' } : null,
}) }));
import { loadConnectionSecrets } from './credentials';
import { createProviderReader, getConnection } from './providers';
const now = new Date('2026-10-05T23:00:00Z');

function authorizeGoogle() {
  vi.stubEnv('MEASUREMENT_GOOGLE_CLIENT_ID', 'fixture-client');
  vi.stubEnv('MEASUREMENT_GOOGLE_CLIENT_SECRET', 'private-fixture-secret');
  vi.stubEnv('MEASUREMENT_GOOGLE_REFRESH_TOKEN', 'private-fixture-refresh');
}
describe('consultas privadas de las fuentes', () => {
  beforeEach(() => {
    vi.stubEnv('MEASUREMENT_GOOGLE_CLIENT_ID', ''); vi.stubEnv('MEASUREMENT_GOOGLE_CLIENT_SECRET', ''); vi.stubEnv('MEASUREMENT_GOOGLE_REFRESH_TOKEN', '');
    vi.stubEnv('MEASUREMENT_CLOUDFLARE_TOKEN', ''); vi.stubEnv('MEASUREMENT_CLOUDFLARE_ACCOUNT_ID', '');
    const query = { select: vi.fn(), eq: vi.fn(), gt: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { payload: {}, expires_at: '2026-10-06T00:00:00Z' }, error: null }) };
    for (const key of ['select', 'eq', 'gt', 'order', 'limit', 'abortSignal'] as const) query[key].mockReturnValue(query);
    mocked.client.mockReturnValue({ rpc: mocked.rpc, from: () => query }); mocked.rpc.mockReturnValue({ abortSignal: async () => ({ data: null, error: null }) });
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('no confunde la autorización de Codex con una conexión de la página', async () => {
    expect(getConnection('ga4', await loadConnectionSecrets()).state).toBe('needs_setup');
    await expect(createProviderReader(now)('ga4')).rejects.toMatchObject({ kind: 'needs_setup' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('no devuelve cero si una API falla o entrega un informe vacío inválido', async () => {
    authorizeGoogle();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ access_token: 'only-on-server' })).mockResolvedValue(Response.json({}));
    await expect(createProviderReader(now)('ga4')).rejects.toMatchObject({ kind: 'error' });
  });
  it('comparte la renovación de Google y acepta ceros de informes válidos sin filtrar secretos', async () => {
    authorizeGoogle();
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes('/token')) return Response.json({ access_token: 'only-on-server' });
      if (String(url).includes('webmasters')) return Response.json({ responseAggregationType: 'byProperty' });
      const body = JSON.parse(String(init?.body));
      return Response.json({ metricHeaders: body.metrics, metadata: { timeZone: 'America/Buenos_Aires' } });
    });
    const reader = createProviderReader(now);
    const readings = await Promise.all([reader('ga4'), reader('search-console')]);
    expect(readings[0].metrics).toMatchObject({ users: 0, outboundClicks: 0 });
    expect(readings[1].metrics).toMatchObject({ clicks: 0, position: null });
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/token'))).toHaveLength(1);
    expect(JSON.stringify(readings)).not.toMatch(/only-on-server|private-fixture/);
  });
  it('mantiene los errores de permisos sin exponer el cuerpo privado de la API', async () => {
    authorizeGoogle();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ access_token: 'private' })).mockResolvedValue(Response.json({ error: 'private secret' }, { status: 403 }));
    await expect(createProviderReader(now)('search-console')).rejects.toThrow('La cuenta rechazó');
  });
  it('usa la autorización de cada cuenta sin sustituir la de Analytics y Search Console', async () => {
    const settings = {
      google: { clientId: 'main-client', clientSecret: 'main-secret', refreshToken: 'main-refresh', scopes: ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly'] },
      adsenseGoogle: { clientId: 'adsense-client', clientSecret: 'adsense-secret', refreshToken: 'adsense-refresh', scopes: ['https://www.googleapis.com/auth/adsense.readonly'] },
      cloudflare: null, database: null, ads: null,
    };
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes('/token')) return Response.json({ access_token: new URLSearchParams(String(init?.body)).get('refresh_token') === 'main-refresh' ? 'main-access' : 'adsense-access' });
      const authorization = new Headers(init?.headers).get('authorization');
      if (String(url).includes('webmasters')) { expect(authorization).toBe('Bearer main-access'); return Response.json({ responseAggregationType: 'byProperty' }); }
      expect(authorization).toBe('Bearer adsense-access');
      if (String(url).includes('/sites')) return Response.json({ sites: [{ domain: 'comparador-hardware.com.ar', state: 'GETTING_READY' }] });
      return Response.json({ startDate: { year: 2026, month: 9, day: 28 }, endDate: { year: 2026, month: 10, day: 4 }, headers: [{ name: 'ESTIMATED_EARNINGS', currencyCode: 'ARS' }], totals: { cells: [{ value: '12.50' }] } });
    });
    const reader = createProviderReader(now, settings);
    const readings = await Promise.all([reader('search-console'), reader('adsense')]);
    expect(readings[1].metrics.earningsARS).toBe(12.5);
    expect(settings.google.refreshToken).toBe('main-refresh');
    expect(getConnection('ga4', settings).state).toBe('ready');
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/token'))).toHaveLength(2);
    expect(JSON.stringify(readings)).not.toMatch(/main-access|adsense-access|main-refresh|adsense-refresh/);
  });
  it('lee observaciones reales de componentes, sin sumar mantenimiento ni disparar refresh', async () => {
    mocked.rpc.mockReturnValue({ abortSignal: async () => ({ data: [
      { reason: 'components', store_id: 'a', total: 100, observed_24h: 10, observed_3h: 3, never_attempted: 5 },
      { reason: 'maintenance', store_id: 'a', total: 900, observed_24h: 800 },
    ], error: null }) });
    const result = await createProviderReader(now)('catalog');
    expect(result.metrics).toMatchObject({ total: 100, observed24h: 10 });
    expect(mocked.rpc).toHaveBeenCalledWith('catalog_refresh_coverage');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('un error de Supabase no convierte las observaciones en cero', async () => {
    mocked.rpc.mockReturnValue({ abortSignal: async () => ({ data: null, error: { message: 'private diagnostic' } }) });
    await expect(createProviderReader(now)('catalog')).rejects.toThrow('No se pudo leer');
  });
  it('lee el feed guardado sin habilitar el piloto ni llamar a Eneba', async () => {
    vi.stubEnv('ENEBA_AFFILIATE_PILOT_ENABLED', '0');
    mocked.eneba.mockReturnValue({ status: 'empty', offers: [], fetchedAt: now.toISOString() });
    expect((await createProviderReader(now)('eneba')).metrics.offers).toBe(0);
    expect(process.env.ENEBA_AFFILIATE_PILOT_ENABLED).toBe('0');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('consulta logs agregados del proyecto con un rango de 24 horas sin devolver registros privados', async () => {
    vi.stubEnv('MEASUREMENT_SUPABASE_ACCESS_TOKEN', 'private-log-token');
    vi.mocked(fetch).mockResolvedValue(Response.json({ result: [{ http500: 3, canceledQueries: 5 }] }));
    const result = await createProviderReader(now)('database');
    expect(result.metrics).toEqual({ http500: 3, canceledQueries: 5 });
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.pathname).toContain('/zyiyziubpcpgoqlkcrie/analytics/endpoints/logs');
    expect(url.searchParams.get('iso_timestamp_start')).toBe('2026-10-04T00:00:00Z');
    expect(url.searchParams.get('iso_timestamp_end')).toBe('2026-10-05T00:00:00Z');
    expect(JSON.stringify(result)).not.toContain('private-log-token');
  });
  it('no registra ingresos si AdSense devuelve otra moneda o no confirma el dominio', async () => {
    authorizeGoogle();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/token')) return Response.json({ access_token: 'private-access' });
      if (String(url).includes('/sites')) return Response.json({ sites: [{ domain: 'comparador-hardware.com.ar', state: 'GETTING_READY' }] });
      return Response.json({ startDate: { year: 2026, month: 9, day: 28 }, endDate: { year: 2026, month: 10, day: 4 }, headers: [{ name: 'ESTIMATED_EARNINGS', currencyCode: 'USD' }], totals: { cells: [{ value: '99' }] } });
    });
    await expect(createProviderReader(now)('adsense')).rejects.toMatchObject({ kind: 'error' });
  });
  it('AdSense conserva aprobación e ingreso estimado del dominio, con moneda y fechas verificadas', async () => {
    authorizeGoogle();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/token')) return Response.json({ access_token: 'private-access' });
      if (String(url).includes('/sites')) return Response.json({ sites: [{ domain: 'comparador-hardware.com.ar', state: 'GETTING_READY' }] });
      const query = new URL(String(url)).searchParams;
      expect(query.get('filters')).toBe('OWNED_SITE_DOMAIN_NAME==comparador-hardware.com.ar');
      expect(query.get('currencyCode')).toBe('ARS');
      expect(query.get('reportingTimeZone')).toBe('GOOGLE_TIME_ZONE');
      return Response.json({ startDate: { year: 2026, month: 9, day: 28 }, endDate: { year: 2026, month: 10, day: 4 }, headers: [{ name: 'ESTIMATED_EARNINGS', currencyCode: 'ARS' }], totals: { cells: [{ value: '12.50' }] } });
    });
    expect((await createProviderReader(now)('adsense')).metrics).toEqual({ approved: 0, earningsARS: 12.5 });
  });
  it('conserva el estado real de AdSense cuando su informe válido aún no trae importes', async () => {
    authorizeGoogle();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/token')) return Response.json({ access_token: 'private-access' });
      if (String(url).includes('/sites')) return Response.json({ sites: [{ domain: 'comparador-hardware.com.ar', state: 'GETTING_READY' }] });
      return Response.json({ startDate: { year: 2026, month: 9, day: 28 }, endDate: { year: 2026, month: 10, day: 4 }, headers: [{ name: 'ESTIMATED_EARNINGS', type: 'METRIC_CURRENCY', currencyCode: 'ARS' }] });
    });
    const result = await createProviderReader(now)('adsense');
    expect(result.metrics).toEqual({ approved: 0, earningsARS: null });
    expect(result.notes).toContain('Estado del sitio: Google está revisando el sitio.');
    expect(result.notes).toContain('Google todavía no informó un importe de ingresos para este dominio y período.');
  });
  it.each([{ rows: [{ cells: [{ value: '9' }] }] }, { totalMatchedRows: '1' }, { totals: { cells: [] } }])('rechaza un informe incompleto de AdSense sin totales válidos: %j', async (incomplete) => {
    authorizeGoogle();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/token')) return Response.json({ access_token: 'private-access' });
      if (String(url).includes('/sites')) return Response.json({ sites: [{ domain: 'comparador-hardware.com.ar', state: 'READY' }] });
      return Response.json({ startDate: { year: 2026, month: 9, day: 28 }, endDate: { year: 2026, month: 10, day: 4 }, headers: [{ name: 'ESTIMATED_EARNINGS', currencyCode: 'ARS' }], ...incomplete });
    });
    await expect(createProviderReader(now)('adsense')).rejects.toMatchObject({ kind: 'error' });
  });
  it('Ads convierte los micros de la cuenta verificada en ARS y exige informes completos', async () => {
    authorizeGoogle(); vi.stubEnv('MEASUREMENT_GOOGLE_ADS_DEVELOPER_TOKEN', 'private-developer');
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes('/token')) return Response.json({ access_token: 'private-access' });
      const query = JSON.parse(String(init?.body)).query;
      if (query.includes('currency_code')) return Response.json({ results: [{ customer: { id: '5796164752', currencyCode: 'ARS', timeZone: 'America/Buenos_Aires' } }] });
      if (query.includes('FROM campaign')) return Response.json({ fieldMask: 'campaign.id', results: [{ campaign: { id: '123' } }] });
      return Response.json({ fieldMask: 'customer.id,metrics.costMicros', results: [{ customer: { id: '5796164752' }, metrics: { costMicros: '12500000' } }] });
    });
    expect((await createProviderReader(now)('google-ads')).metrics).toEqual({ campaigns: 1, spendARS: 12.5 });
  });
  it('no registra gasto de Google Ads si la cuenta no está en ARS', async () => {
    authorizeGoogle(); vi.stubEnv('MEASUREMENT_GOOGLE_ADS_DEVELOPER_TOKEN', 'private-developer');
    vi.mocked(fetch).mockImplementation(async (url) => String(url).includes('/token') ? Response.json({ access_token: 'private-access' }) : Response.json({ results: [{ customer: { id: '5796164752', currencyCode: 'USD', timeZone: 'America/Buenos_Aires' } }] }));
    await expect(createProviderReader(now)('google-ads')).rejects.toThrow('pesos argentinos');
  });
  it('calcula la proporción de fallas con el denominador del Worker, no el de visitantes', async () => {
    vi.stubEnv('MEASUREMENT_CLOUDFLARE_TOKEN', 'private-cf'); vi.stubEnv('MEASUREMENT_CLOUDFLARE_ACCOUNT_ID', 'a'.repeat(32));
    vi.mocked(fetch).mockResolvedValue(Response.json({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [
      { dimensions: { status: 'success' }, sum: { requests: 90, errors: 0 } },
      { dimensions: { status: 'exceededResources' }, sum: { requests: 10, errors: 10 } },
    ] }] } } }));
    const result = await createProviderReader(now)('cloudflare');
    expect(result.metrics).toEqual({ requests: 100, errors: 10, resourceErrors: 10 });
    expect(JSON.stringify(result)).not.toContain('private-cf');
  });
});
