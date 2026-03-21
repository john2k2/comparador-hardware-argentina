import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { HardwareCategory, Product, StockStatus } from '../types';
import { normalizeAbsoluteUrl } from './common-pagination';
import { logger } from '../logger';

const GAMING_CITY_BASE_URL = 'https://www.gamingcity.com.ar';
const GAMING_CITY_SEARCH_MAX_PAGES = 3;
const GAMING_CITY_CATEGORY_MAX_PAGES = 3;

const SCRAPE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const GAMING_CITY_CATEGORY_URLS: Record<HardwareCategory, string> = {
  procesadores: `${GAMING_CITY_BASE_URL}/procesadores-componentes--prod--27`,
  'tarjetas-graficas': `${GAMING_CITY_BASE_URL}/placas-de-video-componentes--prod--104`,
  motherboards: `${GAMING_CITY_BASE_URL}/motherboards-componentes--prod--170`,
  'memoria-ram': `${GAMING_CITY_BASE_URL}/memorias-ram-componentes--prod--100`,
  almacenamiento: `${GAMING_CITY_BASE_URL}/discos-componentes--prod--167`,
  'fuentes-alimentacion': `${GAMING_CITY_BASE_URL}/fuentes-componentes--prod--10`,
  gabinetes: `${GAMING_CITY_BASE_URL}/gabinetes--prod--9`,
  refrigeracion: `${GAMING_CITY_BASE_URL}/refrigeracion-componentes--prod--129`,
  perifericos: `${GAMING_CITY_BASE_URL}/perifericos--prod--178`,
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
  ];

  const upper = name.toUpperCase();
  for (const brand of brands) {
    if (upper.includes(brand.toUpperCase())) return brand;
  }
  return 'Generica';
}

function inferStock(card: cheerio.Cheerio<Element>): StockStatus {
  const stockText = card.find('.leyendaConStock, .stock').text().replace(/\s+/g, ' ').trim().toLowerCase();
  if (!stockText) return 'unknown';
  if (stockText.includes('sin stock') || stockText.includes('agotad')) return 'out-of-stock';
  if (stockText.includes('ultim') || stockText.includes('pocas')) return 'low-stock';
  if (stockText.includes('stock') || stockText.includes('disponibles')) return 'in-stock';
  return 'unknown';
}

function extractProductId(href: string, title: string): string {
  const detailMatch = href.match(/--det--(\d+)/i);
  const slug = slugify(title);
  if (detailMatch?.[1]) return `gamingcity-${detailMatch[1]}-${slug}`;
  return `gamingcity-${slug}`;
}

function findNextPageUrl($: cheerio.CheerioAPI, currentUrl: string): string | null {
  const nextAnchor = $('.pagination a, .pager a, .page-item a')
    .filter((_, el) => $(el).text().replace(/\s+/g, ' ').trim().toLowerCase().startsWith('siguiente'))
    .first();

  if (!nextAnchor.length) return null;

  const href = nextAnchor.attr('href')?.trim() || '';
  if (!href) return null;

  const absolute = normalizeAbsoluteUrl(GAMING_CITY_BASE_URL, href);
  return absolute && absolute !== currentUrl ? absolute : null;
}

async function scrapeGamingCityPage(
  url: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<{ products: Product[]; nextPageUrl: string | null }> {
  const res = await fetch(url, {
    headers: SCRAPE_HEADERS,
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const products: Product[] = [];
  const seenIds = new Set<string>();

  $('.cajasoferta .product, .product').each((_, el) => {
    const card = $(el);
    const title = card.find('h4 a, h4').first().text().replace(/\s+/g, ' ').trim();
    const href = card.find('a[href*="--det--"]').first().attr('href')?.trim() || '';
    if (!title || !href) return;

    const productUrl = normalizeAbsoluteUrl(GAMING_CITY_BASE_URL, href);
    if (!productUrl) return;

    const id = extractProductId(href, title);
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const priceText = card.find('.price').first().text().replace(/\s+/g, ' ').trim();
    const price = parseArsPrice(priceText);
    if (price <= 0) return;

    const imageRaw = card.find('.image img').first().attr('src')?.trim() || '';
    const image = imageRaw ? normalizeAbsoluteUrl(GAMING_CITY_BASE_URL, imageRaw) : undefined;
    const stock = inferStock(card);

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
          storeId: 'gamingcity',
          storeName: 'Gaming City',
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

  return {
    products,
    nextPageUrl: findNextPageUrl($, url),
  };
}

async function scrapeGamingCityCollection(
  initialUrl: string,
  categorySlug: HardwareCategory,
  maxPages: number,
  signal?: AbortSignal,
): Promise<Product[]> {
  const products: Product[] = [];
  const seenIds = new Set<string>();
  let currentUrl: string | null = initialUrl;
  let page = 0;

  while (currentUrl && page < maxPages) {
    page += 1;
    const { products: pageProducts, nextPageUrl } = await scrapeGamingCityPage(currentUrl, categorySlug, signal);
    for (const product of pageProducts) {
      if (seenIds.has(product.id)) continue;
      seenIds.add(product.id);
      products.push(product);
    }

    if (!nextPageUrl || nextPageUrl === currentUrl) break;
    currentUrl = nextPageUrl;
  }

  return products;
}

export async function fetchGamingCityProducts(
  queryOrUrl: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  const rawInput = queryOrUrl.trim();
  if (!rawInput) return [];

  const initialUrl = rawInput.startsWith('http')
    ? rawInput
    : `${GAMING_CITY_BASE_URL}/busqueda_avanzada.php?buscar=1&palabra=${encodeURIComponent(rawInput)}`;
  const maxPages = rawInput.startsWith('http') ? GAMING_CITY_CATEGORY_MAX_PAGES : GAMING_CITY_SEARCH_MAX_PAGES;

  try {
    logger.info(`[Gaming City Scraper] Extrayendo productos de: ${initialUrl}`);
    const products = await scrapeGamingCityCollection(initialUrl, categorySlug, maxPages, signal);
    logger.info(`[Gaming City Scraper] Productos detectados: ${products.length}`);
    return products;
  } catch (error) {
    logger.error('[Gaming City Scraper] Error', { error });
    return [];
  }
}

export function getGamingCityCategoryUrl(categorySlug: HardwareCategory): string {
  return GAMING_CITY_CATEGORY_URLS[categorySlug];
}
