import { describe, expect, it } from 'vitest';
import type { HardwareCategory, Product, ProductPrice } from '@/lib/types';
import { resolveGuideComponent, resolveGuideSlots } from '@/lib/seo/budget-guide-pricing';

function price(overrides: Partial<ProductPrice> & Pick<ProductPrice, 'storeId' | 'storeName' | 'price'>): ProductPrice {
  return {
    url: `https://example.com/${overrides.storeId}`,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date('2026-08-29T12:00:00.000Z'),
    ...overrides,
  };
}

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name' | 'category'>): Product {
  const prices = overrides.prices ?? [];
  const lowest = prices.length > 0 ? Math.min(...prices.map((item) => item.price)) : 0;
  return {
    brand: 'AMD',
    model: overrides.name,
    specs: {},
    prices,
    lowestPrice: lowest,
    highestPrice: lowest,
    averagePrice: lowest,
    createdAt: new Date('2026-08-29T12:00:00.000Z'),
    updatedAt: new Date('2026-08-29T12:00:00.000Z'),
    ...overrides,
  };
}

const cpuSpec = {
  name: 'AMD Ryzen 5 7600X / 7500F',
  searchTerms: ['ryzen 5 7600x', 'ryzen 5 7500f'],
  category: 'procesadores' as HardwareCategory,
  description: '6 nucleos',
  estimatedPrice: 350_000,
};

