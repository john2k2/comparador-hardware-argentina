import * as cheerio from 'cheerio';
import { Product, HardwareCategory, StockStatus } from '../types';
import { MonitoredEndpoint, runObservedStoreScrape } from '../telemetry/operational-metrics';
import { normalizeAbsoluteUrl as normalizeAbsolutePaginationUrl } from './common-pagination';

export interface FoxtiendaStore {
  id: string;
  name: string;
  baseUrl: string;
}

export const FOXTIENDA_STORES: FoxtiendaStore[] = [
  { id: 'hftecnologia', name: 'HF Tecnologia', baseUrl: 'https://hftecnologia.com.ar' },
  { id: 'spacevideojuegos', name: 'Space', baseUrl: 'https://spacegamer.com.ar' },
];

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const STORE_BACKOFF_MS = 30 * 60 * 1000;
const FOXTIENDA_CONCURRENCY = 2;
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

type FoxtiendaRequestOptions = {
  signal?: AbortSignal;
};

type FoxtiendaListingState = {
  orderId: string;
  form: URLSearchParams;
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
  if (normalized.includes('sin stock') || normalized.includes('agotado') || normalized.includes('no disponible')) {
    return 'out-of-stock';
  }
  if (normalized.includes('ultimas') || normalized.includes('últimas')) return 'low-stock';
  if (normalized.includes('disponible')) return 'in-stock';
  return 'unknown';
}

