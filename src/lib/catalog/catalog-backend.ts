import type { createD1CatalogReader } from './d1-catalog-reader';
import { captureMacCatalogBinding } from './mac-catalog-binding';

export type D1CatalogReader = Awaited<ReturnType<typeof createD1CatalogReader>>;

/** Un selector puro: el backend apagado no carga proveedores ni consulta SQL. */
export function isCatalogSqlBackendEnabled(): boolean {
  return process.env.CATALOG_READ_BACKEND === 'd1' || process.env.CATALOG_READ_BACKEND === 'mac';
}

/** Export histórico usado por todos los callers para evitar el fallback legado. */
export const isD1CatalogEnabled = isCatalogSqlBackendEnabled;

/** Sin fallback: seleccionar SQL exige binding y catálogo certificado. */
export async function getD1CatalogReader(): Promise<D1CatalogReader | null> {
  if (!isD1CatalogEnabled()) return null;
  const fingerprint = process.env.CATALOG_FINGERPRINT;
  if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('CATALOG_FINGERPRINT_REQUIRED');
  const mac = process.env.CATALOG_READ_BACKEND === 'mac' ? captureMacCatalogBinding() : null;
  let binding: { prepare?: unknown };
  if (mac) binding = mac.binding;
  else {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const context = await getCloudflareContext({ async: true });
    const cloudflareBinding = (context.env as { CATALOG_DB?: { prepare?: unknown } }).CATALOG_DB;
    if (!cloudflareBinding || typeof cloudflareBinding.prepare !== 'function') throw new Error('CATALOG_D1_BINDING_REQUIRED');
    binding = cloudflareBinding;
  }
  const { d1Adapter } = await import('../../../scripts/pilots/cloudflare-catalog/sqlite-adapter.mjs');
  const { createD1CatalogReader } = await import('./d1-catalog-reader');
  let pageCache: Cache | undefined;
  if (!mac && process.env.CATALOG_RESPONSE_CACHE === '1') {
    try { pageCache = (globalThis.caches as CacheStorage & { default?: Cache } | undefined)?.default; }
    catch { /* Sin Cache API se conserva la lectura certificada de D1. */ }
  }
  const reader = await createD1CatalogReader(d1Adapter(binding), { expectedCatalogFingerprint: fingerprint, pageCache,
    ...(process.env.CATALOG_PREPARED_VIEWS === '1'
      ? { prepared: { publicKey: process.env.CATALOG_PREPARED_PUBLIC_KEY ?? '' } } : {}) });
  mac?.assertCurrent();
  return reader;
}
