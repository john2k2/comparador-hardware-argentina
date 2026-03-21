import type { HardwareCategory, Product } from '@/lib/types';
import { withAbortTimeout, withPromiseTimeout } from '@/lib/async/with-abort-timeout';
import { hardwareCategoryToSearchTerm } from '@/lib/catalog/hardware-categories';
import { snapshotProducts } from '@/lib/cache/search-snapshot';
import { persistProductsSnapshot } from '@/lib/persistence/product-catalog';
import { normalizeProductContent } from '@/lib/products/normalize-product-content';
import {
  countMatchedQueryWords,
  normalizeForQueryMatch,
  shouldKeepByQueryWords,
  tokenizeQueryWords,
} from '@/lib/products/product-detail-helpers';
import { PERSISTENCE_TIMEOUT_MS, SCRAPER_TIMEOUT_MS } from '@/lib/products/products-handler-shared';
import { fetchCompraGamerProducts, searchCompraGamerProducts } from '@/lib/scrapers/compragamer';
import { fetchCompugardenProducts } from '@/lib/scrapers/compugarden';
import { fetchAllFoxtiendaCategory, fetchAllFoxtiendaSearch } from '@/lib/scrapers/foxtienda';
import { fetchFullh4rdProducts } from '@/lib/scrapers/fullh4rd';
import { fetchGamingCityProducts, getGamingCityCategoryUrl } from '@/lib/scrapers/gamingcity';
import { fetchGezatekProducts } from '@/lib/scrapers/gezatek';
import { fetchLoggProducts } from '@/lib/scrapers/logg';
import { fetchMaximusProducts } from '@/lib/scrapers/maximus';
import { fetchMexxProducts } from '@/lib/scrapers/mexx';
import { fetchPortalTechCategory, fetchPortalTechProducts } from '@/lib/scrapers/portaltech';
import { fetchAllPrestashopCategory, fetchAllPrestashopSearch } from '@/lib/scrapers/prestashop';
import { fetchAllQloudCategory, fetchAllQloudSearch } from '@/lib/scrapers/qloud';
import { fetchAllTiendaNubeCategory, fetchAllTiendaNubeSearch } from '@/lib/scrapers/tiendanube';
import { fetchVenexProducts } from '@/lib/scrapers/venex';
import { fetchWiztechCategory, fetchWiztechProducts } from '@/lib/scrapers/wiztech';
import { fetchAllWooCommerceCategory, fetchAllWooCommerceSearch } from '@/lib/scrapers/woocommerce';
import { fetchXtpcCategory, fetchXtpcProducts } from '@/lib/scrapers/xtpc';

type ObserveSource = (
  storeId: string,
  storeName: string,
  run: (signal: AbortSignal) => Promise<Product[]>,
) => Promise<Product[]>;

export async function fetchCompraGamerByQuery(
  query: string,
  category: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  return searchCompraGamerProducts(query, category, signal);
}

