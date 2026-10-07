import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import { buildHistoryArchive } from './history-archive.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../history-archive-pilot.mjs');
const rejected = args => {
  try { execFileSync(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { return error.stderr.toString(); }
  throw new Error('Se aceptó un CLI fuera del piloto');
};

test('no amplía corte o snapshot ni lee credenciales con opciones inesperadas', () => {
  for (const option of ['--cutoff', '--snapshot-at']) {
    const result = rejected(['upload', '--out', '/nonexistent-archive', '--server-config', '/nonexistent-env', option, '2026-10-07T00:00:00Z']);
    assert.match(result, /HISTORY_CLI_ARGUMENT/);
    assert.doesNotMatch(result, /ENOENT/);
  }
});

test('día futuro o fecha inexistente falla antes de abrir archivos o red', () => {
  assert.match(rejected(['export', '--out', '/nonexistent-archive', '--date', '2026-10-07']), /DAY_AFTER_CUTOFF/);
  assert.match(rejected(['export', '--out', '/nonexistent-archive', '--date', '2026-02-30']), /TIMESTAMP_DATE/);
});

test('verificar rechaza una fecha distinta aunque el archivo sea válido', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'history-cli-test-'));
  try {
    const expected = { projectId: 'zyiyziubpcpgoqlkcrie', cutoff: '2026-07-09T00:00:00.000000Z', snapshotAt: '2026-10-07T19:16:07.876892Z' };
    const archive = buildHistoryArchive([{ id: '00000000-0000-0000-0000-000000000001', product_id: 'p', store_id: 's', price: '10.00', original_price: null, stock: 'unknown', recorded_at: '2026-07-05T00:00:00.000000Z', offer_url: null }], expected);
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(archive.manifest));
    for (const [name, bytes] of archive.chunks) await fs.writeFile(path.join(dir, name), bytes);
    assert.match(rejected(['verify', '--out', dir, '--date', '2026-07-04']), /SELECTION_DAY_MISMATCH/);
    const result = execFileSync(process.execPath, [cli, 'verify', '--out', dir, '--date', '2026-07-05'], { encoding: 'utf8' });
    assert.equal(JSON.parse(result).verified, true);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
