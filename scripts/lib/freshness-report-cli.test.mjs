import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { evaluateG02Readiness } from './g02-readiness.mjs';

const execute = promisify(execFile);

async function withFakeCatalog(missingCount, run, windowRows) {
  const requests = [];
  const fixed = JSON.parse(await readFile('docs/reports/crecimiento-2026-09-12/G02-MUESTRA-PRIORITARIA.json', 'utf8')).products;
  const products = [{ id: 'cpu', name: 'AMD Ryzen 5 5600', category: 'procesadores' },
    ...fixed.map(row => ({ ...row, name: row.id.replaceAll('-', ' ') }))];
  const selected = raw => products.filter(row => raw?.slice(4, -1).split(',').includes(row.id));
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    requests.push({ path: url.pathname, method: request.method, select: url.searchParams.get('select'), prefer: request.headers.prefer });
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/rest/v1/stores') {
      response.end(JSON.stringify([{ id: 'a', name: 'A' }, { id: 'shopgamer', name: 'Shopgamer' }]));
      return;
    }
    if (url.pathname === '/rest/v1/products') {
      response.end(JSON.stringify(selected(url.searchParams.get('id'))));
      return;
    }
    if (url.pathname !== '/rest/v1/product_prices') {
      response.statusCode = 404;
      response.end('{}');
      return;
    }
    if (request.method === 'HEAD') {
      const count = url.searchParams.get('store_id') === 'eq.a'
        && !url.searchParams.has('identity_review->>status') ? 2 : 0;
      if (!missingCount) response.setHeader('Content-Range', `*/${count}`);
      response.end();
      return;
    }
    response.end(JSON.stringify(url.searchParams.has('product_id') ? selected(url.searchParams.get('product_id')).map(row => ({
      product_id: row.id, store_id: 'a', url: 'https://store.example/amd-ryzen-5-5600',
      price: 100, stock: 'in-stock', last_updated: new Date(Date.now() - 1000).toISOString(),
      identity_review: null,
    })) : windowRows ?? [
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
    assert.ok(requests.some(row => row.select === 'store_id,product_id,price,stock'));
    const summary = await readFile(env.GITHUB_STEP_SUMMARY, 'utf8');
    assert.ok(summary.includes('| shopgamer | 0 | 0 | 0 | 0 | 1 | 1 | 0 |'));
  });
});

// Ejecuta los comandos y las condiciones reales del workflow contra el transporte local.
async function reportingSteps(env, mode) {
  const yaml = await readFile('.github/workflows/catalog-refresh.yml', 'utf8');
  const steps = yaml.split(/^      - name: /m).filter(step => /^(?:Record omitted global report|Measure global window updates)/.test(step));
  assert.equal(steps.length, 2);
  for (const step of steps) {
    const condition = step.match(/^        if: (.+)$/m)[1];
    const contexts = { always: () => true, steps: { resolve: { outputs: { mode } } }, env };
    if (!runInNewContext(condition, contexts, { timeout: 100 })) continue;
    const command = step.split('        run: |\n')[1].split('\n').filter(line => /^          |^$/.test(line)).map(line => line.slice(10)).join('\n');
    await execute('bash', ['-e', '-c', command], { env: { PATH: process.env.PATH, ...env, MODE: mode }, timeout: 5000 });
  }
}

async function runnerFixture(env, overrides = {}) {
  const folder = join(env.GITHUB_STEP_SUMMARY, '..');
  const result = { source: 'priority-known-offers', attempted: 3, observed: 1, comparable: 1,
    missingGuideSlots: ['pc-gamer-1-millon/ram'], privateDetail: 'fixture-private-not-reportable', ...overrides };
  const raw = JSON.stringify(result);
  await writeFile(join(folder, 'catalog-refresh-result.json'), raw);
  return { folder, raw, reportEnv: { ...env, RUNNER_TEMP: folder, REFRESH_WINDOW_START: new Date(Date.now() - 3600_000).toISOString() } };
}

test('el workflow guides omite todo diagnóstico global, conserva recibo y no fabrica muestra/ceros', async () => {
  await withFakeCatalog(false, async (env, requests) => {
    const fixture = await runnerFixture(env);
    await reportingSteps(fixture.reportEnv, 'guides');
    const raw = await readFile(join(fixture.folder, 'catalog-freshness.json'), 'utf8');
    const report = JSON.parse(raw);
    assert.equal(requests.length, 0);
    assert.equal(report.status, 'omitted');
    assert.equal(report.mode, 'guides');
    assert.equal(report.reason, 'guides-use-runner-receipt');
    assert.equal(report.runnerEvidence.observed, 1);
    assert.equal(report.runnerEvidence.comparable, 1);
    assert.deepEqual(report.runnerEvidence.missingGuideSlots, ['pc-gamer-1-millon/ram']);
    for (const field of ['denominator', 'fresh24h', 'sample', 'observedRows', 'byStore']) assert.equal(field in report, false);
    assert.equal(raw.includes('fixture-private-not-reportable'), false);
    assert.equal(await readFile(join(fixture.folder, 'catalog-refresh-result.json'), 'utf8'), fixture.raw);
    assert.equal(evaluateG02Readiness([], report, Array.from({ length: 9 }, (_, i) => `p${i}`)).status, 'not-ready');
  });
});

