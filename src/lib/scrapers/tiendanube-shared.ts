import * as cheerio from 'cheerio';
import type { HardwareCategory, Product, StockStatus } from '../types';
import { findNextPageUrl, normalizeAbsoluteUrl as normalizeAbsolutePaginationUrl } from './common-pagination';
import { readProductDetailEvidence, schemaStock, selectedVariantStock } from './product-detail-evidence';
import { SourceHttpError } from './source-http';
import {
  buildSinglePriceProduct,
  cleanScrapedText,
  extractFirstSrcSetUrl,
  extractKnownHardwareBrand,
  normalizeScrapedAbsoluteUrl,
  parseScrapedArsPrice,
  slugFromScrapedUrl,
} from './scraper-helpers';

export interface TiendaNubeStore {
  id: string;
  name: string;
  baseUrl: string;
}

export type TiendaNubeRequestOptions = {
  signal?: AbortSignal;
};

type JsonLdOffer = {
  price?: string | number;
  availability?: string;
  inventoryLevel?: {
    value?: string | number | null;
  };
};

export const TIENDANUBE_STORES: TiendaNubeStore[] = [
  { id: '37bytes', name: '37 Bytes', baseUrl: 'https://www.37bytes.com.ar' },
  { id: 'integradosargentinos', name: 'Integrados Argentinos', baseUrl: 'https://integradosargentinos.com' },
  { id: 'shopgamer', name: 'ShopGamer', baseUrl: 'https://www.shopgamer.com.ar' },
  { id: 'slotone', name: 'Slot One', baseUrl: 'https://www.slot-one.com.ar' },
  { id: 'vertexretail', name: 'Vertex Retail', baseUrl: 'https://vrx.com.ar' },
];

export const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

export const TIENDANUBE_CONCURRENCY = 3;
export const TIENDANUBE_SEARCH_MAX_PAGES = 3;
export const TIENDANUBE_CATEGORY_MAX_PAGES = 2;

export const CATEGORY_SEARCH_TERMS: Record<HardwareCategory, string[]> = {
  procesadores: ['procesador', 'ryzen'],
  'tarjetas-graficas': ['placa de video', 'rtx'],
  motherboards: ['motherboard', 'mother'],
  'memoria-ram': ['memoria ram', 'ddr4'],
  almacenamiento: ['ssd', 'disco'],
  'fuentes-alimentacion': ['fuente', 'fuente de alimentacion'],
  gabinetes: ['gabinete', 'case'],
  refrigeracion: ['cooler', 'watercooler'],
  computadoras: ['pc armada', 'notebook'],
  perifericos: ['monitor', 'teclado'],
};

function normalizeAbsoluteUrl(baseUrl: string, href: string): string {
  return normalizeAbsolutePaginationUrl(baseUrl, href);
}

function cleanTiendaNubeName(value: string | undefined): string {
  return cleanScrapedText(value);
}

function slugFromUrl(url: string): string {
  return slugFromScrapedUrl(url);
}

function extractImageFromSrcSet(srcset: string | undefined): string {
  return extractFirstSrcSetUrl(srcset);
}

export function inferTiendaNubeStockFromVariants(rawVariants: string, selectedId?: string): StockStatus {
  return selectedVariantStock(rawVariants, selectedId);
}

export function inferTiendaNubeStockFromOffer(offer: JsonLdOffer | undefined): StockStatus {
  if (!offer) return 'unknown';
  const result = schemaStock({ ...offer });
  return result.state === 'value' ? result.value : 'unknown';
}

