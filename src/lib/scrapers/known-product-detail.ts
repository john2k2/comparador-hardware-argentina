import * as cheerio from 'cheerio';
import { sourceFetch, SourceHttpError } from './source-http';
import { buildSinglePriceProduct } from './scraper-helpers';
import { parseKnownDomDetail } from './known-dom-detail';
import { readProductDetailEvidence, type DetailEvidence } from './product-detail-evidence';
import { fetchKnownMaximusOffer } from './maximus-known-detail';
import type { HardwareCategory, Product } from '@/lib/types';

type Store = { id: string; name: string; baseUrl: string };
const dedicatedStores = new Set(['mexx', 'xtpc', 'gamingcity', 'compugarden']);

function buildKnownProduct(evidence: DetailEvidence, url: string, store: Store, category: HardwareCategory): Product | null {
  if (evidence.state !== 'value') return null;
  const { name, price, stock, node } = evidence.value;
  const rawImage = Array.isArray(node.image) ? node.image[0] : node.image;
  const image = typeof rawImage === 'string' ? rawImage : undefined;
  const product = buildSinglePriceProduct({
    id: `${store.id}-known`, name, category, storeId: store.id, storeName: store.name,
    storeBaseUrl: store.baseUrl, url, price, stock, image,
  });
  if (product) {
    // El constructor común redondea ARS; conservar el importe corroborado.
    product.prices[0].price = price;
    product.lowestPrice = price;
    product.highestPrice = price;
    product.averagePrice = price;
    if (typeof node.sku === 'string' && node.sku.length <= 160) product.specs.SKU = node.sku;
  }
  return product;
}

/** Sólo evidencia del producto principal; un conflicto no habilita otra fuente. */
export function parseKnownProductDetail(html: string, url: string, store: Store, category: HardwareCategory): Product | null {
  if (store.id === 'maximus') return null;
  // Las cuatro fuentes conservan su corroboración DOM específica; un fallo
  // nunca las devuelve al JSON-LD de plantilla que puede conservar datos viejos.
  if (dedicatedStores.has(store.id)) return parseKnownDomDetail(html, url, store, category);
  return buildKnownProduct(readProductDetailEvidence(cheerio.load(html), url, store.id), url, store, category);
}

export async function fetchKnownProductDetail(
  url: string,
  store: Store,
  category: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product | null> {
  const allowed = new URL(store.baseUrl).hostname.replace(/^www\./, '');
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || target.port
    || target.hostname.replace(/^www\./, '') !== allowed) return null;
  if (store.id === 'maximus') return fetchKnownMaximusOffer(url, category, signal);
  const response = await sourceFetch(store.id, url, {
    signal, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
  }, 8_000_000, [allowed]);
  const html = await response.text();
  if (dedicatedStores.has(store.id)) return parseKnownDomDetail(html, url, store, category);
  const evidence = readProductDetailEvidence(cheerio.load(html), url, store.id);
  if (evidence.state === 'conflict') throw new SourceHttpError('inconsistent-source');
  return buildKnownProduct(evidence, url, store, category);
}
