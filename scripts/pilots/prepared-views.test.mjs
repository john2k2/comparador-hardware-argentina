// Incluye los contratos de controlplane en npm run test:ops sin instalar runtime TS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';

test('productor firmado e índice de observaciones mantienen sus contratos locales', async () => {
  const bundle = await build({ entryPoints: [ 'scripts/pilots/cloudflare-catalog/prepared-view-build.test.ts' ],
    bundle: true, packages: 'external', write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  const second = await build({ entryPoints: [ 'scripts/pilots/cloudflare-catalog/observation-clock-index.test.ts' ],
    bundle: true, packages: 'external', write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  for (const compiled of [bundle, second]) {
    const outcome = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module'], { cwd: process.cwd(), stdio: ['pipe','pipe','pipe'] });
      let output = '';
      child.stdout.on('data', data => { output += data; });
      child.stderr.on('data', data => { output += data; });
      child.on('error', reject);
      child.on('close', code => resolve({ code, output }));
      child.stdin.end(compiled.outputFiles[0].text);
    });
    assert.equal(outcome.code, 0, outcome.output);
  }
});