describe('resolveGuideComponent', () => {
  it('usa el estimado y no inventa tienda si no hay match de catalogo', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'gpu-1',
        name: 'RTX 4060',
        category: 'tarjetas-graficas',
        prices: [price({ storeId: 'venex', storeName: 'Venex', price: 500_000 })],
      }),
    ]);

    expect(resolved.price).toBe(350_000);
    expect(resolved.priceSource).toBe('estimate');
    expect(resolved.bestStoreName).toBeNull();
    expect(resolved.storeCount).toBe(0);
    expect(resolved.productId).toBeUndefined();
  });

  it('toma el precio comparable en stock y la tienda de esa oferta', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'agrupado-procesadores-ryzen-5-7600x',
        name: 'Procesador AMD Ryzen 5 7600X',
        category: 'procesadores',
        prices: [
          price({ storeId: 'fullh4rd', storeName: 'FullH4rd', price: 333_129, stock: 'in-stock' }),
          price({ storeId: 'venex', storeName: 'Venex', price: 360_000, stock: 'in-stock' }),
          price({ storeId: 'mexx', storeName: 'Mexx', price: 280_000, stock: 'out-of-stock' }),
        ],
      }),
    ]);

    expect(resolved.priceSource).toBe('catalog');
    expect(resolved.price).toBe(333_129);
    expect(resolved.bestStoreName).toBe('FullH4rd');
    expect(resolved.storeCount).toBe(2);
    expect(resolved.storeNames).toEqual(['FullH4rd', 'Venex']);
    expect(resolved.productId).toBe('agrupado-procesadores-ryzen-5-7600x');
    expect(resolved.name).toBe('Procesador AMD Ryzen 5 7600X');
  });

  it('elige el mas barato comparable entre alternativas del slot', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'agrupado-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [price({ storeId: 'venex', storeName: 'Venex', price: 350_000 })],
      }),
      product({
        id: 'agrupado-7500f',
        name: 'Ryzen 5 7500F',
        category: 'procesadores',
        prices: [price({ storeId: 'compragamer', storeName: 'CompraGamer', price: 290_000 })],
      }),
    ]);

    expect(resolved.price).toBe(290_000);
    expect(resolved.bestStoreName).toBe('CompraGamer');
    expect(resolved.productId).toBe('agrupado-7500f');
  });

  it('ignora PCs armadas que mencionan el CPU', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'pc-5500',
        name: 'Pc Ryzen 5 5500 - 16gb Ram - 512gb -rtx 2060 Super',
        category: 'procesadores',
        prices: [price({ storeId: 'mexx', storeName: 'Mexx', price: 150_489 })],
      }),
      product({
        id: 'agrupado-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [price({ storeId: 'fullh4rd', storeName: 'FullH4rd', price: 333_129 })],
      }),
    ]);

    expect(resolved.productId).toBe('agrupado-7600x');
  });

  it('ignora combos y notebooks aunque el nombre contenga el termino', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'combo-1',
        name: 'PC Gamer Ryzen 5 7600X + RTX 4060',
        category: 'computadoras',
        prices: [price({ storeId: 'venex', storeName: 'Venex', price: 1_200_000 })],
      }),
      product({
        id: 'agrupado-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [price({ storeId: 'fullh4rd', storeName: 'FullH4rd', price: 333_129 })],
      }),
    ]);

    expect(resolved.productId).toBe('agrupado-7600x');
    expect(resolved.price).toBe(333_129);
  });

  it('no usa una oferta SODIMM aunque el agrupado se llame como RAM de escritorio', () => {
    const resolved = resolveGuideComponent(
      {
        name: '32GB DDR5',
        searchTerms: ['32gb ddr5'],
        category: 'memoria-ram',
        description: 'Desktop',
        estimatedPrice: 150_000,
      },
      [
        product({
          id: 'agrupado-kingston-32',
          name: 'Memoria Kingston Fury Beast 32GB DDR5 5600Mhz CL40 EXPO',
          category: 'memoria-ram',
          prices: [
            price({
              storeId: 'compragamer',
              storeName: 'CompraGamer',
              price: 582_880,
              url: 'https://compragamer.com/producto/Memoria_Kingston_DDR5_32GB_5600MHz_SODIMM_Fury_Impact_CL40',
            }),
            price({
              storeId: 'hardcore',
              storeName: 'Hardcore',
              price: 809_325,
              url: 'https://hardcorecomputacion.com.ar/producto/memoria-kingston-fury-beast-ddr5-rgb-5600mhz-32gb-rgb/',
            }),
          ],
        }),
      ],
    );

    expect(resolved.priceSource).toBe('catalog');
    expect(resolved.price).toBe(809_325);
    expect(resolved.bestStoreName).toBe('Hardcore');
    expect(resolved.bestStoreUrl).not.toMatch(/sodimm/i);
    expect(resolved.storeCount).toBe(1);
  });

  it('si el agrupado solo tiene ofertas SODIMM, no recomienda esa RAM', () => {
    const resolved = resolveGuideComponent(
      {
        name: '32GB DDR5',
        searchTerms: ['32gb ddr5'],
        category: 'memoria-ram',
        description: 'Desktop',
        estimatedPrice: 150_000,
      },
      [
        product({
          id: 'agrupado-sodimm',
          name: 'Memoria Kingston Fury Beast 32GB DDR5',
          category: 'memoria-ram',
          prices: [
            price({
              storeId: 'compragamer',
              storeName: 'CompraGamer',
              price: 120_000,
              url: 'https://compragamer.com/producto/Memoria_Kingston_DDR5_32GB_SODIMM',
            }),
          ],
        }),
      ],
    );

    expect(resolved.priceSource).toBe('estimate');
    expect(resolved.bestStoreUrl).toBeNull();
  });

  it('no elige RAM SODIMM para un kit de escritorio', () => {
    const resolved = resolveGuideComponent(
      {
        name: '32GB DDR5',
        searchTerms: ['32gb ddr5', 'ddr5 5600mhz'],
        category: 'memoria-ram',
        description: 'Desktop',
        estimatedPrice: 150_000,
      },
      [
        product({
          id: 'sodimm-8',
          name: 'Memoria Ram SODIMM KINGSTON 8GB DDR5 5600MHz',
          category: 'memoria-ram',
          prices: [price({ storeId: 'portaltech', storeName: 'Portal Tech', price: 45_000 })],
        }),
        product({
          id: 'agrupado-32ddr5',
          name: 'Memoria RAM 32GB DDR5 5600 Kingston Fury',
          category: 'memoria-ram',
          prices: [
            price({ storeId: 'venex', storeName: 'Venex', price: 180_000 }),
            price({ storeId: 'mexx', storeName: 'Mexx', price: 185_000 }),
          ],
        }),
      ],
    );

    expect(resolved.productId).toBe('agrupado-32ddr5');
    expect(resolved.price).toBe(180_000);
  });

  it('no elige un fan suelto como gabinete', () => {
    const resolved = resolveGuideComponent(
      {
        name: 'Mid Tower',
        searchTerms: ['mid tower', 'gabinete'],
        category: 'gabinetes',
        description: 'Airflow',
        estimatedPrice: 80_000,
      },
      [
        product({
          id: 'fan-1',
          name: 'Cooler Gabinete Sentey Fan 120Mm Bulk',
          category: 'gabinetes',
          prices: [
            price({ storeId: 'gamingcity', storeName: 'Gaming City', price: 5_130 }),
            price({ storeId: 'megasoft', storeName: 'Megasoft', price: 6_000 }),
          ],
        }),
        product({
          id: 'agrupado-case',
          name: 'Gabinete Mid Tower Sentey Mesh',
          category: 'gabinetes',
          prices: [price({ storeId: 'compragamer', storeName: 'CompraGamer', price: 75_000 })],
        }),
      ],
    );

    expect(resolved.productId).toBe('agrupado-case');
  });

  it('no toma 1550w como si fuera 550w', () => {
    const resolved = resolveGuideComponent(
      {
        name: '550W',
        searchTerms: ['550w'],
        category: 'fuentes-alimentacion',
        description: 'Bronze',
        estimatedPrice: 50_000,
      },
      [
        product({
          id: 'agrupado-1550w',
          name: 'Fuente 1550W Platinum',
          category: 'fuentes-alimentacion',
          prices: [price({ storeId: 'venex', storeName: 'Venex', price: 40_000 })],
        }),
        product({
          id: 'agrupado-550w',
          name: 'Fuente 550W Bronze',
          category: 'fuentes-alimentacion',
          prices: [price({ storeId: 'fullh4rd', storeName: 'FullH4rd', price: 62_000 })],
        }),
      ],
    );

    expect(resolved.productId).toBe('agrupado-550w');
    expect(resolved.price).toBe(62_000);
  });

  it('ignora un producto si todas las ofertas estan sin stock', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'agrupado-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [
          price({ storeId: 'mexx', storeName: 'Mexx', price: 199_000, stock: 'out-of-stock' }),
          price({ storeId: 'venex', storeName: 'Venex', price: 210_000, stock: 'out-of-stock' }),
        ],
      }),
    ]);

    expect(resolved.priceSource).toBe('estimate');
    expect(resolved.price).toBe(350_000);
    expect(resolved.bestStoreName).toBeNull();
    expect(resolved.offers).toEqual([]);
  });

  it('no trata unknown como stock comprable', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'agrupado-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [price({ storeId: 'venex', storeName: 'Venex', price: 199_000, stock: 'unknown' })],
      }),
    ]);

    expect(resolved.priceSource).toBe('estimate');
    expect(resolved.bestStoreName).toBeNull();
  });

  it('acepta low-stock como oferta comprable', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'agrupado-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [price({ storeId: 'fullh4rd', storeName: 'FullH4rd', price: 340_000, stock: 'low-stock' })],
      }),
    ]);

    expect(resolved.priceSource).toBe('catalog');
    expect(resolved.price).toBe(340_000);
    expect(resolved.bestStoreName).toBe('FullH4rd');
    expect(resolved.offers[0]?.stock).toBe('low-stock');
  });

  it('usa un listing individual en stock si el agrupado solo tiene OOS', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'agrupado-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [price({ storeId: 'mexx', storeName: 'Mexx', price: 199_000, stock: 'out-of-stock' })],
      }),
      product({
        id: 'venex-7600x',
        name: 'Ryzen 5 7600X AM5',
        category: 'procesadores',
        prices: [price({ storeId: 'venex', storeName: 'Venex', price: 355_000, stock: 'in-stock' })],
      }),
    ]);

    expect(resolved.priceSource).toBe('catalog');
    expect(resolved.productId).toBe('venex-7600x');
    expect(resolved.price).toBe(355_000);
    expect(resolved.bestStoreName).toBe('Venex');
  });

  it('no usa una oferta de otra frecuencia o familia Patriot', () => {
    const resolved = resolveGuideComponent(
      {
        name: '32GB DDR5',
        searchTerms: ['32gb ddr5'],
        category: 'memoria-ram',
        description: 'Desktop',
        estimatedPrice: 150_000,
      },
      [
        product({
          id: 'xtpc-xtreme-7000',
          name: 'MEMORIA 32GB (2X16GB) DDR5 7000 PATRIOT VIPER XTREME 5',
          category: 'memoria-ram',
          prices: [
            price({
              storeId: 'xtpc',
              storeName: 'Xt-PC',
              price: 220_000,
              url: 'https://www.xt-pc.com.ar/prod/26092/memoria-32gb-2x16gb-ddr5-6000-patriot-viper-venom-xmp-expo',
            }),
          ],
        }),
        product({
          id: 'xtpc-xtreme-ok',
          name: 'MEMORIA 32GB (2X16GB) DDR5 7000 PATRIOT VIPER XTREME 5',
          category: 'memoria-ram',
          prices: [
            price({
              storeId: 'xtpc',
              storeName: 'Xt-PC',
              price: 280_000,
              url: 'https://www.xt-pc.com.ar/prod/30482/memoria-32gb-2x16gb-ddr5-7000-patriot-viper-xtreme-5',
            }),
          ],
        }),
      ],
    );

    expect(resolved.productId).toBe('xtpc-xtreme-ok');
    expect(resolved.bestStoreUrl).toMatch(/7000/);
    expect(resolved.bestStoreUrl).toMatch(/xtreme/);
    expect(resolved.bestStoreUrl).not.toMatch(/venom/);
  });

  it('no usa una oferta de otra linea dentro del mismo agrupado', () => {
    const resolved = resolveGuideComponent(
      {
        name: '16GB DDR4',
        searchTerms: ['16gb ddr4'],
        category: 'memoria-ram',
        description: 'Desktop',
        estimatedPrice: 50_000,
      },
      [
        product({
          id: 'agrupado-16ddr4',
          name: 'Memoria Ddr4 Kingston 16Gb 3200 Mhz Fury Beast Rgb',
          category: 'memoria-ram',
          prices: [
            price({
              storeId: 'mexx',
              storeName: 'Mexx',
              price: 189_999,
              url: 'https://www.mexx.com.ar/productos-rubro/memorias-ram/52437-memoria-ram-ddr4-16gb-3200-mhz-raptor-value.html',
            }),
            price({
              storeId: 'xtpc',
              storeName: 'Xt-PC',
              price: 200_670,
              url: 'https://xtpc.com.ar/memoria-ddr4-kingston-16gb-3200-mhz-fury-beast-rgb',
            }),
          ],
        }),
      ],
    );

    expect(resolved.bestStoreName).toBe('Xt-PC');
    expect(resolved.price).toBe(200_670);
    expect(resolved.bestStoreUrl).toMatch(/fury-beast/i);
    expect(resolved.bestStoreUrl).not.toMatch(/raptor/i);
  });

  it('prefiere el listing individual para no mezclar ofertas de un agrupado', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'venex-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [price({ storeId: 'venex', storeName: 'Venex', price: 320_000 })],
      }),
      product({
        id: 'agrupado-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [
          price({ storeId: 'fullh4rd', storeName: 'FullH4rd', price: 333_129 }),
          price({ storeId: 'venex', storeName: 'Venex', price: 320_000 }),
        ],
      }),
    ]);

    expect(resolved.productId).toBe('venex-7600x');
    expect(resolved.bestStoreName).toBe('Venex');
    expect(resolved.price).toBe(320_000);
    expect(resolved.storeCount).toBe(1);
  });
});

describe('resolveGuideSlots', () => {
  it('resuelve cada slot y suma el total con mezcla catalogo/estimado', () => {
    const products = [
      product({
        id: 'agrupado-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [price({ storeId: 'fullh4rd', storeName: 'FullH4rd', price: 333_129 })],
      }),
    ];

    const resolved = resolveGuideSlots(
      {
        cpu: cpuSpec,
        gpu: {
          name: 'RTX 4060',
          searchTerms: ['rtx 4060'],
          category: 'tarjetas-graficas',
          description: '8GB',
          estimatedPrice: 500_000,
        },
      },
      products,
    );

    expect(resolved.cpu.priceSource).toBe('catalog');
    expect(resolved.gpu.priceSource).toBe('estimate');
    expect(resolved.catalogTotal).toBe(333_129);
    expect(resolved.estimateTotal).toBe(500_000);
    expect(resolved.total).toBe(333_129 + 500_000);
    expect(resolved.inStockSlots).toBe(1);
    expect(resolved.hasEstimates).toBe(true);
  });
});
