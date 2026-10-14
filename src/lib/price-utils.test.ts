import { describe, expect, it } from 'vitest';
import type { ProductPrice } from './types';
import {
  computeComparableStorePriceStats,
  getAvailableComparableStorePrices,
  getComparableStorePrices,
  parseLocalizedArsPrice,
  pickBestStorePrices,
  preferStorePrice,
  isComparableStoreOffer,
  computeCurrentStorePriceStats,
} from './price-utils';
import { proveManufacturerRamAttributes } from './quality/offer-attribute-proof';
import { normalizeIdentityText } from './product-identity';

function buildPrice(overrides: Partial<ProductPrice>): ProductPrice {
  return {
    storeId: 'store-a',
    storeName: 'Store A',
    url: 'https://example.com/producto',
    price: 250_000,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date('2026-03-13T12:00:00.000Z'),
    ...overrides,
  };
}

describe('price-utils', () => {
  it('el reloj explícito mantiene una selección reproducible sin cambiar el reloj del proceso', () => {
    const clock = Date.parse('2026-03-13T12:00:00Z');
    const cheap = buildPrice({ price: 100, lastUpdated: new Date(clock - 23 * 3600000) });
    const recent = buildPrice({ price: 200, lastUpdated: new Date(clock - 1000) });
    expect(pickBestStorePrices([cheap, recent], clock)).toEqual([cheap]);
    expect(pickBestStorePrices([cheap, recent], clock + 2 * 3600000)).toEqual([recent]);
    expect(pickBestStorePrices([cheap, recent], clock + 25 * 3600000)).toEqual([cheap]);
    expect(computeCurrentStorePriceStats([cheap, recent], { name: 'Gabinete Sentey P20', category: 'gabinetes' }, clock).lowest).toBe(100);
  });
  it('con producto el stock comprable se filtra antes de deduplicar la tienda', () => {
    const unknown = buildPrice({ storeId: 'mexx', url: 'https://www.mexx.com.ar/ram-a', price: 100, stock: 'unknown', lastUpdated: new Date() });
    const available = { ...unknown, url: 'https://www.mexx.com.ar/ram-b', price: 200, stock: 'in-stock' as const };
    const product = { name: 'Memoria DDR4', category: 'memoria-ram' };
    for (const stock of ['unknown', 'out-of-stock', 'backorder', null]) {
      const unavailable = { ...unknown, stock } as ProductPrice;
      expect(getAvailableComparableStorePrices([unavailable, available], product)).toEqual([available]);
      expect(getAvailableComparableStorePrices([available, unavailable], product)).toEqual([available]);
    }
    expect(getAvailableComparableStorePrices([unknown, available])).toEqual([unknown]);
  });
  it.each([
    ['agrupado-memoria-ram-corsair-16gb-1co0hh2', 'CMG16GX4M1E3200C16', 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16', '15558', 283600],
    ['cg-15558', 'CMG16GX4M1E3200C16', 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16', '15558', 283600],
    ['cg-15522', 'CMK8GX4M1E3200C16', 'Memoria Corsair DDR4 8GB 3200MHz Vengeance LPX Black CL16', '15522', 129990],
    ['cg-16112', 'CMK16GX5M1B5600C40', 'Memoria Corsair DDR5 16GB 5600MHz Vengeance Black CL40', '16112', 428000],
  ])('stats y lectores públicos revalidan SKU actual de %s', (_id, sku, name, ref, price) => {
    const url = `https://compragamer.com/producto/RAM_${ref}`, listingRef = `compragamer:id:${ref}`;
    const subject = { title: name, sku, specs: { SKU: sku } };
    const sourceIdentity = { title: name, storeSku: sku, listingRef };
    const proof = proveManufacturerRamAttributes(subject, subject, { storeId: 'compragamer', url, listingRef });
    expect(proof).not.toBeNull();
    const offer = buildPrice({ storeId: 'compragamer', url, price, lastUpdated: new Date(), sourceIdentity,
      identityReview: { version: 1, status: 'consistent', reason: 'manufacturer-ram', reviewedAt: new Date().toISOString(),
        model: null, confidence: null, subject: { name: normalizeIdentityText(name), category: 'memoria-ram', url },
        sourceIdentity, proof: proof! } });
    const product = { name, category: 'memoria-ram', specs: { SKU: sku } };
    for (const getter of [getComparableStorePrices, getAvailableComparableStorePrices]) {
      expect(getter([offer], product)).toEqual([offer]);
      expect(getter([offer])).toEqual([]);
      for (const changed of [{ ...product, specs: {} }, { ...product, specs: { SKU: 'otro' } },
        { ...product, name: `${name} 2x8GB` }, { ...product, name: name.replace('Black', 'White') }])
        expect(getter([offer], changed)).toEqual([]);
    }
    expect(computeComparableStorePriceStats([offer], product).lowest).toBe(price);
    expect(computeComparableStorePriceStats([offer]).lowest).toBe(0);
    const damaged = { ...offer, identityReview: { ...offer.identityReview!, proof: undefined } };
    expect(getAvailableComparableStorePrices([damaged])).toEqual([]);
    expect(getAvailableComparableStorePrices([damaged], product)).toEqual([]);
    // La elegibilidad se comprueba antes de deduplicar una tienda: un proof
    // inválido barato no oculta su otra publicación válida.
    const pending = { ...offer, price: 1, sourceIdentity: { ...sourceIdentity, storeSku: 'otro' } };
    expect(computeComparableStorePriceStats([pending, offer], product).lowest).toBe(price);
  });
  it('RAM fabricante serializada requiere SKU y specs vigentes, stock y frescura por separado',()=>{
    const name='Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16',sku='CMG16GX4M1E3200C16';
    const url='https://compragamer.com/producto/RAM_15558',listingRef='compragamer:id:15558',subject={title:name,sku,specs:{SKU:sku}};
    const now=Date.parse('2026-10-11T22:30:00Z'),sourceIdentity={title:name,storeSku:sku,listingRef};
    const proof=proveManufacturerRamAttributes(subject,subject,{storeId:'compragamer',url,listingRef})!;
    const offer=JSON.parse(JSON.stringify(buildPrice({storeId:'compragamer',url,lastUpdated:new Date(now),sourceIdentity,
      identityReview:{version:1,status:'consistent',reason:'manufacturer-ram',reviewedAt:new Date(now).toISOString(),model:null,confidence:null,
        subject:{name:normalizeIdentityText(name),category:'memoria-ram',url},sourceIdentity,proof}})));
    const product={name,category:'memoria-ram',specs:{SKU:sku}};
    expect(isComparableStoreOffer(offer,product)).toBe(true);
    expect(isComparableStoreOffer({...offer,sourceIdentity:undefined},product)).toBe(false);
    for(const changed of [{name,category:'memoria-ram'},{...product,specs:{}},{...product,specs:{SKU:'another'}},
      {...product,specs:{SKU:sku,kit:'2x8GB'}},{...product,name:name.replace('Black','Grey')}])
      expect(isComparableStoreOffer(offer,changed)).toBe(false);
    for(const marker of ['*','×'])expect(isComparableStoreOffer(offer,{...product,name:name.replace('RGB RS',`RGB${marker}RS`)})).toBe(false);
    for(const stock of ['unknown','out-of-stock','backorder'])expect(isComparableStoreOffer({...offer,stock},product)).toBe(false);
    expect(isComparableStoreOffer({...offer,price:0},product)).toBe(false);
    expect(computeCurrentStorePriceStats([offer],product,now).comparablePrices).toHaveLength(1);
    expect(computeCurrentStorePriceStats([offer],product,now+86400001).comparablePrices).toHaveLength(0);
  });
  it('prioriza observación reciente sobre precio histórico barato de la misma tienda',()=>{
    const old=buildPrice({price:1,lastUpdated:new Date(Date.now()-25*3600000)}),fresh=buildPrice({price:50000,lastUpdated:new Date()});
    expect(preferStorePrice(old,fresh)).toBe(fresh);expect(preferStorePrice(fresh,old)).toBe(fresh);
    expect(preferStorePrice(old,{...fresh,stock:'out-of-stock'})).toMatchObject({stock:'out-of-stock',lastUpdated:fresh.lastUpdated});
  });
  it('parseLocalizedArsPrice respeta separadores locales de ARS', () => {
    expect(parseLocalizedArsPrice('$ 248.496,11')).toBe(248_496);
    expect(parseLocalizedArsPrice('248.496')).toBe(248_496);
    expect(parseLocalizedArsPrice('ARS 248496,50')).toBe(248_497);
  });

  it('parseLocalizedArsPrice no concatena numeros de cuotas con el precio', () => {
    // Bug fix: antes "3 cuotas de $82.832" se parseaba como 382832
    expect(parseLocalizedArsPrice('3 cuotas de $82.832')).toBe(82_832);
    expect(parseLocalizedArsPrice('Antes: $300.000 Ahora: $248.496')).toBe(248_496);
  });

  it('parseLocalizedArsPrice maneja precio con cuotas de Compugarden', () => {
    // Caso real de Compugarden: precio principal + cuotas
    expect(parseLocalizedArsPrice('$ 38.188,80 3 cuotas de $ 15.084,58')).toBe(38_189);
    expect(parseLocalizedArsPrice('$ 59.849,81 6 cuotas de $ 12.668,21')).toBe(59_850);
  });

  it('pickBestStorePrices deja la mejor opcion por tienda', () => {
    const picked = pickBestStorePrices([
      buildPrice({
        storeId: 'venex',
        storeName: 'Venex',
        price: 320_000,
        lastUpdated: new Date('2026-03-13T10:00:00.000Z'),
      }),
      buildPrice({
        storeId: 'venex',
        storeName: 'Venex',
        price: 300_000,
        lastUpdated: new Date('2026-03-13T11:00:00.000Z'),
      }),
      buildPrice({
        storeId: 'mexx',
        storeName: 'Mexx',
        price: 305_000,
      }),
    ]);

    expect(picked).toHaveLength(2);
    expect(picked.map((price) => [price.storeId, price.price])).toEqual([
      ['venex', 300_000],
      ['mexx', 305_000],
    ]);
  });

  it('preferStorePrice nunca reemplaza in-stock por un OOS mas barato o mas nuevo', () => {
    const inStock = buildPrice({ storeId: 'mexx', price: 100_000, stock: 'in-stock' });
    const cheaperOos = buildPrice({
      storeId: 'mexx',
      price: 80_000,
      stock: 'out-of-stock',
      lastUpdated: new Date('2026-03-20T12:00:00.000Z'),
    });

    expect(preferStorePrice(inStock, cheaperOos)).toMatchObject({ price: 100_000, stock: 'in-stock' });
    expect(preferStorePrice(cheaperOos, inStock)).toMatchObject({ price: 100_000, stock: 'in-stock' });
    expect(preferStorePrice(
      buildPrice({ storeId: 'mexx', price: 120_000, stock: 'in-stock' }),
      buildPrice({ storeId: 'mexx', price: 100_000, stock: 'in-stock' }),
    )).toMatchObject({ price: 100_000 });
  });

  it('pickBestStorePrices nunca deja que una oferta sin stock desplace una disponible', () => {
    const picked = pickBestStorePrices([
      buildPrice({ storeId: 'venex', price: 250_000, stock: 'in-stock' }),
      buildPrice({ storeId: 'venex', price: 190_000, stock: 'out-of-stock' }),
    ]);

    expect(picked).toHaveLength(1);
    expect(picked[0]).toMatchObject({ price: 250_000, stock: 'in-stock' });
  });

  it('computeComparableStorePriceStats no deja que un OOS mas barato de otra tienda gane el lowest', () => {
    const stats = computeComparableStorePriceStats([
      buildPrice({ storeId: 'venex', storeName: 'Venex', price: 190_000, stock: 'out-of-stock' }),
      buildPrice({ storeId: 'mexx', storeName: 'Mexx', price: 250_000, stock: 'in-stock' }),
    ]);

    expect(stats.lowest).toBe(250_000);
    expect(stats.highest).toBe(250_000);
    expect(stats.average).toBe(250_000);
    expect(stats.comparablePrices[0]).toMatchObject({ storeId: 'mexx', price: 250_000, stock: 'in-stock' });
    expect(stats.comparablePrices.map((price) => price.storeId)).toEqual(['mexx', 'venex']);
  });

  it('computeComparableStorePriceStats usa el OOS mas barato solo si ninguna tienda tiene stock', () => {
    const stats = computeComparableStorePriceStats([
      buildPrice({ storeId: 'venex', storeName: 'Venex', price: 190_000, stock: 'out-of-stock' }),
      buildPrice({ storeId: 'mexx', storeName: 'Mexx', price: 250_000, stock: 'out-of-stock' }),
    ]);

    expect(stats.lowest).toBe(190_000);
    expect(stats.comparablePrices[0]).toMatchObject({ storeId: 'venex', price: 190_000 });
  });

  it('separa las ofertas disponibles para contratos que no deben contar agotadas', () => {
    const available = getAvailableComparableStorePrices([
      { storeId: 'agotada', price: 100_000, stock: 'out-of-stock' },
      { storeId: 'disponible', price: 150_000, stock: 'in-stock' },
    ]);

    expect(available).toEqual([expect.objectContaining({ storeId: 'disponible', price: 150_000 })]);
  });

  it('computeComparableStorePriceStats filtra outliers altos absurdos sin romper precios reales', () => {
    const stats = computeComparableStorePriceStats([
      buildPrice({ storeId: 'venex', storeName: 'Venex', price: 260_000 }),
      buildPrice({ storeId: 'mexx', storeName: 'Mexx', price: 262_000 }),
      buildPrice({ storeId: 'compugarden', storeName: 'Compugarden', price: 24_849_611 }),
    ]);

    expect(stats.comparablePrices).toHaveLength(2);
    expect(stats.discardedPrices).toHaveLength(1);
    expect(stats.lowest).toBe(260_000);
    expect(stats.highest).toBe(262_000);
    expect(stats.average).toBe(261_000);
  });

  it('computeComparableStorePriceStats tambien filtra un outlier alto cuando solo hay dos tiendas', () => {
    const stats = computeComparableStorePriceStats([
      buildPrice({ storeId: 'venex', storeName: 'Venex', price: 255_000 }),
      buildPrice({ storeId: 'compugarden', storeName: 'Compugarden', price: 24_849_611 }),
    ]);

    expect(stats.comparablePrices.map((price) => price.storeId)).toEqual(['venex']);
    expect(stats.discardedPrices.map((price) => price.storeId)).toEqual(['compugarden']);
    expect(stats.highest).toBe(255_000);
  });
});
