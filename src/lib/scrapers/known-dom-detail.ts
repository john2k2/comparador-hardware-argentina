import * as cheerio from 'cheerio';
import { normalizeIdentityText } from '@/lib/product-identity';
import { parseLocalizedArsPrice } from '@/lib/price-utils';
import { sameListing } from './listing-reference';
import { buildSinglePriceProduct } from './scraper-helpers';
import type { HardwareCategory, Product, StockStatus } from '@/lib/types';

type Store = { id: string; name: string; baseUrl: string };
const supportedHosts: Record<string, string> = {
  mexx: 'mexx.com.ar', xtpc: 'xt-pc.com.ar', gamingcity: 'gamingcity.com.ar', compugarden: 'compugarden.com.ar',
};

/** Selectores constatados en fichas reales. Nunca recorre tarjetas relacionadas. */
export function parseKnownDomDetail(html: string, url: string, store: Store, category: HardwareCategory): Product | null {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || target.port
    || target.hostname.replace(/^www\./, '') !== supportedHosts[store.id]) return null;
  const $ = cheerio.load(html);
  const uniqueText = (selector: string): string => {
    const values = [...new Set($(selector).map((_, element) => $(element).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean))];
    return values.length === 1 ? values[0] : '';
  };
  let name = '', price = 0, stock: StockStatus = 'unknown', sku = '', image: string | undefined;
  const canonical = $('link[rel=canonical]').attr('href');
  if (canonical && !sameListing(store.id, new URL(canonical, url).href, url)) return null;
  if (store.id === 'xtpc') {
    name = uniqueText('.product > .meta h1');
    // La plantilla JSON-LD conserva fecha de 2020 y OutOfStock incluso con
    // stock web alto. Se contrasta el ID/nombre, pero precio y stock son visibles.
    const nodes: Record<string, unknown>[] = [];
    $('script[type="application/ld+json"]').each((_, element) => {
      try { const node = JSON.parse($(element).text()); if (node['@type'] === 'Product') nodes.push(node); } catch { /* Sin identidad no hay observación. */ }
    });
    const node = nodes.length === 1 ? nodes[0] : null;
    if (!node || typeof node.name !== 'string' || normalizeIdentityText(node.name) !== normalizeIdentityText(name)
      || typeof node.url !== 'string' || !sameListing(store.id, node.url, url)) return null;
    price = parseLocalizedArsPrice(uniqueText('.product > .meta .price-list-container > p:first-child > span.bold'));
    const web = $('.product > .meta h5').map((_, element) => $(element).text().replace(/\s+/g, ' ').trim()).get()
      .filter(text => /\ben la web\b/i.test(text));
    if (web.length === 1) {
      const text = normalizeIdentityText(web[0]);
      stock = /sin stock|agotado/.test(text) ? 'out-of-stock' : /stock (alto|disponible)/.test(text) ? 'in-stock'
        : /stock (bajo|limitado)/.test(text) ? 'low-stock' : 'unknown';
    }
    sku = $('.product > .meta .codebar').first().text().replace(/^c[oó]digo del producto:\s*/i, '').trim();
    image = $('.product #mainpic').attr('src');
  } else if (store.id === 'mexx') {
    name = uniqueText('#prod_desc_edit h1.title');
    const nodes = $('[itemscope][itemtype$="/Product"]').filter((_, element) => {
      const value = $(element).children('meta[itemprop=name]').attr('content');
      return !!value && normalizeIdentityText(value) === normalizeIdentityText(name);
    });
    if (nodes.length !== 1) return null;
    const offers = nodes.find('[itemscope][itemtype$="/Offer"]');
    if (offers.length !== 1 || offers.find('meta[itemprop=priceCurrency]').attr('content') !== 'ARS') return null;
    const offerUrl = offers.find('[itemprop=url]').attr('href');
    if (!offerUrl || !sameListing(store.id, offerUrl, url)) return null;
    const metaPrice = Number(offers.find('meta[itemprop=price]').attr('content'));
    price = parseLocalizedArsPrice(uniqueText('#prod_desc_edit .main-price > b:not([class])'));
    if (!Number.isFinite(metaPrice) || Math.abs(price - metaPrice) > 1) return null;
    const availability = offers.find('[itemprop=availability]').attr('content');
    stock = availability === 'InStock' ? 'in-stock' : availability === 'OutOfStock' ? 'out-of-stock' : 'unknown';
    // El visible debe corroborar la disponibilidad estructurada.
    const visible = uniqueText('#prod_desc_edit .en_stock_prod').toLowerCase();
    if (stock === 'in-stock' && !/^en stock$/.test(visible)) stock = 'unknown';
    image = $('#foto1 img').first().attr('src');
  } else if (store.id === 'gamingcity') {
    if (!canonical) return null;
    name = uniqueText('#detalle .det_prod_1 h1.product-title');
    price = parseLocalizedArsPrice(uniqueText('#detalle .det_prod_1 .product-price #precio'));
    const text = uniqueText('#detalle .det_prod_1 .stock-ley_stoc').toLowerCase();
    stock = /sin stock|agotado/.test(text) ? 'out-of-stock' : /^\d+\s*disponibles$/.test(text)
      ? Number.parseInt(text, 10) > 0 ? 'in-stock' : 'out-of-stock' : 'unknown';
  } else if (store.id === 'compugarden') {
    const id = target.pathname.match(/\/ITEM_ID=(\d+)\//i)?.[1];
    const heading = $('#detalle h1.prod-titulo');
    if (!id || heading.length !== 1 || heading.attr('id') !== `COD${id}`) return null;
    name = heading.text().replace(/\s+/g, ' ').trim();
    price = parseLocalizedArsPrice(uniqueText('#detalle #precio'));
    // Disponibilidad para envío y en el local son canales distintos.
    const text = uniqueText('#detalle .cg-stock-api > .stock-box .stock-title').toLowerCase();
    stock = /^disponible para env[ií]o$/.test(text) ? 'in-stock' : /sin stock|agotado/.test(text) ? 'out-of-stock' : 'unknown';
    sku = $('#detalle .art_cod_precios').first().text().replace(/^cod:\s*/i, '').trim();
  }
  if (!name || !Number.isFinite(price) || price <= 0) return null;
  const product = buildSinglePriceProduct({ id: `${store.id}-known`, name, category, storeId: store.id, storeName: store.name,
    storeBaseUrl: store.baseUrl, url, price, stock, image: image ? new URL(image, url).href : undefined });
  if (product) {
    product.prices[0].priceCondition = 'special';
    if (sku) product.specs.SKU = sku;
  }
  return product;
}
