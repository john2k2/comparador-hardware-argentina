import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = args => spawnSync(process.execPath, ['scripts/telemetry-backup-pilot.mjs', ...args], { encoding: 'utf8', timeout: 5000 });
test('CLI rechaza modos mutantes y flags ajenos antes de leer configuración privada', () => {
  for (const args of [['apply'], ['delete'], ['export', '--apply'], ['upload', '--create-bucket'],
    ['export', '--archive', 'fixture', '--archive', 'other'], ['download', '--server-config']]) {
    const result = run(args);
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).originalRowsRemoved, 0);
  }
});

test('un recibo de selección alterado se rechaza antes de acceder a env o red', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-cli-test-'));
  try {
    const selection = path.join(dir, 'selection.json');
    fs.writeFileSync(selection, JSON.stringify({ rows: [], selected: 250 }));
    const result = run(['export', '--server-config', path.join(dir, 'absent-env'), '--selection', selection, '--archive', path.join(dir, 'backup')]);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).reason, 'TELEMETRY_SELECTION_HASH');
    assert.equal(fs.existsSync(path.join(dir, 'backup')), false);
  } finally { fs.rmSync(dir, { recursive: true }); }
});
