import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CLOUD = 'https://zyiyziubpcpgoqlkcrie.supabase.co';
const VPS = 'https://catalog-api.comparador-hardware.com.ar';
export function selectDatabase(input) {
  const backend = input.backend || 'cloud';
  if (!['cloud', 'vps'].includes(backend)) throw Error('CATALOG_DATABASE_BACKEND_INVALID');
  if (input.cloudUrl !== CLOUD || !input.cloudPublishableKey || !input.cloudSecretKey) throw Error('CATALOG_DATABASE_CLOUD_CONFIG_INVALID');
  const pair = backend === 'vps'
    ? { url: input.vpsUrl, publishable: input.vpsPublishableKey, secret: input.vpsSecretKey }
    : { url: input.cloudUrl, publishable: input.cloudPublishableKey, secret: input.cloudSecretKey };
  if (!pair.url || !pair.publishable || !pair.secret || backend === 'vps' && pair.url !== VPS) throw Error('CATALOG_DATABASE_CONFIG_INCOMPLETE');
  const env = { SUPABASE_URL: pair.url, SUPABASE_PUBLISHABLE_KEY: pair.publishable, SUPABASE_SECRET_KEY: pair.secret,
    SUPABASE_AUTH_URL: input.cloudUrl, SUPABASE_AUTH_PUBLISHABLE_KEY: input.cloudPublishableKey };
  if (Object.values(env).some(value => typeof value !== 'string' || /[\r\n\0]/.test(value))) throw Error('CATALOG_DATABASE_CONFIG_INVALID');
  return { backend, env };
}

export async function waitForHandoff(selection, { fetcher = fetch, clock = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 29 * 60_000 } = {}) {
  if (selection.backend !== 'vps') return;
  const start = clock();
  while (clock() - start < timeoutMs) {
    try {
      const response = await fetcher(VPS + '/__ready', {
        headers: { Authorization: 'Bearer ' + selection.env.SUPABASE_SECRET_KEY, 'User-Agent': 'comparador-catalog-runner/1.0' }, redirect: 'manual', signal: AbortSignal.timeout(10000),
      });
      await response.body?.cancel();
      if (response.status === 200) return;
      if (response.status === 401 || response.status === 403) {
        console.error('CATALOG_DATABASE_HTTP_' + response.status + (response.headers.get('cf-mitigated') === 'challenge' ? '_EDGE_CHALLENGE' : ''));
        throw Error('CATALOG_DATABASE_AUTH_FAILED');
      }
      if (![502, 503, 504].includes(response.status)) throw Error('CATALOG_DATABASE_GATE_INVALID');
    } catch (error) {
      if (/^CATALOG_DATABASE_/.test(error?.message)) throw error;
    }
    await sleep(5000);
  }
  throw Error('CATALOG_DATABASE_HANDOFF_TIMEOUT');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const get = key => process.env['INPUT_' + key.toUpperCase()] || '';
  try {
    const selection = selectDatabase({ backend: get('backend'), cloudUrl: get('cloud-url'), cloudPublishableKey: get('cloud-publishable-key'), cloudSecretKey: get('cloud-secret-key'), vpsUrl: get('vps-url'), vpsPublishableKey: get('vps-publishable-key'), vpsSecretKey: get('vps-secret-key') });
    const mode = get('mode') || 'configure';
    if (!['configure', 'wait'].includes(mode)) throw Error('CATALOG_DATABASE_MODE_INVALID');
    if (mode === 'wait') {
      console.log('CATALOG_DATABASE_HANDOFF_WAIT');
      await waitForHandoff(selection);
    } else {
      if (!process.env.GITHUB_ENV) throw Error('CATALOG_DATABASE_ENV_MISSING');
      appendFileSync(process.env.GITHUB_ENV, Object.entries(selection.env).map(([key, value]) => key + '=' + value + '\n').join(''));
    }
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'backend=' + selection.backend + '\n');
    console.log('CATALOG_DATABASE_' + selection.backend.toUpperCase() + '_READY');
  } catch (error) {
    console.error(/^CATALOG_DATABASE_[A-Z_]+$/.test(error?.message) ? error.message : 'CATALOG_DATABASE_SETUP_FAILED');
    process.exitCode = 1;
  }
}