async function getListingState(
  store: FoxtiendaStore,
  query: string,
  options?: FoxtiendaRequestOptions,
): Promise<FoxtiendaListingState> {
  const res = await fetch(`${store.baseUrl}/Home/Listado?buscar=${encodeURIComponent(query)}`, {
    headers: {
      ...SCRAPE_HEADERS,
      Referer: `${store.baseUrl}/`,
    },
    signal: options?.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const orderId = $('#orderFilter option[selected]').attr('value') || 'c';

  const form = new URLSearchParams();
  $('#formBuscar input[name], #formBuscar select[name]').each((_, element) => {
    const el = $(element);
    const name = el.attr('name')?.trim();
    if (!name) return;

    const value = el.attr('value')
      || el.find('option[selected]').attr('value')
      || '';
    form.set(name, value);
  });

  form.set('Palabra', query);
  return { orderId, form };
}

async function fetchFoxtiendaListingHtml(
  store: FoxtiendaStore,
  query: string,
  options?: FoxtiendaRequestOptions,
): Promise<string> {
  const { orderId, form } = await getListingState(store, query, options);
  const res = await fetch(`${store.baseUrl}/Home/CargarResultado?id=${encodeURIComponent(orderId)}`, {
    method: 'POST',
    headers: {
      'User-Agent': SCRAPE_HEADERS['User-Agent'],
      Accept: 'text/html, */*;q=0.8',
      'Accept-Language': SCRAPE_HEADERS['Accept-Language'],
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: `${store.baseUrl}/Home/Listado?buscar=${encodeURIComponent(query)}`,
    },
    body: form.toString(),
    signal: options?.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseFoxtiendaListing(
  html: string,
  store: FoxtiendaStore,
  category: HardwareCategory,
): Product[] {
  const $ = cheerio.load(html);
  const products: Product[] = [];
  const seenIds = new Set<string>();

  $('.product-card').each((_, element) => {
    const card = $(element);
    const rawId = card.attr('data-id')?.trim() || card.attr('id')?.match(/producto_(\d+)/)?.[1] || '';
    const title = cleanName(card.attr('data-nombre') || card.find('.product-card__name h2, .product-card__name').first().text());
    const href = card.find('.product-card__image a, .product-card__name a').first().attr('href')?.trim() || '';
    if (!rawId || !title || !href) return;

    const productUrl = normalizeAbsoluteUrl(store.baseUrl, href);
    const id = `${store.id}-${rawId}-${slugify(title)}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const priceText = cleanName(card.find('.product-card__prices').first().text());
    const price = parseArsPrice(priceText);
    if (price <= 0) return;

    const imageRaw = card.find('.product-image__img').first().attr('src') || '';
    const image = imageRaw ? normalizeAbsoluteUrl(store.baseUrl, imageRaw) : undefined;
    const stock = inferStock(card.find('.product-card__availability').text());

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

  return products;
}

function selectFoxtiendaStores(storeIds?: Iterable<string>): FoxtiendaStore[] {
  const selected = storeIds ? new Set(Array.from(storeIds, (value) => value.toLowerCase())) : null;
  return FOXTIENDA_STORES.filter((store) => !selected || selected.has(store.id.toLowerCase()));
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

async function fetchFoxtiendaSearch(
  query: string,
  category: HardwareCategory,
  store: FoxtiendaStore,
  endpoint: MonitoredEndpoint,
  options?: FoxtiendaRequestOptions,
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
        const listingHtml = await fetchFoxtiendaListingHtml(store, trimmedQuery, options);
        return parseFoxtiendaListing(listingHtml, store, category);
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

async function fetchFoxtiendaCategory(
  category: HardwareCategory,
  store: FoxtiendaStore,
  endpoint: MonitoredEndpoint,
  options?: FoxtiendaRequestOptions,
): Promise<Product[]> {
  const searchTerms = CATEGORY_SEARCH_TERMS[category] ?? [];
  const merged = new Map<string, Product>();

  for (const term of searchTerms) {
    const products = await fetchFoxtiendaSearch(term, category, store, endpoint, options).catch(() => []);
    for (const product of products) {
      if (!merged.has(product.id)) merged.set(product.id, product);
    }
    if (merged.size >= 18) break;
  }

  return Array.from(merged.values());
}

export async function fetchAllFoxtiendaSearch(
  query: string,
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/search',
  storeIds?: Iterable<string>,
  options?: FoxtiendaRequestOptions,
): Promise<Product[]> {
  const stores = selectFoxtiendaStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, FOXTIENDA_CONCURRENCY, async (store) =>
    Promise.resolve(fetchFoxtiendaSearch(query, category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

export async function fetchAllFoxtiendaCategory(
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/products',
  storeIds?: Iterable<string>,
  options?: FoxtiendaRequestOptions,
): Promise<Product[]> {
  const stores = selectFoxtiendaStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, FOXTIENDA_CONCURRENCY, async (store) =>
    Promise.resolve(fetchFoxtiendaCategory(category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

export async function fetchFoxtiendaProductById(
  productId: string,
  category: HardwareCategory,
  options?: FoxtiendaRequestOptions,
): Promise<Product | null> {
  const separatorIndex = productId.indexOf('-');
  if (separatorIndex <= 0 || separatorIndex >= productId.length - 1) return null;

  const storeId = productId.slice(0, separatorIndex);
  const remainder = productId.slice(separatorIndex + 1);
  const store = FOXTIENDA_STORES.find((item) => item.id === storeId);
  if (!store) return null;

  const numericCode = remainder.match(/^(\d+)-/)?.[1];
  const slug = remainder.replace(/^\d+-/, '');
  if (!numericCode || !slug) return null;

  const productUrl = `${store.baseUrl}/${numericCode}-${slug}`;
  const res = await fetch(productUrl, {
    headers: {
      ...SCRAPE_HEADERS,
      Referer: `${store.baseUrl}/`,
    },
    signal: options?.signal,
  });
  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);
  const title =
    cleanName($('meta[property="og:title"]').attr('content'))
    || cleanName($('title').first().text())
    || cleanName($('h1, .product__name, #NombreWeb, #NombreMobile').first().text());
  const priceText =
    $('meta[property="product:price:amount"]').attr('content')
    || $('meta[itemprop="price"]').attr('content')
    || cleanName($('.product__prices, .product-card__prices').first().text());
  const price = parseArsPrice(String(priceText));
  if (!title || price <= 0) return null;

  const imageRaw =
    $('meta[property="og:image"]').attr('content')
    || $('.product-image__img, .product__image img').first().attr('src')
    || '';
  const image = imageRaw ? normalizeAbsoluteUrl(store.baseUrl, imageRaw) : undefined;
  const stock = inferStock($('.product__availability, .text-success, .text-danger').first().text());
  const description =
    cleanName($('meta[name="description"]').attr('content'))
    || title;

  return {
    id: `${store.id}-${numericCode}-${slug}`,
    name: title,
    category,
    brand: extractBrand(title),
    model: title,
    description,
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
