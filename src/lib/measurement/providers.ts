import 'server-only';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { buildSnapshotFromState } from '@/lib/metrics/calculator';
import { ENDPOINT_SCOPE, STORE_SCOPE, ENDPOINT_EVENT_LIMIT, STORE_EVENT_LIMIT } from '@/lib/metrics/constants';
import { normalizeEndpointEvent, normalizeStoreEvent } from '@/lib/metrics/utils';
import { readEnebaSnapshot } from '@/lib/eneba/pilot';
import { ENEBA_CACHE_KEY, ENEBA_CACHE_SCOPE } from '@/lib/eneba/snapshot-cache';
import { GOOGLE_SCOPES, googleAuthorizationFor, loadConnectionSecrets, type ConnectionSecrets, type GoogleAuthorization } from './credentials';
import { dateInZone, isRecord, readingPeriod, shiftDate } from './validation';
import type { MeasurementReading, ProviderConnection, ProviderId } from './types';

export class ProviderReadError extends Error {
  constructor(public readonly kind: 'needs_setup' | 'error', message: string) { super(message); }
}
const secret = (name: string) => process.env[name]?.trim();
export function getConnection(id: ProviderId, settings: ConnectionSecrets): ProviderConnection {
  let state: ProviderConnection['state'] = 'ready';
  if (id in GOOGLE_SCOPES && !googleAuthorizationFor(id, settings)?.scopes.includes(GOOGLE_SCOPES[id as keyof typeof GOOGLE_SCOPES])) state = 'needs_setup';
  else if (id === 'cloudflare' && !settings.cloudflare) state = 'needs_setup';
  else if (id === 'database' && !settings.database) state = 'needs_setup';
  else if (id === 'google-ads' && !settings.ads) state = 'needs_setup';
  else if (['catalog', 'operations', 'eneba'].includes(id) && !getServerSupabaseServiceClient()) state = 'needs_setup';
  return { id, state, checkedAt: null, issue: null };
}

async function readJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new ProviderReadError('error', 'La cuenta rechazó la lectura. Revisar autorización y permisos.');
    if (response.status === 429) throw new ProviderReadError('error', 'La cuenta limitó las consultas. Esperá unos minutos antes de volver a intentar.');
    throw new ProviderReadError('error', 'El servicio no pudo entregar la lectura. Se conserva el dato anterior con su fecha.');
  }
  const length = Number(response.headers.get('content-length'));
  if (length > 512_000) throw new ProviderReadError('error', 'El informe excedió el tamaño permitido.');
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderReadError('error', 'La cuenta devolvió una respuesta vacía.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 512_000) { await reader.cancel(); throw new ProviderReadError('error', 'El informe excedió el tamaño permitido.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(data)) throw new ProviderReadError('error', 'La cuenta devolvió un informe con formato inesperado.');
  return data;
}

function number(value: unknown): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') throw new Error('Invalid metric');
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1e12) throw new Error('Invalid metric');
  return parsed;
}
function rows(data: Record<string, unknown>, key = 'rows'): Record<string, unknown>[] {
  if (data[key] === undefined) return [];
  if (!Array.isArray(data[key]) || data[key].some((row: unknown) => !isRecord(row))) throw new Error('Invalid rows');
  return data[key] as Record<string, unknown>[];
}
function gaValues(row: Record<string, unknown>, key: 'metricValues' | 'dimensionValues'): string[] {
  if (!Array.isArray(row[key])) throw new Error('Invalid GA values');
  return row[key].map((value: unknown) => {
    if (!isRecord(value) || typeof value.value !== 'string') throw new Error('Invalid GA value');
    return value.value;
  });
}
function validateGaReport(data: Record<string, unknown>, names: string[]) {
  const headers = rows(data, 'metricHeaders');
  if (headers.length !== names.length || headers.some((header, index) => header.name !== names[index])) throw new Error('Invalid GA report');
}
function reading(id: ProviderId, metrics: MeasurementReading['metrics'], now: Date, notes: string[] = []): MeasurementReading {
  return { version: 1, provider: id, origin: 'api', collectedAt: now.toISOString(), period: readingPeriod(id, now), metrics, notes };
}

