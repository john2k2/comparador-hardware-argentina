import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCatalogCommand } from '../run-catalog-refresh.mjs';

async function withRunner(run) {
  const cwd = await mkdtemp(join(tmpdir(), 'catalog-process-'));
  const output = join(cwd, 'result.json');
  try { await run(cwd, output); assert.deepEqual((await readdir(cwd)).filter(name => name.startsWith('.catalog-runner-')), []); }
  finally { await rm(cwd, { recursive: true, force: true }); }
}
const buildStub = contents => async ({ outfile }) => writeFile(outfile, contents);

test('supervisa un hijo real exitoso y preserva exactamente su resultado', async () => {
  await withRunner(async (cwd, output) => {
    const original = '{"source":"fixture","observed":2}\n';
    const code = await runCatalogCommand(['adaptive', output], { cwd,
      build: buildStub('import fs from "node:fs"; fs.writeFileSync(process.argv[3], ' + JSON.stringify(original) + ');') });
    assert.equal(code, 0); assert.equal(await readFile(output, 'utf8'), original);
  });
});

test('conserva un resultado parcial del hijo real que falla', async () => {
  await withRunner(async (cwd, output) => {
    const original = '{"status":"failed","observed":1}\n';
    const code = await runCatalogCommand(['requested', output], { cwd,
      build: buildStub('import fs from "node:fs"; fs.writeFileSync(process.argv[3], ' + JSON.stringify(original) + '); process.exitCode=1;') });
    assert.equal(code, 1); assert.equal(await readFile(output, 'utf8'), original);
  });
});

for (const scenario of ['build', 'spawn', 'missing', 'failed']) {
  test('genera recibo saneado sin salida en ' + scenario, async () => {
    await withRunner(async (cwd, output) => {
      await writeFile(output, ''); // mktemp del workflow crea un archivo vacío.
      const options = { cwd, build: buildStub(scenario === 'failed' ? 'process.exitCode=1;' : '') };
      if (scenario === 'build') options.build = async () => { throw new Error('PRIVATE_TOKEN private URL'); };
      if (scenario === 'spawn') options.spawn = () => {
        const child = new EventEmitter(); queueMicrotask(() => child.emit('error', new Error('PRIVATE_TOKEN'))); return child;
      };
      assert.equal(await runCatalogCommand(['priority', output], options), 1);
      const raw = await readFile(output, 'utf8'); const receipt = JSON.parse(raw);
      assert.equal(receipt.error, 'REFRESH_RUNNER_' + ({ build: 'BUILD_FAILED', spawn: 'SPAWN_FAILED', missing: 'MISSING_OUTPUT', failed: 'CHILD_FAILED' }[scenario]));
      assert.equal(receipt.persistence, 'unknown'); assert.equal(receipt.mode, 'priority');
      assert.equal(receipt.exitCode, scenario === 'missing' ? 0 : scenario === 'failed' ? 1 : null);
      assert.ok(Date.parse(receipt.finishedAt) >= Date.parse(receipt.startedAt));
      assert.equal('observed' in receipt, false); assert.doesNotMatch(raw, /PRIVATE_TOKEN|private URL/);
    });
  });
}

for (const ignoresSignal of [false, true]) {
  test('timeout de hijo real ' + (ignoresSignal ? 'escala SIGTERM ignorada' : 'termina por SIGTERM'), async () => {
    await withRunner(async (cwd, output) => {
      const code = await runCatalogCommand(['eneba-pilot', output], { cwd, timeoutMs: 750, killGraceMs: 75,
        build: buildStub((ignoresSignal ? 'process.on("SIGTERM",()=>{});' : '') + 'setInterval(()=>{},1000);') });
      assert.equal(code, 1);
      const receipt = JSON.parse(await readFile(output, 'utf8'));
      assert.equal(receipt.error, 'REFRESH_RUNNER_TIMEOUT');
      assert.equal(receipt.signal, ignoresSignal ? 'SIGKILL' : 'SIGTERM');
      assert.equal(receipt.persistence, 'unknown');
    });
  });
}

test('valida argumentos antes de build y nunca sobrescribe el input de import-interest', async () => {
  await withRunner(async (cwd, output) => {
    let builds = 0; const build = async () => { builds++; throw new Error('PRIVATE_TOKEN'); };
    await assert.rejects(runCatalogCommand(['verify-listings', output], { cwd, build }), /INVALID_REFRESH_ARGUMENTS/);
    assert.equal(builds, 0);
    await writeFile(output, '{"products":[]}');
    assert.equal(await runCatalogCommand(['import-interest', output], { cwd, build }), 1);
    assert.equal(await readFile(output, 'utf8'), '{"products":[]}');
  });
});
