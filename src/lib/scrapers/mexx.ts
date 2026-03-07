import * as cheerio from 'cheerio';
import { Product, HardwareCategory } from '../types';
import {
  buildPaginatedUrl,
  findNextPageUrl,
  normalizeAbsoluteUrl,
  resolvePaginationBudget,
} from './common-pagination';

const MEXX_BASE_URL = 'https://www.mexx.com.ar';
const MEXX_CATEGORY_MAX_PAGES = 5;
const MEXX_SEARCH_MAX_PAGES = 3;

export async function fetchMexxProducts(
  categoryUrl: string,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  try {
    console.log(`[Mexx Scraper] Extrayendo productos de: ${categoryUrl}`);

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
        throw new Error(`Fallo al acceder a Mexx: ${res.statusText}`);
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

      console.log(`[Mexx Scraper] Pagina ${pageIndex}: ${pageProducts} productos nuevos`);
      if (pageProducts === 0) break;

      nextPageUrl = findNextPageUrl($, res.url || pageUrl, MEXX_BASE_URL);
      if (!nextPageUrl && pageIndex < pageBudget) {
        nextPageUrl = buildPaginatedUrl(categoryUrl, pageIndex + 1);
      }

      pageIndex += 1;
    }

    return products;
  } catch (error) {
    console.error('[Mexx Scraper] Error critico:', error);
    return [];
  }
}

function extractBrandFromName(name: string): string {
  const upperName = name.toUpperCase();
  if (upperName.includes('AMD')) return 'AMD';
  if (upperName.includes('INTEL')) return 'Intel';
  if (upperName.includes('ASUS')) return 'ASUS';
  if (upperName.includes('GIGABYTE')) return 'Gigabyte';
  if (upperName.includes('MSI')) return 'MSI';
  if (upperName.includes('CORSAIR')) return 'Corsair';
  if (upperName.includes('NVIDIA') || upperName.includes('GEFORCE')) return 'NVIDIA';
  if (upperName.includes('RADEON')) return 'AMD Radeon';
  return 'Generica';
}
