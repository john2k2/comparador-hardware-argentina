import * as cheerio from 'cheerio';
import { normalizeIdentityText } from '@/lib/product-identity';
import type { StockStatus } from '@/lib/types';
import { sameListing } from './listing-reference';

type JsonRecord = Record<string, unknown>;
type Evidence<T> = { state: 'absent' } | { state: 'conflict' } | { state: 'value'; value: T };
type DetailValue = { name: string; price: number; stock: StockStatus; node: JsonRecord };
export type DetailEvidence = Evidence<DetailValue>;
const absent = { state: 'absent' } as const;
const conflict = { state: 'conflict' } as const;
const priceEpsilon = 0.005;
const excluded = '.related, .upsells, .cross-sells, .products, .product-grid, .js-item-product, .js-quickshop-container, .item-product, .product-item, .user-content, .js-product-description, .product-description, .qloud-cart-reco-products-native, .qloud-cart-reco-carousel, footer, nav, aside, header';
const priceSelector = '.js-price-display, .price-main, .product-price, .price, [itemprop="price"]';
const stockSelector = '.js-stock-label-private, .text-stock, .stock, .availability, .product-stock, [itemprop="availability"]';

function record(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function number(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function available(stock: StockStatus): boolean {
  return stock === 'in-stock' || stock === 'low-stock';
}

function mergeStock(first: Evidence<StockStatus>, second: Evidence<StockStatus>): Evidence<StockStatus> {
  if (first.state === 'conflict' || second.state === 'conflict') return conflict;
  if (first.state === 'absent') return second;
  if (second.state === 'absent') return first;
  if (first.value === second.value) return first;
  if (available(first.value) && available(second.value)) return { state: 'value', value: 'low-stock' };
  return conflict;
}

/** Una ausencia no equivale a cero; dos señales incompatibles no se reemplazan. */
export function schemaStock(offer: JsonRecord): Evidence<StockStatus> {
  const label = typeof offer.availability === 'string' ? offer.availability.split('/').pop() : '';
  let result: Evidence<StockStatus> = absent;
  if (label) {
    const value: StockStatus = label === 'InStock' ? 'in-stock' : label === 'LimitedAvailability' ? 'low-stock'
      : label === 'OutOfStock' || label === 'SoldOut' ? 'out-of-stock' : 'unknown';
    result = { state: 'value', value };
  }
  const raw = record(offer.inventoryLevel) ? offer.inventoryLevel.value : undefined;
  if (raw === undefined || raw === null) return result;
  const quantity = number(raw);
  if (quantity === undefined || quantity < 0 || !Number.isInteger(quantity)) return conflict;
  const value: StockStatus = quantity === 0 ? 'out-of-stock' : quantity <= 3 ? 'low-stock' : 'in-stock';
  return mergeStock(result, { state: 'value', value });
}

function variantStock(variant: JsonRecord): Evidence<StockStatus> {
  let result: Evidence<StockStatus> = absent;
  if (typeof variant.available === 'boolean') result = { state: 'value', value: variant.available ? 'in-stock' : 'out-of-stock' };
  if (variant.stock === undefined || variant.stock === null) return result;
  const quantity = number(variant.stock);
  if (quantity === undefined || quantity < 0 || !Number.isInteger(quantity)) return conflict;
  const value: StockStatus = quantity === 0 ? 'out-of-stock' : quantity <= 3 ? 'low-stock' : 'in-stock';
  return mergeStock(result, { state: 'value', value });
}

function variants(raw: string): JsonRecord[] | null {
  try {
    const decoded = raw.replace(/&quot;|&#34;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const parsed: unknown = JSON.parse(decoded);
    return Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 200 && parsed.every(record) ? parsed : null;
  } catch { return null; }
}

export function selectedVariantStock(raw: string, selectedId?: string): StockStatus {
  const list = variants(raw);
  const selected = selectedId ? list?.filter(item => String(item.id) === selectedId) : list?.length === 1 ? list : [];
  if (!selected || selected.length !== 1) return 'unknown';
  const result = variantStock(selected[0]);
  return result.state === 'value' ? result.value : 'unknown';
}

function primary($: cheerio.CheerioAPI, selector: string) {
  const scopeSelector = '.js-product-detail, main.product, .product-detail, #product-detail, #product-details';
  const scoped = $(scopeSelector).filter((_, element) => !$(element).closest(excluded).length).length > 0;
  return $(selector).filter((_, element) => !$(element).closest(excluded).length
    && (!scoped || $(element).closest(scopeSelector).length > 0));
}

function visible($: cheerio.CheerioAPI, selector: string) {
  return primary($, selector).filter((_, element) => !$(element).parents().addBack().toArray().some(parent => {
    const node = $(parent);
    return node.is('[hidden], [aria-hidden="true"], .d-none, .hidden')
      || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.attr('style') ?? '');
  }));
}

function visibleText(node: ReturnType<typeof primary>): string {
  const copy = node.clone();
  copy.find(excluded).remove();
  copy.find('[hidden], [aria-hidden="true"], .d-none, .hidden, del, s, .old-price, .price-original, .installments, .cuotas').remove();
  copy.find('[style]').filter((_, element) => /display\s*:\s*none|visibility\s*:\s*hidden/i.test(copy.find(element).attr('style') ?? '')).remove();
  return copy.text().replace(/\s+/g, ' ').trim();
}

function localizedPrice(value: string): number | undefined {
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value)) return number(value.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value)) return number(value.replace(/,/g, ''));
  if (/^\d+(?:[.,]\d{1,2})?$/.test(value)) return number(value.replace(',', '.'));
  return undefined;
}

