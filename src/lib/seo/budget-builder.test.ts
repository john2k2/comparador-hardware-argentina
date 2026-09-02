import { describe, expect, it } from 'vitest';
import type { HardwareCategory, Product, ProductPrice } from '@/lib/types';
import { buildBudgetFromCatalog, resolveCustomBudgetSlots, resolveLiveGuideSlots } from '@/lib/seo/budget-builder';
import { getBudgetGuideBySlug } from '@/lib/seo/budget-guides-data';

function price(overrides: Partial<ProductPrice> & Pick<ProductPrice, 'storeId' | 'storeName' | 'price'>): ProductPrice {
  return {
    url: `https://example.com/${overrides.storeId}`,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date('2026-09-02T12:00:00.000Z'),
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
    createdAt: new Date('2026-09-02T12:00:00.000Z'),
    updatedAt: new Date('2026-09-02T12:00:00.000Z'),
    ...overrides,
  };
}

function listed(
  id: string,
  name: string,
  category: HardwareCategory,
  amount: number,
): Product {
  return product({
    id,
    name,
    category,
    prices: [price({ storeId: 'venex', storeName: 'Venex', price: amount })],
  });
}

const starterCatalog = [
  listed('cpu-5600', 'AMD Ryzen 5 5600', 'procesadores', 150_000),
  listed('cpu-5500', 'AMD Ryzen 5 5500', 'procesadores', 120_000),
  listed('gpu-6600', 'Gigabyte RX 6600 Eagle 8GB', 'tarjetas-graficas', 300_000),
  listed('gpu-5050', 'GeForce RTX 5050 8GB Gigabyte', 'tarjetas-graficas', 200_000),
  listed('gpu-4060', 'MSI RTX 4060 Ventus 8GB', 'tarjetas-graficas', 480_000),
  listed('ram-16', 'Memoria Kingston 16GB DDR4 3200', 'memoria-ram', 50_000),
  listed('ram-kit-32', 'Kit Memoria 32GB DDR4 3200 2x16', 'memoria-ram', 90_000),
  listed('ssd-500', 'SSD NVMe 500GB', 'almacenamiento', 40_000),
  listed('ssd-1tb', 'SSD NVMe 1TB Gen4', 'almacenamiento', 80_000),
  listed('mb-b450', 'ASUS Prime B450M-A II', 'motherboards', 80_000),
  listed('mb-b650', 'Gigabyte B650 Eagle AX', 'motherboards', 200_000),
  listed('psu-550', 'Fuente 550W 80 Plus Bronze', 'fuentes-alimentacion', 50_000),
  listed('psu-650', 'Fuente 650W 80 Plus Gold', 'fuentes-alimentacion', 70_000),
  listed('case-mid', 'Gabinete Mid Tower Mesh', 'gabinetes', 40_000),
];

