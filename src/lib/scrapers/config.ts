// ============================================
// Scraper Config - Configuración de scrapers
// ============================================

import type { ScraperConfig } from '../types';

// Configuración de scrapers para cada tienda
export const scraperConfigs: Record<string, ScraperConfig> = {
  mercadolibre: {
    storeId: 'mercadolibre',
    name: 'Mercado Libre',
    baseUrl: 'https://www.mercadolibre.com.ar',
    selectors: {
      productList: '.ui-search-layout__item',
      productCard: '.ui-search-result',
      productName: '.ui-search-item__title',
      productPrice: '.price-tag-fraction',
      productImage: 'img.ui-search-result-image__element',
      productUrl: 'a.ui-search-link',
      productStock: '.ui-search-stock',
    },
    pagination: {
      type: 'offset',
      offsetParam: 'O',
      limit: 50,
    },
  },
  huevocash: {
    storeId: 'huevocash',
    name: 'Huevo Cash',
    baseUrl: 'https://www.huevocash.com.ar',
    selectors: {
      productList: '.product-item',
      productCard: '.product-item',
      productName: '.product-title',
      productPrice: '.price-current',
      productImage: '.product-image img',
      productUrl: 'a.product-url',
      productStock: '.stock-status',
    },
    pagination: {
      type: 'page',
      pageParam: 'page',
      limit: 24,
    },
  },
};

// URLs de categorías por tienda
export const categoryUrls: Record<string, Record<string, string>> = {
  mercadolibre: {
    procesadores: 'https://listado.mercadolibre.com.ar/computacion/componentes-pc/procesadores/',
    'tarjetas-graficas': 'https://listado.mercadolibre.com.ar/computacion/componentes-pc/tarjetas-graficas/',
    'memoria-ram': 'https://listado.mercadolibre.com.ar/computacion/componentes-pc/memorias-ram/',
    almacenamiento: 'https://listado.mercadolibre.com.ar/computacion/almacenamiento/discos-ssd/',
    motherboards: 'https://listado.mercadolibre.com.ar/computacion/componentes-pc/motherboards/',
    'fuentes-alimentacion': 'https://listado.mercadolibre.com.ar/computacion/componentes-pc/fuentes/',
    gabinetes: 'https://listado.mercadolibre.com.ar/computacion/componentes-pc/gabinetes/',
    perifericos: 'https://listado.mercadolibre.com.ar/computacion/perifericos-pc/',
  },
  huevocash: {
    procesadores: 'https://www.huevocash.com.ar/procesadores',
    'tarjetas-graficas': 'https://www.huevocash.com.ar/placas-de-video',
    'memoria-ram': 'https://www.huevocash.com.ar/memorias-ram',
    almacenamiento: 'https://www.huevocash.com.ar/discos-ssd',
    motherboards: 'https://www.huevocash.com.ar/motherboards',
    perifericos: 'https://www.huevocash.com.ar/perifericos',
  },
};

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
  mercadolibre: 3000, // Mercado Libre es más estricto
  huevocash: 2000,
};

// Obtener config de scraper por tienda
export function getScraperConfig(storeId: string): ScraperConfig | undefined {
  return scraperConfigs[storeId];
}

// Obtener URL de categoría por tienda
export function getCategoryUrl(storeId: string, category: string): string | undefined {
  return categoryUrls[storeId]?.[category];
}

// Obtener rate limit por tienda
export function getRateLimit(storeId: string): number {
  return (rateLimits as Record<string, number>)[storeId] || rateLimits.default;
}