test('priority conserva exact counts y muestra, separando tres filas de ventana de una observación propia', async () => {
  await withFakeCatalog(false, async (env, requests) => {
    const fixture = await runnerFixture(env);
    await reportingSteps(fixture.reportEnv, 'priority');
    const report = JSON.parse(await readFile(join(fixture.folder, 'catalog-freshness.json'), 'utf8'));
    assert.equal(report.status, 'measured');
    assert.equal(report.mode, 'priority');
    assert.equal(requests.length, 12); // stores + 4 exact counts por cada tienda + ventana + productos/precios de muestra.
    assert.equal(requests.filter(row => row.method === 'HEAD' && row.prefer?.includes('count=exact')).length, 8);
    assert.equal(report.denominator, 2);
    assert.equal(report.fresh24h, 2);
    assert.equal(report.fresh3h, 2);
    assert.equal(report.sample.byProduct.length, 9);
    assert.equal(report.sample.identityAccepted3h, 0);
    assert.equal(report.observedRows, 3);
    assert.equal(report.runnerEvidence.observed, 1);
    assert.equal(report.observationAttribution, 'window-only-not-runner-authorship');
    const summary = await readFile(env.GITHUB_STEP_SUMMARY, 'utf8');
    assert.ok(summary.includes('Pueden proceder de otros runners'));
    assert.ok(summary.includes('observaciones guardadas 1'));
    assert.equal(summary.includes('Productos distintos del ciclo'), false);
  });
});

test('manual conserva el reporte global previo y no inventa un recibo propio ausente', async () => {
  await withFakeCatalog(false, async (env, requests) => {
    const fixture = await runnerFixture(env);
    await reportingSteps(fixture.reportEnv, 'tracked');
    const report = JSON.parse(await readFile(join(fixture.folder, 'catalog-freshness.json'), 'utf8'));
    assert.equal(requests.length, 12);
    assert.equal(report.denominator, 2);
    assert.equal(report.sample.byProduct.length, 9);
    assert.equal('runnerEvidence' in report, false);
  });
});

test('guides conserva la omisión con recibo ausente o inválido sin transformar ausencia en cero', async () => {
  await withFakeCatalog(false, async (env, requests) => {
    const fixture = await runnerFixture(env, { observed: -1 });
    await reportingSteps(fixture.reportEnv, 'guides');
    const output = join(fixture.folder, 'catalog-freshness.json');
    let report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.runnerEvidence.reason, 'runner-receipt-invalid');
    assert.equal('observed' in report.runnerEvidence, false);
    await rm(join(fixture.folder, 'catalog-refresh-result.json'));
    await reportingSteps(fixture.reportEnv, 'guides');
    report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.runnerEvidence.reason, 'runner-receipt-missing');
    assert.equal('observed' in report.runnerEvidence, false);
    assert.equal(requests.length, 0);
  });
});

test('priority falla ante exact count ausente, sin publicar un diagnóstico de ceros', async () => {
  await withFakeCatalog(true, async env => {
    const fixture = await runnerFixture(env);
    await assert.rejects(reportingSteps(fixture.reportEnv, 'priority'), error => {
      assert.match(error.stderr, /No se recibió un conteo exacto/);
      return true;
    });
    await assert.rejects(readFile(join(fixture.folder, 'catalog-freshness.json')), { code: 'ENOENT' });
  });
});

test('--require-observed conserva salida dos por ventana vacía sin atribuir falta de persistencia propia', async () => {
  await withFakeCatalog(false, async env => {
    await assert.rejects(execute(process.execPath, args(), { env, timeout: 5000 }), error => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /ventana medida.*no atribuye autoría/);
      assert.equal(JSON.parse(error.stdout).observedRows, 0);
      return true;
    });
  }, []);
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

test('el CLI de muestra compila el contrato real y no aprueba una revisión legacy ausente', async () => {
  await withFakeCatalog(false, async env => {
    const sample = join(env.GITHUB_STEP_SUMMARY, '..', 'sample.json');
    await writeFile(sample, JSON.stringify({ products: [{ id: 'cpu', category: 'procesadores' }] }));
    const { stdout } = await execute(process.execPath, [...args(), '--sample', sample], { env, timeout: 5000 });
    const report = JSON.parse(stdout);
    assert.equal(report.sample.fresh3h, 1);
    assert.equal(report.sample.candidateComparable3h, 1);
    assert.equal(report.sample.identityAccepted3h, 0);
    assert.deepEqual(report.sample.productsWithoutAcceptedOffer3h, ['cpu']);
  });
});