function visiblePrice($: cheerio.CheerioAPI): Evidence<number> {
  const values: number[] = [];
  const candidates = visible($, priceSelector).filter((_, element) => !$(element).is('meta, link, del, s')
    && !$(element).closest('del, s, .old-price, .price-original, .installments, .cuotas').length);
  const eligible = new Set(candidates.toArray());
  const nodes = candidates.filter((_, element) => !$(element).find(priceSelector).toArray().some(child => eligible.has(child)));
  for (const element of nodes.toArray()) {
    const text = visibleText($(element));
    if (!text) continue;
    if (/\b(?:USD|U\$S|US\$|EUR)\b/i.test(text) || /(?:U\$S|US\$)/i.test(text)) return conflict;
    const amounts = text.match(/\d[\d.,]*/g) ?? [];
    if (amounts.length !== 1) return conflict;
    const price = localizedPrice(amounts[0]);
    if (price === undefined || price <= 0) return conflict;
    values.push(price);
  }
  if (!values.length) return absent;
  return values.some(value => Math.abs(value - values[0]) > priceEpsilon) ? conflict : { state: 'value', value: values[0] };
}

function visibleStock($: cheerio.CheerioAPI): Evidence<StockStatus> {
  let result: Evidence<StockStatus> = absent;
  for (const element of visible($, stockSelector).toArray()) {
    if ($(element).is('meta, link')) continue;
    const text = normalizeIdentityText(visibleText($(element)));
    let value: StockStatus | undefined;
    const negative = /sin stock|agotad[oa]|no disponible|out of stock/g;
    if (negative.test(text) && /en stock|hay existencias|disponible|in stock/.test(text.replace(negative, ''))) return conflict;
    const units = text.match(/^(\d+)\s*(?:unidades?\s*)?disponibles?$/)?.[1];
    if (units) value = Number(units) === 0 ? 'out-of-stock' : Number(units) <= 3 ? 'low-stock' : 'in-stock';
    else if (/sin stock|agotad[oa]|no disponible|out of stock/.test(text)) value = 'out-of-stock';
    else if (/stock bajo|stock limitado/.test(text)) value = 'low-stock';
    else if (/en stock|hay existencias|disponible|in stock/.test(text)) value = 'in-stock';
    else if (/consultar|a pedido|preventa/.test(text)) value = 'unknown';
    if (value) result = mergeStock(result, { state: 'value', value });
  }
  return result;
}

function collectProducts($: cheerio.CheerioAPI): JsonRecord[] {
  const nodes: JsonRecord[] = [];
  function collect(value: unknown, depth = 0) {
    if (depth > 6 || nodes.length > 200) return;
    if (Array.isArray(value)) { value.slice(0, 201).forEach(item => collect(item, depth + 1)); return; }
    if (!record(value)) return;
    const type = value['@type'];
    if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) nodes.push(value);
    if (value['@graph']) collect(value['@graph'], depth + 1);
    if (value.mainEntity) collect(value.mainEntity, depth + 1);
  }
  $('script[type="application/ld+json"]').each((_, element) => {
    try { collect(JSON.parse($(element).text())); } catch { /* JSON roto no prueba identidad. */ }
  });
  return nodes;
}

function matchingUrl(storeId: string, value: unknown, url: string): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try { return sameListing(storeId, new URL(value, url).href, url); } catch { return false; }
}

function productUrl(node: JsonRecord): unknown {
  if (node.url !== undefined) return node.url;
  const offer = Array.isArray(node.offers) && node.offers.length === 1 ? node.offers[0] : node.offers;
  return record(offer) ? offer.url : undefined;
}