async function scrapeTiendaNubePage(
  url: string,
  store: TiendaNubeStore,
  category: HardwareCategory,
  options?: TiendaNubeRequestOptions,
): Promise<{ products: Product[]; nextPageUrl: string | null }> {
  const res = await fetch(url, {
    headers: {
      ...SCRAPE_HEADERS,
      Referer: `${store.baseUrl}/`,
    },
    signal: options?.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const products: Product[] = [];
  const seenIds = new Set<string>();

  $('.js-item-product, .product-item').each((_, element) => {
    const card = $(element);
    const title = cleanTiendaNubeName(
      card.find('.js-item-name, .product-item-name, h2, h3').first().text(),
    );
    const linkEl = card.find('a.product-item-link, a.js-product-item-image-link-private, a[href*="/productos/"]').first();
    const href = linkEl.attr('href')?.trim() || '';
    if (!title || !href) return;

    const productUrl = normalizeAbsoluteUrl(store.baseUrl, href);
    if (!productUrl || !productUrl.includes('/productos/')) return;

    const productIdRaw =
      card.attr('data-product-id')
      || card.find('input[name="add_to_cart"]').attr('value')
      || '';
    const slug = slugFromUrl(productUrl);
    const id = productIdRaw ? `${store.id}-${productIdRaw}-${slug}` : `${store.id}-${slug}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const priceText = cleanTiendaNubeName(card.find('.js-price-display, .product-item-price, .price').first().text());
    const price = parseScrapedArsPrice(priceText);
    if (price <= 0) return;

    const imageRaw =
      card.find('img').first().attr('data-src')
      || extractImageFromSrcSet(card.find('img').first().attr('data-srcset'))
      || extractImageFromSrcSet(card.find('img').first().attr('srcset'))
      || card.find('img').first().attr('src')
      || '';
    const image = imageRaw ? normalizeAbsoluteUrl(store.baseUrl, imageRaw) : undefined;
    const stockLabel = card.find('.js-stock-label-private, .text-stock').first().text().toLowerCase();
    const stock = stockLabel.includes('sin stock')
      ? 'out-of-stock'
      : inferTiendaNubeStockFromVariants(card.attr('data-variants') ?? '');
    const product = buildSinglePriceProduct({
      id,
      name: title,
      category,
      storeId: store.id,
      storeName: store.name,
      storeBaseUrl: store.baseUrl,
      url: productUrl,
      price,
      stock,
      image,
      brand: extractKnownHardwareBrand(title),
    });

    if (product) {
      products.push(product);
    }
  });

  return {
    products,
    nextPageUrl: findNextPageUrl($, res.url || url, store.baseUrl),
  };
}

export async function scrapeTiendaNubePages(
  startUrl: string,
  store: TiendaNubeStore,
  category: HardwareCategory,
  maxPages: number,
  options?: TiendaNubeRequestOptions,
): Promise<Product[]> {
  const products: Product[] = [];
  const seenProductIds = new Set<string>();
  const seenPageUrls = new Set<string>();
  let currentUrl: string | null = startUrl;
  let page = 0;

  while (currentUrl && page < maxPages) {
    if (seenPageUrls.has(currentUrl)) break;
    seenPageUrls.add(currentUrl);
    page += 1;

    const { products: pageProducts, nextPageUrl } = await scrapeTiendaNubePage(currentUrl, store, category, options);
    let newProducts = 0;

    for (const product of pageProducts) {
      if (seenProductIds.has(product.id)) continue;
      seenProductIds.add(product.id);
      products.push(product);
      newProducts += 1;
    }

    if (newProducts === 0) break;
    currentUrl = nextPageUrl;
  }

  return products;
}

function parseTiendaNubeDetailResult(
  html: string,
  pageUrl: string,
  productId: string,
  store: TiendaNubeStore,
  category: HardwareCategory,
) {
  const $ = cheerio.load(html);
  const evidence = readProductDetailEvidence($, pageUrl, store.id);
  if (evidence.state !== 'value') return { state: evidence.state, product: null };
  const { name: title, price, stock, node: jsonLd } = evidence.value;

  const schemaImage = Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image;
  const imageRaw = (typeof schemaImage === 'string' ? schemaImage : '')
      || $('meta[property="og:image"]').attr('content')
      || $('.js-product-image img, .product-image img, img').first().attr('src')
      || '';
  const description =
    cleanTiendaNubeName(typeof jsonLd.description === 'string' ? jsonLd.description : '') ||
    cleanTiendaNubeName($('meta[name="description"]').attr('content')) ||
    cleanTiendaNubeName($('.js-product-description, .product-description').first().text()) ||
    title;
  const normalizedImage = imageRaw ? normalizeScrapedAbsoluteUrl(store.baseUrl, imageRaw) : undefined;

  const product = buildSinglePriceProduct({
    id: productId,
    name: title,
    category,
    storeId: store.id,
    storeName: store.name,
    storeBaseUrl: store.baseUrl,
    url: pageUrl,
    price,
    stock,
    image: normalizedImage,
    description,
    brand: extractKnownHardwareBrand(title),
  });
  if (product) {
    // El importe de esquema/DOM ya fue corroborado, incluidos sus centavos.
    product.prices[0].price = price;
    product.lowestPrice = price;
    product.highestPrice = price;
    product.averagePrice = price;
    if (typeof jsonLd.sku === 'string' && jsonLd.sku.length <= 160) product.specs.SKU = jsonLd.sku;
  }
  return { state: 'value' as const, product };
}

export function parseTiendaNubeProductDetailHtml(
  html: string,
  pageUrl: string,
  productId: string,
  store: TiendaNubeStore,
  category: HardwareCategory,
): Product | null {
  return parseTiendaNubeDetailResult(html, pageUrl, productId, store, category).product;
}

export async function fetchTiendaNubeProductFromStore(
  productId: string,
  category: HardwareCategory,
  options?: TiendaNubeRequestOptions,
): Promise<Product | null> {
  const separatorIndex = productId.indexOf('-');
  if (separatorIndex <= 0 || separatorIndex >= productId.length - 1) return null;

  const storeId = productId.slice(0, separatorIndex);
  const remainder = productId.slice(separatorIndex + 1);
  const store = TIENDANUBE_STORES.find((item) => item.id === storeId);
  if (!store) return null;

  const slug = remainder.replace(/^\d+-/, '');
  const candidateUrls = [
    `${store.baseUrl}/productos/${slug}/`,
    `${store.baseUrl}/${slug}/`,
  ];

  for (const candidateUrl of candidateUrls) {
    try {
      const res = await fetch(candidateUrl, {
        headers: {
          ...SCRAPE_HEADERS,
          Referer: `${store.baseUrl}/`,
        },
        signal: options?.signal,
      });
      if (!res.ok) continue;

      const html = await res.text();
      const parsed = parseTiendaNubeDetailResult(
        html,
        res.url || candidateUrl,
        productId,
        store,
        category,
      );
      // Una segunda ruta no puede sanar un esquema/DOM contradictorio.
      if (parsed.state === 'conflict') throw new SourceHttpError('inconsistent-source');
      if (parsed.product) return parsed.product;
    } catch (error) {
      if (error instanceof SourceHttpError && error.reason === 'inconsistent-source') throw error;
      continue;
    }
  }

  return null;
}