describe('buildBudgetFromCatalog', () => {
  it('no mezcla un Ryzen AM4 con una mother AM5', () => {
    const built = buildBudgetFromCatalog({
      budget: 1_000_000,
      products: starterCatalog,
    });

    expect(built.slots.cpu?.name).toMatch(/5600|5500/);
    expect(built.slots.motherboard?.name).toMatch(/B450/i);
    expect(built.slots.motherboard?.name).not.toMatch(/B650/i);
    expect(built.slots.ram?.name).toMatch(/DDR4/i);
  });

  it('elige la GPU de mayor tier que entra en el presupuesto, no la mas barata', () => {
    const built = buildBudgetFromCatalog({
      budget: 1_000_000,
      products: starterCatalog,
    });

    expect(built.slots.gpu?.name).toMatch(/4060/);
    expect(built.total).toBeLessThanOrEqual(1_000_000);
    expect(Object.values(built.slots).every((slot) => slot?.priceSource === 'catalog')).toBe(true);
  });

  it('acepta un kit de RAM y rechaza PCs armadas o SODIMM', () => {
    const built = buildBudgetFromCatalog({
      budget: 1_000_000,
      products: [
        ...starterCatalog.filter((item) => item.category !== 'memoria-ram'),
        listed('ram-sodimm', 'Memoria Kingston 16GB DDR4 3200 SODIMM', 'memoria-ram', 30_000),
        listed('pc-combo', 'PC Gamer Ryzen 5 5600 + RX 6600', 'procesadores', 10_000),
        listed('ram-kit', 'Kit Memoria 32GB DDR4 3200 2x16', 'memoria-ram', 88_000),
      ],
    });

    expect(built.slots.ram?.productId).toBe('ram-kit');
    expect(built.slots.cpu?.productId).not.toBe('pc-combo');
  });

  it('no arma una 4090 con una fuente de 650W', () => {
    const built = buildBudgetFromCatalog({
      budget: 3_000_000,
      products: [
        listed('cpu-7700', 'AMD Ryzen 7 7700X', 'procesadores', 400_000),
        listed('gpu-4090', 'ASUS RTX 4090 24GB', 'tarjetas-graficas', 1_200_000),
        listed('ram-32', 'Kit Memoria 32GB DDR5 6000', 'memoria-ram', 180_000),
        listed('ssd-2tb', 'SSD NVMe 2TB Gen4', 'almacenamiento', 150_000),
        listed('mb-b650', 'MSI B650 Tomahawk', 'motherboards', 280_000),
        listed('psu-650', 'Fuente 650W 80 Plus Gold', 'fuentes-alimentacion', 90_000),
        listed('case-mid', 'Gabinete Mid Tower Mesh', 'gabinetes', 80_000),
      ],
    });

    expect(built.slots.gpu?.name ?? '').not.toMatch(/4090/);
  });

  it('completa el armado AM5 cuando la fuente alcanza', () => {
    const built = buildBudgetFromCatalog({
      budget: 3_000_000,
      products: [
        listed('cpu-7700', 'AMD Ryzen 7 7700X', 'procesadores', 400_000),
        listed('gpu-4090', 'ASUS RTX 4090 24GB', 'tarjetas-graficas', 1_200_000),
        listed('ram-32', 'Kit Memoria 32GB DDR5 6000', 'memoria-ram', 180_000),
        listed('ssd-2tb', 'SSD NVMe 2TB Gen4', 'almacenamiento', 150_000),
        listed('mb-b650', 'MSI B650 Tomahawk', 'motherboards', 280_000),
        listed('psu-850', 'Fuente 850W 80 Plus Gold Modular', 'fuentes-alimentacion', 140_000),
        listed('case-mid', 'Gabinete Mid Tower Mesh', 'gabinetes', 80_000),
      ],
    });

    expect(built.slots.gpu?.name).toMatch(/4090/);
    expect(built.slots.psu?.name).toMatch(/850W/);
    expect(built.total).toBeLessThanOrEqual(3_000_000);
  });

  it('no recomienda una RX 580 aunque sea la GPU mas barata', () => {
    const built = buildBudgetFromCatalog({
      budget: 1_000_000,
      products: [
        ...starterCatalog.filter((item) => item.category !== 'tarjetas-graficas'),
        listed('gpu-580', 'Biostar Radeon RX 580 8GB GDDR5 2048SP', 'tarjetas-graficas', 150_000),
      ],
    });

    expect(built.slots.gpu?.name ?? '').not.toMatch(/580/);
  });

  it('no deja que un i3 gane a un Ryzen 5 cuando la GPU es la misma', () => {
    const built = buildBudgetFromCatalog({
      budget: 1_000_000,
      products: [
        ...starterCatalog,
        listed('cpu-i3', 'Procesador Core I3-14100F 3.5Ghz LGA 1700', 'procesadores', 140_000),
        listed('mb-h610', 'Mother MSI PRO H610M-S DDR4 1700', 'motherboards', 90_000),
      ],
    });

    expect(built.slots.cpu?.name).toMatch(/5600|5500/);
    expect(built.slots.cpu?.name).not.toMatch(/14100/);
  });

  it('no deja un Ryzen 3 de cuello de botella con una GPU de gama alta', () => {
    const built = buildBudgetFromCatalog({
      budget: 2_000_000,
      products: [
        listed('cpu-4100', 'AMD Ryzen 3 4100 AM4', 'procesadores', 95_000),
        listed('cpu-5600', 'AMD Ryzen 5 5600', 'procesadores', 150_000),
        listed('gpu-9070', 'Sapphire RX 9070XT PULSE 16GB', 'tarjetas-graficas', 1_650_000),
        listed('gpu-4060', 'MSI RTX 4060 Ventus 8GB', 'tarjetas-graficas', 480_000),
        listed('ram-16', 'Memoria Kingston 16GB DDR4 3200', 'memoria-ram', 50_000),
        listed('ssd-500', 'SSD NVMe 500GB', 'almacenamiento', 40_000),
        listed('mb-b450', 'ASUS Prime B450M-A II', 'motherboards', 80_000),
        listed('psu-650', 'Fuente 650W 80 Plus Gold', 'fuentes-alimentacion', 70_000),
        listed('case-mid', 'Gabinete Mid Tower Mesh', 'gabinetes', 40_000),
      ],
    });

    expect(built.slots.cpu?.name).toMatch(/5600/);
    expect(built.slots.gpu?.name).toMatch(/4060/);
    expect(built.slots.gpu?.name).not.toMatch(/9070/);
  });

  it('no elige un Ryzen 3000 si hay un 5600 compatible', () => {
    const built = buildBudgetFromCatalog({
      budget: 2_000_000,
      products: [
        listed('cpu-3500x', 'AMD Ryzen 5 3500X AM4', 'procesadores', 90_000),
        listed('cpu-5600', 'AMD Ryzen 5 5600', 'procesadores', 150_000),
        listed('gpu-5070', 'GeForce RTX 5070 12GB', 'tarjetas-graficas', 1_400_000),
        listed('gpu-4060', 'MSI RTX 4060 Ventus 8GB', 'tarjetas-graficas', 480_000),
        listed('ram-16', 'Memoria Kingston 16GB DDR4 3200', 'memoria-ram', 50_000),
        listed('ssd-500', 'SSD NVMe 500GB', 'almacenamiento', 40_000),
        listed('mb-b450', 'ASUS Prime B450M-A II', 'motherboards', 80_000),
        listed('psu-650', 'Fuente 650W 80 Plus Gold', 'fuentes-alimentacion', 70_000),
        listed('case-mid', 'Gabinete Mid Tower Mesh', 'gabinetes', 40_000),
      ],
    });

    expect(built.slots.cpu?.name).toMatch(/5600/);
    expect(built.slots.cpu?.name).not.toMatch(/3500/);
  });
});

