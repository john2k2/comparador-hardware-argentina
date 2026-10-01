import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Usa las reglas reales con sus imports de aplicación en el piloto Node.
export async function loadPriceUtils() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../../src/lib/price-utils.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', target: 'node22', format: 'esm', logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