async function googleAccessToken(authorization: GoogleAuthorization): Promise<string> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: authorization.clientId, client_secret: authorization.clientSecret, refresh_token: authorization.refreshToken });
  const result = await readJson('https://oauth2.googleapis.com/token', { method: 'POST', body });
  if (typeof result.access_token !== 'string' || !result.access_token) throw new Error('Invalid authorization');
  return result.access_token;
}

async function readGa4(now: Date, token: () => Promise<string>): Promise<MeasurementReading> {
  const property = secret('MEASUREMENT_GA4_PROPERTY_ID') || '553934279';
  if (!/^\d{1,20}$/.test(property)) throw new ProviderReadError('needs_setup', 'Revisar el identificador de la propiedad de Analytics.');
  const authorization = `Bearer ${await token()}`;
  const period = readingPeriod('ga4', now);
  const report = (body: Record<string, unknown>) => readJson(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ dateRanges: [{ startDate: period.start, endDate: period.end }], ...body }) });
  const [overview, events, daily, channels] = await Promise.all([
    report({ metrics: ['totalUsers', 'sessions', 'screenPageViews', 'engagedSessions'].map((name) => ({ name })) }),
    report({ dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }], limit: '100', dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['outbound_store_click', 'generate_pc_budget', 'affiliate_outbound_click', 'affiliate_pilot_view', 'contact_intent'] } } } }),
    report({ dimensions: [{ name: 'date' }], metrics: [{ name: 'totalUsers' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: '7' }),
    report({ dimensions: [{ name: 'sessionSourceMedium' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: '8' }),
  ]);
  validateGaReport(overview, ['totalUsers', 'sessions', 'screenPageViews', 'engagedSessions']);
  validateGaReport(events, ['eventCount', 'totalUsers']);
  validateGaReport(daily, ['totalUsers']);
  validateGaReport(channels, ['sessions']);
  if (!isRecord(overview.metadata) || overview.metadata.timeZone !== period.timeZone) throw new ProviderReadError('error', 'No se pudo verificar la zona horaria de Analytics. Ajustar la ventana antes de comparar.');
  const totals = rows(overview)[0];
  const metrics = totals ? gaValues(totals, 'metricValues').map(number) : [0, 0, 0, 0];
  if (metrics.length !== 4) throw new Error('Incomplete metrics');
  const eventMap = new Map(rows(events).map((row) => [gaValues(row, 'dimensionValues')[0], gaValues(row, 'metricValues').map(number)]));
  const result = reading('ga4', { users: metrics[0], sessions: metrics[1], views: metrics[2], engagedSessions: metrics[3], outboundClicks: eventMap.get('outbound_store_click')?.[0] ?? 0, outboundUsers: eventMap.get('outbound_store_click')?.[1] ?? 0, budgets: eventMap.get('generate_pc_budget')?.[0] ?? 0, affiliateClicks: eventMap.get('affiliate_outbound_click')?.[0] ?? 0, affiliateViews: eventMap.get('affiliate_pilot_view')?.[0] ?? 0, contactIntents: eventMap.get('contact_intent')?.[0] ?? 0 }, now, ['Usuarios medidos por Analytics según consentimiento y filtros de la propiedad. Los clics hacia tiendas miden uso del comparador; los ingresos se consultan por separado.', 'Las vistas requieren la verificación de duplicación indicada en la auditoría.']);
  result.daily = rows(daily).map((row) => {
    const date = gaValues(row, 'dimensionValues')[0];
    if (!/^\d{8}$/.test(date)) throw new Error('Invalid date');
    return { date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`, value: number(gaValues(row, 'metricValues')[0]) };
  });
  result.breakdown = rows(channels).map((row) => ({ label: gaValues(row, 'dimensionValues')[0].slice(0, 100), value: number(gaValues(row, 'metricValues')[0]) }));
  return result;
}

async function readSearchConsole(now: Date, token: () => Promise<string>): Promise<MeasurementReading> {
  const period = readingPeriod('search-console', now);
  const authorization = `Bearer ${await token()}`;
  const endpoint = 'https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.comparador-hardware.com.ar%2F/searchAnalytics/query';
  const data = await readJson(endpoint, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: period.start, endDate: period.end, type: 'web', dataState: 'final', aggregationType: 'byProperty', rowLimit: 1 }) });
  if (!Array.isArray(data.rows) && data.responseAggregationType !== 'byProperty') throw new Error('Invalid Search Console report');
  const total = rows(data)[0];
  return reading('search-console', { clicks: total ? number(total.clicks) : 0, impressions: total ? number(total.impressions) : 0, ctr: total ? number(total.ctr) * 100 : 0, position: total ? number(total.position) : null }, now, ['Clics desde los resultados de búsqueda de Google. No equivalen a usuarios únicos de Analytics.', 'Ventana de 28 días que termina tres días atrás para solicitar datos finales. Google puede tener retrasos adicionales.']);
}

async function readCloudflare(now: Date, settings: ConnectionSecrets): Promise<MeasurementReading> {
  const account = settings.cloudflare?.accountId;
  const token = settings.cloudflare?.token;
  const script = settings.cloudflare?.worker || 'comparador-hardware-argentina';
  if (!token || !account || !/^[a-f0-9]{32}$/.test(account) || !/^[a-zA-Z0-9_-]{1,64}$/.test(script)) throw new ProviderReadError('needs_setup', 'Falta la autorización de lectura de Cloudflare o sus identificadores.');
  const period = readingPeriod('cloudflare', now);
  const start = `${period.start}T00:00:00Z`;
  const end = new Date(Date.parse(start) + 86400000).toISOString();
  const query = `query { viewer { accounts(filter: {accountTag: ${JSON.stringify(account)}}) { workersInvocationsAdaptive(limit: 100, filter: {datetime_geq: ${JSON.stringify(start)}, datetime_lt: ${JSON.stringify(end)}, scriptName: ${JSON.stringify(script)}}) { dimensions { status } sum { requests errors } } } } }`;
  const data = await readJson('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  if (Array.isArray(data.errors) && data.errors.length) throw new ProviderReadError('error', 'Cloudflare rechazó el informe. Revisar acceso a estadísticas del Worker.');
  const viewer = isRecord(data.data) && isRecord(data.data.viewer) ? data.data.viewer : null;
  const accounts = viewer ? rows(viewer, 'accounts') : [];
  if (!accounts.length) throw new Error('Missing account');
  if (!Array.isArray(accounts[0].workersInvocationsAdaptive)) throw new Error('Missing worker report');
  const groups = rows(accounts[0], 'workersInvocationsAdaptive');
  if (!groups.length) throw new ProviderReadError('error', 'Cloudflare no devolvió invocaciones verificables para este Worker. Revisá la cuenta y el nombre antes de interpretarlo como cero.');
  let requests = 0, errors = 0, resourceErrors = 0;
  for (const group of groups) {
    if (!isRecord(group.sum) || !isRecord(group.dimensions)) throw new Error('Invalid group');
    requests += number(group.sum.requests); errors += number(group.sum.errors);
    if (group.dimensions.status === 'exceededResources') resourceErrors += number(group.sum.requests);
  }
  return reading('cloudflare', { requests, errors, resourceErrors }, now, ['Conteo adaptativo de invocaciones del Worker; no es una tasa de personas afectadas ni de todas las respuestas de la web.', 'Las políticas de alertas y el rendimiento real del navegador se verifican aparte.']);
}

async function readCatalog(now: Date): Promise<MeasurementReading> {
  const client = getServerSupabaseServiceClient();
  if (!client) throw new ProviderReadError('needs_setup', 'Falta la conexión privada de Supabase.');
  const { data, error } = await client.rpc('catalog_refresh_coverage').abortSignal(AbortSignal.timeout(12_000));
  if (error || !Array.isArray(data)) throw new ProviderReadError('error', 'No se pudo leer la cobertura del catálogo. Se conserva la última lectura.');
  const components = data.filter((row: unknown) => isRecord(row) && row.reason === 'components') as Record<string, unknown>[];
  if (!components.length) throw new ProviderReadError('error', 'La consulta no devolvió observaciones de componentes.');
  const sum = (key: string) => components.reduce((total, row) => total + number(row[key]), 0);
  const result = reading('catalog', { total: sum('total'), observed24h: sum('observed_24h'), observed3h: sum('observed_3h'), neverAttempted: sum('never_attempted'), stores: components.length }, now, ['Observaciones reales de componentes en las últimas 24 horas. No acredita stock, identidad ni elegibilidad de una guía.', 'Lectura de la cobertura existente: no ejecuta scraping ni renueva fechas.']);
  result.period = { start: new Date(now.getTime() - 86400000).toISOString().slice(0, 10), end: now.toISOString().slice(0, 10), timeZone: 'UTC' };
  result.breakdown = components.map((row) => ({ label: String(row.store_id).slice(0, 80), value: number(row.total) ? number(row.observed_24h) / number(row.total) * 100 : 0 })).sort((a, b) => a.value - b.value).slice(0, 8);
  return result;
}

async function readOperations(now: Date): Promise<MeasurementReading> {
  const client = getServerSupabaseServiceClient();
  if (!client) throw new ProviderReadError('needs_setup', 'Falta la conexión privada del proyecto.');
  const load = (scope: string, limit: number) => client.from('api_cache_entries').select('payload').eq('scope', scope).gt('expires_at', now.toISOString()).order('updated_at', { ascending: false }).limit(limit).abortSignal(AbortSignal.timeout(12_000));
  const [stores, endpoints] = await Promise.all([load(STORE_SCOPE, STORE_EVENT_LIMIT), load(ENDPOINT_SCOPE, ENDPOINT_EVENT_LIMIT)]);
  if (stores.error || endpoints.error || !Array.isArray(stores.data) || !Array.isArray(endpoints.data)) throw new ProviderReadError('error', 'No se pudo leer el registro operativo persistido. No se reemplaza por ceros.');
  const storeEvents = stores.data.map((row) => normalizeStoreEvent(row.payload)).filter((event) => event !== null);
  const endpointEvents = endpoints.data.map((row) => normalizeEndpointEvent(row.payload)).filter((event) => event !== null);
  const data = buildSnapshotFromState({ storeEvents, endpointEvents }, now.getTime());
  const result = reading('operations', { requests: data.endpoints.reduce((total, row) => total + row.totalRequests24h, 0), errors: data.endpoints.reduce((total, row) => total + row.errorCount24h, 0), storesWithObservations: data.stores.filter((row) => row.totalChecks24h > 0).length, criticalAlerts: data.alerts.filter((row) => row.severity === 'critical').length, warningAlerts: data.alerts.filter((row) => row.severity === 'warning').length }, now, ['Muestra del registro persistido de /api/search y /api/products. Sin registros no se puede confirmar que el sitio funciona bien.', `Se leyeron ${storeEvents.length} registros de tiendas y ${endpointEvents.length} de endpoints; puede haber un límite de filas o registros perdidos. No mide disponibilidad general ni mezcla la memoria del servidor local.`]);
  result.period = { start: new Date(now.getTime() - 86400000).toISOString().slice(0, 10), end: now.toISOString().slice(0, 10), timeZone: 'UTC' };
  return result;
}

async function readGithub(now: Date): Promise<MeasurementReading> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Comparador-Medicion' };
  if (secret('MEASUREMENT_GITHUB_TOKEN')) headers.Authorization = `Bearer ${secret('MEASUREMENT_GITHUB_TOKEN')}`;
  const data = await readJson('https://api.github.com/repos/john2k2/comparador-hardware-argentina/actions/workflows/catalog-refresh.yml/runs?per_page=20', { headers });
  if (!Array.isArray(data.workflow_runs)) throw new Error('Missing runs');
  const runs = rows(data, 'workflow_runs');
  const result = reading('github', { runs: runs.length, successful: runs.filter((row) => row.conclusion === 'success').length, failed: runs.filter((row) => ['failure', 'timed_out', 'action_required', 'startup_failure'].includes(String(row.conclusion))).length, inProgress: runs.filter((row) => row.status !== 'completed').length }, now, ['Muestra de las últimas 20 ejecuciones de catalog-refresh. Las canceladas no cuentan como fallas ni como éxitos.', 'Una ejecución aprobada no demuestra cobertura de precios ni un ciclo diario útil G02.']);
  const dates = runs.map((row) => String(row.created_at).slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  if (dates.length) result.period = { start: dates[0], end: dates[dates.length - 1], timeZone: 'UTC' };
  return result;
}

async function readDatabase(now: Date, settings: ConnectionSecrets): Promise<MeasurementReading> {
  if (!settings.database || settings.database.projectId !== 'zyiyziubpcpgoqlkcrie') throw new ProviderReadError('needs_setup', 'Falta autorizar la lectura de logs de este proyecto.');
  const period = readingPeriod('database', now);
  const url = new URL(`https://api.supabase.com/v1/projects/${settings.database.projectId}/analytics/endpoints/logs`);
  url.searchParams.set('iso_timestamp_start', `${period.start}T00:00:00Z`);
  url.searchParams.set('iso_timestamp_end', `${shiftDate(period.end, 1)}T00:00:00Z`);
  // Consulta fija de agregados. No devuelve cabeceras, IP, correos ni consultas de visitantes.
  url.searchParams.set('sql', "select countIf(source = 'edge_logs' and log_attributes['response.status_code'] = '500') as http500, countIf(source = 'postgres_logs' and log_attributes['parsed.sql_state_code'] = '57014') as canceledQueries from logs where source in ('edge_logs', 'postgres_logs')");
  const data = await readJson(url.toString(), { headers: { Authorization: `Bearer ${settings.database.token}` } });
  const result = rows(data, 'result');
  if (result.length !== 1) throw new Error('Missing log totals');
  return reading('database', { http500: number(result[0].http500), canceledQueries: number(result[0].canceledQueries) }, now, ['Conteos del último día completo en UTC. Los HTTP 500 y las consultas canceladas pueden corresponder a un mismo incidente; no se suman como personas afectadas.']);
}

async function readAdsense(now: Date, token: () => Promise<string>): Promise<MeasurementReading> {
  const publisher = secret('MEASUREMENT_ADSENSE_PUBLISHER_ID') || 'pub-4559843439616138';
  if (!/^pub-\d{16}$/.test(publisher)) throw new ProviderReadError('needs_setup', 'Revisar el identificador de AdSense del proyecto.');
  const base = `https://adsense.googleapis.com/v2/accounts/${publisher}`;
  const headers = { Authorization: `Bearer ${await token()}` };
  const sites = await readJson(`${base}/sites?pageSize=100`, { headers });
  const site = rows(sites, 'sites').find((item) => item.domain === 'comparador-hardware.com.ar' || item.domain === 'www.comparador-hardware.com.ar');
  if (!site || !['READY', 'GETTING_READY', 'REQUIRES_REVIEW', 'NEEDS_ATTENTION'].includes(String(site.state))) throw new ProviderReadError('error', 'AdSense no devolvió un estado verificable para el dominio del proyecto.');
  const period = readingPeriod('adsense', now);
  const url = new URL(`${base}/reports:generate`);
  for (const [prefix, value] of [['startDate', period.start], ['endDate', period.end]]) {
    const [year, month, day] = value.split('-');
    url.searchParams.set(`${prefix}.year`, year); url.searchParams.set(`${prefix}.month`, String(Number(month))); url.searchParams.set(`${prefix}.day`, String(Number(day)));
  }
  url.searchParams.set('metrics', 'ESTIMATED_EARNINGS');
  url.searchParams.set('filters', `OWNED_SITE_DOMAIN_NAME==${site.domain}`);
  url.searchParams.set('currencyCode', 'ARS');
  url.searchParams.set('reportingTimeZone', 'GOOGLE_TIME_ZONE');
  const report = await readJson(url.toString(), { headers });
  const date = (value: unknown) => isRecord(value) && typeof value.year === 'number' && typeof value.month === 'number' && typeof value.day === 'number' ? `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}` : null;
  if (date(report.startDate) !== period.start || date(report.endDate) !== period.end) throw new Error('Invalid earnings window');
  const reportHeaders = rows(report, 'headers');
  if (reportHeaders.length !== 1 || reportHeaders[0].name !== 'ESTIMATED_EARNINGS' || reportHeaders[0].currencyCode !== 'ARS') throw new Error('Invalid earnings currency');
  // Un informe válido puede omitir filas y totales cuando aún no hay un importe informado.
  let earningsARS: number | null = null;
  const emptyReport = report.totals === undefined && rows(report).length === 0 && (report.totalMatchedRows === undefined || number(report.totalMatchedRows) === 0);
  if (!emptyReport) {
    const cells = isRecord(report.totals) ? rows(report.totals, 'cells') : [];
    if (cells.length !== 1) throw new Error('Missing earnings');
    earningsARS = number(cells[0].value);
  }
  const siteStates: Record<string, string> = { READY: 'El sitio está aprobado para mostrar anuncios.', GETTING_READY: 'Google está revisando el sitio.', REQUIRES_REVIEW: 'El sitio necesita una revisión de Google.', NEEDS_ATTENTION: 'Google solicita corregir problemas en el sitio.' };
  return reading('adsense', { approved: site.state === 'READY' ? 1 : 0, earningsARS }, now, [`Estado del sitio: ${siteStates[String(site.state)]}`, earningsARS === null ? 'Google todavía no informó un importe de ingresos para este dominio y período.' : 'Ingresos estimados del dominio en pesos argentinos; no prueban un pago recibido.', 'Últimos siete días completos según la zona del Pacífico usada por Google.']);
}

async function readGoogleAds(now: Date, settings: ConnectionSecrets, token: () => Promise<string>): Promise<MeasurementReading> {
  if (!settings.ads || !/^\d{10}$/.test(settings.ads.customerId)) throw new ProviderReadError('needs_setup', 'Google Ads requiere una autorización y un token de desarrollador aprobado.');
  const authorization = `Bearer ${await token()}`;
  const search = (query: string) => readJson(`https://googleads.googleapis.com/v25/customers/${settings.ads!.customerId}/googleAds:search`, { method: 'POST', headers: { Authorization: authorization, 'developer-token': settings.ads!.developerToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const account = await search('SELECT customer.id, customer.currency_code, customer.time_zone FROM customer');
  const customer = rows(account, 'results')[0]?.customer;
  if (!isRecord(customer) || customer.id !== settings.ads.customerId || customer.currencyCode !== 'ARS' || typeof customer.timeZone !== 'string') throw new ProviderReadError('error', 'No se pudo verificar una cuenta de Google Ads en pesos argentinos.');
  const end = shiftDate(dateInZone(now, customer.timeZone), -1), start = shiftDate(end, -6);
  const [campaignReport, costs] = await Promise.all([
    search("SELECT campaign.id FROM campaign WHERE campaign.status != 'REMOVED'"),
    search(`SELECT customer.id, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${start}' AND '${end}'`),
  ]);
  if (campaignReport.nextPageToken || costs.nextPageToken || typeof campaignReport.fieldMask !== 'string' || !campaignReport.fieldMask.includes('campaign.id') || typeof costs.fieldMask !== 'string' || !costs.fieldMask.includes('metrics.costMicros')) throw new Error('Incomplete Ads report');
  const campaigns = rows(campaignReport, 'results');
  if (campaigns.some((row) => !isRecord(row.campaign) || typeof row.campaign.id !== 'string')) throw new Error('Invalid campaign');
  const costRows = rows(costs, 'results');
  const spend = costRows.reduce((total, row) => {
    if (!isRecord(row.metrics) || !isRecord(row.customer) || row.customer.id !== settings.ads!.customerId) throw new Error('Invalid cost');
    return total + number(row.metrics.costMicros) / 1e6;
  }, 0);
  const result = reading('google-ads', { campaigns: campaigns.length, spendARS: spend }, now, ['Campañas no eliminadas al consultar y gasto de los últimos siete días completos. La cuenta se verifica en ARS; no se convierte moneda.', 'Esta conexión sólo ejecuta informes. Google ofrece un permiso de Ads que también permite cambios; el panel no tiene funciones para crearlos.']);
  result.period = { start, end, timeZone: customer.timeZone };
  return result;
}

async function readEneba(now: Date): Promise<MeasurementReading> {
  const client = getServerSupabaseServiceClient();
  if (!client) throw new ProviderReadError('needs_setup', 'Falta la conexión privada del proyecto.');
  const cached = await client.from('api_cache_entries').select('payload,expires_at').eq('cache_key', `${ENEBA_CACHE_SCOPE}:${ENEBA_CACHE_KEY}`).abortSignal(AbortSignal.timeout(8_000)).maybeSingle();
  const data = !cached.error && Date.parse(cached.data?.expires_at) > now.getTime() ? readEnebaSnapshot(cached.data?.payload, now.getTime()) : null;
  if (!data?.fetchedAt || data.status === 'error' || data.status === 'disabled') throw new ProviderReadError('error', 'No se pudo leer un feed vigente. Se conserva la lectura anterior.');
  const result = reading('eneba', { offers: data.offers.length }, now, ['Cantidad de ofertas del feed del piloto. Los ingresos por comisiones requieren el informe del afiliado.']);
  result.period = { start: data.fetchedAt.slice(0, 10), end: data.fetchedAt.slice(0, 10), timeZone: 'UTC' };
  result.notes.push(`Feed obtenido: ${data.fetchedAt}. Abrir el panel no renueva el feed.`);
  return result;
}

/** Comparte la renovación por autorización; AdSense y Ads pueden pertenecer a otra cuenta. */
export function createProviderReader(now = new Date(), suppliedSettings?: ConnectionSecrets) {
  const settingsPromise = suppliedSettings ? Promise.resolve(suppliedSettings) : loadConnectionSecrets();
  const googleTokens = new Map<GoogleAuthorization, Promise<string>>();
  const tokenFor = (id: ProviderId) => async () => {
    const authorization = googleAuthorizationFor(id, await settingsPromise);
    if (!authorization) throw new ProviderReadError('needs_setup', 'Falta autorizar Google para esta página.');
    let token = googleTokens.get(authorization);
    if (!token) { token = googleAccessToken(authorization); googleTokens.set(authorization, token); }
    return token;
  };
  return async (id: ProviderId): Promise<MeasurementReading> => {
    const settings = await settingsPromise;
    const connection = getConnection(id, settings);
    if (connection.state === 'needs_setup') throw new ProviderReadError('needs_setup', 'Falta completar la autorización de lectura en el servidor.');
    try {
      switch (id) {
        case 'ga4': return await readGa4(now, tokenFor(id));
        case 'search-console': return await readSearchConsole(now, tokenFor(id));
        case 'cloudflare': return await readCloudflare(now, settings);
        case 'database': return await readDatabase(now, settings);
        case 'adsense': return await readAdsense(now, tokenFor(id));
        case 'google-ads': return await readGoogleAds(now, settings, tokenFor(id));
        case 'catalog': return await readCatalog(now);
        case 'operations': return await readOperations(now);
        case 'github': return await readGithub(now);
        case 'eneba': return await readEneba(now);
        default: throw new Error('Unsupported provider');
      }
    } catch (error) {
      if (error instanceof ProviderReadError) throw error;
      throw new ProviderReadError('error', 'No se pudo verificar la lectura. Se conserva el dato anterior con su fecha.');
    }
  };
}
