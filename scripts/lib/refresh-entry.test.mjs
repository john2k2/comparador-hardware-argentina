import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

// Ejecuta el entrypoint real y su serialización. Sólo los runners y el transporte
// se sustituyen: esta prueba nunca adquiere lotes ni visita tiendas o Supabase.
async function runArtifact(mode, scenario) {
  const directory = await mkdtemp(join(tmpdir(), 'refresh-artifact-'));
  const outfile = join(directory, 'entry.mjs');
  const artifact = join(directory, 'result.json');
  const helper = JSON.stringify(resolve('src/lib/catalog/refresh-diagnostics.ts'));
  try {
    await build({ entryPoints: ['scripts/catalog/refresh-entry.ts'], outfile, bundle: true,
      platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
      plugins: [{ name: 'offline-refresh', setup(builder) {
        builder.onResolve({ filter: /^\.\.\/\.\.\/src\/lib\/(?:catalog\/(?:adaptive-refresh|priority-refresh|on-demand\/worker)|scrapers\/source-http)$/ },
          args => ({ path: args.path, namespace: 'offline' }));
        builder.onLoad({ filter: /.*/, namespace: 'offline' }, args => {
          if (args.path.endsWith('source-http')) {
            return { contents: 'export function sourceHttpMetrics() { return { fixture: { requests: 3 } }; }', loader: 'js' };
          }
          return { loader: 'ts', resolveDir: process.cwd(), contents: `
            import { createRefreshClaimError, extractRefreshClaimDiagnostic } from ${helper};
            async function run() {
              if (process.env.REFRESH_TEST_SCENARIO === 'partial') {
                return { processed: true, jobId: 'fixture-job', status: 'partial',
                  attempted: 2, observed: 1, comparable: 1, failures: { 'no-observation': 1 } };
              }
              if (process.env.REFRESH_TEST_SCENARIO === 'unknown') {
                throw new Error('PRIVATE_CREDENTIAL');
              }
              const requested = process.env.REFRESH_TEST_MODE === 'requested';
              const context = { rpc: requested ? 'claim_offer_refresh' : 'claim_catalog_refresh',
                phase: requested ? 'requested' : 'rotation', batchIndex: requested ? 1 : 51,
                limit: requested ? 1 : 24 } as const;
              const error = createRefreshClaimError({ code: '57014', message: 'PRIVATE_CREDENTIAL',
                details: 'private SQL', hint: 'private URL' }, context, 17);
              Object.assign(error.diagnostic!, { token: 'PRIVATE_CREDENTIAL', args: { secret: 'private SQL' } });
              if (process.env.REFRESH_TEST_SCENARIO === 'adaptive-failed') {
                return { status: 'failed', failureCode: error.message, attempted: 24, observed: 12,
                  comparable: 8, claimDiagnostic: extractRefreshClaimDiagnostic(error) };
              }
              throw error;
            }
            export const runAdaptiveRefresh = run;
            export const runRequestedRefresh = run;
            export const runPriorityRefresh = run;
          ` };
        });
      } }] });
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      !['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'CATALOG_REFRESH_CRON_SECRET'].includes(key)));
    const child = spawnSync(process.execPath, [outfile, mode, artifact], {
      env: { ...env, CATALOG_REQUESTED_RUNNER: '1', REFRESH_TEST_MODE: mode, REFRESH_TEST_SCENARIO: scenario },
      encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(child.error, undefined);
    const raw = await readFile(artifact, 'utf8');
    assert.doesNotMatch(raw, /PRIVATE_CREDENTIAL|private SQL|private URL|"token"|"args"/);
    return { status: child.status, payload: JSON.parse(raw) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

for (const mode of ['adaptive', 'requested']) {
  test(`el artefacto ${mode} conserva el diagnóstico permitido y falla con salida 1`, async () => {
    const result = await runArtifact(mode, 'claim');
    assert.equal(result.status, 1);
    assert.equal(result.payload.error, 'REFRESH_CLAIM_FAILED');
    assert.deepEqual(result.payload.claimDiagnostic, { rpc: mode === 'requested' ? 'claim_offer_refresh' : 'claim_catalog_refresh',
      phase: mode === 'requested' ? 'requested' : 'rotation', batchIndex: mode === 'requested' ? 1 : 51,
      limit: mode === 'requested' ? 1 : 24, elapsedMs: 17, code: '57014' });
    assert.deepEqual(result.payload.sourceHttp, { fixture: { requests: 3 } });
  });
}

test('un error desconocido no se convierte en diagnóstico ni filtra su mensaje', async () => {
  const result = await runArtifact('requested', 'unknown');
  assert.equal(result.status, 1);
  assert.deepEqual(result.payload, { error: 'REFRESH_FAILED', sourceHttp: { fixture: { requests: 3 } } });
});

test('un retorno adaptativo fallido conserva acumulados y diagnóstico en el artefacto con salida 1', async () => {
  const result = await runArtifact('adaptive', 'adaptive-failed');
  assert.equal(result.status, 1);
  assert.deepEqual(result.payload, { status: 'failed', failureCode: 'REFRESH_CLAIM_FAILED',
    attempted: 24, observed: 12, comparable: 8,
    claimDiagnostic: { rpc: 'claim_catalog_refresh', phase: 'rotation', batchIndex: 51,
      limit: 24, elapsedMs: 17, code: '57014' }, sourceHttp: { fixture: { requests: 3 } } });
});

test('el artefacto solicitado parcial conserva conteos de observaciones y motivos de fallo', async () => {
  const result = await runArtifact('requested', 'partial');
  assert.equal(result.status, 0);
  assert.deepEqual(result.payload, { processed: true, jobId: 'fixture-job', status: 'partial',
    attempted: 2, observed: 1, comparable: 1, failures: { 'no-observation': 1 }, sourceHttp: { fixture: { requests: 3 } } });
});
