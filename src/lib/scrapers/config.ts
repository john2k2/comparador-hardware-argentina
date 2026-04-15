// ============================================
// Scraper Config — Configuración de scrapers
// ============================================

// URLs de tiendas activas se definen en scraper-registry.ts
// Las configuraciones de mercadolibre y huevocash fueron eliminadas
// porque nunca se usaron en scrapers activos.

// Configuración de user agents
export const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

// Headers adicionales
export const scraperHeaders = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

// Configuración de rate limiting (ms entre requests)
export const rateLimits = {
  default: 2000, // 2 segundos entre requests
};

// Obtener rate limit por tienda
export function getRateLimit(storeId: string): number {
  return (rateLimits as Record<string, number>)[storeId] || rateLimits.default;
}
