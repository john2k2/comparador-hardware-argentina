// ============================================
// Scraper Registry — Registro central de scrapers
// ============================================
// Cada scraper se registra aqui con una interfaz comun.
// Esto elimina la necesidad de importar manualmente cada scraper
// en search-live.ts y permite agregar/quitar stores sin modificar
// la logica de busqueda.
// ============================================

import type { HardwareCategory, Product } from '../types';
import { fetchMexxProducts } from './mexx';
import { fetchVenexProducts } from './venex';
import { fetchFullh4rdProducts } from './fullh4rd';
import { fetchMaximusProducts } from './maximus';
import { fetchGamingCityProducts } from './gamingcity';
import { fetchGezatekProducts } from './gezatek';
import { fetchCompugardenProducts } from './compugarden';
import { fetchLoggProducts } from './logg';
import { fetchPortalTechProducts } from './portaltech';
import { searchCompraGamerProducts } from './compragamer';
import { fetchXtpcProducts } from './xtpc';
import { fetchWiztechProducts } from './wiztech';
import { fetchAllFoxtiendaSearch } from './foxtienda';
import { fetchAllQloudSearch } from './qloud';
import { fetchAllPrestashopSearch } from './prestashop';
import { fetchAllTiendaNubeSearch } from './tiendanube';
import { fetchAllWooCommerceSearch } from './woocommerce';

export type StoreScraperFn = (params: {
  query: string;
  searchUrl: string;
  category?: HardwareCategory;
  selectedStoreIds?: Set<string>;
  signal: AbortSignal;
}) => Promise<Product[]>;

export interface StoreScraper {
  id: string;
  displayName: string;
  baseUrl?: string;
  /** Para scrapers con URL de busqueda fija (mexx, venex, fullh4rd) */
  buildSearchUrl?: (query: string) => string;
  /** Funcion de scraping */
  fn: StoreScraperFn;
  /** Framework scrapers (foxtienda, tiendanube, etc.) que manejan multiples tiendas internas */
  isFramework?: boolean;
}

const DEFAULT_CATEGORY: HardwareCategory = 'perifericos';

