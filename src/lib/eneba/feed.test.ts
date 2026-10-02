import { describe, expect, it } from 'vitest';

import {
  ENEBA_AFFILIATE_ID,
  ENEBA_REVIEWED_GAMES,
  ENEBA_SAMPLE_SIZE,
  buildEnebaFeedUrl,
  readEnebaSnapshot,
} from './pilot';
import { parseEnebaFeed, validateEnebaProductUrl } from './feed';

const NOW = '2026-10-02T18:00:00.000Z';
const OBSERVED_AT = '2026-10-02T17:30:00.000Z';
const NOW_MS = Date.parse(NOW);

type SyntheticItem = {
  id: string;
  sku: string;
  title: string;
  region: string;
  availability: string;
  productType: string;
  price: string;
  link: string;
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function itemXml(item: Partial<SyntheticItem> & Pick<SyntheticItem, 'id'>): string {
  const game = ENEBA_REVIEWED_GAMES.find(({ id }) => id === item.id) ?? ENEBA_REVIEWED_GAMES[0];
  const values: SyntheticItem = {
    id: game.id,
    sku: game.sku,
    title: game.feedTitle,
    region: game.region,
    availability: 'in stock',
    productType: 'Software > Video Game Software',
    price: '12999.00 ARS',
    link: `https://www.eneba.com/latam/${game.id}?af_id=${ENEBA_AFFILIATE_ID}&currency=ARS`,
    ...item,
  };

  return `<item>
    <g:id>${escapeXml(values.id)}</g:id>
    <sku>${escapeXml(values.sku)}</sku>
    <title>${escapeXml(values.title)}</title>
    <region>${escapeXml(values.region)}</region>
    <g:availability>${escapeXml(values.availability)}</g:availability>
    <g:product_type>${escapeXml(values.productType)}</g:product_type>
    <g:price>${escapeXml(values.price)}</g:price>
    <link>${escapeXml(values.link)}</link>
  </item>`;
}

function feedXml(items: string[]): string {
  return `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
    <channel>
      <title>Fixture sintética Eneba XML v3</title>
      ${items.join('\n')}
    </channel>
  </rss>`;
}

describe('Eneba XML v3 feed', () => {
  it('conserva dos fichas revisadas válidas y excluye una fila no revisada', () => {
    const [first, second] = ENEBA_REVIEWED_GAMES;
    const offers = parseEnebaFeed(
      feedXml([
        itemXml({ id: first.id, price: '14999.00 ARS' }),
        itemXml({ id: second.id, price: '7999.50 ARS' }),
        itemXml({
          id: 'synthetic-unreviewed-game',
          sku: 'UNREVIEWED',
          title: 'Synthetic Unreviewed Game Steam Key GLOBAL',
          region: 'global',
          link: 'https://www.eneba.com/latam/synthetic-unreviewed-game?af_id=Comparador_Hardware_Argentina&currency=ARS',
        }),
      ]),
      OBSERVED_AT,
      NOW_MS,
    );

    expect(offers).toHaveLength(2);
    expect(offers.map(({ id, price, currency }) => ({ id, price, currency }))).toEqual([
      { id: first.id, price: 14999, currency: 'ARS' },
      { id: second.id, price: 7999.5, currency: 'ARS' },
    ]);
    for (const offer of offers) {
      expect(offer.url).toContain(`af_id=${ENEBA_AFFILIATE_ID}`);
      expect(new URL(offer.url).searchParams.getAll('af_id')).toEqual([ENEBA_AFFILIATE_ID]);
      expect(offer.observedAt).toBe(OBSERVED_AT);
      expect(offer.reviewedAt).toBe('2026-10-02T17:48:55.000Z');
    }
  });

  it('construye una URL de feed ARS acotada sin giftcard_country', () => {
    const url = new URL(buildEnebaFeedUrl('xml'));

    expect(url.origin + url.pathname).toBe('https://www.eneba.com/rss/products.xml');
    expect(url.searchParams.get('version')).toBe('3');
    expect(url.searchParams.get('currency')).toBe('ARS');
    expect(url.searchParams.get('country')).toBe('ar');
    expect(url.searchParams.get('type')).toBe('game');
    expect(url.searchParams.get('link_locale')).toBe('latam');
    expect(url.searchParams.get('af_id')).toBe(ENEBA_AFFILIATE_ID);
    expect(url.searchParams.get('size')).toBe(String(ENEBA_SAMPLE_SIZE));
    expect(url.searchParams.get('from')).toBe('0');
    expect(url.searchParams.has('giftcard_country')).toBe(false);
  });

  it.each([
    ['moneda distinta', { price: '12999.00 USD' }],
    ['precio cero', { price: '0 ARS' }],
    ['stock desconocido', { availability: 'unknown' }],
    ['región distinta', { region: 'eu' }],
    ['otra edición en el título', { title: 'Chivalry II Deluxe Edition Epic Games Key LATAM' }],
    ['SKU distinto', { sku: 'CHVLRY2/DELUXE' }],
  ])('rechaza una ficha con %s', (_reason, override) => {
    const [game] = ENEBA_REVIEWED_GAMES;

    expect(parseEnebaFeed(feedXml([itemXml({ id: game.id, ...override })]), OBSERVED_AT, NOW_MS)).toEqual([]);
  });

  it.each([
    ['HTTP', (id: string) => `http://www.eneba.com/latam/${id}?af_id=${ENEBA_AFFILIATE_ID}&currency=ARS`],
    ['dominio falso', (id: string) => `https://fake-eneba.example/latam/${id}?af_id=${ENEBA_AFFILIATE_ID}&currency=ARS`],
    ['credenciales', (id: string) => `https://user:pass@www.eneba.com/latam/${id}?af_id=${ENEBA_AFFILIATE_ID}&currency=ARS`],
    ['slug distinto', () => `https://www.eneba.com/latam/other-product?af_id=${ENEBA_AFFILIATE_ID}&currency=ARS`],
    ['af_id ausente', (id: string) => `https://www.eneba.com/latam/${id}?currency=ARS`],
    ['af_id duplicado', (id: string) => `https://www.eneba.com/latam/${id}?af_id=${ENEBA_AFFILIATE_ID}&af_id=${ENEBA_AFFILIATE_ID}&currency=ARS`],
    ['af_id distinto', (id: string) => `https://www.eneba.com/latam/${id}?af_id=otro-afiliado&currency=ARS`],
    ['moneda duplicada', (id: string) => `https://www.eneba.com/latam/${id}?af_id=${ENEBA_AFFILIATE_ID}&currency=ARS&currency=USD`],
    ['parámetro ajeno al contrato', (id: string) => `https://www.eneba.com/latam/${id}?af_id=${ENEBA_AFFILIATE_ID}&currency=ARS&redirect=https://invalid.example`],
  ])('rechaza enlace de producto con %s', (_reason, makeUrl) => {
    const [game] = ENEBA_REVIEWED_GAMES;
    const rawUrl = makeUrl(game.id);

    expect(validateEnebaProductUrl(rawUrl, game.id)).toBeNull();
    expect(parseEnebaFeed(feedXml([itemXml({ id: game.id, link: rawUrl })]), OBSERVED_AT, NOW_MS)).toEqual([]);
  });

  it.each([
    ['HTML', '<html><body>feed unavailable</body></html>', 'invalid-feed'],
    ['XML truncado', '<rss version="2.0"><channel><item><g:id>truncated', 'invalid-feed'],
    ['DOCTYPE', '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///tmp/secret">]><rss><channel></channel></rss>', 'invalid-feed'],
  ])('rechaza %s', (_reason, xml, error) => {
    expect(() => parseEnebaFeed(xml, OBSERVED_AT, NOW_MS)).toThrow(error);
  });

  it('rechaza IDs duplicados aunque la fila sea válida', () => {
    const [game] = ENEBA_REVIEWED_GAMES;

    expect(() => parseEnebaFeed(feedXml([itemXml({ id: game.id }), itemXml({ id: game.id })]), OBSERVED_AT, NOW_MS))
      .toThrow('duplicate-product');
  });

  it('rechaza feeds con más de seis filas', () => {
    const items = Array.from({ length: ENEBA_SAMPLE_SIZE + 1 }, (_, index) => (
      itemXml({ id: `synthetic-overflow-${index}` })
    ));

    expect(() => parseEnebaFeed(feedXml(items), OBSERVED_AT, NOW_MS)).toThrow('oversized-feed');
  });

  it.each([
    ['precio con seis horas exactas', '2026-10-02T12:00:00.000Z', NOW],
    ['precio futuro', '2026-10-02T18:00:01.000Z', NOW],
    ['revisión con más de siete días', NOW, '2026-10-10T18:00:00.001Z'],
  ])('excluye una oferta por %s', (_reason, observedAt, now) => {
    const [game] = ENEBA_REVIEWED_GAMES;

    expect(parseEnebaFeed(feedXml([itemXml({ id: game.id })]), observedAt, Date.parse(now))).toEqual([]);
  });
});

describe('contrato del snapshot público', () => {
  const game = ENEBA_REVIEWED_GAMES[0];
  const offer = { ...game, price: 1234.50, currency: 'ARS',
    observedAt: OBSERVED_AT, url: `https://www.eneba.com/latam/${game.id}?af_id=${ENEBA_AFFILIATE_ID}&currency=ARS` };
  const snapshot = { status: 'ready', fetchedAt: OBSERVED_AT, feedUpdatedAt: OBSERVED_AT, offers: [offer] };

  it('descarta filas malformadas y precios con identidad o destino alterados', () => {
    const read = readEnebaSnapshot({ ...snapshot, offers: [null, { ...offer, sku: 'WRONG' },
      { ...offer, url: 'https://invalid.example' }, offer] }, NOW_MS);
    expect(read?.offers).toEqual([offer]);
    expect(readEnebaSnapshot({ ...snapshot, offers: [{ ...offer, reviewedAt: NOW }] }, NOW_MS)?.offers).toEqual([]);
  });

  it('no conserva precios en una respuesta de error ni renueva la fecha al leer', () => {
    expect(readEnebaSnapshot({ ...snapshot, status: 'error' }, NOW_MS)?.offers).toEqual([]);
    expect(readEnebaSnapshot(snapshot, NOW_MS)?.feedUpdatedAt).toBe(OBSERVED_AT);
    expect(readEnebaSnapshot({ ...snapshot, feedUpdatedAt: NOW }, NOW_MS)?.offers).toEqual([]);
    expect(readEnebaSnapshot({ status: 'ready', offers: [] }, NOW_MS)).toBeNull();
  });
});