export async function resolveLiveProductsList(
  categorySlug: HardwareCategory,
  query: string | undefined,
  observeSource: ObserveSource,
): Promise<Product[]> {
  const categorySearchTerm = hardwareCategoryToSearchTerm(categorySlug);
  const nonWooQuery = query || categorySearchTerm;
  let mexxUrl = 'https://www.mexx.com.ar/productos-rubro/procesadores/';
  let fullh4rdUrl = 'https://www.fullh4rd.com.ar/cat/search/procesador';
  let venexUrl = 'https://www.venex.com.ar/componentes-de-pc/microprocesadores';
  let gamingCityUrl = getGamingCityCategoryUrl(categorySlug);
  let cgCategoryId = 27;

  if (categorySlug === 'tarjetas-graficas') {
    mexxUrl = 'https://www.mexx.com.ar/productos-rubro/placas-de-video/';
    fullh4rdUrl = 'https://www.fullh4rd.com.ar/cat/search/video';
    venexUrl = 'https://www.venex.com.ar/componentes-de-pc/placas-de-video';
    cgCategoryId = 6;
  } else if (categorySlug === 'motherboards') {
    mexxUrl = 'https://www.mexx.com.ar/productos-rubro/motherboards/';
    fullh4rdUrl = 'https://www.fullh4rd.com.ar/cat/search/mother';
    venexUrl = 'https://www.venex.com.ar/componentes-de-pc/mothers';
    cgCategoryId = 26;
  } else if (categorySlug === 'perifericos') {
    const encodedPeripheralQuery = encodeURIComponent(nonWooQuery);
    mexxUrl = `https://www.mexx.com.ar/buscar/?p=${encodedPeripheralQuery}`;
    fullh4rdUrl = `https://www.fullh4rd.com.ar/cat/search/${encodedPeripheralQuery}`;
    venexUrl = `https://www.venex.com.ar/resultados-busqueda.htm?keywords=${encodedPeripheralQuery}`;
    gamingCityUrl = getGamingCityCategoryUrl(categorySlug);
  }

  console.log(`[API] Iniciando scraping paralelo para la categoria: ${categorySlug}`);
  const results = await Promise.all([
    observeSource('mexx', 'Mexx', (signal) => fetchMexxProducts(mexxUrl, categorySlug, signal)),
    observeSource('venex', 'Venex', (signal) => fetchVenexProducts(venexUrl, categorySlug, signal)),
    observeSource('fullh4rd', 'FullH4rd', (signal) => fetchFullh4rdProducts(fullh4rdUrl, categorySlug, signal)),
    observeSource('maximus', 'Maximus', (signal) => fetchMaximusProducts(nonWooQuery, categorySlug, signal)),
    observeSource('gamingcity', 'Gaming City', (signal) => fetchGamingCityProducts(query || gamingCityUrl, categorySlug, signal)),
    observeSource('gezatek', 'Gezatek', (signal) => fetchGezatekProducts(nonWooQuery, categorySlug, signal)),
    observeSource('compugarden', 'Compugarden', (signal) => fetchCompugardenProducts(nonWooQuery, categorySlug, signal)),
    observeSource('logg', 'Logg', (signal) => fetchLoggProducts(query || '', categorySlug, signal)),
    observeSource('compragamer', 'CompraGamer', (signal) => fetchCompraGamerProducts(cgCategoryId, categorySlug, signal)),
    query
      ? observeSource('portaltech', 'Portal Tech', (signal) => fetchPortalTechProducts(query, categorySlug, signal))
      : observeSource('portaltech', 'Portal Tech', (signal) => fetchPortalTechCategory(categorySlug, signal)),
    query
      ? observeSource('wiztech', 'WizTech', (signal) => fetchWiztechProducts(query, categorySlug, signal))
      : observeSource('wiztech', 'WizTech', (signal) => fetchWiztechCategory(categorySlug, signal)),
    query
      ? observeSource('xtpc', 'Xt-PC', (signal) => fetchXtpcProducts(query, categorySlug, signal))
      : observeSource('xtpc', 'Xt-PC', (signal) => fetchXtpcCategory(categorySlug, signal)),
    query
      ? withAbortTimeout(
        (signal) => fetchAllFoxtiendaSearch(query, categorySlug, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'foxtienda',
      ).catch(() => [] as Product[])
      : withAbortTimeout(
        (signal) => fetchAllFoxtiendaCategory(categorySlug, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'foxtienda',
      ).catch(() => [] as Product[]),
    query
      ? withAbortTimeout(
        (signal) => fetchAllQloudSearch(query, categorySlug, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'qloud',
      ).catch(() => [] as Product[])
      : withAbortTimeout(
        (signal) => fetchAllQloudCategory(categorySlug, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'qloud',
      ).catch(() => [] as Product[]),
    query
      ? withAbortTimeout(
        (signal) => fetchAllPrestashopSearch(query, categorySlug, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'prestashop',
      ).catch(() => [] as Product[])
      : withAbortTimeout(
        (signal) => fetchAllPrestashopCategory(categorySlug, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'prestashop',
      ).catch(() => [] as Product[]),
    query
      ? withAbortTimeout(
        (signal) => fetchAllTiendaNubeSearch(query, categorySlug, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'tiendanube',
      ).catch(() => [] as Product[])
      : withAbortTimeout(
        (signal) => fetchAllTiendaNubeCategory(categorySlug, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'tiendanube',
      ).catch(() => [] as Product[]),
    query
      ? withAbortTimeout(
        (signal) => fetchAllWooCommerceSearch(query, categorySlug, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'woocommerce',
      ).catch(() => [] as Product[])
      : withAbortTimeout(
        (signal) => fetchAllWooCommerceCategory(categorySlug, '/api/products', undefined, { signal }),
        SCRAPER_TIMEOUT_MS,
        'woocommerce',
      ).catch(() => [] as Product[]),
  ]);

  let liveProducts: Product[] = results.flat();
  console.log(`[API] Scraping terminado. Total productos extraidos en vivo: ${liveProducts.length}`);

  const uniqueMap = new Map<string, Product>();
  for (const product of liveProducts) {
    if (!uniqueMap.has(product.id)) {
      uniqueMap.set(product.id, normalizeProductContent(product));
    }
  }
  liveProducts = Array.from(uniqueMap.values());
  console.log(`[API] Tras eliminar duplicados intencionales: ${liveProducts.length}`);

  if (query) {
    const normalizedQuery = normalizeForQueryMatch(query);
    const queryWords = tokenizeQueryWords(query);
    liveProducts = liveProducts.filter((product) => {
      const normalizedName = normalizeForQueryMatch(product.name);
      if (normalizedQuery && normalizedName.includes(normalizedQuery)) return true;
      return shouldKeepByQueryWords(product.name, queryWords);
    });

    liveProducts.sort((a, b) => {
      const scoreDiff = countMatchedQueryWords(b.name, queryWords) - countMatchedQueryWords(a.name, queryWords);
      if (scoreDiff !== 0) return scoreDiff;
      return a.lowestPrice - b.lowestPrice;
    });
  }

  await withPromiseTimeout(persistProductsSnapshot(liveProducts), PERSISTENCE_TIMEOUT_MS, 'supabase-persist')
    .catch((persistError) => {
      console.warn('[API Products] Persistencia listado omitida:', persistError);
    });

  snapshotProducts(liveProducts);
  return liveProducts;
}