describe('resolveLiveGuideSlots', () => {
  it('arma la guia de 1 millon con el catalogo y no cae al BOM editorial incompatible', () => {
    const guide = getBudgetGuideBySlug('pc-gamer-1-millon');
    if (!guide) throw new Error('missing guide');

    const resolved = resolveLiveGuideSlots(guide, starterCatalog);

    expect(resolved.cpu.priceSource).toBe('catalog');
    expect(resolved.gpu.name).toMatch(/4060/);
    expect(resolved.motherboard.name).toMatch(/B450/i);
    expect(resolved.hasEstimates).toBe(false);
    expect(resolved.catalogTotal).toBeLessThanOrEqual(guide.budget);
  });

  it('si el catálogo no alcanza, no estima una mother AM5 para un CPU AM4', () => {
    const guide = getBudgetGuideBySlug('pc-gamer-2-millones');
    if (!guide) throw new Error('missing guide');

    const resolved = resolveLiveGuideSlots(guide, [
      listed('cpu-5600', 'AMD Ryzen 5 5600', 'procesadores', 150_000),
      listed('gpu-6600', 'Gigabyte RX 6600 Eagle 8GB', 'tarjetas-graficas', 300_000),
      listed('ram-16', 'Memoria Kingston 16GB DDR4 3200', 'memoria-ram', 50_000),
      listed('ssd-500', 'SSD NVMe 500GB', 'almacenamiento', 40_000),
      listed('psu-550', 'Fuente 550W 80 Plus Bronze', 'fuentes-alimentacion', 50_000),
      listed('case-mid', 'Gabinete Mid Tower Mesh', 'gabinetes', 40_000),
    ]);

    expect(resolved.cpu.priceSource).toBe('catalog');
    expect(resolved.cpu.name).toMatch(/5600/);
    expect(resolved.motherboard.priceSource).toBe('estimate');
    expect(resolved.motherboard.name).not.toMatch(/B650|X670|B650E/i);
    expect(resolved.motherboard.name).toMatch(/AM4/i);
  });
});

describe('resolveCustomBudgetSlots', () => {
  it('arma un presupuesto libre con el catalogo y no usa el BOM de las guias', () => {
    const resolved = resolveCustomBudgetSlots(1_500_000, starterCatalog);

    expect(resolved.cpu.priceSource).toBe('catalog');
    expect(resolved.gpu.priceSource).toBe('catalog');
    expect(resolved.motherboard.name).toMatch(/B450/i);
    expect(resolved.motherboard.name).not.toMatch(/B650/i);
    expect(resolved.catalogTotal).toBeLessThanOrEqual(1_500_000);
  });

  it('deja slots vacios como sin stock, sin copiar una mother editorial AM5', () => {
    const resolved = resolveCustomBudgetSlots(1_200_000, [
      listed('cpu-5600', 'AMD Ryzen 5 5600', 'procesadores', 150_000),
      listed('gpu-6600', 'Gigabyte RX 6600 Eagle 8GB', 'tarjetas-graficas', 300_000),
      listed('ram-16', 'Memoria Kingston 16GB DDR4 3200', 'memoria-ram', 50_000),
      listed('ssd-500', 'SSD NVMe 500GB', 'almacenamiento', 40_000),
      listed('psu-550', 'Fuente 550W 80 Plus Bronze', 'fuentes-alimentacion', 50_000),
      listed('case-mid', 'Gabinete Mid Tower Mesh', 'gabinetes', 40_000),
    ]);

    expect(resolved.motherboard.priceSource).toBe('estimate');
    expect(resolved.motherboard.price).toBe(0);
    expect(resolved.motherboard.name).toMatch(/AM4/i);
    expect(resolved.motherboard.name).not.toMatch(/B650/i);
  });
});
