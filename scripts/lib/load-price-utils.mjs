import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Usa las reglas reales con sus imports de aplicación en el piloto Node.
async function loadApplicationModule(name) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../../src/lib/${name}.ts`, import.meta.url))],
    bundle: true, write: false, platform: 'node', target: 'node22', format: 'esm', logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

export function loadPriceUtils() { return loadApplicationModule('price-utils'); }
export function loadProductIdentity() { return loadApplicationModule('product-identity'); }
