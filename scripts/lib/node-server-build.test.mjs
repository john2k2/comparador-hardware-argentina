import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { runCatalogCommand } from '../run-catalog-refresh.mjs';
import { nodeServerBuildOptions } from './node-server-build.mjs';

const offlineEnvironment = { PATH: process.env.PATH, CATALOG_REQUESTED_RUNNER: '0', LOG_LEVEL: 'silent' };
const blockFetch = 'data:text/javascript,' + encodeURIComponent("globalThis.fetch = () => { throw new Error('TEST_NETWORK_FORBIDDEN'); };");

// Carga los imports reales, sin mocks de runners, Next o persistencia. La guarda
// de autorización debe ejecutarse antes de leer/adquirir ofertas o tocar cuentas.
for (const mode of ['guides', 'priority', 'adaptive', 'requested']) {
  test(`el runner ${mode} carga sus dependencias reales y conserva la guarda`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'catalog-import-test-'));
    const output = join(directory, 'result.json');
    let stderr = '';
    try {
      const result = await runCatalogCommand([mode, output], {
        timeoutMs: 15_000,
        spawn(executable, args, options) {
          const child = spawn(executable, ['--import', blockFetch, ...args], {
            ...options, env: offlineEnvironment, stdio: ['ignore', 'pipe', 'pipe'],
          });
          child.stdout.resume();
          child.stderr.on('data', chunk => { stderr += chunk; });
          return child;
        },
      });
      assert.equal(result, 1);
      assert.match(stderr, /REFRESH_RUNNER_REQUIRED/);
      assert.doesNotMatch(stderr, /ERR_MODULE_NOT_FOUND|TEST_NETWORK_FORBIDDEN/);
      const receipt = JSON.parse(await readFile(output, 'utf8'));
      assert.equal(receipt.error, 'REFRESH_RUNNER_CHILD_FAILED');
      assert.equal(receipt.persistence, 'unknown');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

// El colector vive en /tmp en Actions y resuelve paquetes por un symlink.
// Se importa su grafo real; no se llama ningún productor ni guardado.
for (const task of ['home', 'measurements']) {
  test(`el grafo del colector ${task} se importa fuera del checkout`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'measurement-import-test-'));
    const outfile = join(directory, 'collector.mjs');
    const entry = `
      export { saveObservedHomeSnapshot } from './src/lib/home/save-observed-snapshot';
      ${task === 'measurements' ? `
        export { executeMeasurementCommand } from './src/lib/measurement/service';
        export { saveMeasurementView } from './src/lib/measurement/store';
        export { getServerSupabaseServiceClient } from './src/lib/server/supabase-server';
        export { refreshEnebaPilot } from './src/lib/eneba/producer';
        export { ENEBA_CACHE_SCOPE, ENEBA_CACHE_KEY } from './src/lib/eneba/snapshot-cache';
      ` : ''}
    `;
    try {
      await build(nodeServerBuildOptions({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, outfile, logLevel: 'silent' }));
      await symlink(join(process.cwd(), 'node_modules'), join(directory, 'node_modules'), 'dir');
      const child = spawnSync(process.execPath, ['--import', blockFetch, '--input-type=module', '-e',
        `const loaded = await import(${JSON.stringify(outfile)}); if (typeof loaded.saveObservedHomeSnapshot !== 'function') throw Error('MISSING_HOME_EXPORT'); console.log('IMPORT_OK');`],
      { env: offlineEnvironment, encoding: 'utf8', timeout: 15_000 });
      assert.equal(child.error, undefined);
      assert.equal(child.status, 0, child.stderr);
      assert.equal(child.stdout.trim(), 'IMPORT_OK');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
