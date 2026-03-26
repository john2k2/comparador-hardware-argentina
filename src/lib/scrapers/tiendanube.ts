import * as cheerio from 'cheerio';
import { Product, HardwareCategory, StockStatus } from '../types';
import { MonitoredEndpoint, recordStoreScrapeEvent, runObservedStoreScrape } from '../telemetry/operational-metrics';
import { findNextPageUrl, normalizeAbsoluteUrl as normalizeAbsolutePaginationUrl } from './common-pagination';
import { logger } from '../logger';
import {
  buildSinglePriceProduct,
  cleanScrapedText,
  extractFirstSrcSetUrl,
  extractKnownHardwareBrand,
  normalizeScrapedAbsoluteUrl,
  parseScrapedArsPrice,
  slugFromScrapedUrl,
} from './scraper-helpers';

export interface TiendaNubeStore {
  id: string;
  name: string;
  baseUrl: string;
}

export const TIENDANUBE_STORES: TiendaNubeStore[] = [
  { id: '37bytes', name: '37 Bytes', baseUrl: 'https://www.37bytes.com.ar' },
  { id: 'integradosargentinos', name: 'Integrados Argentinos', baseUrl: 'https://integradosargentinos.com' },
  { id: 'shopgamer', name: 'ShopGamer', baseUrl: 'https://www.shopgamer.com.ar' },
  { id: 'slotone', name: 'Slot One', baseUrl: 'https://www.slot-one.com.ar' },
  { id: 'vertexretail', name: 'Vertex Retail', baseUrl: 'https://vrx.com.ar' },
];

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const STORE_BACKOFF_MS = 30 * 60 * 1000;
const TIENDANUBE_CONCURRENCY = 3;
const TIENDANUBE_SEARCH_MAX_PAGES = 3;
const TIENDANUBE_CATEGORY_MAX_PAGES = 2;
const storeBackoffUntil = new Map<string, number>();

const CATEGORY_SEARCH_TERMS: Record<HardwareCategory, string[]> = {
  procesadores: ['procesador', 'ryzen'],
  'tarjetas-graficas': ['placa de video', 'rtx'],
  motherboards: ['motherboard', 'mother'],
  'memoria-ram': ['memoria ram', 'ddr4'],
  almacenamiento: ['ssd', 'disco'],
  'fuentes-alimentacion': ['fuente', 'fuente de alimentacion'],
  gabinetes: ['gabinete', 'case'],
  refrigeracion: ['cooler', 'watercooler'],
  perifericos: ['monitor', 'teclado'],
};

type TiendaNubeRequestOptions = {
  signal?: AbortSignal;
};

type JsonLdOffer = {
  price?: string | number;
  availability?: string;
  inventoryLevel?: {
    value?: string | number;
  };
};

type JsonLdProduct = {
  '@type'?: string;
  name?: string;
  image?: string | string[];
  description?: string;
  brand?: {
    name?: string;
  } | string;
  offers?: JsonLdOffer | JsonLdOffer[];
};

function normalizeAbsoluteUrl(baseUrl: string, href: string): string {
  return normalizeAbsolutePaginationUrl(baseUrl, href);
}

function cleanName(value: string | undefined): string {
  return cleanScrapedText(value);
}

function slugFromUrl(url: string): string {
  return slugFromScrapedUrl(url);
}

function extractImageFromSrcSet(srcset: string | undefined): string {
  return extractFirstSrcSetUrl(srcset);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, '\'');
}

function inferStockFromVariants(rawVariants: string): StockStatus {
  if (!rawVariants) return 'unknown';

  try {
    const decoded = decodeHtmlEntities(rawVariants);
    const variants = JSON.parse(decoded) as Array<{
      available?: boolean;
      stock?: number | null;
    }>;
    const first = variants[0];
    if (!first) return 'unknown';
    if (first.available === false || first.stock === 0) return 'out-of-stock';
    if (typeof first.stock === 'number' && first.stock > 0 && first.stock <= 3) return 'low-stock';
    if (first.available === true || (typeof first.stock === 'number' && first.stock > 0)) return 'in-stock';
  } catch {
    return 'unknown';
  }

  return 'unknown';
}

function inferStockFromOffer(offer: JsonLdOffer | undefined): StockStatus {
  if (!offer) return 'unknown';
  const availability = String(offer.availability ?? '').toLowerCase();
  const inventoryLevel = Number(offer.inventoryLevel?.value);

  if (availability.includes('outofstock')) return 'out-of-stock';
  if (Number.isFinite(inventoryLevel)) {
    if (inventoryLevel <= 0) return 'out-of-stock';
    if (inventoryLevel <= 3) return 'low-stock';
    return 'in-stock';
  }
  if (availability.includes('instock')) return 'in-stock';
  return 'unknown';
}

