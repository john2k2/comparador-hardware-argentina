import { describe, expect, it } from 'vitest';
import {
  PRODUCT_TITLE_SUFFIX,
  buildCanonicalUrl,
  buildProductDescription,
  buildProductJsonLd,
  buildShortProductTitle,
  stockToSchemaAvailability,
  truncateText,
} from './product-page-metadata';
import type { Product } from '@/lib/types';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'agrupado-motherboards-gigabyte-eagle-lga1851-z890-12a7yda',
    name: 'MOTHER GIGABYTE (LGA1851) Z890 EAGLE DDR5',
    category: 'motherboards',
    brand: 'Gigabyte',
    model: 'MOTHER GIGABYTE (LGA1851) Z890 EAGLE',
    specs: {},
    prices: [
      {
        storeId: 'scp',
        storeName: 'SCP Hardstore',
        url: 'https://www.scphardstore.com/producto/mother-gigabyte-z890-eagle-ddr5-lga1851/',
        price: 363736,
        stock: 'in-stock',
        installment: null,
        lastUpdated: new Date(),
      },
      {
        storeId: 'venex',
        storeName: 'Venex',
        url: 'https://venex.com.ar/producto/mother-gigabyte-z890-eagle',
        price: 370000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: new Date(),
      },
    ],
    lowestPrice: 363736,
    highestPrice: 370000,
    averagePrice: 366868,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    ...overrides,
  };
}

describe('truncateText', () => {
  it('deja el texto intacto si entra en el limite', () => {
    expect(truncateText('Ryzen 5 7600', 20)).toBe('Ryzen 5 7600');
  });

  it('corta en el ultimo espacio y agrega elipsis', () => {
    const result = truncateText('Compara este producto en varias tiendas de Argentina', 20);
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toMatch(/\s…$/);
  });
});

describe('buildShortProductTitle', () => {
  it('no repite la marca cuando el modelo scrapeado ya la incluye', () => {
    const product = makeProduct();
    const title = buildShortProductTitle(product);

    const brandOccurrences = title.toUpperCase().split('GIGABYTE').length - 1;
    expect(brandOccurrences).toBe(1);
  });

  it('no filtra el ID interno del producto en el titulo', () => {
    const product = makeProduct();
    const title = buildShortProductTitle(product);

    expect(title).not.toContain('#12a7yd');
    expect(title).not.toMatch(/#[a-z0-9]{4,}/i);
  });

  it('usa el nombre completo cuando no hay marca ni modelo', () => {
    const product = makeProduct({ brand: '', model: '', name: 'Producto generico sin marca' });
    const title = buildShortProductTitle(product);
    expect(title).toContain('Producto generico sin marca');
  });

  it('respeta un largo razonable para SERP (<=60 caracteres)', () => {
    const product = makeProduct({
      brand: 'Gigabyte',
      model: 'MOTHERBOARD GIGABYTE ATX GAMING X870E AORUS ELITE WIFI7 DDR5 EXPANSION SLOTS',
    });
    const title = buildShortProductTitle(product);
    expect(title.length).toBeLessThanOrEqual(46);
    expect(title).not.toContain('…');
    expect(`${title}${PRODUCT_TITLE_SUFFIX}`.length).toBeLessThanOrEqual(80);
    expect(PRODUCT_TITLE_SUFFIX).toContain('Comparador Hardware Argentina');
  });

  it('orienta el snippet a comparar precios sin meter el importe en el title', () => {
    const title = buildShortProductTitle(makeProduct());

    expect(title.endsWith(': precios')).toBe(true);
    expect(title).not.toMatch(/\$|363/);
    expect(`${title}${PRODUCT_TITLE_SUFFIX}`).toContain('| Comparador Hardware Argentina');
  });
});

describe('buildProductDescription', () => {
  it('termina en una oracion completa, nunca cortada a mitad de palabra', () => {
    const product = makeProduct({
      name: 'MOTHERBOARD GIGABYTE ATX GAMING X870E AORUS ELITE WIFI7 DDR5 EXPANSION SLOTS PREMIUM EDITION',
    });
    const description = buildProductDescription(product);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith('.')).toBe(true);
  });

  it('incluye el precio cuando el nombre es corto', () => {
    const product = makeProduct({ name: 'RTX 4060' });
    const description = buildProductDescription(product);
    expect(description).toContain('Compará precios de RTX 4060 en 2 tiendas');
    expect(description).toContain('Mejor precio relevado en 3 horas:');
    expect(description).toContain('$');
  });

  it('no deja que un OOS mas barato aparezca como mejor precio del snippet', () => {
    const product = makeProduct({
      name: 'RTX 4060',
      lowestPrice: 190_000,
      prices: [
        {
          storeId: 'venex',
          storeName: 'Venex',
          url: 'https://venex.com.ar/rtx-4060',
          price: 190_000,
          stock: 'out-of-stock',
          installment: null,
          lastUpdated: new Date(),
        },
        {
          storeId: 'mexx',
          storeName: 'Mexx',
          url: 'https://mexx.com.ar/rtx-4060',
          price: 250_000,
          stock: 'in-stock',
          installment: null,
          lastUpdated: new Date(),
        },
      ],
    });

    expect(buildProductDescription(product)).toContain('250.000');
    expect(buildProductDescription(product)).not.toContain('190.000');
  });
});

describe('buildCanonicalUrl', () => {
  it('codifica el id en la url', () => {
    expect(buildCanonicalUrl('abc def')).toContain('abc%20def');
  });
});