/** Registry de scrapers de tiendas individuales */
export const STORE_SCRAPERS: StoreScraper[] = [
  {
    id: 'mexx',
    displayName: 'Mexx',
    baseUrl: 'https://www.mexx.com.ar',
    buildSearchUrl: (query) => `https://www.mexx.com.ar/buscar/?p=${encodeURIComponent(query)}`,
    fn: ({ searchUrl, category, signal }) => fetchMexxProducts(searchUrl, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'venex',
    displayName: 'Venex',
    baseUrl: 'https://www.venex.com.ar',
    buildSearchUrl: (query) => `https://www.venex.com.ar/resultados-busqueda.htm?keywords=${encodeURIComponent(query)}`,
    fn: ({ searchUrl, category, signal }) => fetchVenexProducts(searchUrl, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'fullh4rd',
    displayName: 'FullH4rd',
    baseUrl: 'https://www.fullh4rd.com.ar',
    buildSearchUrl: (query) => `https://www.fullh4rd.com.ar/cat/search/${encodeURIComponent(query)}`,
    fn: ({ searchUrl, category, signal }) => fetchFullh4rdProducts(searchUrl, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'maximus',
    displayName: 'Maximus',
    baseUrl: 'https://www.maximus.com.ar',
    buildSearchUrl: (query) => query,
    fn: ({ query, category, signal }) => fetchMaximusProducts(query, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'gamingcity',
    displayName: 'Gaming City',
    baseUrl: 'https://www.gamingcity.com.ar',
    buildSearchUrl: (query) => query,
    fn: ({ query, category, signal }) => fetchGamingCityProducts(query, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'gezatek',
    displayName: 'Gezatek',
    baseUrl: 'https://www.gezatek.com.ar',
    buildSearchUrl: (query) => query,
    fn: ({ query, category, signal }) => fetchGezatekProducts(query, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'compugarden',
    displayName: 'Compugarden',
    baseUrl: 'https://www.compugarden.com.ar',
    buildSearchUrl: (query) => query,
    fn: ({ query, category, signal }) => fetchCompugardenProducts(query, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'logg',
    displayName: 'Logg',
    baseUrl: 'https://www.logg.com.ar',
    buildSearchUrl: (query) => query,
    fn: ({ query, category, signal }) => fetchLoggProducts(query, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'portaltech',
    displayName: 'Portal Tech',
    baseUrl: 'https://www.portaltech.com.ar',
    buildSearchUrl: (query) => query,
    fn: ({ query, category, signal }) => fetchPortalTechProducts(query, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'compragamer',
    displayName: 'CompraGamer',
    baseUrl: 'https://www.compragamer.com',
    buildSearchUrl: (query) => query,
    fn: ({ query, category, signal }) => searchCompraGamerProducts(query, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'xtpc',
    displayName: 'Xt-PC',
    baseUrl: 'https://www.xt-pc.com',
    buildSearchUrl: (query) => query,
    fn: ({ query, category, signal }) => fetchXtpcProducts(query, category ?? DEFAULT_CATEGORY, signal),
  },
  {
    id: 'wiztech',
    displayName: 'WizTech',
    baseUrl: 'https://www.wiztech.com.ar',
    buildSearchUrl: (query) => query,
    fn: ({ query, category, signal }) => fetchWiztechProducts(query, category ?? DEFAULT_CATEGORY, signal),
  },
];

/** Framework scrapers (manejan multiples tiendas internas) */
export const FRAMEWORK_SCRAPERS: StoreScraper[] = [
  {
    id: 'foxtienda',
    displayName: 'Foxtienda',
    isFramework: true,
    fn: ({ query, category, selectedStoreIds, signal }) => fetchAllFoxtiendaSearch(query, category ?? DEFAULT_CATEGORY, '/api/search', selectedStoreIds, { signal }),
  },
  {
    id: 'qloud',
    displayName: 'Qloud',
    isFramework: true,
    fn: ({ query, category, selectedStoreIds, signal }) => fetchAllQloudSearch(query, category ?? DEFAULT_CATEGORY, '/api/search', selectedStoreIds, { signal }),
  },
  {
    id: 'prestashop',
    displayName: 'Prestashop',
    isFramework: true,
    fn: ({ query, category, selectedStoreIds, signal }) => fetchAllPrestashopSearch(query, category ?? DEFAULT_CATEGORY, '/api/search', selectedStoreIds, { signal }),
  },
  {
    id: 'tiendanube',
    displayName: 'TiendaNube',
    isFramework: true,
    fn: ({ query, category, selectedStoreIds, signal }) => fetchAllTiendaNubeSearch(query, category ?? DEFAULT_CATEGORY, '/api/search', selectedStoreIds, { signal }),
  },
  {
    id: 'woocommerce',
    displayName: 'WooCommerce',
    isFramework: true,
    fn: ({ query, category, selectedStoreIds, signal }) => fetchAllWooCommerceSearch(query, category ?? DEFAULT_CATEGORY, '/api/search', selectedStoreIds, { signal }),
  },
];

/** Todos los scrapers combinados */
export const ALL_SCRAPERS: StoreScraper[] = [...STORE_SCRAPERS, ...FRAMEWORK_SCRAPERS];

/** Mapa de scrapers por ID para busqueda rapida */
export const SCRAPER_BY_ID = new Map(ALL_SCRAPERS.map((scraper) => [scraper.id, scraper]));

/** Obtiene un scraper por su ID */
export function getStoreScraper(storeId: string): StoreScraper | undefined {
  return SCRAPER_BY_ID.get(storeId);
}

/** Obtiene todos los IDs de scrapers disponibles */
export function getAvailableScraperIds(): string[] {
  return ALL_SCRAPERS.map((scraper) => scraper.id);
}
