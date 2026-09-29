import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Compila el evaluador puro de la aplicación, sin arrancar Next ni duplicar reglas.
export async function loadG02SampleEvaluator() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../../src/lib/catalog/g02-sample-evidence.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', target: 'node22', format: 'esm', logLevel: 'silent',
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)).measureG02Sample;
}
