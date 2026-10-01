import * as cheerio from 'cheerio';
import { HardwareCategory, Product, StockStatus } from '../types';
import { extractBrandFromName as extractBrandFromNameShared } from './brand-utils';
import { logger } from '../logger';
import { sourceFetch } from './source-http';
import { parseLocalizedArsPrice } from '../price-utils';
import { buildSinglePriceProduct } from './scraper-helpers';
import { inferHardwareCategoryFromName } from '../catalog/hardware-categories';

const GEZATEK_BASE_URL = 'https://www.gezatek.com.ar';

const SCRAPE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

function normalizeAbsoluteUrl(baseUrl: string, href: string): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  return `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
}

function parseGezatekPrice(rawPrice: string): number {
  const normalized = rawPrice.trim();
  if (!normalized) return 0;

  const directNumber = Number(normalized.replace(',', '.'));
  if (Number.isFinite(directNumber) && directNumber > 0) {
    return Math.round(directNumber);
  }

  const digits = normalized.replace(/\D/g, '');
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
  return extractBrandFromNameShared(name) ?? 'Generica';
}

function inferStock(stockText: string): StockStatus {
  const normalized = stockText.toLowerCase();
  if (normalized.includes('sin stock') || normalized.includes('agotad')) return 'out-of-stock';
  if (normalized.includes('ultim') || normalized.includes('pocas')) return 'low-stock';
  if (/en stock|disponible|hay existencias/.test(normalized)) return 'in-stock';
  return 'unknown';
}

/** Catálogo Qloud actual: precio Geza, stock explícito y SKU del mismo card. */
export function parseGezatekCatalog(html: string, category: HardwareCategory): Product[] {
  const $ = cheerio.load(html), products: Product[] = [], seen = new Set<string>();
  $('.card-ecommerce').each((_, element) => {
    const card = $(element), anchor = card.find('h4.card-title a').first();
    const name = anchor.text().replace(/\s+/g, ' ').trim(), href = anchor.attr('href');
    if (!name || !href) return;
    const url = new URL(href, GEZATEK_BASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || url.hostname.replace(/^www\./, '') !== 'gezatek.com.ar') return;
    const id = url.pathname.match(/-(\d+)\.html$/)?.[1];
    const primary = card.find('.pecio_final[data-precio]');
    if (!id || primary.length !== 1 || seen.has(id)) return;
    const price = Number(primary.attr('data-precio'));
    const visible = parseLocalizedArsPrice(primary.find('b').first().text());
    if (!Number.isFinite(price) || price <= 0 || Math.abs(price-visible) > 1) return;
    const product = buildSinglePriceProduct({ id:`gezatek-${id}-${slugify(name)}`, name,
      category:inferHardwareCategoryFromName(name) ?? category, storeId:'gezatek', storeName:'Gezatek', storeBaseUrl:GEZATEK_BASE_URL,
      url:url.href, price, stock:inferStock(card.find('.card-category .et').text()), image:card.find('img').first().attr('src') });
    if (!product) return;
    product.prices[0].priceCondition = 'special';
    const sku = card.find('.articulo_field').first().text().trim();
    if (sku) product.specs.SKU = sku;
    seen.add(id); products.push(product);
  });
  return products;
}

export async function fetchGezatekProducts(
  query: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  const searchQuery = query.trim();
  if (!searchQuery) return [];

  const searchUrl = `${GEZATEK_BASE_URL}/buscar/?q=${encodeURIComponent(searchQuery)}`;

  try {
    logger.info(`[Gezatek Scraper] Extrayendo productos de: ${searchUrl}`);

    const res = await sourceFetch('gezatek', searchUrl, {
      headers: SCRAPE_HEADERS,
      signal,
    }, 8_000_000, ['gezatek.com.ar']);
    if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);

    const html = await res.text();
    const currentProducts = parseGezatekCatalog(html, categorySlug);
    if (currentProducts.length) return currentProducts;
    const $ = cheerio.load(html);
    const products: Product[] = [];
    const seenIds = new Set<string>();

    $('.w-box.product, .productos .w-box.product').each((_, el) => {
      const card = $(el);
      const anchor = card.find('a.click, a[href]').first();
      const title = card.find('h2').first().text().replace(/\s+/g, ' ').trim();

      if (!title || !anchor.length) return;

      const href = anchor.attr('href') || '';
      const productUrl = normalizeAbsoluteUrl(GEZATEK_BASE_URL, href);
      if (!productUrl) return;

      const slug = slugify(href.split('/').filter(Boolean).pop()?.replace(/\.html$/i, '') || title);
      const productCode = anchor.attr('data-id')?.trim() || card.parent().attr('class')?.match(/\bc-s\s+(\d+)/)?.[1];
      const id = productCode ? `gezatek-${productCode}-${slug}` : `gezatek-${slug}`;
      if (seenIds.has(id)) return;
      seenIds.add(id);

      const imageRaw = card.find('img').first().attr('src') || '';
      const image = imageRaw ? normalizeAbsoluteUrl(GEZATEK_BASE_URL, imageRaw) : undefined;

      const priceDataId = card.find('h3.precio_web').first().attr('data-id') || '';
      const priceText = card.find('h3.precio_web, h3.price, .price').first().text();
      const price = parseGezatekPrice(priceDataId || priceText);
      if (price <= 0) return;

      const stockText = card.find('.stock_generico').first().text().trim();
      const stock = inferStock(stockText);

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
            storeId: 'gezatek',
            storeName: 'Gezatek',
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

    logger.info(`[Gezatek Scraper] Productos detectados: ${products.length}`);
    return products;
  } catch (error) {
    logger.error('[Gezatek Scraper] Error', { error });
    return [];
  }
}
