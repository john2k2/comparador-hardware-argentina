import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { HardwareCategory, Product, StockStatus } from '../types';
import { parseLocalizedArsPrice } from '../price-utils';
import { extractBrandFromName as extractBrandFromNameShared } from './brand-utils';
import { logger } from '../logger';

const COMPUGARDEN_BASE_URL = 'https://www.compugarden.com.ar';

// Limite superior razonable para precios de hardware en ARS (10 millones)
// Precios por encima de esto son casi seguramente errores de parseo
const MAX_PLAUSIBLE_PRICE_ARS = 10_000_000;

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

function inferStock(card: cheerio.Cheerio<AnyNode>): StockStatus {
  const stockImgSrc = card.find('.semaforostock img').attr('src') || '';
  const buttonClass = card.find('input.btn-compra').attr('class') || '';
  const lowered = `${stockImgSrc} ${buttonClass}`.toLowerCase();
  if (lowered.includes('semaforo3')) return 'out-of-stock';
  if (lowered.includes('semaforo1')) return 'low-stock';
  return 'in-stock';
}

export async function fetchCompugardenProducts(
  query: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  const searchQuery = query.trim();
  if (!searchQuery) return [];

  const searchUrl = `${COMPUGARDEN_BASE_URL}/ARTICULOS/m=0/BUS=${encodeURIComponent(searchQuery)};/compugarden.aspx`;

  try {
    logger.info(`[Compugarden Scraper] Extrayendo productos de: ${searchUrl}`);
    const res = await fetch(searchUrl, {
      headers: SCRAPE_HEADERS,
      signal,
    });
    if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const products: Product[] = [];
    const seenIds = new Set<string>();

    $('.product').each((_, el) => {
      const card = $(el);
      const title = card.find('.description h4 a, .description h4, h4 a').first().text().replace(/\s+/g, ' ').trim();
      if (!title) return;

      const href = card.find('.image a, .description h4 a').first().attr('href') || '';
      const productUrl = normalizeAbsoluteUrl(COMPUGARDEN_BASE_URL, href);
      if (!productUrl) return;

      const idMatch = productUrl.match(/ITEM_ID=(\d+)/i);
      const itemId = idMatch?.[1];
      const slug = slugify(title);
      const id = itemId ? `compugarden-${itemId}-${slug}` : `compugarden-${slug}`;
      if (seenIds.has(id)) return;
      seenIds.add(id);

      const imageRaw = card.find('.image img').first().attr('src') || '';
      const image = imageRaw ? normalizeAbsoluteUrl(COMPUGARDEN_BASE_URL, imageRaw) : undefined;

      const priceText = card.find('.price').first().text().trim();
      const price = parseLocalizedArsPrice(priceText);
      if (price <= 0) return;

      // Rechazar precios imposibles (errores de parseo)
      if (price > MAX_PLAUSIBLE_PRICE_ARS) {
        logger.warn(`[Compugarden Scraper] Precio imposible detectado: $${price} para "${title}"`);
        return;
      }

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
            storeId: 'compugarden',
            storeName: 'Compugarden',
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

    logger.info(`[Compugarden Scraper] Productos detectados: ${products.length}`);
    return products;
  } catch (error) {
    logger.error('[Compugarden Scraper] Error', { error });
    return [];
  }
}
