import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
const contracts = JSON.parse(readFileSync(new URL('./workflow-contracts.json', import.meta.url), 'utf8'));

for (const name of ['catalog-refresh', 'catalog-adaptive-refresh', 'requested-offer-refresh', 'measurement-snapshot', 'eneba-pilot']) {
  test(name + ': fija la base por ejecución y conserva horarios, exclusión y presupuestos', () => {
    const path = '.github/workflows/' + name + '.yml';
    const previous = contracts[name];
    const current = parse(readFileSync(path, 'utf8'));
    assert.deepEqual(current.on, previous.on);
    assert.deepEqual(current.concurrency, previous.concurrency);
    const gate = current.jobs['database-ready'];
    assert.equal(gate.outputs.backend, '${{ steps.database.outputs.backend }}');
    assert.equal(gate.steps[1].id, 'database');
    assert.equal(gate.steps[1].with.mode, 'wait');
    assert.equal(gate.steps[1].with.backend, "${{ vars.CATALOG_DATABASE_BACKEND || 'cloud' }}");
    assert.ok(!gate.if?.includes('CATALOG_DATABASE_BACKEND'));
    for (const [jobName, job] of Object.entries(previous.jobs)) {
      const changed = current.jobs[jobName];
      assert.equal(changed['timeout-minutes'], job['timeout-minutes']);
      assert.ok([changed.needs].flat().includes('database-ready'));
      const connection = changed.steps.find(step => step.uses === './.github/actions/catalog-database');
      assert.equal(connection.with.backend, "${{ needs.database-ready.outputs.backend || 'cloud' }}");
      for (const step of changed.steps) {
        assert.ok(!Object.keys(step.env || {}).some(key => key.startsWith('SUPABASE_')));
      }
    }
  });
}
