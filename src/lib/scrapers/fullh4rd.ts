import * as cheerio from 'cheerio';
import { parseFullh4rdPage } from './fullh4rd-page';
import { Product, HardwareCategory } from '../types';
import {
  buildPaginatedUrl,
  findNextPageUrl,
  resolvePaginationBudget,
} from './common-pagination';
import { logger } from '../logger';

const FULLH4RD_BASE_URL = 'https://www.fullh4rd.com.ar';
const FULLH4RD_CATEGORY_MAX_PAGES = 5;
const FULLH4RD_SEARCH_MAX_PAGES = 3;

export async function fetchFullh4rdProducts(
  categoryUrl: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  try {
    logger.info(`[Fullh4rd Scraper] Extrayendo productos de: ${categoryUrl}`);

    const products: Product[] = [];
    const seenProductIds = new Set<string>();
    const seenPageUrls = new Set<string>();
    const pageBudget = resolvePaginationBudget(
      categoryUrl,
      FULLH4RD_CATEGORY_MAX_PAGES,
      FULLH4RD_SEARCH_MAX_PAGES,
    );

    let pageIndex = 1;
    let nextPageUrl: string | null = categoryUrl;

    while (nextPageUrl && pageIndex <= pageBudget) {
      const pageUrl: string = nextPageUrl;
      if (seenPageUrls.has(pageUrl)) break;
      seenPageUrls.add(pageUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20_000);

      let res: Response;
      try {
        res = await fetch(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);

      const html = await res.text();
      const $ = cheerio.load(html);
      let pageProducts = 0;

      const parsed = parseFullh4rdPage(html, res.url || pageUrl, categorySlug);
      if (parsed.blocked) throw new Error('FULLH4RD_CHALLENGE');
      for (const product of parsed.products) {
        if (seenProductIds.has(product.id)) continue;
        seenProductIds.add(product.id);
        products.push(product);
        pageProducts++;
      }

      logger.info(`[Fullh4rd Scraper] Pagina ${pageIndex}: ${pageProducts} productos nuevos`);
      if (pageProducts === 0) break;

      nextPageUrl = parsed.nextUrl ?? (parsed.modern ? null : findNextPageUrl($, res.url || pageUrl, FULLH4RD_BASE_URL));
      if (!parsed.modern && !nextPageUrl && pageIndex < pageBudget) {
        nextPageUrl = buildPaginatedUrl(categoryUrl, pageIndex + 1);
      }

      pageIndex += 1;
    }

    return products;
  } catch (error) {
    logger.error('[Fullh4rd Scraper] Error', { error });
    return [];
  }
}
