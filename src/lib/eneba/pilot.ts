export const ENEBA_AFFILIATE_ID = 'Comparador_Hardware_Argentina';
export const ENEBA_SAMPLE_SIZE = 6;
export const ENEBA_PRICE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const ENEBA_REVIEW_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ENEBA_REVIEW_VERSION = '2026-10-02-v1';
export const ENEBA_PILOT_CAMPAIGN = 'eneba_pc_ar_20261002';

export type ReviewedGame = {
  id: string;
  sku: string;
  feedTitle: string;
  name: string;
  region: string;
  platform: 'Steam' | 'Epic Games';
  edition: string;
  restrictions: string;
  reviewedAt: string;
  activationCountry: 'AR';
};

// Fichas revisadas en Eneba: Argentina figura en la lista de países permitidos.
// El título exacto y el SKU fijan la edición; no se deducen de la moneda ni del publisher.
export const ENEBA_REVIEWED_GAMES: readonly ReviewedGame[] = [
  {
    id: 'epic-games-chivalry-ii-epic-games-key-latam',
    sku: 'CHVLRY2/LA',
    feedTitle: 'Chivalry II Epic Games Key LATAM',
    name: 'Chivalry II',
    region: 'latam',
    platform: 'Epic Games',
    edition: 'Juego base · clave digital LATAM',
    restrictions: 'PC Windows. Se activa en Epic Games, no en Steam. La ficha anuncia inglés. Revisá los requisitos y la región de tu cuenta antes de comprar.',
    reviewedAt: '2026-10-02T17:48:55.000Z',
    activationCountry: 'AR',
  },
  {
    id: 'steam-knights-of-pen-paper-steam-key-global',
    sku: 'KOPP',
    feedTitle: 'Knights of Pen & Paper Steam Key GLOBAL',
    name: 'Knights of Pen & Paper',
    region: 'global',
    platform: 'Steam',
    edition: 'Juego base · clave digital GLOBAL',
    restrictions: 'Se activa en Steam. La ficha incluye español y lista Windows, Mac y Linux; revisá los requisitos actuales de tu sistema. No anuncia extras ni una edición Deluxe.',
    reviewedAt: '2026-10-02T17:48:55.000Z',
    activationCountry: 'AR',
  },
];

export type EnebaGameOffer = ReviewedGame & {
  price: number;
  currency: 'ARS';
  url: string;
  observedAt: string;
};

export type EnebaSnapshot = {
  status: 'ready' | 'empty' | 'error' | 'disabled';
  offers: EnebaGameOffer[];
  fetchedAt: string | null;
  feedUpdatedAt: string | null;
};

export function buildEnebaFeedUrl(format: 'xml' | 'csv' = 'xml'): string {
  const url = new URL(`https://www.eneba.com/rss/products.${format}`);
  for (const [key, value] of Object.entries({
    version: '3', currency: 'ARS', country: 'ar', type: 'game', link_locale: 'latam',
    af_id: ENEBA_AFFILIATE_ID, size: String(ENEBA_SAMPLE_SIZE), from: '0',
  })) url.searchParams.set(key, value);
  return url.href;
}

export function isEnebaOfferFresh(offer: EnebaGameOffer, now = Date.now()): boolean {
  const priceAge = now - Date.parse(offer.observedAt);
  const reviewAge = now - Date.parse(offer.reviewedAt);
  return Number.isFinite(offer.price) && offer.price > 0 && offer.currency === 'ARS'
    && offer.activationCountry === 'AR'
    && priceAge >= 0 && priceAge < ENEBA_PRICE_MAX_AGE_MS
    && reviewAge >= 0 && reviewAge < ENEBA_REVIEW_MAX_AGE_MS;
}

/** Sólo destinos de la selección revisada y parámetros admitidos por el feed. */
export function validateEnebaProductUrl(raw: string, id: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['www.eneba.com', 'eneba.com'].includes(url.hostname)
      || url.username || url.password || url.port || url.hash
      || url.pathname !== `/latam/${id}`
      || url.searchParams.getAll('af_id').length !== 1
      || url.searchParams.get('af_id') !== ENEBA_AFFILIATE_ID
      || url.searchParams.getAll('currency').length !== 1
      || url.searchParams.get('currency') !== 'ARS'
      || [...url.searchParams.keys()].some((key) => !['af_id', 'currency'].includes(key))) return null;
    return url.href;
  } catch { return null; }
}

/** La caché y la respuesta HTTP deben conservar el mismo contrato editorial. */
export function readEnebaSnapshot(raw: unknown, now = Date.now()): EnebaSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<EnebaSnapshot>;
  if (!['ready', 'empty', 'error', 'disabled'].includes(data.status ?? '') || !Array.isArray(data.offers)) return null;
  if (![data.fetchedAt, data.feedUpdatedAt].every((date) => date === null || (typeof date === 'string' && Number.isFinite(Date.parse(date))))) return null;
  const offers: EnebaGameOffer[] = [];
  const seen = new Set<string>();
  for (const rawOffer of data.status === 'ready' ? data.offers : []) {
    if (!rawOffer || typeof rawOffer !== 'object') continue;
    const review = ENEBA_REVIEWED_GAMES.find((game) => game.id === rawOffer.id);
    if (!review || seen.has(review.id) || rawOffer.sku !== review.sku || rawOffer.feedTitle !== review.feedTitle
      || rawOffer.region !== review.region || rawOffer.reviewedAt !== review.reviewedAt
      || rawOffer.activationCountry !== 'AR' || rawOffer.currency !== 'ARS'
      || typeof rawOffer.price !== 'number' || typeof rawOffer.url !== 'string'
      || rawOffer.observedAt !== data.feedUpdatedAt) continue;
    const url = validateEnebaProductUrl(rawOffer.url, review.id);
    if (!url) continue;
    const offer: EnebaGameOffer = { ...review, price: rawOffer.price, currency: 'ARS', url, observedAt: rawOffer.observedAt };
    if (!isEnebaOfferFresh(offer, now)) continue;
    seen.add(review.id);
    offers.push(offer);
  }
  return { status: data.status === 'ready' && !offers.length ? 'empty' : data.status!, offers,
    fetchedAt: data.fetchedAt!, feedUpdatedAt: data.feedUpdatedAt! };
}
