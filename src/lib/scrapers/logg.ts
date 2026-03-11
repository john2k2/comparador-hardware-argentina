import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { HardwareCategory, Product, StockStatus } from '../types';
import { normalizeAbsoluteUrl } from './common-pagination';

const LOGG_BASE_URL = 'https://logg.com.ar';
const LOGG_PAGE_SIZE = 25;
const LOGG_SEARCH_MAX_PAGES = 3;
const LOGG_CATEGORY_MAX_PAGES = 4;

const SCRAPE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const LOGG_CATEGORY_NAMES: Record<HardwareCategory, string> = {
  procesadores: 'Procesadores',
  'tarjetas-graficas': 'Placasdevideo',
  motherboards: 'Motherboards',
  'memoria-ram': 'MemoriaRAM',
  almacenamiento: 'Almacenamiento',
  'fuentes-alimentacion': 'Fuentesdealimentacion',
  gabinetes: 'Gabinetes',
  refrigeracion: 'Refrigeracion',
  perifericos: 'Perifericos',
};

function parseArsPrice(value: string): number {
  const digits = value.replace(/\D/g, '');
  return parseInt(digits, 10) || 0;
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

function extractBrandFromName(name: string): string {
  const brands = [
    'AMD',
    'Intel',
    'NVIDIA',
    'ASUS',
    'MSI',
    'Gigabyte',
    'ASRock',
    'Kingston',
    'Corsair',
    'G.Skill',
    'Samsung',
    'WD',
    'Seagate',
    'Crucial',
    'Patriot',
    'XPG',
    'Thermaltake',
    'Cooler Master',
    'be quiet!',
    'Noctua',
    'Arctic',
    'Sapphire',
    'PowerColor',
    'Zotac',
    'HyperX',
    'Logitech',
    'Redragon',
    'Razer',
    'Palit',
  ];

  const upper = name.toUpperCase();
  for (const brand of brands) {
    if (upper.includes(brand.toUpperCase())) return brand;
  }
  return 'Generica';
}

function inferStock(card: cheerio.Cheerio<Element>): StockStatus {
  const text = card.text().replace(/\s+/g, ' ').trim().toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('sin stock') || text.includes('agotad')) return 'out-of-stock';
  if (text.includes('quedan pocas')) return 'low-stock';
  return 'in-stock';
}

function getLoggCategoryName(categorySlug: HardwareCategory): string {
  return LOGG_CATEGORY_NAMES[categorySlug];
}

function buildLoggUrl(
  page: number,
  categorySlug: HardwareCategory,
  filterText?: string,
): string {
  const url = new URL('/Products', LOGG_BASE_URL);
  url.searchParams.set('CurrentPage', String(page));
  url.searchParams.set('PageSize', String(LOGG_PAGE_SIZE));
  url.searchParams.set('Order', '3');

  const categoryName = getLoggCategoryName(categorySlug);
  if (categoryName) {
    url.searchParams.set('categoryName', categoryName);
  }

  if (filterText) {
    url.searchParams.set('FilterText', filterText);
  }

  return url.toString();
}

async function scrapeLoggPage(
  url: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<{ products: Product[]; hasNextPage: boolean }> {
  const res = await fetch(url, {
    headers: SCRAPE_HEADERS,
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const products: Product[] = [];
  const seenIds = new Set<string>();

  $('.product-card').each((_, el) => {
    const card = $(el);
    const title = card.find('.card-text').first().text().replace(/\s+/g, ' ').trim();
    const href = card.attr('href')?.trim() || '';
    if (!title || !href) return;

    const productUrl = normalizeAbsoluteUrl(LOGG_BASE_URL, href);
    const imageRaw = card.find('img').first().attr('src')?.trim() || '';
    const image = imageRaw ? normalizeAbsoluteUrl(LOGG_BASE_URL, imageRaw) : undefined;
    const priceText = card.find('.logg-price, .card-price').first().text().replace(/\s+/g, ' ').trim();
    const price = parseArsPrice(priceText);
    if (price <= 0) return;

    const slugPart = href.split('/').filter(Boolean).pop() || slugify(title);
    const onclick = card.attr('onclick') || '';
    const idMatch = onclick.match(/'(\d+)'/);
    const id = idMatch?.[1] ? `logg-${idMatch[1]}-${slugify(title)}` : `logg-${slugify(slugPart)}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    products.push({
      id,
      name: title,
      category: categorySlug,
      brand: extractBrandFromName(title),
      model: title,
      description: title,
      image,
      lowestPrice: price,
      highestPrice: price,
      averagePrice: price,
      prices: [
        {
          storeId: 'logg',
          storeName: 'Logg',
          url: productUrl,
          price,
          installment: null,
          stock: inferStock(card),
          lastUpdated: new Date(),
        },
      ],
      specs: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const hasNextPage = $('.pagination button')
    .filter((_, el) => $(el).text().replace(/\s+/g, ' ').trim().toLowerCase() === 'siguiente')
    .length > 0;

  return { products, hasNextPage };
}

async function scrapeLoggCollection(
  categorySlug: HardwareCategory,
  maxPages: number,
  filterText?: string,
  signal?: AbortSignal,
): Promise<Product[]> {
  const products: Product[] = [];
  const seenIds = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = buildLoggUrl(page, categorySlug, filterText);
    const { products: pageProducts, hasNextPage } = await scrapeLoggPage(pageUrl, categorySlug, signal);

    for (const product of pageProducts) {
      if (seenIds.has(product.id)) continue;
      seenIds.add(product.id);
      products.push(product);
    }

    if (!hasNextPage) break;
  }

  return products;
}

export async function fetchLoggProducts(
  query: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  const trimmedQuery = query.trim();
  try {
    const maxPages = trimmedQuery ? LOGG_SEARCH_MAX_PAGES : LOGG_CATEGORY_MAX_PAGES;
    console.log(`[Logg Scraper] Extrayendo productos para ${trimmedQuery || categorySlug}`);
    const products = await scrapeLoggCollection(categorySlug, maxPages, trimmedQuery || undefined, signal);
    console.log(`[Logg Scraper] Productos detectados: ${products.length}`);
    return products;
  } catch (error) {
    console.error('[Logg Scraper] Error:', error);
    return [];
  }
}
