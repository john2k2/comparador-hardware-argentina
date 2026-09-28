import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);

async function withFakeCatalog(missingCount, run) {
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/rest/v1/stores') {
      response.end(JSON.stringify([{ id: 'a', name: 'A' }, { id: 'shopgamer', name: 'Shopgamer' }]));
      return;
    }
    if (url.pathname !== '/rest/v1/product_prices') {
      response.statusCode = 404;
      response.end('{}');
      return;
    }
    requests.push(url.searchParams.get('select'));
    if (request.method === 'HEAD') {
      const count = url.searchParams.get('store_id') === 'eq.a'
        && !url.searchParams.has('identity_review->>status') ? 2 : 0;
      if (!missingCount) response.setHeader('Content-Range', `*/${count}`);
      response.end();
      return;
    }
    response.end(JSON.stringify([
      { store_id: 'a', product_id: 'cpu', price: 100, stock: 'in-stock' },
      { store_id: 'a', product_id: 'gpu', price: 300, stock: 'low-stock' },
      { store_id: 'shopgamer', product_id: 'cpu', price: 0, stock: 'out-of-stock' },
    ]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(join(tmpdir(), 'catalog-freshness-test-'));
  try {
    const env = {
      SUPABASE_URL: `http://127.0.0.1:${server.address().port}`,
      SUPABASE_SECRET_KEY: 'fixture-only-not-a-credential',
      GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
    };
    await run(env, requests);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

const script = fileURLToPath(new URL('../catalog-freshness-report.mjs', import.meta.url));
const args = () => [script, '--since', new Date(Date.now() - 60 * 60 * 1000).toISOString(), '--require-observed'];

test('el CLI informa una tienda actualizada sin ofertas disponibles y productos por tienda', async () => {
  await withFakeCatalog(false, async (env, requests) => {
    const { stdout } = await execute(process.execPath, args(), { env, timeout: 5000 });
    const report = JSON.parse(stdout);
    assert.equal(report.observedRows, 3);
    assert.equal(report.persistedProducts, 2);
    assert.deepEqual(report.persistedProductsByStore, { a: 2, shopgamer: 1 });
    assert.equal(report.availableObservedRows, 2);
    assert.deepEqual(report.availableObservedByStore, { a: 2, shopgamer: 0 });
    assert.equal(report.denominator, 2);
    assert.equal(report.fresh3h, 2);
    assert.ok(requests.includes('store_id,product_id,price,stock'));
    const summary = await readFile(env.GITHUB_STEP_SUMMARY, 'utf8');
    assert.ok(summary.includes('| shopgamer | 0 | 0 | 0 | 0 | 1 | 1 | 0 |'));
  });
});

test('un conteo exacto ausente falla el informe en lugar de publicar ceros', async () => {
  await withFakeCatalog(true, async env => {
    await assert.rejects(execute(process.execPath, args(), { env, timeout: 5000 }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /No se recibió un conteo exacto/);
      assert.equal(error.stdout, '');
      return true;
    });
  });
});
