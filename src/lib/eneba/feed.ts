import { load } from 'cheerio';
import {
  ENEBA_REVIEWED_GAMES, ENEBA_SAMPLE_SIZE,
  isEnebaOfferFresh, validateEnebaProductUrl, type EnebaGameOffer,
} from './pilot';

/** Valida el destino antes de conservar el enlace profundo del feed. */
export { validateEnebaProductUrl } from './pilot';

/** XML v3: lista editorial cerrada, sin paginación ni inferencias por precio/moneda. */
export function parseEnebaFeed(xml: string, observedAt: string, now = Date.now()): EnebaGameOffer[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || !/<\/rss>\s*$/.test(xml)) throw new Error('invalid-feed');
  const $ = load(xml, { xml: true });
  if ($('rss > channel').length !== 1) throw new Error('invalid-feed');
  const items = $('rss > channel > item');
  if (items.length > ENEBA_SAMPLE_SIZE) throw new Error('oversized-feed');
  const seen = new Set<string>();
  const offers: EnebaGameOffer[] = [];
  for (const item of items.toArray()) {
    const field = (name: string) => {
      const nodes = $(item).children(name.replace(':', '\\:'));
      return nodes.length === 1 ? nodes.text().trim() : '';
    };
    const id = field('g:id');
    if (seen.has(id)) throw new Error('duplicate-product');
    seen.add(id);
    const review = ENEBA_REVIEWED_GAMES.find((game) => game.id === id);
    if (!review || field('sku') !== review.sku || field('title') !== review.feedTitle
      || field('region') !== review.region || field('g:availability') !== 'in stock'
      || field('g:product_type') !== 'Software > Video Game Software') continue;
    const match = /^(\d+(?:\.\d{1,2})?) ARS$/.exec(field('g:price'));
    const url = validateEnebaProductUrl(field('link'), id);
    if (!match || !url) continue;
    const offer: EnebaGameOffer = { ...review, price: Number(match[1]), currency: 'ARS', url, observedAt };
    if (isEnebaOfferFresh(offer, now)) offers.push(offer);
  }
  return offers;
}