function skuConflict(...sources: JsonRecord[]): boolean {
  const values = sources.map(source => source.sku).filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  // SKU explícitos: sólo quitar espacio externo, sin igualdad difusa o por serie.
  return new Set(values.map(value => value.trim())).size > 1;
}

function variantEvidence($: cheerio.CheerioAPI, node: JsonRecord, offer: JsonRecord, price: number): Evidence<StockStatus> {
  const containers = primary($, '[data-variants]').filter((_, element) => !$(element).is('.js-item-product, .product-item'));
  if (!containers.length) return absent;
  if (containers.length !== 1) return conflict;
  const list = variants(containers.attr('data-variants') ?? '');
  if (!list) return conflict;
  const ids = primary($, 'input[name="variant_id"], select[name="variant_id"] option[selected], [data-selected-variant-id]')
    .map((_, element) => $(element).attr('data-selected-variant-id') ?? $(element).attr('value') ?? '').get().filter(Boolean);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length > 1 || (list.length > 1 && !uniqueIds.length)) return conflict;
  const selected = uniqueIds.length ? list.filter(item => String(item.id) === uniqueIds[0]) : list;
  if (selected.length !== 1) return conflict;
  const variant = selected[0];
  if (skuConflict(node, offer, variant)) return conflict;
  // El selector debe vincular también el precio: nunca elegir stock de una
  // variante y conservar el precio mínimo/de otra variante del esquema.
  const rawPrice = variant.price ?? (/\sARS$/.test(String(variant.price_long)) ? variant.price_number : undefined);
  const variantPrice = number(rawPrice);
  if (rawPrice !== undefined && (variantPrice === undefined || variantPrice <= 0 || Math.abs(variantPrice - price) > priceEpsilon)) return conflict;
  const selectedSku = typeof variant.sku === 'string' ? variant.sku.trim() : '';
  const skuMatches = selectedSku.length > 0 && [node.sku, offer.sku].some(value => typeof value === 'string' && value.trim() === selectedSku);
  if (list.length > 1 && variantPrice === undefined && !skuMatches) return conflict;
  return variantStock(variant);
}

/** Ausencia de DOM no contradice un esquema exacto; un conflicto nunca habilita fallback. */
export function readProductDetailEvidence($: cheerio.CheerioAPI, url: string, storeId: string): DetailEvidence {
  const canonicals = $('link[rel="canonical"]').map((_, element) => $(element).attr('href') ?? '').get();
  if (!canonicals.length) return absent;
  if (canonicals.some(value => !matchingUrl(storeId, value, url))) return conflict;
  const headings = [...new Set(visible($, 'h1').map((_, element) => $(element).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean))];
  if (headings.length > 1) return conflict;
  const nodes = collectProducts($);
  if (!nodes.length) return absent;
  if (nodes.length > 200) return conflict;
  const matching = nodes.filter(node => matchingUrl(storeId, productUrl(node), url)
    || (headings.length === 1 && typeof node.name === 'string' && normalizeIdentityText(node.name) === normalizeIdentityText(headings[0])));
  if (matching.length !== 1) return conflict;
  const node = matching[0];
  if (typeof node.name !== 'string' || !node.name.trim()) return conflict;
  const name = node.name.replace(/\s+/g, ' ').trim();
  const identityUrl = productUrl(node);
  if ((identityUrl !== undefined && !matchingUrl(storeId, identityUrl, url))
    || (!headings.length && !matchingUrl(storeId, identityUrl, url))) return conflict;
  if (headings.length && normalizeIdentityText(headings[0]) !== normalizeIdentityText(name)) return conflict;
  const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
  if (offers.length !== 1 || !record(offers[0])) return conflict;
  const offer = offers[0];
  if ((offer['@type'] !== undefined && offer['@type'] !== 'Offer') || offer.priceCurrency !== 'ARS'
    || (offer.url !== undefined && !matchingUrl(storeId, offer.url, url))) return conflict;
  if (skuConflict(node, offer)) return conflict;
  const price = number(offer.price);
  if (price === undefined || price <= 0) return conflict;
  const domPrice = visiblePrice($);
  if (domPrice.state === 'conflict' || (domPrice.state === 'value' && Math.abs(domPrice.value - price) > priceEpsilon)) return conflict;
  const stock = mergeStock(mergeStock(schemaStock(offer), visibleStock($)), variantEvidence($, node, offer, price));
  if (stock.state === 'conflict') return conflict;
  return { state: 'value', value: { name, price, stock: stock.state === 'value' ? stock.value : 'unknown', node } };
}
