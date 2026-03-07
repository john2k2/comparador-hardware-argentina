import * as cheerio from 'cheerio';
import { Product, HardwareCategory } from '../types';
import {
  buildPaginatedUrl,
  findNextPageUrl,
  normalizeAbsoluteUrl,
  resolvePaginationBudget,
} from './common-pagination';

const FULLH4RD_BASE_URL = 'https://www.fullh4rd.com.ar';
const FULLH4RD_CATEGORY_MAX_PAGES = 5;
const FULLH4RD_SEARCH_MAX_PAGES = 3;

export async function fetchFullh4rdProducts(
  categoryUrl: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  try {
    console.log(`[Fullh4rd Scraper] Extrayendo productos de: ${categoryUrl}`);

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
      const pageUrl = pageIndex === 1 ? nextPageUrl : buildPaginatedUrl(nextPageUrl, pageIndex);
      if (seenPageUrls.has(pageUrl)) break;
      seenPageUrls.add(pageUrl);

      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        },
        signal,
      });

      if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);

      const html = await res.text();
      const $ = cheerio.load(html);
      let pageProducts = 0;

      $('.item').each((_, el) => {
        const title = $(el).find('h3').text().trim() || $(el).find('h2').text().trim();
        if (!title) return;

        const urlRel = $(el).find('a').attr('href') || '';
        const url = normalizeAbsoluteUrl(FULLH4RD_BASE_URL, urlRel);
        let image = $(el).find('.image img').attr('src') || $(el).find('img').attr('src') || '';
        if (image) {
          image = normalizeAbsoluteUrl(FULLH4RD_BASE_URL, image);
        }

        const priceText = $(el).find('.price').text().trim();
        const matches = priceText.match(/\$?([\d\.]+)(,\d+)?/g);
        let price = 0;
        if (matches && matches.length > 0) {
          price = parseInt(matches[0].split(',')[0].replace(/\D/g, ''), 10) || 0;
        }

        if (price <= 0 || !url) return;

        const id = `fh-${url.split('/').pop() || Date.now().toString()}`;
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
              storeId: 'fullh4rd',
              storeName: 'Fullh4rd',
              url,
              price,
              installment: null,
              stock: 'in-stock',
              lastUpdated: new Date(),
            },
          ],
          specs: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      console.log(`[Fullh4rd Scraper] Pagina ${pageIndex}: ${pageProducts} productos nuevos`);
      if (pageProducts === 0) break;

      nextPageUrl = findNextPageUrl($, res.url || pageUrl, FULLH4RD_BASE_URL);
      if (!nextPageUrl && pageIndex < pageBudget) {
        nextPageUrl = buildPaginatedUrl(categoryUrl, pageIndex + 1);
      }

      pageIndex += 1;
    }

    return products;
  } catch (error) {
    console.error('[Fullh4rd Scraper] Error:', error);
    return [];
  }
}

function extractBrandFromName(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('AMD')) return 'AMD';
  if (upper.includes('INTEL')) return 'Intel';
  if (upper.includes('ASUS')) return 'ASUS';
  if (upper.includes('GIGABYTE')) return 'Gigabyte';
  if (upper.includes('MSI')) return 'MSI';
  return 'Generica';
}
