import type { HardwareCategory, Product } from '@/lib/types';
import { withAbortTimeout } from '@/lib/async/with-abort-timeout';
import { inferDetailHardwareCategory, isHardwareCategory } from '@/lib/catalog/hardware-categories';
import {
  buildDetailSearchQuery,
  extractPrefixAndCode,
  findBestProductMatch,
  normalizeId,
} from '@/lib/products/product-detail-helpers';
import { sanitizeProducts } from '@/lib/product-sanitizer';
import { fetchCompraGamerByQuery } from '@/lib/products/products-list-service';
import { SCRAPER_TIMEOUT_MS } from '@/lib/products/products-handler-shared';
import { fetchMexxProducts } from '@/lib/scrapers/mexx';
import { fetchVenexProducts } from '@/lib/scrapers/venex';
import { fetchFullh4rdProducts } from '@/lib/scrapers/fullh4rd';
import { fetchMaximusProducts } from '@/lib/scrapers/maximus';
import { fetchGamingCityProducts } from '@/lib/scrapers/gamingcity';
import { fetchGezatekProducts } from '@/lib/scrapers/gezatek';
import { fetchCompugardenProducts } from '@/lib/scrapers/compugarden';
import { fetchAllFoxtiendaSearch, fetchFoxtiendaProductById } from '@/lib/scrapers/foxtienda';
import { fetchLoggProducts } from '@/lib/scrapers/logg';
import { fetchPortalTechProductById, fetchPortalTechProducts } from '@/lib/scrapers/portaltech';
import { fetchAllPrestashopSearch } from '@/lib/scrapers/prestashop';
import { fetchAllQloudSearch } from '@/lib/scrapers/qloud';
import { fetchAllTiendaNubeSearch, fetchTiendaNubeProductById } from '@/lib/scrapers/tiendanube';
import { fetchAllWooCommerceSearch, fetchWooCommerceProductById } from '@/lib/scrapers/woocommerce';
import { fetchWiztechProductById, fetchWiztechProducts } from '@/lib/scrapers/wiztech';
import { fetchXtpcProductById, fetchXtpcProducts } from '@/lib/scrapers/xtpc';
import { logger } from '@/lib/logger';

type ObserveSource = (
  storeId: string,
  storeName: string,
  run: (signal: AbortSignal) => Promise<Product[]>,
) => Promise<Product[]>;

