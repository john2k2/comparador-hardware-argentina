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
  assert.ok(job.if.includes("needs.refresh.outputs.mode == 'priority'"));
  assert.equal(workflow.jobs.refresh.outputs.mode,'${{ steps.resolve.outputs.mode }}');
  assert.equal(job.env.TELEMETRY_RETENTION_MODE,"${{ vars.TELEMETRY_RETENTION_MODE || 'inspect' }}");
  assert.equal(job.env.SUPABASE_SECRET_KEY,'${{ secrets.SUPABASE_SECRET_KEY }}');
  assert.equal(job.steps.find(step => step.uses === 'actions/setup-node@v4').with['node-version'],22);
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