describe('stockToSchemaAvailability', () => {
  it('mapea in-stock y low-stock a InStock', () => {
    expect(stockToSchemaAvailability('in-stock')).toBe('https://schema.org/InStock');
    expect(stockToSchemaAvailability('low-stock')).toBe('https://schema.org/InStock');
  });

  it('mapea out-of-stock a OutOfStock', () => {
    expect(stockToSchemaAvailability('out-of-stock')).toBe('https://schema.org/OutOfStock');
  });

  it('mapea unknown a LimitedAvailability', () => {
    expect(stockToSchemaAvailability('unknown')).toBe('https://schema.org/LimitedAvailability');
  });
});

describe('buildProductJsonLd', () => {
  it('genera BreadcrumbList, Organization y Product con offers reales', () => {
    const product = makeProduct();
    const jsonLd = buildProductJsonLd(product, product.id);

    const types = jsonLd.map((entry) => entry['@type']);
    expect(types).toEqual(['BreadcrumbList', 'Organization', 'Product']);

    const productEntry = jsonLd.find((entry) => entry['@type'] === 'Product') as {
      offers: {
        '@type': string;
        priceCurrency: string;
        lowPrice: number;
        highPrice: number;
        offerCount: number;
        offers: Array<{ price: number; priceCurrency: string }>;
      };
    };
    expect(productEntry.offers['@type']).toBe('AggregateOffer');
    expect(productEntry.offers.priceCurrency).toBe('ARS');
    expect(productEntry.offers.lowPrice).toBe(363736);
    expect(productEntry.offers.highPrice).toBe(370000);
    expect(productEntry.offers.offerCount).toBe(2);
    expect(productEntry.offers.offers).toHaveLength(2);
    expect(productEntry.offers.offers[0].priceCurrency).toBe('ARS');
  });

  it('publica identificadores comerciales solo cuando vienen de especificaciones confiables', () => {
    const jsonLd = buildProductJsonLd(makeProduct({
      model: 'MOTHER GIGABYTE (LGA1851) Z890 EAGLE DDR5 NOMBRE MUY LARGO',
      specs: {
        SKU: 'Z890-EAGLE-WIFI7',
        MPN: 'Z890-EAGLE-WIFI7-AR',
      },
    }), 'agrupado-motherboards-gigabyte-eagle-lga1851-z890-12a7yda');
    const productEntry = jsonLd.find((entry) => entry['@type'] === 'Product') as {
      model: string;
      sku?: string;
      mpn?: string;
    };

    expect(productEntry.model).toContain('GIGABYTE');
    expect(productEntry.sku).toBe('Z890-EAGLE-WIFI7');
    expect(productEntry.mpn).toBe('Z890-EAGLE-WIFI7-AR');
  });

  it('omite sku y mpn inventados cuando no existen en las especificaciones', () => {
    const jsonLd = buildProductJsonLd(makeProduct({ specs: {} }), 'agrupado-motherboards-gigabyte-eagle-lga1851-z890-12a7yda');
    const productEntry = jsonLd.find((entry) => entry['@type'] === 'Product') as {
      sku?: string;
      mpn?: string;
    };

    expect(productEntry.sku).toBeUndefined();
    expect(productEntry.mpn).toBeUndefined();
  });

  it('excluye ofertas sin precio o sin url', () => {
    const product = makeProduct({
      prices: [
        {
          storeId: 'a',
          storeName: 'Tienda A',
          url: '',
          price: 100,
          stock: 'in-stock',
          installment: null,
          lastUpdated: new Date(),
        },
        {
          storeId: 'b',
          storeName: 'Tienda B',
          url: 'https://tienda-b.com.ar/producto',
          price: 0,
          stock: 'in-stock',
          installment: null,
          lastUpdated: new Date(),
        },
      ],
    });
    const jsonLd = buildProductJsonLd(product, product.id);
    const productEntry = jsonLd.find((entry) => entry['@type'] === 'Product') as {
      offers: unknown[];
    };
    expect(productEntry.offers).toHaveLength(0);
  });

  it('no publica como oferta comparable una tienda agotada', () => {
    const jsonLd = buildProductJsonLd(makeProduct({
      prices: [
        { storeId: 'agotada', storeName: 'Agotada', url: 'https://agotada.example/a', price: 100_000, stock: 'out-of-stock', installment: null, lastUpdated: new Date() },
        { storeId: 'disponible', storeName: 'Disponible', url: 'https://disponible.example/a', price: 150_000, stock: 'in-stock', installment: null, lastUpdated: new Date() },
      ],
    }), 'agrupado-motherboards-gigabyte-eagle-lga1851-z890-12a7yda');
    const productEntry = jsonLd.find((entry) => entry['@type'] === 'Product') as { offers: { lowPrice: number; offerCount: number } };

    expect(productEntry.offers.lowPrice).toBe(150_000);
    expect(productEntry.offers.offerCount).toBe(1);
  });

  it('no publica ofertas antiguas como precios vigentes en el snippet ni en los datos estructurados', () => {
    const product = makeProduct({ name: 'RTX 4060', prices: makeProduct().prices.map((offer) => ({
      ...offer, lastUpdated: new Date('2026-05-01T00:00:00.000Z'),
    })) });
    const jsonLd = buildProductJsonLd(product, product.id);
    const productEntry = jsonLd.find((entry) => entry['@type'] === 'Product') as { offers: unknown[] };

    expect(buildProductDescription(product)).not.toContain('Mejor precio relevado');
    expect(buildProductDescription(product)).not.toContain('$');
    expect(productEntry.offers).toEqual([]);
  });
});
