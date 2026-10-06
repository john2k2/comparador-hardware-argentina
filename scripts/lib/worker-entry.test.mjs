import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('la entrada real conserva Next, el scheduler y los exports al filtrar escaneos', async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../../custom-worker.mjs', import.meta.url))],
    bundle: true, write: false, platform: 'node', target: 'node22', format: 'esm', logLevel: 'silent',
    plugins: [{
      name: 'isolate-worker-transports',
      setup(builder) {
        builder.onResolve({ filter: /\.open-next\/worker\.js$/ }, () => ({ path: 'next', namespace: 'worker-test' }));
        builder.onResolve({ filter: /lib\/catalog\/scheduler\.ts$/ }, () => ({ path: 'scheduler', namespace: 'worker-test' }));
        builder.onLoad({ filter: /.*/, namespace: 'worker-test' }, ({ path }) => ({
          contents: path === 'next' ? `
            export const nextCalls = [];
            export const nextResponse = new Response('next', { headers: {
              'Set-Cookie': 'session=test; HttpOnly; SameSite=Lax',
              'Content-Security-Policy': "script-src 'nonce-test'"
            }});
            export const DOQueueHandler = class Queue {};
            export const DOShardedTagCache = class Cache {};
            export const futureAdapterExport = 'preserved';
            export default {
              adapterProperty: 'preserved',
              fetch(request, env, context) { nextCalls.push({ request, env, context }); return nextResponse; }
            };
          ` : `
            export const scheduleCalls = [];
            export async function observeCatalogSchedule(env, fetchImpl) { scheduleCalls.push({ env, fetchImpl }); }
          `,
        }));
      },
    }],
  });
  // Sólo se sustituyen el adaptador y el transporte programado. La entrada y
  // la protección ejecutadas son las de producción; no se consulta ni despacha nada.
  const source = bundle.outputFiles[0].text + '\nexport { scheduleCalls };';
  const adapter = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const worker = adapter.default;
  const env = { marker: 'original-env' };
  const context = { waitUntil() {} };

  const scan = await worker.fetch(new Request('https://example.test/.env.local'), env, context);
  assert.equal(scan.status, 404);
  assert.equal(await scan.text(), 'Not Found');
  assert.equal(scan.headers.get('cache-control'), 'no-store');
  assert.match(scan.headers.get('x-robots-tag'), /noindex/);
  assert.equal(adapter.nextCalls.length, 0);
  const head = await worker.fetch(new Request('https://example.test/phpinfo.php', { method: 'HEAD' }), env, context);
  assert.equal(head.status, 404);
  assert.equal(head.body, null);
  assert.equal(adapter.nextCalls.length, 0);

  const request = new Request('https://example.test/api/search?q=.env', { method: 'POST', body: 'untouched' });
  const response = await worker.fetch(request, env, context);
  assert.equal(response, adapter.nextResponse);
  assert.deepEqual(adapter.nextCalls, [{ request, env, context }]);
  assert.equal(response.headers.get('set-cookie'), 'session=test; HttpOnly; SameSite=Lax');
  assert.equal(response.headers.get('content-security-policy'), "script-src 'nonce-test'");

  await worker.scheduled({ cron: '11 * * * *' }, env, context);
  assert.equal(adapter.scheduleCalls.length, 1);
  assert.equal(adapter.scheduleCalls[0].env, env);
  assert.equal(typeof adapter.scheduleCalls[0].fetchImpl, 'function');
  assert.equal(worker.adapterProperty, 'preserved');
  assert.equal(typeof adapter.DOQueueHandler, 'function');
  assert.equal(typeof adapter.DOShardedTagCache, 'function');
  assert.equal(adapter.futureAdapterExport, 'preserved');
});
