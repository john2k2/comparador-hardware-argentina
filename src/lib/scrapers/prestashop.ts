import * as cheerio from 'cheerio';
import { Product, HardwareCategory, StockStatus } from '../types';
import { MonitoredEndpoint, runObservedStoreScrape } from '../telemetry/operational-metrics';
import { findNextPageUrl, normalizeAbsoluteUrl as normalizeAbsolutePaginationUrl } from './common-pagination';

export interface PrestashopStore {
  id: string;
  name: string;
  baseUrl: string;
}

export const PRESTASHOP_STORES: PrestashopStore[] = [
  { id: 'armytech', name: 'ArmyTech', baseUrl: 'https://www.armytech.com.ar' },
];

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const STORE_BACKOFF_MS = 30 * 60 * 1000;
const PRESTASHOP_CONCURRENCY = 1;
const PRESTASHOP_SEARCH_MAX_PAGES = 3;
const storeBackoffUntil = new Map<string, number>();

const CATEGORY_SEARCH_TERMS: Record<HardwareCategory, string[]> = {
  procesadores: ['procesador', 'ryzen'],
  'tarjetas-graficas': ['placa de video', 'rtx'],
  motherboards: ['motherboard', 'mother'],
  'memoria-ram': ['memoria ram', 'ddr5'],
  almacenamiento: ['ssd', 'nvme'],
  'fuentes-alimentacion': ['fuente', 'psu'],
  gabinetes: ['gabinete', 'case'],
  refrigeracion: ['cooler', 'watercooler'],
  perifericos: ['monitor', 'teclado'],
};

type PrestashopRequestOptions = {
  signal?: AbortSignal;
};

function parseArsPrice(text: string): number {
  let cleaned = text.replace(/[^0-9,.]/g, '');
  if (!cleaned) return 0;
  cleaned = cleaned.replace(/[,.]\d{1,2}$/, '');
  cleaned = cleaned.replace(/[,.]/g, '');
  return parseInt(cleaned, 10) || 0;
}

