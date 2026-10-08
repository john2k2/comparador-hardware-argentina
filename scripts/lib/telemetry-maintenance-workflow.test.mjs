import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';
import { parseTelemetryMaintenanceArguments } from '../telemetry-maintenance.mjs';

const file = new URL('../../.github/workflows/catalog-refresh.yml', import.meta.url);
const workflow = parse(await fs.readFile(file, 'utf8'));
test('maintenance comparte la programación y concurrencia existentes; excluye manuales y guías', () => {
  assert.deepEqual(workflow.on.schedule.map(value => value.cron), ['5 5 * * *','17 0-4,6-23 * * *']);
  assert.deepEqual(workflow.concurrency,{ group:'catalog-refresh','cancel-in-progress':false });
  const job = workflow.jobs['telemetry-maintenance'];
  assert.equal(job.needs,'refresh');
  assert.ok(job.if.includes("github.event_name == 'schedule'"));
  assert.ok(job.if.includes("github.run_attempt == '1'"));
  assert.ok(job.if.includes("github.event.schedule == '5 5 * * *'"));
  assert.ok(job.if.includes("needs.refresh.outputs.mode == 'priority'"));
  assert.equal(workflow.jobs.refresh.outputs.mode,'${{ steps.resolve.outputs.mode }}');
  assert.equal(job.env.TELEMETRY_RETENTION_MODE,"${{ vars.TELEMETRY_RETENTION_MODE || 'inspect' }}");
  assert.equal(job.env.SUPABASE_SECRET_KEY,'${{ secrets.SUPABASE_SECRET_KEY }}');
  assert.equal(job.steps.find(step => step.uses === 'actions/setup-node@v4').with['node-version'],22);
});
test('la guardia del job excluye reintentos del diario y eventos a pedido', () => {
  const expression = workflow.jobs['telemetry-maintenance'].if.slice(3,-2).trim();
  const predicates = expression.split(' && ');
  function allows(context) {
    return predicates.every(predicate => {
      if (predicate === 'always()') return true;
      const comparison = predicate.match(/^([a-zA-Z_.]+) == '([^']*)'$/);
      assert.ok(comparison, 'La prueba debe reconocer todos los términos de la guardia');
      const actual = comparison[1].split('.').reduce((value,key) => value?.[key],context);
      return actual === comparison[2];
    });
  }
  for (const [event,attempt,cron,mode,expected] of [
    ['schedule','1','5 5 * * *','priority',true],
    ['schedule','2','5 5 * * *','priority',false],
    ['schedule','3','5 5 * * *','priority',false],
    ['workflow_dispatch','1','5 5 * * *','priority',false],
    ['workflow_dispatch','1','5 5 * * *','guides',false],
    ['workflow_dispatch','2','17 0-4,6-23 * * *','guides',false],
    ['schedule','1','17 0-4,6-23 * * *','guides',false],
    ['schedule','1','17 0-4,6-23 * * *','priority',false],
    ['schedule','1','5 5 * * *','guides',false],
  ]) {
    const context={ github:{event_name:event,run_attempt:attempt,event:{schedule:cron}},needs:{refresh:{outputs:{mode}}}};
    assert.equal(allows(context),expected,`${event}/${attempt}/${cron}/${mode}`);
  }
});
test('el respaldo de guías registra origen sin crear crons ni mantenimiento adicional', () => {
  const input = workflow.on.workflow_dispatch.inputs.trigger;
  assert.deepEqual(input.options, ['manual', 'cloudflare-fallback']);
  assert.equal(input.default, 'manual');
  assert.ok(workflow['run-name'].includes('inputs.mode'));
  assert.ok(workflow['run-name'].includes('inputs.trigger'));
  const refresh = workflow.jobs.refresh.steps.find(step => step.name === 'Run catalog refresh');
  assert.equal(refresh.env.CATALOG_RUN_TRIGGER,
    "${{ github.event_name == 'schedule' && 'github-schedule' || github.event.inputs.trigger || 'manual' }}");
  assert.deepEqual(Object.keys(workflow.jobs), ['refresh', 'telemetry-maintenance']);
});
test('los límites del workflow parsean y sólo preserva el resumen agregado, incluso en error', () => {
  const job = workflow.jobs['telemetry-maintenance'];
  const run = job.steps.find(step => step.name === 'Inspect or maintain backed telemetry').run;
  const flags = ['--batch-size','--max-batches','--deadline-ms','--max-stored-bytes'];
  const args = ['inspect','--out','/fixture/telemetry-maintenance.json'];
  for (const flag of flags) {
    const match = run.match(new RegExp(`${flag} ([0-9]+)`)); assert.ok(match); args.push(flag,match[1]);
  }
  const { config } = parseTelemetryMaintenanceArguments(args,'2026-10-07T22:00:00Z');
  assert.equal(config.batchSize*config.maxBatches,1000);
  assert.equal(config.deadlineMs,120000); assert.equal(config.maxStoredBytes,5242880);
  const receipt = job.steps.find(step => step.uses === 'actions/upload-artifact@v4');
  assert.equal(receipt.if,'always()');
  assert.equal(receipt.with.path,'${{ runner.temp }}/telemetry-maintenance.json');
  assert.equal(receipt.with['retention-days'],30);
  assert.ok(!run.includes('|| true') && !job['continue-on-error']);
  assert.equal(job['timeout-minutes'],5);
});
