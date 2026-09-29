import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
// Dentro del checkout para que Node resuelva sus dependencias instaladas.
const directory = await mkdtemp(join(process.cwd(), '.catalog-runner-'));
try {
  const outfile = join(directory, 'refresh.mjs');
  await build({ entryPoints: ['scripts/catalog/refresh-entry.ts'], outfile, bundle: true,
    platform: 'node', target: 'node22', format: 'esm', packages: 'external', logLevel: 'warning',
    plugins: [{ name: 'server-only-cli', setup(builder) {
      // Marcador de compilación Next: este artefacto sólo se ejecuta en Node.
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'cli-marker' }));
      builder.onLoad({ filter: /.*/, namespace: 'cli-marker' }, () => ({ contents: 'export {};', loader: 'js' }));
    } }]  });
  const child = spawn(process.execPath, ['--conditions=react-server', outfile, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
  const timer = setTimeout(() => child.kill('SIGTERM'), 19 * 60_000);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  clearTimeout(timer);
  process.exitCode = code;
} finally { await rm(directory, { recursive: true, force: true }); }
