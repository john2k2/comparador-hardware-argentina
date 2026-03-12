import * as cheerio from 'cheerio';
import { Product, HardwareCategory, StockStatus } from '../types';

const XTPC_BASE_URL = 'https://www.xt-pc.com.ar';
const XTPC_SEARCH_MAX_PAGES = 3;

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const CATEGORY_SEARCH_TERMS: Record<HardwareCategory, string[]> = {
  procesadores: ['ryzen', 'procesador'],
  'tarjetas-graficas': ['rtx', 'placa de video'],
  motherboards: ['motherboard', 'mother'],
  'memoria-ram': ['memoria ram', 'ddr5'],
  almacenamiento: ['ssd', 'nvme'],
  'fuentes-alimentacion': ['fuente', 'psu'],
  gabinetes: ['gabinete', 'case'],
  refrigeracion: ['cooler', 'watercooler'],
  perifericos: ['monitor', 'teclado'],
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

function normalizeAbsoluteUrl(href: string): string {
  return new URL(href, XTPC_BASE_URL).toString();
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
  const brands = ['AMD', 'Intel', 'NVIDIA', 'ASUS', 'MSI', 'Gigabyte', 'Corsair', 'Kingston', 'Logitech', 'Razer', 'Redragon', 'HP', 'Lenovo', 'Acer', 'Dell'];
  const upper = name.toUpperCase();
  for (const brand of brands) {
    if (upper.includes(brand.toUpperCase())) return brand;
  }
  return 'Generica';
}

function inferStock(text: string): StockStatus {
  const normalized = text.toLowerCase();
  if (!normalized) return 'in-stock';
  if (normalized.includes('sin stock') || normalized.includes('agotado')) return 'out-of-stock';
  if (normalized.includes('ultim')) return 'low-stock';
  return 'in-stock';
}

async function scrapeXtpcPage(url: string, category: HardwareCategory, signal?: AbortSignal): Promise<Product[]> {
  const res = await fetch(url, {
    headers: SCRAPE_HEADERS,
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const products: Product[] = [];
  const seenIds = new Set<string>();

  $('.product-list').each((_, element) => {
    const card = $(element);
    const linkEl = card.find('a[href*="/prod/"]').first();
    const href = linkEl.attr('href')?.trim() || '';
    const title = cleanName(card.find('h3').first().text());
    if (!href || !title) return;

    const productUrl = normalizeAbsoluteUrl(href);
    const code = productUrl.match(/\/prod\/(\d+)\//i)?.[1];
    const id = code ? `xtpc-${code}-${slugify(title)}` : `xtpc-${slugify(title)}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const priceText = cleanName(card.find('.price').first().contents().first().text() || card.find('.price').first().text());
    const promoText = cleanName(card.find('.price-promo').first().text());
    const price = parseArsPrice(priceText);
    const originalPrice = parseArsPrice(promoText);
    if (price <= 0) return;

    const imageRaw = card.find('img').first().attr('src') || '';
    const image = imageRaw ? normalizeAbsoluteUrl(imageRaw) : undefined;

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
      prices: [{
        storeId: 'xtpc',
        storeName: 'Xt-PC',
        url: productUrl,
        price,
        originalPrice: originalPrice > price ? originalPrice : undefined,
        installment: null,
        stock: inferStock(card.text()),
        lastUpdated: new Date(),
      }],
      specs: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  return products;
}

async function scrapeXtpcCollection(query: string, category: HardwareCategory, signal?: AbortSignal): Promise<Product[]> {
  const merged = new Map<string, Product>();

  for (let page = 1; page <= XTPC_SEARCH_MAX_PAGES; page += 1) {
    const url = `${XTPC_BASE_URL}/cat/search/${encodeURIComponent(query)}${page > 1 ? `/${page}` : ''}`;
    const pageProducts = await scrapeXtpcPage(url, category, signal).catch(() => []);
    if (pageProducts.length === 0) break;
    for (const product of pageProducts) {
      if (!merged.has(product.id)) merged.set(product.id, product);
    }
  }

  return Array.from(merged.values());
}

export async function fetchXtpcProducts(query: string, category: HardwareCategory, signal?: AbortSignal): Promise<Product[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];
  return scrapeXtpcCollection(trimmedQuery, category, signal);
}

export async function fetchXtpcCategory(category: HardwareCategory, signal?: AbortSignal): Promise<Product[]> {
  const terms = CATEGORY_SEARCH_TERMS[category] ?? [];
  const merged = new Map<string, Product>();

  for (const term of terms) {
    const products = await fetchXtpcProducts(term, category, signal).catch(() => []);
    for (const product of products) {
      if (!merged.has(product.id)) merged.set(product.id, product);
    }
    if (merged.size >= 18) break;
  }

  return Array.from(merged.values());
}

export async function fetchXtpcProductById(id: string, category: HardwareCategory, signal?: AbortSignal): Promise<Product | null> {
  const normalized = id.trim().toLowerCase();
  if (!normalized.startsWith('xtpc-')) return null;

  const remainder = normalized.slice('xtpc-'.length);
  const code = remainder.match(/^(\d+)-/)?.[1];
  const slug = remainder.replace(/^\d+-/, '');
  if (!code || !slug) return null;

  const url = `${XTPC_BASE_URL}/prod/${code}/${slug}`;
  const res = await fetch(url, { headers: SCRAPE_HEADERS, signal });
  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);
  const title =
    cleanName($('meta[property="og:title"]').attr('content'))
    || cleanName($('title').first().text())
    || cleanName($('h1').first().text());
  const priceText = cleanName($('.price').first().contents().first().text() || $('.price').first().text());
  const promoText = cleanName($('.price-promo').first().text());
  const price = parseArsPrice(priceText);
  if (!title || price <= 0) return null;

  const imageRaw = $('meta[property="og:image"]').attr('content') || $('img').first().attr('src') || '';
  const image = imageRaw ? normalizeAbsoluteUrl(imageRaw) : undefined;

  return {
    id: `xtpc-${code}-${slug}`,
    name: title,
    category,
    brand: extractBrand(title),
    model: title,
    description: title,
    image,
    lowestPrice: price,
    highestPrice: price,
    averagePrice: price,
    prices: [{
      storeId: 'xtpc',
      storeName: 'Xt-PC',
      url,
      price,
      originalPrice: parseArsPrice(promoText) > price ? parseArsPrice(promoText) : undefined,
      installment: null,
      stock: inferStock($.text()),
      lastUpdated: new Date(),
    }],
    specs: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
