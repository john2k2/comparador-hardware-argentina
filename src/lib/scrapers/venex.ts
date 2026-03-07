import * as cheerio from 'cheerio';
import { Product, HardwareCategory } from '../types';
import {
  buildPaginatedUrl,
  findNextPageUrl,
  normalizeAbsoluteUrl,
  resolvePaginationBudget,
} from './common-pagination';

const VENEX_BASE_URL = 'https://www.venex.com.ar';
const VENEX_CATEGORY_MAX_PAGES = 5;
const VENEX_SEARCH_MAX_PAGES = 3;

export async function fetchVenexProducts(
  categoryUrl: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  try {
    console.log(`[Venex Scraper] Extrayendo productos de: ${categoryUrl}`);

    const products: Product[] = [];
    const seenProductIds = new Set<string>();
    const seenPageUrls = new Set<string>();
    const pageBudget = resolvePaginationBudget(
      categoryUrl,
      VENEX_CATEGORY_MAX_PAGES,
      VENEX_SEARCH_MAX_PAGES,
    );

    let pageIndex = 1;
    let nextPageUrl: string | null = categoryUrl;

    while (nextPageUrl && pageIndex <= pageBudget) {
      const pageUrl = pageIndex === 1 ? nextPageUrl : buildPaginatedUrl(nextPageUrl, pageIndex);
      if (seenPageUrls.has(pageUrl)) break;
      seenPageUrls.add(pageUrl);

      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        },
        signal,
      });

      if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);

      const html = await res.text();
      const $ = cheerio.load(html);
      let pageProducts = 0;

      $('.product-box').each((_, el) => {
        const title = $(el).find('h3').text().trim();
        if (!title) return;

        const urlRel = $(el).find('a').attr('href') || $(el).attr('href') || '';
        const url = normalizeAbsoluteUrl(VENEX_BASE_URL, urlRel);

        let image = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
        if (image) {
          image = normalizeAbsoluteUrl(VENEX_BASE_URL, image);
        }

        const priceText = $(el).find('.current-price').text().trim() || $(el).find('.price').text().trim();
        const price = parseInt(priceText.split(',')[0].replace(/\D/g, ''), 10) || 0;
        if (price <= 0 || !url) return;

        const id = `venex-${url.split('/').pop()?.replace('.html', '') || Date.now().toString()}`;
        if (seenProductIds.has(id)) return;
        seenProductIds.add(id);
        pageProducts += 1;

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
              storeId: 'venex',
              storeName: 'Venex',
              url,
              price,
              installment: null,
              stock: title.toLowerCase().includes('outlet') ? 'low-stock' : 'in-stock',
              lastUpdated: new Date(),
            },
          ],
          specs: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      console.log(`[Venex Scraper] Pagina ${pageIndex}: ${pageProducts} productos nuevos`);
      if (pageProducts === 0) break;

      nextPageUrl = findNextPageUrl($, res.url || pageUrl, VENEX_BASE_URL);
      if (!nextPageUrl && pageIndex < pageBudget) {
        nextPageUrl = buildPaginatedUrl(categoryUrl, pageIndex + 1);
      }

      pageIndex += 1;
    }

    return products;
  } catch (error) {
    console.error('[Venex Scraper] Error:', error);
    return [];
  }
}

function extractBrandFromName(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('AMD')) return 'AMD';
  if (upper.includes('INTEL')) return 'Intel';
  if (upper.includes('CORSAIR')) return 'Corsair';
  if (upper.includes('GIGABYTE')) return 'Gigabyte';
  return 'Generica';
}
