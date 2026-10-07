import * as cheerio from 'cheerio';
import { normalizeIdentityText } from '@/lib/product-identity';
import type { HardwareCategory, Product, StockStatus } from '@/lib/types';
import { listingReference, sameListing } from './listing-reference';
import { buildSinglePriceProduct } from './scraper-helpers';
import { sourceFetch, SourceHttpError } from './source-http';

const baseUrl = 'https://www.maximus.com.ar';
const detailScript = 'web.MAX.GetItemDetail_V6';
type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function inconsistent(): never { throw new SourceHttpError('inconsistent-source'); }
function positive(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}
function formattedPrice(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{3})*(?:,\d{2})?$/.test(value)) return null;
  const amount = Number(value.replace(/\./g, '').replace(',', '.'));
  return positive(amount);
}
function sameAmount(raw: unknown, formatted: unknown): number {
  const amount = positive(raw), visible = formattedPrice(formatted);
  if (amount === null || visible === null || Math.abs(amount - visible) > 0.005) return inconsistent();
  return amount;
}
function targetId(url: string): string | null {
  return listingReference('maximus', url)?.match(/^maximus:id:([1-9]\d{0,14})$/)?.[1] ?? null;
}

/** El payload público exacto alimenta Vue; nunca leer los valores de ejemplo del HTML. */
export function parseMaximusKnownDetail(payload: unknown, html: string, url: string,
  category: HardwareCategory, observedAt = new Date()): Product | null {
  const itemId = targetId(url);
  if (!itemId || !Number.isFinite(observedAt.getTime())) return null;
  if (!record(payload) || payload.scName !== detailScript) return inconsistent();
  const data = payload.data;
  // -1 es ausencia de detalle: la plantilla muestra "sin stock" también para IDs inválidos.
  if (data === -1 || data === null || data === undefined) return null;
  if (!record(data) || String(data.item_id) !== itemId) return inconsistent();
  const $ = cheerio.load(html);
  const canonicals = $('link[rel="canonical"]').map((_, element) => $(element).attr('href') ?? '').get();
  let exactCanonical = false;
  try { exactCanonical = canonicals.length > 0 && canonicals.every(value => sameListing('maximus', new URL(value, url).href, url)); }
  catch { return inconsistent(); }
  if (!exactCanonical) return inconsistent();
  const name = typeof data.item_desc === 'string' ? data.item_desc.trim() : '';
  const sku = typeof data.item_code4web === 'string' ? data.item_code4web.trim() : '';
  const pn = new URL(url).searchParams.get('PN');
  const headings = [...new Set($('#contenedorproducto h1').map((_, element) => $(element).text().trim()).get().filter(Boolean))];
  if (!name || !sku || sku.length > 160 || /[\x00-\x1f]/.test(sku) || (pn && pn !== sku)
    || headings.length !== 1 || normalizeIdentityText(headings[0]) !== normalizeIdentityText(name)) return inconsistent();
  const currencies = $('meta[property="product:price:currency"]').map((_, element) => $(element).attr('content') ?? '').get();
  if (!currencies.length || currencies.some(value => value !== 'ARS') || data.currency_symbol !== '$') return inconsistent();
  // Corroborar campos y método de pago que el sitio usa para el producto principal.
  const card = $('#contenedorproducto .mx-card');
  if (!/String\(\s*detail\.price_1\s*\)/.test(card.find('.mx-card-amount').attr('v-text') ?? '')
    || !/Con tarjeta d[eé]bito \/ cr[eé]dito/.test(card.find('.mx-card-label').text())) return inconsistent();
  const cardPrice = sameAmount(data.price_1_original, data.price_1);
  let price = cardPrice;
  let special = false;
  if (data.bestPriceData !== undefined && data.bestPriceData !== null) {
    if (!record(data.bestPriceData)) return inconsistent();
    const best = $('#contenedorproducto .mx-best');
    if (!/String\(\s*detail\.bestPriceData\.disc_price_formated\s*\)/.test(best.find('.mx-best-amount').attr('v-text') ?? '')
      || !/Efectivo\s*\/\s*Transferencia/.test(best.find('.mx-best-method-txt').text())) return inconsistent();
    price = sameAmount(data.bestPriceData.disc_price, data.bestPriceData.disc_price_formated);
    if (price > cardPrice) return inconsistent();
    special = true;
  }
  let stock: StockStatus = 'unknown';
  if (data.itst_LastAvailableInRelalculation !== undefined && data.itst_LastAvailableInRelalculation !== null) {
    const quantity = data.itst_LastAvailableInRelalculation;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0) return inconsistent();
    // El dato es stock online; cantLocal no lo reemplaza. El sitio define bajo como 1–5.
    if (!$('#contenedorproducto .producto-stock [v-if], #contenedorproducto .producto-stock [v-else-if]')
      .toArray().some(element => Object.values($(element).attr() ?? {}).some(value => value.includes('detail.itst_LastAvailableInRelalculation')))) return inconsistent();
    stock = quantity === 0 ? 'out-of-stock' : quantity <= 5 ? 'low-stock' : 'in-stock';
  }
  const product = buildSinglePriceProduct({ id: `maximus-known-${itemId}`, name: data.item_outlet === true ? `${name} (Outlet)` : name,
    category, storeId: 'maximus', storeName: 'Maximus', storeBaseUrl: baseUrl, url, price, stock,
    specs: { SKU: sku, SourceListingId: itemId }, createdAt: observedAt, updatedAt: observedAt });
  if (product) {
    product.prices[0].price = price;
    product.prices[0].priceCondition = special ? 'special' : 'unspecified';
    product.lowestPrice = product.highestPrice = product.averagePrice = price;
  }
  return product;
}

/** Dos lecturas acotadas: publicación y su script de detalle anónimo, sin ejecutar JavaScript. */
export async function fetchKnownMaximusOffer(url: string, category: HardwareCategory, signal?: AbortSignal): Promise<Product | null> {
  const itemId = targetId(url);
  if (!itemId) return null;
  const page = await sourceFetch('maximus', url, { signal, cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } }, 8_000_000, ['maximus.com.ar']);
  const html = await page.text();
  const websiteId = cheerio.load(html)('#hidWebSiteID').attr('value');
  if (!websiteId || !/^[a-f0-9-]{36}$/i.test(websiteId)) throw new SourceHttpError('invalid-response');
  const headers = page.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headers.getSetCookie?.() ?? (headers.get('set-cookie') ?? '').split(/,(?=[^;,=\s]+=[^;,]+)/g);
  const cookie = cookies.map(value => value.split(';')[0].trim()).filter(Boolean).join('; ');
  const response = await sourceFetch('maximus', `${baseUrl}/wfmWebSite2.aspx/wsNRW_Script`, {
    method: 'POST', signal, cache: 'no-store',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0', Origin: baseUrl, Referer: url,
      ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ guidWS_Id: websiteId, strScriptLabel: detailScript,
      JSonParameters: JSON.stringify({ prli_id: 17, comp_id: 1, item_id: Number(itemId), ws_id: websiteId, cust_id: -1 }) }),
  }, 4_000_000);
  let payload: unknown;
  try {
    const envelope: unknown = await response.json();
    if (!record(envelope) || typeof envelope.d !== 'string') throw new Error();
    payload = JSON.parse(envelope.d);
  } catch { throw new SourceHttpError('invalid-response'); }
  return parseMaximusKnownDetail(payload, html, url, category, new Date());
}
