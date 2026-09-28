import { describe, expect, it } from 'vitest';
import type { HardwareCategory, Product, ProductPrice } from '@/lib/types';
import { resolveGuideComponent, resolveGuideReferenceOffer, resolveGuideSlots } from '@/lib/seo/budget-guide-pricing';

function price(overrides: Partial<ProductPrice> & Pick<ProductPrice, 'storeId' | 'storeName' | 'price'>): ProductPrice {
  return {
    url: `https://example.com/${overrides.storeId}`,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date(),
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
  it('conserva el modelo de motherboard comprobado frente a variantes más baratas', () => {
    const spec = { name: 'MSI PRO B650M-B', exactModel: 'B650M-B', searchTerms: ['b650'], category: 'motherboards' as const, description: '', estimatedPrice: 0 };
    const valid = product({ id: 'board-b', name: 'Mother MSI PRO B650M-B DDR5 AM5', category: 'motherboards', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 146_200 })] });
    const differentSuffix = product({ ...valid, id: 'board-p', name: 'Mother MSI PRO B650M-P DDR5 AM5', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 100_000 })] });
    const atx = product({ ...valid, id: 'board-atx', name: 'Mother MSI B650 Gaming Plus ATX DDR5 AM5', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 90_000 })] });

    expect(resolveGuideComponent(spec, [differentSuffix, atx, valid]).productId).toBe('board-b');
    expect(resolveGuideComponent(spec, [differentSuffix, atx]).offers).toEqual([]);
    expect(resolveGuideReferenceOffer(spec, [differentSuffix, atx])).toBeNull();
  });

  it('no trata un sufijo distinto de gabinete como el modelo de dimensiones comprobadas', () => {
    const spec = { name: 'Cooler Master Elite 302', exactModel: 'Elite 302', searchTerms: ['cooler master elite 302'], category: 'gabinetes' as const, description: '', estimatedPrice: 0 };
    const valid = product({ id: 'case-302', name: 'Gabinete Cooler Master Elite 302', category: 'gabinetes', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 71_999 })] });
    const variant = product({ ...valid, id: 'case-302d', name: 'Gabinete Cooler Master Elite 302D', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 50_000 })] });

    expect(resolveGuideComponent(spec, [variant, valid]).productId).toBe('case-302');
    expect(resolveGuideComponent(spec, [variant]).offers).toEqual([]);
    expect(resolveGuideReferenceOffer(spec, [variant])).toBeNull();
  });

  it('admite CPU con cooler de caja y conserva el rechazo de combos con motherboard', () => {
    const spec = { name: 'Ryzen 5 7600 con Wraith Stealth', searchTerms: ['ryzen 5 7600'], category: 'procesadores' as const, description: '', estimatedPrice: 0 };
    const included = product({ id: 'cpu-included', name: 'Procesador AMD Ryzen 5 7600 AM5 + Wraith Stealth Cooler', category: 'procesadores', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 354_700 })] });
    const bundle = product({ ...included, id: 'cpu-bundle', name: 'Kit Mother ASUS A620M + Procesador AMD Ryzen 5 7600 AM5 + Wraith Stealth Cooler' });
    const tray = product({ ...included, id: 'cpu-tray', name: 'Procesador AMD Ryzen 5 7600 AM5 OEM sin cooler' });
    expect(resolveGuideComponent(spec, [bundle, tray]).priceSource).toBe('estimate');
    expect(resolveGuideComponent(spec, [bundle, tray, included]).productId).toBe('cpu-included');
  });

  it('no confunde la lista de generaciones admitidas con el modelo de motherboard', () => {
    const spec = { name: 'AM5 B650', searchTerms: ['b650'], category: 'motherboards' as const, description: '', estimatedPrice: 0 };
    const board = product({ id: 'board', name: 'Mother MSI PRO B650M-B DDR5 AM5 (Serie 7000/8000) (4797)', category: 'motherboards', prices: [price({ storeId: 'cg', storeName: 'CompraGamer', price: 146_200, url: 'https://compragamer.com/producto/Mother_MSI_PRO_B650M_B_AM5_18056' })] });
    expect(resolveGuideComponent(spec, [board]).productId).toBe('board');
    const wrong = product({ ...board, prices: [price({ storeId: 'cg', storeName: 'CompraGamer', price: 100_000, url: 'https://compragamer.com/producto/Mother_MSI_PRO_B650M_P_AM5_18057' })] });
    expect(resolveGuideComponent(spec, [wrong]).priceSource).toBe('estimate');
  });

  it('prioriza el precio válido también cuando el agrupado es más barato que la oferta individual', () => {
    const cheap = product({ id: 'agrupado-cpu', name: 'Ryzen 5 7600X', category: 'procesadores', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 300_000 })] });
    const individual = product({ ...cheap, id: 'cpu-single', prices: [price({ storeId: 'other', storeName: 'Other', price: 350_000 })] });
    expect(resolveGuideComponent(cpuSpec, [individual, cheap]).productId).toBe('agrupado-cpu');
  });

  it('respeta un módulo DDR5 de 16 GB frente a kits o generaciones diferentes', () => {
    const spec = { name: '16GB DDR5 5600MHz (1 módulo)', searchTerms: ['16gb ddr5 5600'], category: 'memoria-ram' as const, description: '', estimatedPrice: 0 };
    const single = product({ id: 'single', name: 'Memoria Adata DDR5 16GB 5600MHz', category: 'memoria-ram', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 441_450 })] });
    const kit = product({ ...single, id: 'kit', name: 'Memoria DDR5 16GB (2x8GB) 5600MHz' });
    const wrongGen = product({ ...single, id: 'ddr4', name: 'Memoria DDR4 16GB 5600MHz' });
    expect(resolveGuideComponent(spec, [kit, wrongGen]).priceSource).toBe('estimate');
    expect(resolveGuideComponent(spec, [kit, wrongGen, single]).productId).toBe('single');
  });
  it('admite un kit de RAM de escritorio sin confundirlo con una PC armada', () => {
    const spec = { name: '32GB DDR5 5600MHz (2x16GB)', searchTerms: ['32gb ddr5'], category: 'memoria-ram' as const, description: '', estimatedPrice: 150_000 };
    const ram = product({ id: 'ram-kit', name: 'Memoria RAM Kingston Fury Beast DDR5 32GB Kit (2x16GB) 5600MHz RGB CL40', category: 'memoria-ram', prices: [price({ storeId: 'venex', storeName: 'Venex', price: 1_199_990, url: 'https://www.venex.com.ar/memoria-ram-kingston-fury-beast-ddr5-32gb-kit-2x16gb-5600mhz-rgb-cl40.html' })] });
    expect(resolveGuideComponent(spec, [ram])).toMatchObject({ priceSource: 'catalog', productId: 'ram-kit', price: 1_199_990 });
  });

  it('usa la siguiente tienda comprobada cuando la más barata no tiene stock o tiene un precio anterior', () => {
    const candidate = product({
      id: 'ryzen-7600x', name: 'Ryzen 5 7600X', category: 'procesadores',
      prices: [
        price({ storeId: 'no-stock', storeName: 'Sin stock', price: 200_000, stock: 'out-of-stock' }),
        price({ storeId: 'stale', storeName: 'Precio anterior', price: 250_000, lastUpdated: new Date(Date.now() - 4 * 60 * 60 * 1000) }),
        price({ storeId: 'available', storeName: 'Disponible', price: 300_000 }),
        price({ storeId: 'next', storeName: 'Otra disponible', price: 320_000 }),
      ],
    });
    const resolved = resolveGuideComponent(cpuSpec, [candidate]);
    expect(resolved).toMatchObject({ priceSource: 'catalog', price: 300_000, bestStoreName: 'Disponible' });
    expect(resolved.offers.map((offer) => offer.storeId)).toEqual(['available', 'next']);
  });

  it('no presenta como comprable una oferta sin observación reciente', () => {
    const resolved = resolveGuideComponent(cpuSpec, [
      product({
        id: 'ryzen-7600x',
        name: 'Ryzen 5 7600X',
        category: 'procesadores',
        prices: [
          price({ storeId: 'stale', storeName: 'Tienda anterior', price: 100_000, lastUpdated: new Date(Date.now() - 4 * 60 * 60 * 1000) }),
          price({ storeId: 'invalid', storeName: 'Tienda sin fecha', price: 90_000, lastUpdated: new Date(NaN) }),
        ],
      }),
    ]);

    expect(resolved.priceSource).toBe('estimate');
    expect(resolved.bestStoreUrl).toBeNull();
    expect(resolved.offers).toEqual([]);
  });

  it('separa la última referencia de un presupuesto actual y conserva el enlace para comprobarla', () => {
    const older = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const newer = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const candidate = product({
      id: 'ryzen-7600x', name: 'Ryzen 5 7600X', category: 'procesadores',
      prices: [
        price({ storeId: 'old', storeName: 'Anterior', price: 250_000, lastUpdated: older }),
        price({ storeId: 'recent', storeName: 'Reciente', price: 300_000, lastUpdated: newer }),
      ],
    });

    expect(resolveGuideComponent(cpuSpec, [candidate]).priceSource).toBe('estimate');
    expect(resolveGuideReferenceOffer(cpuSpec, [candidate])).toMatchObject({
      productId: 'ryzen-7600x', storeId: 'recent', price: 300_000,
      url: 'https://example.com/recent',
    });
  });

  it('no ofrece refrescar enlaces inseguros o referencias de más de 30 días', () => {
    const candidate = product({
      id: 'ryzen-7600x', name: 'Ryzen 5 7600X', category: 'procesadores',
      prices: [
        price({ storeId: 'unsafe', storeName: 'Insegura', price: 100_000, url: 'javascript:alert(1)' }),
        price({ storeId: 'old', storeName: 'Muy antigua', price: 200_000, lastUpdated: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) }),
      ],
    });
    expect(resolveGuideReferenceOffer(cpuSpec, [candidate])).toBeNull();
  });

  it('no sustituye un NVMe por un SSD SATA ni una fuente Gold por Bronze', () => {
    const ssdSpec = { name: 'SSD NVMe 1TB', searchTerms: ['ssd 1tb', 'nvme 1tb'], category: 'almacenamiento' as const, description: '', estimatedPrice: 80_000 };
    const psuSpec = { name: '650W 80 Plus Gold', searchTerms: ['650w'], category: 'fuentes-alimentacion' as const, description: '', estimatedPrice: 100_000 };
    const products = [
      product({ id: 'sata', name: 'SSD SanDisk 1TB SATA 2.5', category: 'almacenamiento', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 80_000 })] }),
      product({ id: 'bronze', name: 'Fuente Thermaltake 650W 80 Plus Bronze', category: 'fuentes-alimentacion', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 90_000 })] }),
    ];

    expect(resolveGuideComponent(ssdSpec, products).priceSource).toBe('estimate');
    expect(resolveGuideComponent(psuSpec, products).priceSource).toBe('estimate');
    expect(resolveGuideReferenceOffer(ssdSpec, products)).toBeNull();
    expect(resolveGuideReferenceOffer(psuSpec, products)).toBeNull();
  });

  it('no sustituye la GPU pedida por una variante Ti o XT', () => {
    const gpuSpec = { name: 'RTX 5070 / RX 7800 XT', searchTerms: ['rtx 5070', 'rx 7800 xt'], category: 'tarjetas-graficas' as const, description: '', estimatedPrice: 900_000 };
    const products = [
      product({ id: 'ti', name: 'GeForce RTX 5070 Ti 16GB', category: 'tarjetas-graficas', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 1_500_000 })] }),
      product({ id: 'xtx', name: 'Radeon RX 7800 XTX 16GB', category: 'tarjetas-graficas', prices: [price({ storeId: 'shop2', storeName: 'Shop 2', price: 1_700_000 })] }),
    ];

    expect(resolveGuideComponent(gpuSpec, products).priceSource).toBe('estimate');
    expect(resolveGuideReferenceOffer(gpuSpec, products)).toBeNull();
    const exact = product({ id: 'plain', name: 'GeForce RTX 5070 12GB', category: 'tarjetas-graficas', prices: [price({ storeId: 'shop3', storeName: 'Shop 3', price: 1_600_000 })] });
    expect(resolveGuideComponent(gpuSpec, [...products, exact]).productId).toBe('plain');
  });

  it('no sustituye un CPU X por un X3D', () => {
    const other = product({ id: 'x3d', name: 'AMD Ryzen 5 7600X3D', category: 'procesadores', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 400_000 })] });
    expect(resolveGuideComponent(cpuSpec, [other]).priceSource).toBe('estimate');
    expect(resolveGuideReferenceOffer(cpuSpec, [other])).toBeNull();
  });

  it('no sustituye un kit DDR5 5600 de 2x16 por uno de 6000 o un módulo único', () => {
    const ramSpec = { name: '32GB DDR5 5600MHz (2x16GB)', searchTerms: ['32gb ddr5'], category: 'memoria-ram' as const, description: '', estimatedPrice: 150_000 };
    const wrongSpeed = product({ id: '6000', name: 'Memoria DDR5 32GB (2x16GB) 6000MHz', category: 'memoria-ram', prices: [price({ storeId: 'shop', storeName: 'Shop', price: 900_000 })] });
    const single = product({ id: 'single', name: 'Memoria DDR5 32GB 5600MHz', category: 'memoria-ram', prices: [price({ storeId: 'shop2', storeName: 'Shop 2', price: 700_000 })] });
    const exact = product({ id: '5600', name: 'Memoria DDR5 32GB (2x16GB) 5600MHz', category: 'memoria-ram', prices: [price({ storeId: 'shop3', storeName: 'Shop 3', price: 800_000 })] });

    expect(resolveGuideComponent(ramSpec, [wrongSpeed, single]).priceSource).toBe('estimate');
    expect(resolveGuideReferenceOffer(ramSpec, [wrongSpeed, single])).toBeNull();
    expect(resolveGuideComponent(ramSpec, [wrongSpeed, single, exact]).productId).toBe('5600');
  });

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
