import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { Product, HardwareCategory, StockStatus } from '../types';
import { MonitoredEndpoint, runObservedStoreScrape } from '../telemetry/operational-metrics';
import { findNextPageUrl, normalizeAbsoluteUrl as normalizeAbsolutePaginationUrl } from './common-pagination';

export interface QloudStore {
  id: string;
  name: string;
  baseUrl: string;
}

export const QLOUD_STORES: QloudStore[] = [
  { id: 'clickgaming', name: 'Click Gaming', baseUrl: 'https://clickgaming.com.ar' },
  { id: 'hypergaming', name: 'Hyper Gaming', baseUrl: 'https://hypergaming.com.ar' },
  { id: 'megasoft', name: 'Megasoft', baseUrl: 'https://megasoftargentina.com.ar' },
  { id: 'noxie', name: 'Noxie Store', baseUrl: 'https://noxiestore.com' },
  { id: 'rockethard', name: 'Rocket Hard', baseUrl: 'https://rockethard.com.ar' },
];

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const STORE_BACKOFF_MS = 30 * 60 * 1000;
const QLOUD_CONCURRENCY = 2;
const QLOUD_SEARCH_MAX_PAGES = 3;
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

type QloudRequestOptions = {
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
  if (normalized.includes('sin stock') || normalized.includes('agotado')) return 'out-of-stock';
  if (normalized.includes('ultima') || normalized.includes('ultimas')) return 'low-stock';
  if (normalized.includes('stock') || normalized.includes('deposito') || normalized.includes('disponible')) {
    return 'in-stock';
  }
  return 'unknown';
}

function extractPrice(card: cheerio.Cheerio<AnyNode>): { price: number; originalPrice?: number } {
  const specialPriceText =
    card.find('[data-precio]').first().attr('data-precio')
    || card.find('[data-price]').first().attr('data-price')
    || card.find('.pecio_final b, .main-price .precio, .main-price, .price .pecio_final b').first().text();
  const price = parseArsPrice(String(specialPriceText ?? ''));

  const originalPriceText =
    card.find('.precio_mp, .tachado_1, .solo_web.show, .regular-price').first().text();
  const originalPrice = parseArsPrice(originalPriceText);

  return {
    price,
    originalPrice: originalPrice > price ? originalPrice : undefined,
  };
}

async function scrapeQloudPage(
  url: string,
  store: QloudStore,
  category: HardwareCategory,
  options?: QloudRequestOptions,
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

  $('.card.card-ecommerce, .card-ecommerce').each((_, element) => {
    const card = $(element);
    const linkEl = card.find('a[href*=".html"]').first();
    const href = linkEl.attr('href')?.trim() || '';
    if (!href) return;

    const productUrl = normalizeAbsoluteUrl(store.baseUrl, href);
    const title = cleanName(
      card.find('h4.card-title a, h4.card-title, .card-title a, .card-title').first().text()
      || card.find('img').first().attr('alt')
      || card.find('img').first().attr('title'),
    );
    if (!title) return;

    const idFromButton = card.find('button[data-id]').first().attr('data-id')?.trim();
    const idFromUrl = productUrl.match(/-(\d+)\.html(?:$|[?#])/i)?.[1];
    const slug = slugify(productUrl.split('/').filter(Boolean).pop()?.replace(/\.html.*$/i, '') || title);
    const id = idFromButton || idFromUrl
      ? `${store.id}-${idFromButton || idFromUrl}-${slug}`
      : `${store.id}-${slug}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const { price, originalPrice } = extractPrice(card);
    if (price <= 0) return;

    const imageRaw =
      card.find('img').first().attr('data-src')
      || card.find('img').first().attr('src')
      || '';
    const image = imageRaw ? normalizeAbsoluteUrl(store.baseUrl, imageRaw) : undefined;
    const stock = inferStock(card.find('.articulo_field, .stock, .disponibilidad').text());

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
          originalPrice,
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

async function scrapeQloudPages(
  startUrl: string,
  store: QloudStore,
  category: HardwareCategory,
  maxPages: number,
  options?: QloudRequestOptions,
): Promise<Product[]> {
  const products: Product[] = [];
  const seenProductIds = new Set<string>();
  const seenPageUrls = new Set<string>();

  let pageIndex = 1;
  let nextPageUrl: string | null = startUrl;

  while (nextPageUrl && pageIndex <= maxPages) {
    if (seenPageUrls.has(nextPageUrl)) break;
    seenPageUrls.add(nextPageUrl);

    const pageResult = await scrapeQloudPage(nextPageUrl, store, category, options);
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

function selectQloudStores(storeIds?: Iterable<string>): QloudStore[] {
  const selected = storeIds ? new Set(Array.from(storeIds, (value) => value.toLowerCase())) : null;
  return QLOUD_STORES.filter((store) => !selected || selected.has(store.id.toLowerCase()));
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

async function fetchQloudSearch(
  query: string,
  category: HardwareCategory,
  store: QloudStore,
  endpoint: MonitoredEndpoint,
  options?: QloudRequestOptions,
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
        const url = `${store.baseUrl}/buscar/?q=${encodeURIComponent(trimmedQuery)}`;
        return await scrapeQloudPages(url, store, category, QLOUD_SEARCH_MAX_PAGES, options);
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

async function fetchQloudCategory(
  category: HardwareCategory,
  store: QloudStore,
  endpoint: MonitoredEndpoint,
  options?: QloudRequestOptions,
): Promise<Product[]> {
  const searchTerms = CATEGORY_SEARCH_TERMS[category] ?? [];
  const merged = new Map<string, Product>();

  for (const term of searchTerms) {
    const products = await fetchQloudSearch(term, category, store, endpoint, options).catch(() => []);
    for (const product of products) {
      if (!merged.has(product.id)) merged.set(product.id, product);
    }
    if (merged.size >= 18) break;
  }

  return Array.from(merged.values());
}

export async function fetchAllQloudSearch(
  query: string,
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/search',
  storeIds?: Iterable<string>,
  options?: QloudRequestOptions,
): Promise<Product[]> {
  const stores = selectQloudStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, QLOUD_CONCURRENCY, async (store) =>
    Promise.resolve(fetchQloudSearch(query, category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

export async function fetchAllQloudCategory(
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/products',
  storeIds?: Iterable<string>,
  options?: QloudRequestOptions,
): Promise<Product[]> {
  const stores = selectQloudStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, QLOUD_CONCURRENCY, async (store) =>
    Promise.resolve(fetchQloudCategory(category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}
