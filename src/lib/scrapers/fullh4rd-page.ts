import * as cheerio from 'cheerio';
import type { HardwareCategory, Product, StockStatus } from '../types';
import { inferHardwareCategoryFromName } from '../catalog/hardware-categories';
import { extractBrandFromName } from './brand-utils';

function localUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.hostname.replace(/^www\./, '') === 'fullh4rd.com.ar' ? url.href : null;
  } catch { return null; }
}

/** Grilla pública actual y anterior. Botón Comprar no acredita stock. */
export function parseFullh4rdPage(html: string, pageUrl: string, categoryHint?: HardwareCategory, observedAt = new Date()) {
  if (!localUrl(pageUrl, pageUrl) || !Number.isFinite(observedAt.valueOf())) throw new Error('FULLH4RD_PAGE_INPUT');
  const $ = cheerio.load(html), products: Product[] = [], seen = new Set<string>();
  if (/un momento|just a moment/i.test($('title').text()) || $('script[src*="/challenge-platform/"]').length)
    return { products, nextUrl: null, advertisedTotal: null, blocked: true, modern: false };
  const modern = $('.results-card').length > 0;
  $(modern ? '.results-card' : '.item').each((_, el) => {
    const card = $(el), name = card.find('h2,h3').first().text().trim();
    const url = localUrl(card.find('h2 a,h3 a,a').first().attr('href') ?? '', pageUrl);
    const listing = url && new URL(url).pathname.match(/^\/prod\/(\d+)\/[^/]+\/?$/)?.[1];
    const amount = card.find(modern ? '.results-card__price-current' : '.price').first().text().match(/\$?([\d.]+(?:,\d{2})?)/)?.[1];
    const price = amount ? Number(amount.replaceAll('.', '').replace(',', '.')) : 0;
    const category = inferHardwareCategoryFromName(name) ?? categoryHint;
    if (!name || !url || !listing || !category || !Number.isFinite(price) || price <= 0 || seen.has(listing)) return;
    seen.add(listing);
    // Cheerio concatena nodos adyacentes: "$100.000En stock" pierde el límite
    // de palabra. Conservar también el texto explícito de la etiqueta de stock.
    const text = `${card.text()} ${card.find('.stock').text()}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const availability = card.find('[itemprop="availability"]').attr('href') ?? '';
    let stock: StockStatus = 'unknown';
    if (card.hasClass('out-of-stock') || card.find('.out-of-stock,.sin-stock').length || /sin stock|agotad[oa]|no disponible/.test(text) || /OutOfStock|Discontinued|SoldOut/.test(availability)) stock = 'out-of-stock';
    else if (/ultimas? unidades|pocas? unidades/.test(text)) stock = 'low-stock';
    else if (card.hasClass('in-stock') || card.find('.in-stock').length || /\ben stock\b|stock disponible/.test(text) || /InStock|LimitedAvailability/.test(availability)) stock = 'in-stock';
    const image = localUrl(card.find('img').attr('src') ?? '', pageUrl) ?? '/pixel-box.svg';
    products.push({ id: `fh-${listing}`, name, category, brand: extractBrandFromName(name) ?? 'Generica', model: name,
      description: name, image, lowestPrice: price, highestPrice: price, averagePrice: price,
      prices: [{ storeId: 'fullh4rd', storeName: 'FullH4rd', url, price, priceCondition: 'unspecified', installment: null, stock, lastUpdated: observedAt }],
      specs: { SourceListingId: listing }, createdAt: observedAt, updatedAt: observedAt });
  });
  const next = $('[aria-label="Página siguiente"]').filter((_, el) => !$(el).hasClass('disabled') && !$(el).attr('class')?.includes('pointer-events-none')).first().attr('href');
  const nextUrl = next ? localUrl(next, pageUrl) : null;
  const advertised = $('[aria-label="Paginación de resultados"]').text().match(/\bde\s+([\d.]+)/)?.[1];
  return { products, nextUrl: nextUrl && nextUrl !== pageUrl ? nextUrl : null,
    advertisedTotal: advertised ? Number(advertised.replaceAll('.', '')) : null, blocked: false, modern };
}
