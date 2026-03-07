import * as cheerio from 'cheerio';
import { Product, HardwareCategory } from '../types';
import { MonitoredEndpoint, recordStoreScrapeEvent, runObservedStoreScrape } from '../telemetry/operational-metrics';
import {
  buildPaginatedUrl,
  findNextPageUrl,
  normalizeAbsoluteUrl as normalizeAbsolutePaginationUrl,
} from './common-pagination';

export interface WooStore {
  id: string;
  name: string;
  baseUrl: string;
  categoryPath?: (slug: string) => string;
}

export const WOOCOMMERCE_STORES: WooStore[] = [
  { id: 'katech', name: 'Katech', baseUrl: 'https://katech.com.ar' },
  { id: 'dinobyte', name: 'Dinobyte', baseUrl: 'https://dinobyte.ar' },
  { id: 'maxtecno', name: 'MaxTecno', baseUrl: 'https://www.maxtecno.com.ar' },
  { id: 'thegamershop', name: 'TheGamerShop', baseUrl: 'https://www.thegamershop.com.ar' },
  { id: 'hardcore', name: 'Hardcore', baseUrl: 'https://hardcorecomputacion.com.ar' },
  { id: 'goldentechstore', name: 'Golden Tech', baseUrl: 'https://www.goldentechstore.com.ar' },
];

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const STORE_BACKOFF_MS = 30 * 60 * 1000;
const storeBackoffUntil = new Map<string, number>();
const WOO_CONCURRENCY = 3;
const WOO_CATEGORY_MAX_PAGES = 4;
const WOO_SEARCH_MAX_PAGES = 3;

const CATEGORY_SLUGS: Record<HardwareCategory, string[]> = {
  procesadores: ['procesadores', 'microprocesadores', 'cpu', 'procesador'],
  'tarjetas-graficas': ['placas-de-video', 'tarjetas-de-video', 'gpu', 'video'],
  motherboards: ['motherboards', 'placas-madre', 'mother'],
  'memoria-ram': ['memorias-ram', 'memoria-ram', 'ram'],
  almacenamiento: ['almacenamiento', 'discos-ssd', 'ssd', 'nvme'],
  'fuentes-alimentacion': ['fuentes-de-alimentacion', 'fuentes', 'psu'],
  gabinetes: ['gabinetes', 'cases', 'gabinete'],
  refrigeracion: ['refrigeracion', 'coolers', 'cooling'],
  perifericos: ['perifericos', 'accesorios', 'teclados', 'mouse', 'mouses', 'monitores', 'audio', 'auriculares', 'headsets'],
};

type WooRequestOptions = {
  signal?: AbortSignal;
};

function parseArsPrice(text: string): number {
  let cleaned = text.replace(/[^0-9,.]/g, '');
  if (!cleaned) return 0;

  // Si termina con un punto o coma seguido de 1 o 2 dígitos, lo removemos entero (ej: .00 o ,50)
  cleaned = cleaned.replace(/[,.]\d{1,2}$/, '');

  // Removemos cualquier punto o coma separador de miles que haya quedado
  cleaned = cleaned.replace(/[,.]/g, '');

  return parseInt(cleaned, 10) || 0;
}

function cleanName(value: string | undefined): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (/^ver detalles/i.test(normalized)) return '';
  return normalized;
}

function extractBrand(name: string): string {
  const BRANDS = [
    'AMD', 'Intel', 'NVIDIA', 'ASUS', 'MSI', 'Gigabyte', 'ASRock',
    'Kingston', 'Corsair', 'G.Skill', 'Samsung', 'WD', 'Seagate',
    'Crucial', 'Patriot', 'XPG', 'Thermaltake', 'Cooler Master',
    'be quiet!', 'Noctua', 'Arctic', 'Sapphire', 'PowerColor', 'Zotac',
    'EVGA', 'PNY', 'HyperX', 'Redragon', 'Logitech', 'Razer',
  ];
  const upper = name.toUpperCase();
  for (const brand of BRANDS) {
    if (upper.includes(brand.toUpperCase())) return brand;
  }
  return 'Generica';
}

function normalizeAbsoluteUrl(baseUrl: string, href: string): string {
  return normalizeAbsolutePaginationUrl(baseUrl, href);
}