function parseJsonLdProduct($: cheerio.CheerioAPI): JsonLdProduct | null {
  const scripts = $('script[type="application/ld+json"]').toArray();

  for (const script of scripts) {
    const raw = $(script).contents().text().trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as JsonLdProduct | JsonLdProduct[];
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const match = candidates.find((item) => String(item?.['@type'] ?? '').toLowerCase() === 'product');
      if (match) return match;
    } catch {
      continue;
    }
  }

  return null;
}

async function scrapeTiendaNubePage(
  url: string,
  store: TiendaNubeStore,
  category: HardwareCategory,
  options?: TiendaNubeRequestOptions,
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
  const seenIds = new Set<string>();

  $('.js-item-product, .product-item').each((_, element) => {
    const card = $(element);
    const title = cleanName(
      card.find('.js-item-name, .product-item-name, h2, h3').first().text(),
    );
    const linkEl = card.find('a.product-item-link, a.js-product-item-image-link-private, a[href*="/productos/"]').first();
    const href = linkEl.attr('href')?.trim() || '';
    if (!title || !href) return;

    const productUrl = normalizeAbsoluteUrl(store.baseUrl, href);
    if (!productUrl || !productUrl.includes('/productos/')) return;

    const productIdRaw =
      card.attr('data-product-id')
      || card.find('input[name="add_to_cart"]').attr('value')
      || '';
    const slug = slugFromUrl(productUrl);
    const id = productIdRaw ? `${store.id}-${productIdRaw}-${slug}` : `${store.id}-${slug}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const priceText = cleanName(card.find('.js-price-display, .product-item-price, .price').first().text());
    const price = parseScrapedArsPrice(priceText);
    if (price <= 0) return;

    const imageRaw =
      card.find('img').first().attr('data-src')
      || extractImageFromSrcSet(card.find('img').first().attr('data-srcset'))
      || extractImageFromSrcSet(card.find('img').first().attr('srcset'))
      || card.find('img').first().attr('src')
      || '';
    const image = imageRaw ? normalizeAbsoluteUrl(store.baseUrl, imageRaw) : undefined;
    const stockLabel = card.find('.js-stock-label-private, .text-stock').first().text().toLowerCase();
    const stock = stockLabel.includes('sin stock')
      ? 'out-of-stock'
      : inferStockFromVariants(card.attr('data-variants') ?? '');
    const product = buildSinglePriceProduct({
      id,
      name: title,
      category,
      storeId: store.id,
      storeName: store.name,
      storeBaseUrl: store.baseUrl,
      url: productUrl,
      price,
      stock,
      image,
      brand: extractKnownHardwareBrand(title),
    });

    if (product) {
      products.push(product);
    }
  });

  return {
    products,
    nextPageUrl: findNextPageUrl($, res.url || url, store.baseUrl),
  };
}

async function scrapeTiendaNubePages(
  startUrl: string,
  store: TiendaNubeStore,
  category: HardwareCategory,
  maxPages: number,
  options?: TiendaNubeRequestOptions,
): Promise<Product[]> {
  const products: Product[] = [];
  const seenProductIds = new Set<string>();
  const seenPageUrls = new Set<string>();
  let currentUrl: string | null = startUrl;
  let page = 0;

  while (currentUrl && page < maxPages) {
    if (seenPageUrls.has(currentUrl)) break;
    seenPageUrls.add(currentUrl);
    page += 1;

    const { products: pageProducts, nextPageUrl } = await scrapeTiendaNubePage(currentUrl, store, category, options);
    let newProducts = 0;

    for (const product of pageProducts) {
      if (seenProductIds.has(product.id)) continue;
      seenProductIds.add(product.id);
      products.push(product);
      newProducts += 1;
    }

    if (newProducts === 0) break;
    currentUrl = nextPageUrl;
  }

  return products;
}

function selectTiendaNubeStores(storeIds?: Iterable<string>): TiendaNubeStore[] {
  if (!storeIds) return TIENDANUBE_STORES;

  const selected = new Set<string>();
  for (const id of storeIds) {
    const normalized = String(id ?? '').trim().toLowerCase();
    if (normalized) selected.add(normalized);
  }

  if (selected.size === 0) return TIENDANUBE_STORES;
  return TIENDANUBE_STORES.filter((store) => selected.has(store.id.toLowerCase()));
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

export async function fetchTiendaNubeSearch(
  query: string,
  category: HardwareCategory,
  store: TiendaNubeStore,
  endpoint: MonitoredEndpoint = '/api/search',
  options?: TiendaNubeRequestOptions,
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
      const url = `${store.baseUrl}/search/?q=${encodeURIComponent(query)}`;

      try {
        const results = await scrapeTiendaNubePages(url, store, category, TIENDANUBE_SEARCH_MAX_PAGES, options);
        if (results.length > 0) storeBackoffUntil.delete(store.id);
        logger.info(`[TiendaNube] ${store.name} -> ${results.length} productos`);
        return results;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('HTTP 403') || message.includes('HTTP 429')) {
          storeBackoffUntil.set(store.id, Date.now() + STORE_BACKOFF_MS);
        }
        throw error;
      }
    },
  });
}

export async function fetchTiendaNubeCategory(
  category: HardwareCategory,
  store: TiendaNubeStore,
  endpoint: MonitoredEndpoint = '/api/products',
  options?: TiendaNubeRequestOptions,
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
      const terms = CATEGORY_SEARCH_TERMS[category] ?? [];

      for (const term of terms) {
        try {
          const url = `${store.baseUrl}/search/?q=${encodeURIComponent(term)}`;
          const results = await scrapeTiendaNubePages(url, store, category, TIENDANUBE_CATEGORY_MAX_PAGES, options);
          if (results.length > 0) {
            storeBackoffUntil.delete(store.id);
            return results;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('HTTP 403') || message.includes('HTTP 429')) {
            storeBackoffUntil.set(store.id, Date.now() + STORE_BACKOFF_MS);
            throw error;
          }
        }
      }

      return [];
    },
  });
}

export async function fetchAllTiendaNubeSearch(
  query: string,
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/search',
  storeIds?: Iterable<string>,
  options?: TiendaNubeRequestOptions,
): Promise<Product[]> {
  const stores = selectTiendaNubeStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, TIENDANUBE_CONCURRENCY, async (store) =>
    Promise.resolve(fetchTiendaNubeSearch(query, category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

export async function fetchAllTiendaNubeCategory(
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/products',
  storeIds?: Iterable<string>,
  options?: TiendaNubeRequestOptions,
): Promise<Product[]> {
  const stores = selectTiendaNubeStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, TIENDANUBE_CONCURRENCY, async (store) =>
    Promise.resolve(fetchTiendaNubeCategory(category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

export async function fetchTiendaNubeProductById(
  productId: string,
  category: HardwareCategory,
  options?: TiendaNubeRequestOptions,
): Promise<Product | null> {
  const separatorIndex = productId.indexOf('-');
  if (separatorIndex <= 0 || separatorIndex >= productId.length - 1) return null;

  const storeId = productId.slice(0, separatorIndex);
  const remainder = productId.slice(separatorIndex + 1);
  const store = TIENDANUBE_STORES.find((item) => item.id === storeId);
  if (!store) return null;

  const slug = remainder.replace(/^\d+-/, '');
  const candidateUrls = [
    `${store.baseUrl}/productos/${slug}/`,
    `${store.baseUrl}/${slug}/`,
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
      const $ = cheerio.load(html);
      const jsonLd = parseJsonLdProduct($);
      const offer = Array.isArray(jsonLd?.offers) ? jsonLd?.offers[0] : jsonLd?.offers;
      const title =
        cleanName(jsonLd?.name) ||
        cleanName($('h1.js-product-name, h1[itemprop="name"], h1').first().text());
      const priceText =
        String(offer?.price ?? '') ||
        cleanName($('.js-price-display, .product-price, .price').first().text());
      const price = parseScrapedArsPrice(priceText);
      if (!title || price <= 0) continue;

      const imageRaw = Array.isArray(jsonLd?.image)
        ? jsonLd?.image[0]
        : jsonLd?.image
          || $('meta[property="og:image"]').attr('content')
          || $('.js-product-image img, .product-image img, img').first().attr('src')
          || '';
      const description =
        cleanName(jsonLd?.description) ||
        cleanName($('meta[name="description"]').attr('content')) ||
        cleanName($('.js-product-description, .product-description').first().text()) ||
        title;
      const stockFromOffer = inferStockFromOffer(offer);
      const stockFromVariants = inferStockFromVariants($('.js-product-container').attr('data-variants') ?? '');
      const stock = stockFromOffer !== 'unknown' ? stockFromOffer : stockFromVariants;
      const normalizedImage = imageRaw ? normalizeScrapedAbsoluteUrl(store.baseUrl, imageRaw) : undefined;

      return buildSinglePriceProduct({
        id: productId,
        name: title,
        category,
        storeId: store.id,
        storeName: store.name,
        storeBaseUrl: store.baseUrl,
        url: res.url || candidateUrl,
        price,
        stock,
        image: normalizedImage,
        description,
        brand: extractKnownHardwareBrand(title),
      });
    } catch {
      continue;
    }
  }

  return null;
}
