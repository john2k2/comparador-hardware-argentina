import { sourceFetch, SourceHttpError } from './source-http';
import { parseKnownProductDetail } from './known-product-detail';
import { normalizeIdentityText } from '@/lib/product-identity';
import { sameListing } from './listing-reference';
import * as cheerio from 'cheerio';
import type { HardwareCategory, Product } from '../types';
import {
  buildPaginatedUrl,
  findNextPageUrl,
  normalizeAbsoluteUrl as normalizeAbsolutePaginationUrl,
} from './common-pagination';
import {
  buildSinglePriceProduct,
  cleanScrapedText,
  extractKnownHardwareBrand,
  parseScrapedArsPrice,
  slugFromScrapedUrl,
} from './scraper-helpers';

export interface WooStore {
  id: string;
  name: string;
  baseUrl: string;
  categoryPath?: (slug: string) => string;
}

export type WooRequestOptions = {
  signal?: AbortSignal;
};

export const WOOCOMMERCE_STORES: WooStore[] = [
  { id: 'acuarioinsumos', name: 'Acuario Insumos', baseUrl: 'https://www.acuarioinsumos.com.ar' },
  { id: 'beings', name: 'Beings', baseUrl: 'https://beings.com.ar' },
  { id: 'gamerspoint', name: 'Gamers Point', baseUrl: 'https://www.gamerspoint.com.ar' },
  { id: 'katech', name: 'Katech', baseUrl: 'https://katech.com.ar' },
  { id: 'dinobyte', name: 'Dinobyte', baseUrl: 'https://dinobyte.ar' },
  { id: 'liontech', name: 'LionTech', baseUrl: 'https://liontech.com.ar' },
  { id: 'maxtecno', name: 'MaxTecno', baseUrl: 'https://www.maxtecno.com.ar' },
  { id: 'scphardstore', name: 'SCP Hardstore', baseUrl: 'https://www.scphardstore.com' },
  { id: 'thegamershop', name: 'TheGamerShop', baseUrl: 'https://www.thegamershop.com.ar' },
  { id: 'hardcore', name: 'Hardcore', baseUrl: 'https://hardcorecomputacion.com.ar' },
  { id: 'goldentechstore', name: 'Golden Tech', baseUrl: 'https://www.goldentechstore.com.ar' },
];

export const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

export const WOO_CONCURRENCY = 3;
export const WOO_CATEGORY_MAX_PAGES = 4;
export const WOO_SEARCH_MAX_PAGES = 3;

export const CATEGORY_SLUGS: Record<HardwareCategory, string[]> = {
  procesadores: ['procesadores', 'microprocesadores', 'cpu', 'procesador'],
  'tarjetas-graficas': ['placas-de-video', 'tarjetas-de-video', 'gpu', 'video'],
  motherboards: ['motherboards', 'placas-madre', 'mother'],
  'memoria-ram': ['memorias-ram', 'memoria-ram', 'ram'],
  almacenamiento: ['almacenamiento', 'discos-ssd', 'ssd', 'nvme'],
  'fuentes-alimentacion': ['fuentes-de-alimentacion', 'fuentes', 'psu'],
  gabinetes: ['gabinetes', 'cases', 'gabinete'],
  refrigeracion: ['refrigeracion', 'coolers', 'cooling'],
  computadoras: ['computadoras', 'pc-armadas', 'notebooks', 'pcs'],
  perifericos: ['perifericos', 'accesorios', 'teclados', 'mouse', 'mouses', 'monitores', 'audio', 'auriculares', 'headsets'],
};

function cleanWooName(value: string | undefined): string {
  const normalized = cleanScrapedText(value);
  if (!normalized) return '';
  if (/^ver detalles/i.test(normalized)) return '';
  return normalized;
}

function normalizeAbsoluteUrl(baseUrl: string, href: string): string {
  return normalizeAbsolutePaginationUrl(baseUrl, href);
}