async function scrapeWooPage(
  url: string,
  store: WooStore,
  category: HardwareCategory,
  options?: WooRequestOptions,
): Promise<{ products: Product[]; nextPageUrl: string | null }> {
  const res = await fetch(url, {
    headers: {
      ...SCRAPE_HEADERS,
      Referer: `${store.baseUrl}/`,
    },
    signal: options?.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const products: Product[] = [];

  $('li.type-product, article.type-product, div.type-product').each((_, el) => {
    const titleEl = $(el).find('.woocommerce-loop-product__title').first();
    const anyHeadingEl = $(el).find('h1, h2, h3, h4').first();
    const productLinkEl = $(el)
      .find('a.woocommerce-loop-product__link, a.woocommerce-LoopProduct-link, a[href*="/producto/"], a[href*="/product/"], a[href*="/productos/"], a[href]')
      .filter((_, anchor) => {
        const href = $(anchor).attr('href') ?? '';
        return href.length > 0 && !href.startsWith('#') && !href.startsWith('mailto:');
      })
      .first();
    const img = $(el).find('img.wp-post-image, img.attachment-woocommerce_thumbnail, img').first();

    const name = (
      cleanName(titleEl.find('a').text()) ||
      cleanName(titleEl.text()) ||
      cleanName(anyHeadingEl.text()) ||
      cleanName(productLinkEl.attr('title')) ||
      cleanName(img.attr('alt'))
    );
    if (!name) return;

    const href = titleEl.find('a').attr('href') || productLinkEl.attr('href') || '';
    if (!href) return;
    const productUrl = normalizeAbsoluteUrl(store.baseUrl, href);

    const imageRaw = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || '';
    const image = imageRaw ? normalizeAbsoluteUrl(store.baseUrl, imageRaw) : '';

    const insPrice = $(el).find('ins .woocommerce-Price-amount bdi, ins bdi').first().text().trim();
    const anyPrice = $(el).find('.woocommerce-Price-amount bdi').first().text().trim();
    const rawAmount = $(el).find('span.amount bdi, span.amount').first().text().trim();
    const classPrice = $(el).find('.price, [class*="price"]').first().text().trim();
    const priceText = insPrice || anyPrice || rawAmount || classPrice;
    const price = parseArsPrice(priceText);
    if (price <= 0) return;

    const outOfStock = $(el).hasClass('outofstock') || $(el).find('.out-of-stock').length > 0;
    const slugPartRaw = productUrl.split('/').filter(Boolean).pop() || Date.now().toString();
    const slugPart = slugPartRaw.split('?')[0].split('#')[0];

    products.push({
      id: `${store.id}-${slugPart}`,
      name,
      category,
      brand: extractBrand(name),
      model: name,
      description: name,
      image: image || undefined,
      lowestPrice: price,
      highestPrice: price,
      averagePrice: price,
      prices: [{
        storeId: store.id,
        storeName: store.name,
        url: productUrl,
        price,
        installment: null,
        stock: outOfStock ? 'out-of-stock' : 'in-stock',
        lastUpdated: new Date(),
      }],
      specs: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  return {
    products,
    nextPageUrl: findNextPageUrl($, res.url || url, store.baseUrl),
  };
}

async function scrapeWooPages(
  startUrl: string,
  store: WooStore,
  category: HardwareCategory,
  maxPages: number,
  options?: WooRequestOptions,
): Promise<Product[]> {
  const products: Product[] = [];
  const seenProductIds = new Set<string>();
  const seenPageUrls = new Set<string>();

  let pageIndex = 1;
  let nextPageUrl: string | null = startUrl;

  while (nextPageUrl && pageIndex <= maxPages) {
    const pageUrl = pageIndex === 1 ? nextPageUrl : buildPaginatedUrl(nextPageUrl, pageIndex);
    if (seenPageUrls.has(pageUrl)) break;
    seenPageUrls.add(pageUrl);

    const pageResult = await scrapeWooPage(pageUrl, store, category, options);
    let newProducts = 0;

    for (const product of pageResult.products) {
      if (seenProductIds.has(product.id)) continue;
      seenProductIds.add(product.id);
      products.push(product);
      newProducts += 1;
    }

    if (newProducts === 0) break;

    nextPageUrl = pageResult.nextPageUrl;
    if (!nextPageUrl && pageIndex < maxPages) {
      nextPageUrl = buildPaginatedUrl(startUrl, pageIndex + 1);
    }

    pageIndex += 1;
  }

  return products;
}

function parseWooPrice(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  if (/^\d+(\.\d+)?$/.test(normalized)) return Math.round(Number(normalized));
  return parseArsPrice(normalized);
}

function parseWooProductDetail(
  html: string,
  pageUrl: string,
  store: WooStore,
  category: HardwareCategory,
  fallbackSlug: string,
): Product | null {
  const $ = cheerio.load(html);

  const name =
    $('h1.product_title').first().text().trim() ||
    $('h1.entry-title').first().text().trim() ||
    $('h1[itemprop="name"]').first().text().trim();
  if (!name) return null;

  const insPrice = $('p.price ins .woocommerce-Price-amount bdi, .summary ins bdi').first().text().trim();
  const anyPrice = $('p.price .woocommerce-Price-amount bdi, .summary .woocommerce-Price-amount bdi, .price bdi').first().text().trim();
  const metaPrice = $('meta[property="product:price:amount"]').attr('content') || '';
  const price = parseWooPrice(insPrice || anyPrice || metaPrice);
  if (price <= 0) return null;

  const imageRaw =
    $('.woocommerce-product-gallery__wrapper img').first().attr('data-large_image') ||
    $('.woocommerce-product-gallery__wrapper img').first().attr('src') ||
    $('.woocommerce-product-gallery img').first().attr('src') ||
    $('img.wp-post-image').first().attr('src') ||
    '';
  const image = imageRaw ? normalizeAbsoluteUrl(store.baseUrl, imageRaw) : undefined;

  const stockText = $('.stock').first().text().toLowerCase();
  const hasOutOfStockClass = $('.stock.out-of-stock, .out-of-stock').length > 0;
  const hasLowStockText = stockText.includes('ultim') || stockText.includes('pocas');
  const hasOutOfStockText = stockText.includes('sin stock') || stockText.includes('agotad');
  const stock = hasOutOfStockClass || hasOutOfStockText
    ? 'out-of-stock'
    : hasLowStockText
      ? 'low-stock'
      : 'in-stock';

  const canonical = $('link[rel="canonical"]').attr('href') || pageUrl;
  const productUrl = normalizeAbsoluteUrl(store.baseUrl, canonical);
  const slugPart = productUrl.split('/').filter(Boolean).pop() || fallbackSlug;
  const detailDescription =
    $('.woocommerce-product-details__short-description').first().text().replace(/\s+/g, ' ').trim() ||
    $('[itemprop="description"]').first().text().replace(/\s+/g, ' ').trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    '';

  return {
    id: `${store.id}-${slugPart}`,
    name,
    category,
    brand: extractBrand(name),
    model: name,
    description: detailDescription || name,
    image,
    lowestPrice: price,
    highestPrice: price,
    averagePrice: price,
    prices: [
      {
        storeId: store.id,
        storeName: store.name,
        url: productUrl,
        price,
        installment: null,
        stock,
        lastUpdated: new Date(),
      },
    ],
    specs: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function fetchWooCommerceProductById(
  productId: string,
  category: HardwareCategory,
  options?: WooRequestOptions,
): Promise<Product | null> {
  const separatorIndex = productId.indexOf('-');
  if (separatorIndex <= 0 || separatorIndex >= productId.length - 1) return null;

  const storeId = productId.slice(0, separatorIndex);
  const slugPart = productId.slice(separatorIndex + 1);
  const store = WOOCOMMERCE_STORES.find((item) => item.id === storeId);
  if (!store) return null;

  const candidateUrls = [
    `${store.baseUrl}/producto/${slugPart}/`,
    `${store.baseUrl}/product/${slugPart}/`,
    `${store.baseUrl}/${slugPart}/`,
  ];

  for (const candidateUrl of candidateUrls) {
    try {
      const res = await fetch(candidateUrl, {
        headers: {
          ...SCRAPE_HEADERS,
          Referer: `${store.baseUrl}/`,
        },
        signal: options?.signal,
      });
      if (!res.ok) continue;
      const html = await res.text();
      const parsed = parseWooProductDetail(html, res.url || candidateUrl, store, category, slugPart);
      if (parsed) return parsed;
    } catch {
      // try next candidate
    }
  }

  return null;
}

export async function fetchWooCommerceSearch(
  query: string,
  category: HardwareCategory,
  store: WooStore,
  endpoint: MonitoredEndpoint = '/api/search',
  options?: WooRequestOptions,
): Promise<Product[]> {
  const blockedUntil = storeBackoffUntil.get(store.id);
  if (blockedUntil && blockedUntil > Date.now()) {
    recordStoreScrapeEvent({
      endpoint,
      storeId: store.id,
      storeName: store.name,
      startedAtMs: Date.now(),
      latencyMs: 0,
      resultCount: 0,
      status: 'blocked',
      message: `Backoff activo hasta ${new Date(blockedUntil).toISOString()}`,
    });
    return [];
  }

  return runObservedStoreScrape({
    endpoint,
    storeId: store.id,
    storeName: store.name,
    run: async () => {
      if (options?.signal?.aborted) return [];
      const url = `${store.baseUrl}/?s=${encodeURIComponent(query)}&post_type=product`;
      try {
        console.log(`[WooCommerce] ${store.name} buscando: ${query}`);
        const results = await scrapeWooPages(url, store, category, WOO_SEARCH_MAX_PAGES, options);
        if (results.length > 0) {
          storeBackoffUntil.delete(store.id);
        }
        console.log(`[WooCommerce] ${store.name} -> ${results.length} productos`);
        return results;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('HTTP 403') || message.includes('HTTP 429')) {
          storeBackoffUntil.set(store.id, Date.now() + STORE_BACKOFF_MS);
          console.warn(`[WooCommerce] ${store.name} bloquea scraping (${message})`);
        } else {
          console.error(`[WooCommerce] ${store.name} error: ${message}`);
        }
        throw error;
      }
    },
  });
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = [];
  let currentIndex = 0;

  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const index = currentIndex;
      currentIndex += 1;
      if (index >= items.length) break;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

function selectWooStores(storeIds?: Iterable<string>): WooStore[] {
  if (!storeIds) return WOOCOMMERCE_STORES;

  const selected = new Set<string>();
  for (const id of storeIds) {
    const normalized = String(id ?? '').trim().toLowerCase();
    if (normalized) selected.add(normalized);
  }

  if (selected.size === 0) return WOOCOMMERCE_STORES;
  return WOOCOMMERCE_STORES.filter((store) => selected.has(store.id.toLowerCase()));
}

export async function fetchWooCommerceCategory(
  category: HardwareCategory,
  store: WooStore,
  endpoint: MonitoredEndpoint = '/api/products',
  options?: WooRequestOptions,
): Promise<Product[]> {
  const blockedUntil = storeBackoffUntil.get(store.id);
  if (blockedUntil && blockedUntil > Date.now()) {
    recordStoreScrapeEvent({
      endpoint,
      storeId: store.id,
      storeName: store.name,
      startedAtMs: Date.now(),
      latencyMs: 0,
      resultCount: 0,
      status: 'blocked',
      message: `Backoff activo hasta ${new Date(blockedUntil).toISOString()}`,
    });
    return [];
  }

  return runObservedStoreScrape({
    endpoint,
    storeId: store.id,
    storeName: store.name,
    run: async () => {
      if (options?.signal?.aborted) return [];
      const slugs = CATEGORY_SLUGS[category] ?? [];
      for (const slug of slugs) {
        const url = `${store.baseUrl}/product-category/${slug}/`;
        try {
          const results = await scrapeWooPages(url, store, category, WOO_CATEGORY_MAX_PAGES, options);
          if (results.length > 0) {
            storeBackoffUntil.delete(store.id);
            console.log(`[WooCommerce] ${store.name} categoria '${slug}' -> ${results.length} productos`);
            return results;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('HTTP 403') || message.includes('HTTP 429')) {
            storeBackoffUntil.set(store.id, Date.now() + STORE_BACKOFF_MS);
            console.warn(`[WooCommerce] ${store.name} bloquea scraping (${message})`);
            throw error;
          }
        }
      }

      if (slugs.length === 0) return [];

      const fallbackSearchUrl = `${store.baseUrl}/?s=${encodeURIComponent(slugs[0])}&post_type=product`;
      try {
        const fallbackResults = await scrapeWooPages(
          fallbackSearchUrl,
          store,
          category,
          WOO_SEARCH_MAX_PAGES,
          options,
        );
        if (fallbackResults.length > 0) {
          storeBackoffUntil.delete(store.id);
        }
        return fallbackResults;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('HTTP 403') || message.includes('HTTP 429')) {
          storeBackoffUntil.set(store.id, Date.now() + STORE_BACKOFF_MS);
          console.warn(`[WooCommerce] ${store.name} bloquea scraping (${message})`);
        }
        throw error;
      }
    },
  });
}

export async function fetchAllWooCommerceSearch(
  query: string,
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/search',
  storeIds?: Iterable<string>,
  options?: WooRequestOptions,
): Promise<Product[]> {
  const stores = selectWooStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, WOO_CONCURRENCY, async (store) =>
    Promise.resolve(fetchWooCommerceSearch(query, category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));
  const results = settled;
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

export async function fetchAllWooCommerceCategory(
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/products',
  storeIds?: Iterable<string>,
  options?: WooRequestOptions,
): Promise<Product[]> {
  const stores = selectWooStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, WOO_CONCURRENCY, async (store) =>
    Promise.resolve(fetchWooCommerceCategory(category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));
  const results = settled;
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
