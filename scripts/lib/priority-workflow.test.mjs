import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const yaml = await readFile('.github/workflows/catalog-refresh.yml', 'utf8');
const validator = yaml.match(/STATUS_CODE="\$STATUS_CODE".*python3 - <<'PY'\n([\s\S]*?)\n          PY/)[1]
  .split('\n').map(line => line.slice(10)).join('\n');
async function validate(payload, mode = 'guides', status = '200') {
  const directory = await mkdtemp(join(tmpdir(), 'priority-workflow-'));
  try {
    const response = join(directory, 'result.json'), output = join(directory, 'output.txt');
    await writeFile(response, JSON.stringify(payload)); await writeFile(output, '');
    const result = spawnSync('python3', ['-c', validator], { encoding: 'utf8', timeout: 5000,
      env: { PATH: process.env.PATH, STATUS_CODE: status, MODE: mode, RESPONSE_FILE: response, GITHUB_OUTPUT: output } });
    return { code: result.status, stdout: result.stdout, stderr: result.stderr, output: await readFile(output, 'utf8') };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
const deferred = { source: 'priority-known-offers', status: 'deferred', reason: 'PRIORITY_REFRESH_DEFERRED' };
test('el validador real informa diferimiento sin declarar observaciones ni activar home/global', async () => {
  const result = await validate(deferred);
  assert.equal(result.code, 0); assert.equal(result.output, 'status=deferred\n'); assert.match(result.stdout, /diferido/);
  for (const name of ['Guardar selección pública después de actualizar ofertas', 'Measure global window updates and store freshness']) {
    const step = yaml.split(/^      - name: /m).find(value => value.startsWith(name));
    const condition = step.match(/^        if: (.+)$/m)[1];
    assert.equal(runInNewContext(condition, { success: () => true, always: () => true,
      steps: { resolve: { outputs: { mode: 'priority' } }, refresh: { outputs: { status: 'deferred' } } },
      env: { REFRESH_WINDOW_START: '2026-10-10T18:00:00Z' } }), false);
  }
});
test('rechaza diferimientos con conteos inventados y conserva fallo de DB', async () => {
  assert.equal((await validate({ ...deferred, observed: 0 })).code, 1);
  const failed = await validate({ error: 'PRIORITY_GATE_FAILED' }, 'priority', '503');
  assert.equal(failed.code, 1); assert.match(failed.stderr, /HTTP 503/);
});
test('guardados de demanda no ocultan que hubo intentos críticos sin observaciones', async () => {
  const result = await validate({ source: 'priority-known-offers', attempted: 10, observed: 9, comparable: 9,
    critical: { attempted: 1, observed: 0, comparable: 0 }, missingGuideSlots: ['guide/cpu'] }, 'priority');
  assert.equal(result.code, 1); assert.match(result.stderr, /No se persistió ninguna observación prioritaria/);
});
test('un ciclo crítico útil conserva sus guardados y registra demanda diferida aparte', async () => {
  const result = await validate({ source: 'priority-known-offers', attempted: 2, observed: 1, comparable: 1,
    critical: { attempted: 1, observed: 1, comparable: 1 }, missingGuideSlots: [], demand: { status: 'deferred' } });
  assert.equal(result.code, 0); assert.equal(result.output, 'status=completed\n'); assert.match(result.stdout, /señal de búsqueda/);
});