function cleanName(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeAbsoluteUrl(baseUrl: string, href: string): string {
  return normalizeAbsolutePaginationUrl(baseUrl, href);
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function extractBrand(name: string): string {
  const brands = [
    'AMD', 'Intel', 'NVIDIA', 'ASUS', 'MSI', 'Gigabyte', 'ASRock',
    'Kingston', 'Corsair', 'G.Skill', 'Samsung', 'WD', 'Seagate',
    'Crucial', 'Patriot', 'XPG', 'Thermaltake', 'Cooler Master',
    'be quiet!', 'Noctua', 'Arctic', 'Sapphire', 'PowerColor', 'Zotac',
    'EVGA', 'PNY', 'HyperX', 'Redragon', 'Logitech', 'Razer', 'Acer',
    'Lenovo', 'HP', 'Dell',
  ];
  const upper = name.toUpperCase();
  for (const brand of brands) {
    if (upper.includes(brand.toUpperCase())) return brand;
  }
  return 'Generica';
}

function inferStock(text: string): StockStatus {
  const normalized = text.toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('no disponible') || normalized.includes('sin stock') || normalized.includes('agotado')) return 'out-of-stock';
  if (normalized.includes('ultimas') || normalized.includes('últimas')) return 'low-stock';
  if (normalized.includes('stock') || normalized.includes('disponible')) return 'in-stock';
  return 'unknown';
}

async function scrapePrestashopPage(
  url: string,
  store: PrestashopStore,
  category: HardwareCategory,
  options?: PrestashopRequestOptions,
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

  $('.product-miniature, article.product-miniature, .js-product-miniature').each((_, element) => {
    const card = $(element);
    const href = card.find('.product-title a, a.product-thumbnail').first().attr('href')?.trim() || '';
    const title = cleanName(card.find('.product-title a, .product-title').first().text());
    if (!href || !title) return;

    const productUrl = normalizeAbsoluteUrl(store.baseUrl, href);
    const idFromAttr =
      card.attr('data-id-product')
      || card.find('[data-id-product]').first().attr('data-id-product')
      || productUrl.match(/\/(\d+)-/i)?.[1]
      || '';
    const slug = slugify(title);
    const id = idFromAttr ? `${store.id}-${idFromAttr}-${slug}` : `${store.id}-${slug}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const priceText = card.find('.product-price').first().attr('content') || card.find('.product-price').first().text();
    const price = parseArsPrice(priceText);
    if (price <= 0) return;

    const originalPriceText = card.find('.regular-price').first().text();
    const originalPrice = parseArsPrice(originalPriceText);
    const imageRaw =
      card.find('img').first().attr('data-full-size-image-url')
      || card.find('img').first().attr('src')
      || '';
    const image = imageRaw ? normalizeAbsoluteUrl(store.baseUrl, imageRaw) : undefined;
    const stock = inferStock(card.find('.product-availability, .product-availability-list').text());

    products.push({
      id,
      name: title,
      category,
      brand: extractBrand(title),
      model: title,
      description: title,
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
          originalPrice: originalPrice > price ? originalPrice : undefined,
          installment: null,
          stock,
          lastUpdated: new Date(),
        },
      ],
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

async function scrapePrestashopPages(
  startUrl: string,
  store: PrestashopStore,
  category: HardwareCategory,
  maxPages: number,
  options?: PrestashopRequestOptions,
): Promise<Product[]> {
  const products: Product[] = [];
  const seenProductIds = new Set<string>();
  const seenPageUrls = new Set<string>();

  let pageIndex = 1;
  let nextPageUrl: string | null = startUrl;

  while (nextPageUrl && pageIndex <= maxPages) {
    if (seenPageUrls.has(nextPageUrl)) break;
    seenPageUrls.add(nextPageUrl);

    const pageResult = await scrapePrestashopPage(nextPageUrl, store, category, options);
    let newProducts = 0;

    for (const product of pageResult.products) {
      if (seenProductIds.has(product.id)) continue;
      seenProductIds.add(product.id);
      products.push(product);
      newProducts += 1;
    }

    if (newProducts === 0) break;
    nextPageUrl = pageResult.nextPageUrl;
    pageIndex += 1;
  }

  return products;
}

function selectPrestashopStores(storeIds?: Iterable<string>): PrestashopStore[] {
  const selected = storeIds ? new Set(Array.from(storeIds, (value) => value.toLowerCase())) : null;
  return PRESTASHOP_STORES.filter((store) => !selected || selected.has(store.id.toLowerCase()));
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = currentIndex;
      currentIndex += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchPrestashopSearch(
  query: string,
  category: HardwareCategory,
  store: PrestashopStore,
  endpoint: MonitoredEndpoint,
  options?: PrestashopRequestOptions,
): Promise<Product[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  return runObservedStoreScrape({
    endpoint,
    storeId: store.id,
    storeName: store.name,
    run: async () => {
      const backoffUntil = storeBackoffUntil.get(store.id) ?? 0;
      if (backoffUntil > Date.now()) {
        throw new Error(`HTTP 429 - backoff ${store.id}`);
      }

      try {
        const url = `${store.baseUrl}/buscar?controller=search&s=${encodeURIComponent(trimmedQuery)}`;
        return await scrapePrestashopPages(url, store, category, PRESTASHOP_SEARCH_MAX_PAGES, options);
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

async function fetchPrestashopCategory(
  category: HardwareCategory,
  store: PrestashopStore,
  endpoint: MonitoredEndpoint,
  options?: PrestashopRequestOptions,
): Promise<Product[]> {
  const searchTerms = CATEGORY_SEARCH_TERMS[category] ?? [];
  const merged = new Map<string, Product>();

  for (const term of searchTerms) {
    const products = await fetchPrestashopSearch(term, category, store, endpoint, options).catch(() => []);
    for (const product of products) {
      if (!merged.has(product.id)) merged.set(product.id, product);
    }
    if (merged.size >= 18) break;
  }

  return Array.from(merged.values());
}

export async function fetchAllPrestashopSearch(
  query: string,
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/search',
  storeIds?: Iterable<string>,
  options?: PrestashopRequestOptions,
): Promise<Product[]> {
  const stores = selectPrestashopStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, PRESTASHOP_CONCURRENCY, async (store) =>
    Promise.resolve(fetchPrestashopSearch(query, category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

export async function fetchAllPrestashopCategory(
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/products',
  storeIds?: Iterable<string>,
  options?: PrestashopRequestOptions,
): Promise<Product[]> {
  const stores = selectPrestashopStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, PRESTASHOP_CONCURRENCY, async (store) =>
    Promise.resolve(fetchPrestashopCategory(category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}
