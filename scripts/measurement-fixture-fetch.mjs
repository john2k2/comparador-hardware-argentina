// Sólo se precarga en el proceso local de pruebas. La aplicación no importa este archivo.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access-only' });
  if (url.startsWith('https://analyticsdata.googleapis.com/v1beta/properties/')) {
    const body = JSON.parse(String(init?.body || await input.clone().text()));
    const metricHeaders = body.metrics;
    const name = body.dimensions?.[0]?.name;
    const row = (dimensions, values) => ({ dimensionValues: dimensions.map((value) => ({ value })), metricValues: values.map((value) => ({ value: String(value) })) });
    let rows;
    if (!name) rows = [row([], [52, 80, 140, 44])];
    else if (name === 'eventName') rows = [row(['outbound_store_click'], [12, 8]), row(['generate_pc_budget'], [3, 2])];
    else if (name === 'date') rows = [row([body.dateRanges[0].startDate.replaceAll('-', '')], [8]), row([body.dateRanges[0].endDate.replaceAll('-', '')], [12])];
    else rows = [row(['google / organic'], [35]), row(['(direct) / (none)'], [28])];
    return Response.json({ metricHeaders, rows, metadata: { timeZone: 'America/Buenos_Aires' } });
  }
  if (url.startsWith('https://www.googleapis.com/webmasters/v3/sites/')) return Response.json({ responseAggregationType: 'byProperty', rows: [{ clicks: 320, impressions: 14000, ctr: 320 / 14000, position: 7.5 }] });
  if (url === 'https://api.cloudflare.com/client/v4/graphql') return Response.json({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [{ dimensions: { status: 'success' }, sum: { requests: 100, errors: 0 } }] }] } } });
  if (url.startsWith('https://api.github.com/repos/john2k2/comparador-hardware-argentina/actions/workflows/catalog-refresh.yml/runs')) return Response.json({ workflow_runs: [{ created_at: new Date().toISOString(), status: 'completed', conclusion: 'success' }] });
  return originalFetch(input, init);
};