export async function resolveLiveProductDetail(
  id: string,
  category: string | null,
  observeSource: ObserveSource,
): Promise<Product | null> {
  logger.info('Re-scraping live product detail', {
    endpoint: '/api/products',
    id,
    category,
  });
  const storePrefix = id.split('-')[0];
  const cleanQuery = buildDetailSearchQuery(id).substring(0, 60);
  const { code } = extractPrefixAndCode(id);
  const searchQuery = code || cleanQuery || normalizeId(id);

  const mexxSearchUrl = `https://www.mexx.com.ar/buscar/?p=${encodeURIComponent(searchQuery)}`;
  const fullh4rdSearchUrl = `https://www.fullh4rd.com.ar/cat/search/${encodeURIComponent(searchQuery)}`;
  const venexSearchUrl = `https://www.venex.com.ar/resultados-busqueda.htm?keywords=${encodeURIComponent(searchQuery)}`;

  const fallbackCategory: HardwareCategory = isHardwareCategory(category)
    ? category
    : inferDetailHardwareCategory(`${searchQuery} ${id}`);

  const tiendanubeProduct = await withAbortTimeout(
    (signal) => fetchTiendaNubeProductById(id, fallbackCategory, { signal }),
    SCRAPER_TIMEOUT_MS,
    'tiendanube-detail',
  ).catch(() => null);
  if (tiendanubeProduct) return tiendanubeProduct;

  const foxtiendaProduct = await withAbortTimeout(
    (signal) => fetchFoxtiendaProductById(id, fallbackCategory, { signal }),
    SCRAPER_TIMEOUT_MS,
    'foxtienda-detail',
  ).catch(() => null);
  if (foxtiendaProduct) return foxtiendaProduct;

  const xtpcProduct = await withAbortTimeout(
    (signal) => fetchXtpcProductById(id, fallbackCategory, signal),
    SCRAPER_TIMEOUT_MS,
    'xtpc-detail',
  ).catch(() => null);
  if (xtpcProduct) return xtpcProduct;

  const portalTechProduct = await withAbortTimeout(
    (signal) => fetchPortalTechProductById(id, signal),
    SCRAPER_TIMEOUT_MS,
    'portaltech-detail',
  ).catch(() => null);
  if (portalTechProduct) return portalTechProduct;

  const wiztechProduct = await withAbortTimeout(
    (signal) => fetchWiztechProductById(id, fallbackCategory, signal),
    SCRAPER_TIMEOUT_MS,
    'wiztech-detail',
  ).catch(() => null);
  if (wiztechProduct) return wiztechProduct;

  const wooProduct = await withAbortTimeout(
    (signal) => fetchWooCommerceProductById(id, fallbackCategory, { signal }),
    SCRAPER_TIMEOUT_MS,
    'woocommerce-detail',
  ).catch(() => null);
  if (wooProduct) return wooProduct;

  const searchPromises: Promise<Product[]>[] = [];
  if (storePrefix === 'mexx') {
    searchPromises.push(observeSource('mexx', 'Mexx', (signal) => fetchMexxProducts(mexxSearchUrl, fallbackCategory, signal)));
  } else if (storePrefix === 'venex') {
    searchPromises.push(observeSource('venex', 'Venex', (signal) => fetchVenexProducts(venexSearchUrl, fallbackCategory, signal)));
  } else if (storePrefix === 'fh') {
    searchPromises.push(observeSource('fullh4rd', 'FullH4rd', (signal) => fetchFullh4rdProducts(fullh4rdSearchUrl, fallbackCategory, signal)));
  } else if (storePrefix === 'maximus') {
    searchPromises.push(observeSource('maximus', 'Maximus', (signal) => fetchMaximusProducts(searchQuery, fallbackCategory, signal)));
  } else if (storePrefix === 'gamingcity') {
    searchPromises.push(observeSource('gamingcity', 'Gaming City', (signal) => fetchGamingCityProducts(cleanQuery || searchQuery, fallbackCategory, signal)));
  } else if (storePrefix === 'gezatek') {
    searchPromises.push(observeSource('gezatek', 'Gezatek', (signal) => fetchGezatekProducts(searchQuery, fallbackCategory, signal)));
  } else if (storePrefix === 'compugarden') {
    searchPromises.push(observeSource('compugarden', 'Compugarden', (signal) => fetchCompugardenProducts(searchQuery, fallbackCategory, signal)));
  } else if (storePrefix === 'logg') {
    searchPromises.push(observeSource('logg', 'Logg', (signal) => fetchLoggProducts(cleanQuery || searchQuery, fallbackCategory, signal)));
  } else if (['clickgaming', 'hypergaming', 'megasoft', 'noxie', 'rockethard'].includes(storePrefix)) {
    searchPromises.push(
      withAbortTimeout(
        (signal) => fetchAllQloudSearch(searchQuery, fallbackCategory, '/api/products', [storePrefix], { signal }),
        SCRAPER_TIMEOUT_MS,
        `qloud-${storePrefix}`,
      ).catch(() => [] as Product[]),
    );
  } else if (storePrefix === 'armytech') {
    searchPromises.push(
      withAbortTimeout(
        (signal) => fetchAllPrestashopSearch(searchQuery, fallbackCategory, '/api/products', [storePrefix], { signal }),
        SCRAPER_TIMEOUT_MS,
        `prestashop-${storePrefix}`,
      ).catch(() => [] as Product[]),
    );
  } else if (storePrefix === 'hftecnologia' || storePrefix === 'spacevideojuegos') {
    searchPromises.push(
      withAbortTimeout(
        (signal) => fetchAllFoxtiendaSearch(searchQuery, fallbackCategory, '/api/products', [storePrefix], { signal }),
        SCRAPER_TIMEOUT_MS,
        `foxtienda-${storePrefix}`,
      ).catch(() => [] as Product[]),
    );
  } else if (storePrefix === 'xtpc') {
    searchPromises.push(observeSource('xtpc', 'Xt-PC', (signal) => fetchXtpcProducts(searchQuery, fallbackCategory, signal)));
  } else if (storePrefix === 'portaltech') {
    searchPromises.push(observeSource('portaltech', 'Portal Tech', (signal) => fetchPortalTechProducts(searchQuery, fallbackCategory, signal)));
  } else if (storePrefix === 'wiztech') {
    searchPromises.push(observeSource('wiztech', 'WizTech', (signal) => fetchWiztechProducts(searchQuery, fallbackCategory, signal)));
  } else if (storePrefix === 'cg' || storePrefix === 'compragamer') {
    searchPromises.push(observeSource('compragamer', 'CompraGamer', (signal) => fetchCompraGamerByQuery(searchQuery, fallbackCategory, signal)));
  } else {
    searchPromises.push(
      observeSource('mexx', 'Mexx', (signal) => fetchMexxProducts(mexxSearchUrl, fallbackCategory, signal)),
      observeSource('venex', 'Venex', (signal) => fetchVenexProducts(venexSearchUrl, fallbackCategory, signal)),
      observeSource('fullh4rd', 'FullH4rd', (signal) => fetchFullh4rdProducts(fullh4rdSearchUrl, fallbackCategory, signal)),
      observeSource('maximus', 'Maximus', (signal) => fetchMaximusProducts(searchQuery, fallbackCategory, signal)),
      observeSource('gamingcity', 'Gaming City', (signal) => fetchGamingCityProducts(cleanQuery || searchQuery, fallbackCategory, signal)),
      observeSource('gezatek', 'Gezatek', (signal) => fetchGezatekProducts(searchQuery, fallbackCategory, signal)),
      observeSource('compugarden', 'Compugarden', (signal) => fetchCompugardenProducts(searchQuery, fallbackCategory, signal)),
      observeSource('logg', 'Logg', (signal) => fetchLoggProducts(cleanQuery || searchQuery, fallbackCategory, signal)),
      observeSource('compragamer', 'CompraGamer', (signal) => fetchCompraGamerByQuery(searchQuery, fallbackCategory, signal)),
      observeSource('portaltech', 'Portal Tech', (signal) => fetchPortalTechProducts(searchQuery, fallbackCategory, signal)),
      observeSource('xtpc', 'Xt-PC', (signal) => fetchXtpcProducts(searchQuery, fallbackCategory, signal)),
      observeSource('wiztech', 'WizTech', (signal) => fetchWiztechProducts(searchQuery, fallbackCategory, signal)),
      withAbortTimeout(
        (signal) => fetchAllFoxtiendaSearch(searchQuery, fallbackCategory, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'foxtienda',
      ).catch(() => [] as Product[]),
      withAbortTimeout(
        (signal) => fetchAllQloudSearch(searchQuery, fallbackCategory, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'qloud',
      ).catch(() => [] as Product[]),
      withAbortTimeout(
        (signal) => fetchAllPrestashopSearch(searchQuery, fallbackCategory, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'prestashop',
      ).catch(() => [] as Product[]),
      withAbortTimeout(
        (signal) => fetchAllTiendaNubeSearch(searchQuery, fallbackCategory, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'tiendanube',
      ).catch(() => [] as Product[]),
      withAbortTimeout(
        (signal) => fetchAllWooCommerceSearch(searchQuery, fallbackCategory, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'woocommerce',
      ).catch(() => [] as Product[]),
    );
  }

  const idResults = await Promise.all(searchPromises);
  const foundProducts: Product[] = sanitizeProducts(idResults.flat());
  return findBestProductMatch(id, foundProducts) ?? null;
}