async function scrapeWooPage(
  url: string,
  store: WooStore,
  category: HardwareCategory,
  options?: WooRequestOptions,
): Promise<{ products: Product[]; nextPageUrl: string | null; isDetail?: boolean }> {
  let res = await fetch(url, {
    headers: {
      ...SCRAPE_HEADERS,
      Referer: `${store.baseUrl}/`,
    },
    signal: options?.signal,
  });

  if (res.status === 403) {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: options?.signal,
    });
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  // WooCommerce puede redirigir una búsqueda de un único resultado a su ficha.
  // No recorrer sus recomendados como si fueran resultados de esa búsqueda.
  if ($('body').hasClass('single-product') || $('h1.product_title').length > 0) {
    const pageUrl = res.url || url;
    const detail = parseWooProductDetail(html, pageUrl, store, category, slugFromScrapedUrl(pageUrl));
    return { products: detail ? [detail] : [], nextPageUrl: null, isDetail: true };
  }
  const products: Product[] = [];

  $('li.type-product, article.type-product, div.type-product').each((_, el) => {
    const titleEl = $(el).find('.woocommerce-loop-product__title').first();
    const anyHeadingEl = $(el).find('h1, h2, h3, h4').first();
    const productLinkEl = $(el)
      .find('a.woocommerce-loop-product__link, a.woocommerce-LoopProduct-link, a[href*="/producto/"], a[href*="/product/"], a[href*="/productos/"], a[href]')
      .filter((_, anchor) => {
        const href = $(anchor).attr('href') ?? '';
        return href.length > 0 && !href.startsWith('#') && !href.startsWith('mailto:');
      })
      .first();
    const img = $(el).find('img.wp-post-image, img.attachment-woocommerce_thumbnail, img').first();

    const name = (
      cleanWooName(titleEl.find('a').text()) ||
      cleanWooName(titleEl.text()) ||
      cleanWooName(anyHeadingEl.text()) ||
      cleanWooName(productLinkEl.attr('title')) ||
      cleanWooName(img.attr('alt'))
    );
    if (!name) return;

    const href = titleEl.find('a').attr('href') || productLinkEl.attr('href') || '';
    if (!href) return;
    const productUrl = normalizeAbsoluteUrl(store.baseUrl, href);

    const imageRaw = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || '';
    const image = imageRaw ? normalizeAbsoluteUrl(store.baseUrl, imageRaw) : '';

    const insPrice = $(el).find('ins .woocommerce-Price-amount bdi, ins bdi').first().text().trim();
    const anyPrice = $(el).find('.woocommerce-Price-amount bdi').first().text().trim();
    const rawAmount = $(el).find('span.amount bdi, span.amount').first().text().trim();
    const classPrice = $(el).find('.price, [class*="price"]').first().text().trim();
    const storePrice = store.id === 'scphardstore' ? $(el).find('.scp-cat-card__price-current').first().text().trim() : '';
    const priceText = storePrice || insPrice || anyPrice || rawAmount || classPrice;
    const price = parseScrapedArsPrice(priceText);
    if (price <= 0) return;

    const outOfStock = $(el).hasClass('outofstock') || $(el).find('.out-of-stock').length > 0;
    const slugPart = slugFromScrapedUrl(productUrl) || Date.now().toString();
    const product = buildSinglePriceProduct({
      id: `${store.id}-${slugPart}`,
      name,
      category,
      storeId: store.id,
      storeName: store.name,
      storeBaseUrl: store.baseUrl,
      url: productUrl,
      price,
      stock: outOfStock ? 'out-of-stock' : $(el).hasClass('instock') || $(el).find('.stock.in-stock').length > 0 ? 'in-stock' : 'unknown',
      image,
      brand: extractKnownHardwareBrand(name),
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

export async function scrapeWooPages(
  startUrl: string,
  store: WooStore,
  category: HardwareCategory,
  maxPages: number,
  options?: WooRequestOptions,
): Promise<Product[]> {
  const products: Product[] = [];
  const seenProductIds = new Set<string>();
  const seenPageUrls = new Set<string>();

  let pageIndex = 1;
  let nextPageUrl: string | null = startUrl;

  while (nextPageUrl && pageIndex <= maxPages) {
    const pageUrl = pageIndex === 1 ? nextPageUrl : buildPaginatedUrl(nextPageUrl, pageIndex);
    if (seenPageUrls.has(pageUrl)) break;
    seenPageUrls.add(pageUrl);

    const pageResult = await scrapeWooPage(pageUrl, store, category, options);
    let newProducts = 0;

    for (const product of pageResult.products) {
      if (seenProductIds.has(product.id)) continue;
      seenProductIds.add(product.id);
      products.push(product);
      newProducts += 1;
    }

    if (newProducts === 0 || pageResult.isDetail) break;

    nextPageUrl = pageResult.nextPageUrl;
    if (!nextPageUrl && pageIndex < maxPages) {
      nextPageUrl = buildPaginatedUrl(startUrl, pageIndex + 1);
    }

    pageIndex += 1;
  }

  return products;
}

function parseWooPrice(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  if (/\b(?:USD|EUR)\b|(?:U\$S|US\$)/i.test(normalized)) return 0;
  if (/^\d+(\.\d+)?$/.test(normalized)) return Math.round(Number(normalized));
  return parseScrapedArsPrice(normalized);
}

function foreignWooCurrency($: cheerio.CheerioAPI, pageUrl: string, storeId: string): boolean {
  const excluded = '.related, .up-sells, .upsells, .cross-sells, .products, .w-grid-item';
  const metaConflict = $('meta[property="product:price:currency"], meta[itemprop="priceCurrency"]').toArray()
    .filter(element => !$(element).closest(excluded).length)
    .some(element => {
      const currency = $(element).attr('content')?.trim().toUpperCase();
      return Boolean(currency && currency !== 'ARS');
    });
  const visibleConflict = $('p.price, .product_field.price, .scp-price-main__current, main.product .price-main').toArray()
    .filter(element => !$(element).closest(excluded).length)
    .some(element => {
      const copy = $(element).clone();
      copy.find('del, s').remove();
      return /\b(?:USD|EUR)\b|(?:U\$S|US\$)/i.test(copy.text());
    });
  const heading = $('h1').filter((_, element) => !$(element).closest(excluded).length).first().text();
  let schemaConflict = false;
  function checkSchema(value: unknown, depth = 0) {
    if (depth > 6 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.slice(0, 200).forEach(item => checkSchema(item, depth + 1)); return; }
    const node = value as Record<string, unknown>;
    const type = node['@type'];
    let matchesUrl = node.url === undefined;
    if (typeof node.url === 'string') {
      try { matchesUrl = sameListing(storeId, new URL(node.url, pageUrl).href, pageUrl); } catch { matchesUrl = false; }
    }
    if ((type === 'Product' || (Array.isArray(type) && type.includes('Product')))
      && typeof node.name === 'string' && heading.trim()
      && normalizeIdentityText(node.name) === normalizeIdentityText(heading)
      && matchesUrl) {
      const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
      schemaConflict ||= offers.some(offer => {
        if (!offer || typeof offer !== 'object') return false;
        const currency = (offer as Record<string, unknown>).priceCurrency;
        return typeof currency === 'string' && Boolean(currency.trim()) && currency.trim().toUpperCase() !== 'ARS';
      });
    }
    if (node['@graph']) checkSchema(node['@graph'], depth + 1);
    if (node.mainEntity) checkSchema(node.mainEntity, depth + 1);
  }
  $('script[type="application/ld+json"]').each((_, element) => {
    try { checkSchema(JSON.parse($(element).text())); } catch { /* Un esquema roto no demuestra moneda. */ }
  });
  return metaConflict || visibleConflict || schemaConflict;
}

export function parseWooProductDetail(
  html: string,
  pageUrl: string,
  store: WooStore,
  category: HardwareCategory,
  fallbackSlug: string,
): Product | null {
  const $ = cheerio.load(html);
  // Una publicación con variantes necesita observar la opción exacta.
  if ($('form.variations_form, table.variations').length > 0 || foreignWooCurrency($, pageUrl, store.id)) return null;

  const name =
    $('h1.product_title').first().text().trim() ||
    $('h1.entry-title').first().text().trim() ||
    (store.id === 'scphardstore' ? $('h1.scp-single-product__title').first().text().trim() : '') ||
    $('h1[itemprop="name"]').first().text().trim() ||
    (store.id === 'maxtecno' ? $('main.product h1.product-title').first().text().trim() : '') ||
    (store.id === 'liontech' && $('body.single-product').length ? $('h1').first().text().trim() : '') ||
    $('body.single-product h1.post_title').first().text().trim();
  if (!name) return null;

  // Las recomendaciones pueden contener un precio rebajado antes del importe
  // principal. Nunca usar sus montos como precio de la publicación consultada.
  const primary = (selector: string) => $(selector).filter((_, element) => $(element).parents('.related, .up-sells, .upsells, .cross-sells, .products, .w-grid-item').length === 0);
  const primaryPrices = $('.summary, p.price, .product_field.price').filter((_, element) => (
    $(element).parents('.related, .up-sells, .upsells, .cross-sells, .products, .w-grid-item').length === 0
  ));
  const productFieldPrice = primaryPrices.filter('.product_field.price').first().text().trim();
  const insPrice = primaryPrices.find('ins .woocommerce-Price-amount bdi, ins bdi').first().text().trim();
  const anyPrice = primaryPrices.find('.woocommerce-Price-amount bdi, bdi').first().text().trim();
  const metaPrice = $('meta[property="product:price:currency"]').attr('content') === 'ARS'
    ? $('meta[property="product:price:amount"]').attr('content') || '' : '';
  // El importe sin impuestos de SCP también usa las clases estándar de Woo.
  const storePrice = store.id === 'scphardstore' ? primary('.scp-price-main__current').first().text().trim()
    : store.id === 'maxtecno' ? primary('main.product .price-showcase-box .price-main').first().text().trim() : '';
  const price = parseWooPrice(storePrice || productFieldPrice || insPrice || anyPrice || metaPrice);
  if (price <= 0) return null;

  const imageRaw =
    $('.woocommerce-product-gallery__wrapper img').first().attr('data-large_image') ||
    $('.woocommerce-product-gallery__wrapper img').first().attr('src') ||
    $('.woocommerce-product-gallery img').first().attr('src') ||
    $('img.wp-post-image').first().attr('src') ||
    '';
  const image = imageRaw ? normalizeAbsoluteUrl(store.baseUrl, imageRaw) : undefined;

  const primaryStock = primary('.stock');
  const stockText = primaryStock.first().text().toLowerCase();
  const primaryProduct = primary('[id^=product-].product, main.product');
  const hasOutOfStockClass = primary('.stock.out-of-stock, .out-of-stock').length > 0 || primaryProduct.hasClass('outofstock');
  const hasLowStockText = stockText.includes('ultim') || stockText.includes('pocas');
  const hasOutOfStockText = stockText.includes('sin stock') || stockText.includes('agotad');
  // Una reserva puede permitir añadir al carrito y conservar la clase instock.
  // Sus señales primarias prevalecen sobre disponibilidad o pocas unidades.
  const hasBackorder = primaryStock.is('.available-on-backorder, .on-backorder') || primaryProduct.hasClass('onbackorder')
    || primaryStock.toArray().some(element => /\b(?:reservas?|back[\s-]?orders?|bajo\s+pedido)\b/i.test($(element).text()));
  const stock = hasOutOfStockClass || hasOutOfStockText
    ? 'out-of-stock'
    : hasBackorder
      ? 'unknown'
      : hasLowStockText
        ? 'low-stock'
        : primaryProduct.hasClass('instock') || primary('.stock.in-stock, button.single_add_to_cart_button:not([disabled]), input[name=add-to-cart]:not([disabled])').length > 0 || /(?:hay existencias|disponible|in stock)/i.test(stockText)
          ? 'in-stock' : 'unknown';

  const canonical = $('link[rel="canonical"]').attr('href') || pageUrl;
  const productUrl = normalizeAbsoluteUrl(store.baseUrl, canonical);
  const slugPart = slugFromScrapedUrl(productUrl) || fallbackSlug;
  const detailDescription =
    cleanScrapedText($('.woocommerce-product-details__short-description').first().text()) ||
    cleanScrapedText($('[itemprop="description"]').first().text()) ||
    cleanScrapedText($('meta[property="og:description"]').attr('content')) ||
    '';

  const product = buildSinglePriceProduct({
    id: `${store.id}-${slugPart}`,
    name,
    category,
    storeId: store.id,
    storeName: store.name,
    storeBaseUrl: store.baseUrl,
    url: productUrl,
    price,
    stock,
    image,
    description: detailDescription || name,
    brand: extractKnownHardwareBrand(name),
  });
  const sourceIds = new Set<string>();
  primary('input[name="product_id"], input[name="add-to-cart"], button[name="add-to-cart"]').each((_, element) => {
    const value = $(element).attr('value') ?? '';
    if (/^[1-9]\d{0,14}$/.test(value)) sourceIds.add(value);
  });
  primaryProduct.each((_, element) => {
    const value = ($(element).attr('id') ?? '').match(/^product-([1-9]\d{0,14})$/)?.[1];
    if (value) sourceIds.add(value);
  });
  // Un ID contradictorio no se resuelve eligiendo el primer botón del HTML.
  if (sourceIds.size > 1) return null;
  if (product && sourceIds.size === 1) product.specs.SourceListingId = [...sourceIds][0];
  const sku = primary('.sku').first().text().replace(/^sku\s*:\s*/i, '').trim();
  if (product && sku && sku !== 'N/A') product.specs.SKU = sku;
  if (product && store.id === 'maxtecno' && storePrice) product.prices[0].priceCondition = 'special';
  return product;
}

export async function fetchWooCommerceProductBySlug(
  productId: string,
  category: HardwareCategory,
  options?: WooRequestOptions,
): Promise<Product | null> {
  const separatorIndex = productId.indexOf('-');
  if (separatorIndex <= 0 || separatorIndex >= productId.length - 1) return null;

  const storeId = productId.slice(0, separatorIndex);
  const slugPart = productId.slice(separatorIndex + 1);
  const store = WOOCOMMERCE_STORES.find((item) => item.id === storeId);
  if (!store) return null;

  const candidateUrls = [
    `${store.baseUrl}/producto/${slugPart}/`,
    `${store.baseUrl}/product/${slugPart}/`,
    `${store.baseUrl}/${slugPart}/`,
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
      const parsed = parseWooProductDetail(html, res.url || candidateUrl, store, category, slugPart);
      if (parsed) return parsed;
    } catch {
      // try next candidate
    }
  }

  return null;
}

/** Publicación conocida: una sola ruta, host configurado y sin búsqueda paginada. */
export async function fetchWooCommerceKnownOffer(storeId: string, rawUrl: string, category: HardwareCategory, signal?: AbortSignal): Promise<Product | null> {
  const store = WOOCOMMERCE_STORES.find(item => item.id === storeId);
  if (!store) return null;
  const url = new URL(rawUrl);
  const host = (value: string) => new URL(value).hostname.replace(/^www\./, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || host(rawUrl) !== host(store.baseUrl)) return null;
  const response = await sourceFetch(store.id, url.href, { headers: SCRAPE_HEADERS, signal },8_000_000,[host(store.baseUrl)]);
  const html = await response.text();
  if (foreignWooCurrency(cheerio.load(html), url.href, store.id)) throw new SourceHttpError('inconsistent-source');
  const product = parseWooProductDetail(html, url.href, store, category, slugFromScrapedUrl(url.href))
    ?? (cheerio.load(html)('form.variations_form, table.variations').length === 0
      ? parseKnownProductDetail(html, url.href, store, category) : null);
  if (!product || host(product.prices[0].url) !== host(store.baseUrl)) return null;
  return product;
}
