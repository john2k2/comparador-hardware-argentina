export function isStableRuntimeMode(): boolean {
  return (
    process.env.DISABLE_LIVE_SCRAPING === '1'
    || process.env.E2E_STABLE_MODE === '1'
    || process.env.CI_E2E === '1'
  );
}

type LiveScrapingContext = {
  internalRefresh?: boolean;
  privilegedBypass?: boolean;
};

/**
 * Las visitas públicas deben responder desde el catálogo persistido. El
 * scraping queda reservado para el refresh autenticado o para una intervención
 * administrativa, así una tienda lenta o bloqueada no degrada una búsqueda.
 *
 * En desarrollo se conserva el comportamiento histórico para facilitar el
 * trabajo con scrapers. Producción puede habilitarlo temporalmente sólo con
 * `ENABLE_PUBLIC_LIVE_SCRAPING=1`.
 */
export function shouldSkipLiveScraping(context: LiveScrapingContext = {}): boolean {
  if (isStableRuntimeMode()) return true;
  if (context.internalRefresh || context.privilegedBypass) return false;

  if (process.env.NODE_ENV !== 'production') return false;
  return process.env.ENABLE_PUBLIC_LIVE_SCRAPING !== '1';
}
