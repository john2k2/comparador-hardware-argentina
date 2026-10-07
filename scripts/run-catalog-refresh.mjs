import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const normal = ['priority', 'guides', 'requested', 'adaptive'];
const standalone = ['import-interest', 'inspect-sources', 'verify-listings', 'eneba-pilot'];

// Dependencias inyectables para probar el supervisor sin cargar runners o cuentas.
export async function runCatalogCommand(args, options = {}) {
  const [mode] = args;
  const count = mode === 'verify-listings' ? 3 : 2;
  if ((!normal.includes(mode) && !standalone.includes(mode)) || args.some(arg => typeof arg !== 'string' || !arg.trim())
    || (mode === 'eneba-pilot' ? args.length < 1 || args.length > 2 : args.length !== count)) throw new Error('INVALID_REFRESH_ARGUMENTS');
  const output = mode === 'import-interest' ? undefined : args[mode === 'verify-listings' ? 2 : 1];
  const cwd = options.cwd ?? process.cwd();
  const startedAt = new Date().toISOString();
  let directory;
  let phase = 'build';
  let code = 1;
  let childExitCode = null;
  let signal = null;
  let failure = null;
  try {
    // Dentro del checkout para que Node resuelva sus dependencias instaladas.
    directory = await mkdtemp(join(cwd, '.catalog-runner-'));
    const outfile = join(directory, 'refresh.mjs');
    await (options.build ?? build)({ entryPoints: [standalone.includes(mode) ? 'scripts/catalog/' + mode + '.ts' : 'scripts/catalog/refresh-entry.ts'], outfile, bundle: true,
      platform: 'node', target: 'node22', format: 'esm', packages: 'external', logLevel: 'warning',
      plugins: [{ name: 'server-only-cli', setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'cli-marker' }));
        builder.onLoad({ filter: /.*/, namespace: 'cli-marker' }, () => ({ contents: 'export {};', loader: 'js' }));
      } }] });
    phase = 'spawn';
    const child = (options.spawn ?? spawn)(process.execPath, ['--conditions=react-server', outfile, ...args.slice(standalone.includes(mode) ? 1 : 0)], { cwd, stdio: 'inherit', env: process.env });
    const timeoutMs = options.timeoutMs ?? (mode === 'eneba-pilot' ? 90_000 : mode === 'requested' ? 8 * 60_000 : 19 * 60_000);
    let escalation;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Sólo este hijo; el padre no queda colgado si ignora SIGTERM.
      escalation = setTimeout(() => child.kill('SIGKILL'), options.killGraceMs ?? 5_000);
    }, timeoutMs);
    try {
      const result = await new Promise((done, failed) => {
        child.once('error', failed);
        child.once('close', (exitCode, exitSignal) => done({ exitCode, exitSignal }));
      });
      phase = 'exit';
      childExitCode = Number.isInteger(result.exitCode) ? result.exitCode : null;
      code = childExitCode ?? 1;
      signal = ['SIGTERM', 'SIGKILL', 'SIGINT'].includes(result.exitSignal) ? result.exitSignal : null;
      if (timedOut) { failure = 'TIMEOUT'; code = 1; }
      else if (code !== 0) failure = 'CHILD_FAILED';
    } finally { clearTimeout(timer); clearTimeout(escalation); }
  } catch {
    failure = phase === 'build' ? 'BUILD_FAILED' : 'SPAWN_FAILED';
    code = 1;
  } finally { if (directory) await rm(directory, { recursive: true, force: true }); }

  if (output) {
    const path = resolve(cwd, output);
    // Preservar toda salida no vacía, también un resultado parcial del hijo.
    const existing = await stat(path).catch(error => { if (error.code === 'ENOENT') return null; throw new Error('REFRESH_RUNNER_RECEIPT_FAILED'); });
    if (!existing || existing.size === 0) {
      code = 1;
      const receipt = { source: 'catalog-runner-wrapper', status: 'failed', mode, startedAt, finishedAt: new Date().toISOString(),
        error: 'REFRESH_RUNNER_' + (failure ?? 'MISSING_OUTPUT'), phase, exitCode: childExitCode, signal, wrapperExitCode: code, persistence: 'unknown' };
      const temporary = path + '.wrapper-' + process.pid + '.tmp';
      try {
        await writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        await rename(temporary, path);
      } catch { throw new Error('REFRESH_RUNNER_RECEIPT_FAILED'); }
      finally { await rm(temporary, { force: true }); }
    }
  }
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runCatalogCommand(process.argv.slice(2)); }
  catch (error) { process.stderr.write(error instanceof Error && /^(INVALID_REFRESH_ARGUMENTS|REFRESH_RUNNER_RECEIPT_FAILED)$/.test(error.message) ? error.message + '\n' : 'REFRESH_RUNNER_FAILED\n'); process.exitCode = 1; }
}
