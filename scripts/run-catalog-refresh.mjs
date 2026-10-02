import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
// Dentro del checkout para que Node resuelva sus dependencias instaladas.
const directory = await mkdtemp(join(process.cwd(), '.catalog-runner-'));
const standalone = ['import-interest', 'inspect-sources', 'verify-listings'].includes(process.argv[2]);
try {
  const outfile = join(directory, 'refresh.mjs');
  await build({ entryPoints: [standalone ? `scripts/catalog/${process.argv[2]}.ts` : 'scripts/catalog/refresh-entry.ts'], outfile, bundle: true,
    platform: 'node', target: 'node22', format: 'esm', packages: 'external', logLevel: 'warning',
    plugins: [{ name: 'server-only-cli', setup(builder) {
      // Marcador de compilación Next: este artefacto sólo se ejecuta en Node.
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'cli-marker' }));
      builder.onLoad({ filter: /.*/, namespace: 'cli-marker' }, () => ({ contents: 'export {};', loader: 'js' }));
    } }]  });
  const child = spawn(process.execPath, ['--conditions=react-server', outfile, ...process.argv.slice(standalone ? 3 : 2)], { stdio: 'inherit', env: process.env });
  const timeoutMs = process.argv[2] === 'requested' ? 8 * 60_000 : 19 * 60_000;
  const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  clearTimeout(timer);
  process.exitCode = code;
} finally { await rm(directory, { recursive: true, force: true }); }
