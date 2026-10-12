import type { createD1CatalogReader } from './d1-catalog-reader';

export type D1CatalogReader = Awaited<ReturnType<typeof createD1CatalogReader>>;

/** Un selector puro: el backend apagado no carga OpenNext ni consulta D1. */
export function isD1CatalogEnabled(): boolean {
  return process.env.CATALOG_READ_BACKEND === 'd1';
}

/** Sin fallback: seleccionar D1 exige binding y catálogo certificado. */
export async function getD1CatalogReader(): Promise<D1CatalogReader | null> {
  if (!isD1CatalogEnabled()) return null;
  const fingerprint = process.env.CATALOG_FINGERPRINT;
  if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('CATALOG_FINGERPRINT_REQUIRED');
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const context = await getCloudflareContext({ async: true });
  const binding = (context.env as { CATALOG_DB?: { prepare?: unknown } }).CATALOG_DB;
  if (!binding || typeof binding.prepare !== 'function') throw new Error('CATALOG_D1_BINDING_REQUIRED');
  const { d1Adapter } = await import('../../../scripts/pilots/cloudflare-catalog/sqlite-adapter.mjs');
  const { createD1CatalogReader } = await import('./d1-catalog-reader');
  return createD1CatalogReader(d1Adapter(binding), { expectedCatalogFingerprint: fingerprint });
}
