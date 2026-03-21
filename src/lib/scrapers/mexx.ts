import * as cheerio from 'cheerio';
import { Product, HardwareCategory } from '../types';
import {
  buildPaginatedUrl,
  findNextPageUrl,
  normalizeAbsoluteUrl,
  resolvePaginationBudget,
} from './common-pagination';
import { extractBrandFromName as extractBrandFromNameShared } from './brand-utils';
import { logger } from '../logger';
import { ScrapingError, ScraperResult, ok, fail, getErrorCode } from './types';

const MEXX_BASE_URL = 'https://www.mexx.com.ar';
const MEXX_CATEGORY_MAX_PAGES = 5;
const MEXX_SEARCH_MAX_PAGES = 3;

export async function scrapeMexxProducts(
  categoryUrl: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<ScraperResult<Product>> {
  const startTime = Date.now();

  try {
    logger.info(`[Mexx Scraper] Extrayendo productos de: ${categoryUrl}`);

    const products: Product[] = [];
    const seenProductIds = new Set<string>();
    const seenPageUrls = new Set<string>();
    const pageBudget = resolvePaginationBudget(
      categoryUrl,
      MEXX_CATEGORY_MAX_PAGES,
      MEXX_SEARCH_MAX_PAGES,
    );

    let pageIndex = 1;
    let nextPageUrl: string | null = categoryUrl;

    while (nextPageUrl && pageIndex <= pageBudget) {
      const pageUrl = pageIndex === 1 ? nextPageUrl : buildPaginatedUrl(nextPageUrl, pageIndex);
      if (seenPageUrls.has(pageUrl)) break;
      seenPageUrls.add(pageUrl);

      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal,
      });

      if (!res.ok) {
        const error: ScrapingError = {
          code: 'NETWORK_ERROR',
          message: `HTTP ${res.status}: ${res.statusText}`,
          url: pageUrl,
          timestamp: Date.now(),
        };
        return fail(error, Date.now() - startTime);
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      let pageProducts = 0;

      $('.card-ecommerce, .card').each((_, el) => {
        const rawTitle = $(el).find('h4').text() || '';
        const cleanTitle = rawTitle.split('$')[0].trim().replace(/\n/g, ' ');
        const rawUrl = $(el).find('a').attr('href') || '';
        const url = normalizeAbsoluteUrl(MEXX_BASE_URL, rawUrl);
        const imageRaw = $(el).find('img').first().attr('src') || '';
        const image = imageRaw ? normalizeAbsoluteUrl(MEXX_BASE_URL, imageRaw) : '';
        const rawPrice = $(el).find('b, strong').first().text() || '';
        const priceClean = parseInt(rawPrice.split(',')[0].replace(/\D/g, ''), 10) || 0;

        let stock: 'in-stock' | 'out-of-stock' | 'low-stock' = 'in-stock';
        if (!priceClean || rawTitle.toLowerCase().includes('sin stock')) {
          stock = 'out-of-stock';
        }

        if (!cleanTitle || !url) return;

        const id = `mexx-${url.split('/').pop()?.replace('.html', '') || Date.now().toString()}`;
        if (seenProductIds.has(id)) return;
        seenProductIds.add(id);
        pageProducts += 1;

        products.push({
          id,
          name: cleanTitle,
          category: categorySlug,
          brand: extractBrandFromName(cleanTitle),
          model: cleanTitle,
          description: cleanTitle,
          image,
          lowestPrice: priceClean,
          highestPrice: priceClean,
          averagePrice: priceClean,
          prices: [
            {
              storeId: 'mexx',
              storeName: 'Mexx',
              url,
              price: priceClean,
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

      logger.info(`[Mexx Scraper] Pagina ${pageIndex}: ${pageProducts} productos nuevos`);
      if (pageProducts === 0) break;

      nextPageUrl = findNextPageUrl($, res.url || pageUrl, MEXX_BASE_URL);
      if (!nextPageUrl && pageIndex < pageBudget) {
        nextPageUrl = buildPaginatedUrl(categoryUrl, pageIndex + 1);
      }

      pageIndex += 1;
    }

    return ok(products, Date.now() - startTime);
  } catch (error) {
    const scrapingError: ScrapingError = {
      code: getErrorCode(error),
      message: error instanceof Error ? error.message : String(error),
      url: categoryUrl,
      timestamp: Date.now(),
    };
    logger.error('[Mexx Scraper] Error critico', { error: scrapingError });
    return fail(scrapingError, Date.now() - startTime);
  }
}

export async function fetchMexxProducts(
  categoryUrl: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  const result = await scrapeMexxProducts(categoryUrl, categorySlug, signal);
  return result.data;
}

function extractBrandFromName(name: string): string {
  return extractBrandFromNameShared(name) ?? 'Generica';
}
