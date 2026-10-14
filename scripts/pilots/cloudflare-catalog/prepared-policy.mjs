// La política compilada invalida QC preparada cuando cambia su implementación.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const generated = 'src/lib/catalog/prepared-policy.generated.ts';
export async function computePreparedPolicy() {
  const compiled = await build({ absWorkingDir: root,
    entryPoints: ['scripts/pilots/cloudflare-catalog/prepared-product-builder.ts'],
    bundle: true, write: false, platform: 'neutral', format: 'esm',
    packages: 'external', metafile: true, logLevel: 'silent' });
  const files = Object.keys(compiled.metafile.inputs).map(file => relative(root, resolve(root, file)).replaceAll('\\', '/'))
    .filter(file => file !== generated);
  files.push('package-lock.json', 'tsconfig.json', 'scripts/pilots/cloudflare-catalog/prepared-policy.mjs');
  const uniqueFiles = [...new Set(files)].sort();
  const inputs = uniqueFiles.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]);
  return createHash('sha256').update(JSON.stringify({ version: 1, inputs })).digest('hex');
}
export async function updatePreparedPolicy({ check = false } = {}) {
  const policy = await computePreparedPolicy();
  const text = `// Generado por prepared-policy.mjs; no editar manualmente.\nexport const CATALOG_PREPARED_POLICY = '${policy}';\n`;
  const target = resolve(root, generated);
  if (check) {
    if (readFileSync(target, 'utf8') !== text) throw new Error('CATALOG_PREPARED_POLICY_STALE');
  } else writeFileSync(target, text);
  return policy;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3 || process.argv[2] && process.argv[2] !== '--check') throw new Error('PREPARED_POLICY_USAGE');
  await updatePreparedPolicy({ check: process.argv[2] === '--check' });
}
