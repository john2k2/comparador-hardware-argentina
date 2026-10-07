// Sólo prepara SQL privados para revisión; no lee env ni ofrece comando de aplicación.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareBackedTelemetryRetention } from '../lib/telemetry-backed-retention.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const SELECTION_SHA = '28200f5820003ab6634f2acd09ac0322a61395bfb5d3175d230b271b99aee009';
try {
  const args = process.argv.slice(2);
  if (args.length !== 3) throw new Error('TELEMETRY_PREPARE_ARGUMENTS');
  const dir = await fs.realpath(args[0]);
  async function read(name) {
    const file = await fs.realpath(path.join(dir, name));
    if (!file.startsWith(dir + path.sep) || (await fs.stat(file)).size > 1024 * 1024) throw new Error('TELEMETRY_PREPARE_LOCAL_FILE');
    return fs.readFile(file);
  }
  const selectionBytes = await fs.readFile(args[1]);
  if (hash(selectionBytes) !== SELECTION_SHA) throw new Error('TELEMETRY_SELECTION_HASH');
  const selection = JSON.parse(selectionBytes.toString('utf8'));
  const expected = { projectId: 'zyiyziubpcpgoqlkcrie', cutoff: '2026-10-07T20:10:00.000000Z', selectionSha256: SELECTION_SHA, selection: selection.rows };
  const backup = { manifest: JSON.parse((await read('manifest.json')).toString('utf8')), gzipBytes: await read('telemetry.json.gz') };
  const plan = prepareBackedTelemetryRetention(backup, expected);
  if (plan.selected !== 250) throw new Error('TELEMETRY_PREPARE_SAMPLE');
  const out = path.resolve(args[2]);
  await fs.mkdir(out, { mode: 0o700 });
  for (const [name, bytes] of [['preview.sql', plan.preview], ['apply-pending-approval.sql', plan.apply], ['restore-pending-approval.sql', plan.restore]]) {
    await fs.writeFile(path.join(out, name), bytes, { flag: 'wx', mode: 0o600 });
  }
  const receipt = { completedAt: new Date().toISOString(), selected: 250, fieldsCompared: 6, selectionSha256: SELECTION_SHA,
    manifestSha256: hash(JSON.stringify(backup.manifest) + '\n'), previewSha256: hash(plan.preview), applySha256: hash(plan.apply), restoreSha256: hash(plan.restore),
    executionIncluded: false, productionMutationApproved: false, originalRowsRemoved: 0 };
  await fs.writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ selected: 250, fieldsCompared: 6, executionIncluded: false, originalRowsRemoved: 0 }));
} catch (error) {
  const reason = error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'TELEMETRY_PREPARE_FAILED';
  console.error(JSON.stringify({ success: false, reason, executionIncluded: false, originalRowsRemoved: 0 }));
  process.exitCode = 1;
}
