export const ENEBA_AFFILIATE_ID = 'Comparador_Hardware_Argentina';
// Las fichas revisadas aparecen hasta la fila 92 del feed; 120 deja margen sin superar el límite de bytes.
export const ENEBA_SAMPLE_SIZE = 120;
export const ENEBA_PRICE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const ENEBA_REVIEW_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ENEBA_REVIEW_VERSION = '2026-10-08-v2';
export const ENEBA_PILOT_CAMPAIGN = 'eneba_pc_ar_20261002';

export type ReviewedGame = {
  id: string;
  sku: string;
  feedTitle: string;
  /** Portada de la ficha revisada; fija para no consultar el feed desde la portada del sitio. */
  coverUrl: string;
  name: string;
  region: string;
  platform: 'Steam' | 'Epic Games';
  edition: string;
  restrictions: string;
  reviewedAt: string;
  activationCountry: 'AR';
};

const REVIEWED_AT = '2026-10-08T23:36:00.000Z';

// Fichas revisadas en Eneba: Argentina figura en la lista de países permitidos.
// El título exacto y el SKU fijan la edición; no se deducen de la moneda ni del publisher.
export const ENEBA_REVIEWED_GAMES: readonly ReviewedGame[] = [
  {
    id: 'epic-games-chivalry-ii-epic-games-key-latam',
    sku: 'CHVLRY2/LA',
    feedTitle: 'Chivalry II Epic Games Key LATAM',
    coverUrl: 'https://products.eneba.games/products/8ObttYpyTnqCZvTS9RgsExdtuaP3JsM4iVVY9u0pdlQ.jpeg',
    name: 'Chivalry II',
    region: 'latam',
    platform: 'Epic Games',
    edition: 'Juego base · clave digital LATAM',
    restrictions: 'PC Windows. Se activa en Epic Games, no en Steam. La ficha anuncia inglés. Revisá los requisitos y la región de tu cuenta antes de comprar.',
    reviewedAt: REVIEWED_AT,
    activationCountry: 'AR',
  },
  {
    id: 'steam-knights-of-pen-paper-steam-key-global',
    sku: 'KOPP',
    feedTitle: 'Knights of Pen & Paper Steam Key GLOBAL',
    coverUrl: 'https://products.eneba.games/products/wka94aumiowsajkcupn9.jpg',
    name: 'Knights of Pen & Paper',
    region: 'global',
    platform: 'Steam',
    edition: 'Juego base · clave digital GLOBAL',
    restrictions: 'Se activa en Steam. La ficha incluye español y lista Windows, Mac y Linux; revisá los requisitos actuales de tu sistema. La portada muestra «+1 Deluxier Edition», pero el título no la anuncia: confirmá en Eneba qué edición se entrega.',
    reviewedAt: REVIEWED_AT,
    activationCountry: 'AR',
  },
  {
    id: 'steam-trine-2-complete-story-steam-key-pc-latam',
    sku: 'T2CSLATAM',
    feedTitle: 'Trine 2: Complete Story Steam Key (PC) LATAM',
    coverUrl: 'https://products.eneba.games/products/m8i4EFD.jpg',
    name: 'Trine 2: Complete Story',
    region: 'latam',
    platform: 'Steam',
    edition: 'Complete Story · clave digital LATAM',
    restrictions: 'Se activa en Steam. La ficha incluye español y lista Windows, Mac y Linux; revisá los requisitos de tu sistema.',
    reviewedAt: REVIEWED_AT,
    activationCountry: 'AR',
  },
  {
    id: 'steam-el-hijo-a-wild-west-tale-steam-key-latam',
    sku: 'ELHIJOWILDWESTALELTM',
    feedTitle: 'El Hijo - A Wild West Tale Steam Key LATAM',
    coverUrl: 'https://products.eneba.games/products/oWfbkzBFOelJ6sukjTsj2Sz3gKCnCKw8NihWIYzBySA.jpeg',
    name: 'El Hijo: A Wild West Tale',
    region: 'latam',
    platform: 'Steam',
    edition: 'Juego base · clave digital LATAM',
    restrictions: 'PC Windows. Se activa en Steam. La ficha incluye español de España entre sus idiomas.',
    reviewedAt: REVIEWED_AT,
    activationCountry: 'AR',
  },
  {
    id: 'steam-gonner-press-jump-to-die-edition-steam-key-global',
    sku: 'GONR',
    feedTitle: 'GoNNER - Press Jump To Die Edition Steam Key GLOBAL',
    coverUrl: 'https://products.eneba.games/products/lW3xm8mBwKu3W7uBHVG-x19SoM0q3JX2A90b84QEIn4.jpeg',
    name: 'GoNNER',
    region: 'global',
    platform: 'Steam',
    edition: 'Press Jump To Die Edition · clave digital GLOBAL',
    restrictions: 'PC Windows. Se activa en Steam. La ficha incluye español.',
    reviewedAt: REVIEWED_AT,
    activationCountry: 'AR',
  },
  {
    id: 'steam-motogp-2014-steam-key-global',
    sku: 'MGP14',
    feedTitle: 'MotoGP 2014 Steam Key GLOBAL',
    coverUrl: 'https://products.eneba.games/products/2UknSkv.jpg',
    name: 'MotoGP 14',
    region: 'global',
    platform: 'Steam',
    edition: 'Juego base · clave digital GLOBAL',
    restrictions: 'PC Windows. Se activa en Steam. La ficha incluye español. Es la edición 2014 del juego.',
    reviewedAt: REVIEWED_AT,
    activationCountry: 'AR',
  },
  {
    id: 'steam-fashion-police-squad-pc-steam-key-latam',
    sku: 'FASHIONPOLICEPCLA',
    feedTitle: 'Fashion Police Squad (PC) Steam Key LATAM',
    coverUrl: 'https://products.eneba.games/products/7ObBIvOzPagKYAu0J5uHJ4-ilm2sIFjRNhSI-By8jqY.jpg',
    name: 'Fashion Police Squad',
    region: 'latam',
    platform: 'Steam',
    edition: 'Juego base · clave digital LATAM',
    restrictions: 'PC Windows. Se activa en Steam. La ficha anuncia sólo inglés.',
    reviewedAt: REVIEWED_AT,
    activationCountry: 'AR',
  },
  {
    id: 'steam-nickelodeon-kart-racers-3-slime-speedway-steam-key-pc-latam',
    sku: 'NKR3SlimeSpeedwayPClatam',
    feedTitle: 'Nickelodeon Kart Racers 3: Slime Speedway Steam Key (PC) LATAM',
    coverUrl: 'https://products.eneba.games/products/kfHZGqVueWY281ci29B3WdTq1ZGHiJVoVGQvXiWeKhM.png',
    name: 'Nickelodeon Kart Racers 3: Slime Speedway',
    region: 'latam',
    platform: 'Steam',
    edition: 'Juego base · clave digital LATAM',
    restrictions: 'PC Windows. Se activa en Steam. La ficha anuncia sólo inglés.',
    reviewedAt: REVIEWED_AT,
    activationCountry: 'AR',
  },
  {
    id: 'steam-shinobi-art-of-vengeance-digital-deluxe-edition-steam-key-pc-latam',
    sku: 'GAMES-STEAM-IMPORTS-10-10-55',
    feedTitle: 'SHINOBI: Art of Vengeance Digital Deluxe Edition Steam Key (PC) LATAM',
    coverUrl: 'https://products.eneba.games/products/u4ZpYn1F6UZJ0eYOte1rkhTJRjzRc_gEj_CAh6RI7nI.jpg',
    name: 'SHINOBI: Art of Vengeance',
    region: 'latam',
    platform: 'Steam',
    edition: 'Digital Deluxe Edition · clave digital LATAM',
    restrictions: 'PC Windows. Se activa en Steam. La ficha no detalla idiomas ni el contenido Deluxe: revisalos en Eneba antes de comprar.',
    reviewedAt: REVIEWED_AT,
    activationCountry: 'AR',
  },
  {
    id: 'steam-planet-coaster-2-deluxe-edition-steam-key-pc-latam',
    sku: 'IMPORT-STEAM-GAMES-1112-14',
    feedTitle: 'Planet Coaster 2 Deluxe Edition Steam Key (PC) LATAM',
    coverUrl: 'https://products.eneba.games/products/dckZzy5sTmj4KA-F4x7NPwDDLkjj0UuFb9picDieZUs.d1ebf5a3-8d93-4c23-bb3e-cf31e7f8ac81',
    name: 'Planet Coaster 2',
    region: 'latam',
    platform: 'Steam',
    edition: 'Deluxe Edition · clave digital LATAM',
    restrictions: 'Se activa en Steam. La ficha no detalla idiomas, sistemas ni el contenido Deluxe: revisalos en Eneba antes de comprar.',
    reviewedAt: REVIEWED_AT,
    activationCountry: 'AR',
  },
  {
    id: 'steam-carmageddon-2-carpocalypse-now-and-carmageddon-max-pack-pc-steam-key-global',
    sku: 'Carmageddon1+2',
    feedTitle: 'Carmageddon 2: Carpocalypse Now and Carmageddon Max Pack (PC) Steam Key GLOBAL',
    coverUrl: 'https://products.eneba.games/products/_YzP2ZvLUnEKy98xUwQyXfsS0SrrsXheyUC0poZnywQ.png',
    name: 'Carmageddon Max Pack + Carmageddon 2',
    region: 'global',
    platform: 'Steam',
    edition: 'Paquete de dos juegos · clave digital GLOBAL',
    restrictions: 'PC Windows. Se activa en Steam. La ficha anuncia sólo inglés.',
    reviewedAt: REVIEWED_AT,
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
