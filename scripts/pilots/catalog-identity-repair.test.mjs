// Incluye la regresión SQLite del reparador en npm run test:ops.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = resolve('outputs/local-test-modules');
mkdirSync(directory, { recursive: true });
const result = await build({ entryPoints: ['scripts/pilots/cloudflare-catalog/repair-catalog-identities.test.ts'],
  bundle: true, packages: 'external', write: false, platform: 'node', target: 'node22', format: 'esm', logLevel: 'silent' });
const file = resolve(directory, 'identity-repair-' + randomUUID() + '.mjs');
writeFileSync(file, result.outputFiles[0].text, { flag: 'wx', mode: 0o600 });
await import(pathToFileURL(file).href);
