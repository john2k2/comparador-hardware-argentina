import { describe, expect, it } from 'vitest';
import type { HardwareCategory, Product, ProductPrice } from '@/lib/types';
import { buildBudgetFromCatalog, resolveCustomBudgetSlots, resolveLiveGuideSlots } from '@/lib/seo/budget-builder';
import { getBudgetGuideBySlug } from '@/lib/seo/budget-guides-data';

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

function reviewedGuideCatalog(gpuPrice: number): Product[] {
  // Selección 2M del 09/10 como fixture contractual; no acredita precios actuales.
  return [
    listed('cpu', 'Procesador AMD Ryzen 7 5700 AM4 con cooler', 'procesadores', 294_245),
    listed('gpu', 'Placa de Video Asrock Radeon RX 9060 XT 16GB GDDR6 Challenger OC', 'tarjetas-graficas', gpuPrice),
    listed('ram', 'Memoria Mancer DDR4 16GB 3200MHz Vant S Black CL19', 'memoria-ram', 191_250),
    listed('ssd', 'SSD Kingston 1TB NV3 NVMe Gen4', 'almacenamiento', 277_869),
    listed('mother', 'Mother Asrock B550M-HDV DDR4 AM4', 'motherboards', 124_966),
    listed('psu', 'Fuente Asrock 750W 80 Plus Gold Steel Legend Full Modular ATX 3.1 PCIe 5.1 Cybenetics Platinum', 'fuentes-alimentacion', 130_850),
    listed('case', 'Gabinete Antec VX310 RGB Black 4x120mm Vidrio Templado', 'gabinetes', 59_990),
  ];
}

// Importes del corte editorial como fixture; no prueban stock ni precios actuales.
function entryGuideCatalog(): Product[] {
  const components: [string, string, HardwareCategory, number, number][] = [
    ['cpu', 'Procesador AMD Ryzen 5 5500 4.2GHz Turbo AM4 + Wraith Stealth Cooler', 'procesadores', 159_450, 13359],
    ['gpu', 'Placa de Video Asrock Intel ARC A380 6GB GDDR6 Challenger ITX OC', 'tarjetas-graficas', 266_691, 19298],
    ['ram', 'Memoria Mancer DDR4 16GB 3200MHz Vant S Black CL19', 'memoria-ram', 191_850, 21515],
    ['ssd', 'Disco Solido SSD Adata 512GB SU650SS SATA 520MB/s', 'almacenamiento', 120_650, 17143],
    ['mother', 'Mother Asrock B550M-HDV DDR4 AM4', 'motherboards', 121_050, 10535],
    ['psu', 'Fuente Antec 650W 80 Plus Bronze ATX 3.1 PCIe 5.1 CSK650DC AR', 'fuentes-alimentacion', 74_252, 18257],
    ['case', 'Gabinete Antec VX310 RGB Black 4x120mm Vidrio Templado', 'gabinetes', 60_360, 18607],
  ];
  return components.map(([id, name, category, amount, sourceId]) => {
    const slug = name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return product({ id: `agrupado-${id}`, name, category,
      prices: [price({ storeId: 'compragamer', storeName: 'CompraGamer', price: amount,
        url: `https://compragamer.com/producto/${slug}_${sourceId}` })],
    });
  });
}

// Corte editorial reproducible; la fixture no demuestra disponibilidad presente.
function expandedGuideCatalog(gpuPrice = 956_600): Product[] {
  const components: [string, string, HardwareCategory, number, number][] = [
    ['cpu', 'Procesador AMD Ryzen 5 7600 5.1GHz Turbo AM5 + Wraith Stealth Cooler', 'procesadores', 355_850, 14309],
    ['gpu', 'Placa de Video Asrock Radeon RX 9060 XT 16GB GDDR6 Challenger OC', 'tarjetas-graficas', gpuPrice, 17960],
    ['ram', 'Memoria Patriot DDR5 32GB (2x16GB) 6000MHz Viper Venom CL36 XMP 3.0/AMD EXPO', 'memoria-ram', 859_100, 17061],
    ['ssd', 'Disco Solido SSD M.2 Kingston 1TB NV3 6000MB/s NVMe PCI-E Gen4 x4', 'almacenamiento', 291_850, 16872],
    ['mother', 'Mother MSI B650M GAMING WIFI AM5 DDR5', 'motherboards', 212_050, 17076],
    ['psu', 'Fuente Asrock 750W 80 Plus Gold Steel Legend Full Modular ATX 3.1 PCIe 5.1 Cybenetics Platinum', 'fuentes-alimentacion', 131_250, 18173],
    ['case', 'Gabinete Antec VX310 RGB Black 4x120mm Vidrio Templado', 'gabinetes', 60_360, 18607],
  ];
  return components.map(([id, name, category, amount, sourceId]) => {
    const slug = name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return product({ id: `expanded-${id}`, name, category,
      prices: [price({ storeId: 'compragamer', storeName: 'CompraGamer', price: amount,
        url: `https://compragamer.com/producto/${slug}_${sourceId}` })],
    });
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
  it('puede priorizar una PC completa sobre una CPU de generación más reciente', () => {
    const products = [
      listed('older-cpu', 'AMD Ryzen 5 3600', 'procesadores', 100000),
      listed('current-cpu', 'AMD Ryzen 7 5700X3D', 'procesadores', 400000),
      ...starterCatalog.filter((item) => item.category !== 'procesadores'),
    ];
    const built = buildBudgetFromCatalog({ budget: 650000, products, preferComplete: true });
    expect(built.slots.cpu?.productId).toBe('older-cpu');
    expect(Object.keys(built.slots)).toHaveLength(7);
    expect(built.total).toBeLessThanOrEqual(650000);
  });

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
  it('respeta las piezas de la guía aunque exista una alternativa comprable fuera de la selección', () => {
    const guide = getBudgetGuideBySlug('pc-gamer-1-millon');
    if (!guide) throw new Error('missing guide');

    const resolved = resolveLiveGuideSlots(guide, [...entryGuideCatalog(), ...starterCatalog]);

    expect(resolved.cpu.priceSource).toBe('catalog');
    expect(resolved.gpu.priceSource).toBe('catalog');
    expect(resolved.gpu.name).toMatch(/A380/);
    expect(resolved.gpu.name).not.toMatch(/4060|RX 6600/);
    expect(resolved.motherboard.name).toMatch(/B550M-HDV/i);
    expect(resolved.inStockSlots).toBe(7);
    expect(resolved.hasEstimates).toBe(false);
    expect(resolved.catalogTotal).toBe(994_303);
    expect(resolved.catalogTotal).toBeLessThanOrEqual(guide.budget);
    expect(resolved.fitsBudget).toBe(true);
  });

  it('no completa la guía de un millón con ofertas vencidas o un CPU sin cooler publicado', () => {
    const guide = getBudgetGuideBySlug('pc-gamer-1-millon')!;
    const catalog = entryGuideCatalog();
    catalog[0].name = 'Procesador AMD Ryzen 5 5500 AM4';
    catalog[1].prices[0].lastUpdated = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const resolved = resolveLiveGuideSlots(guide, catalog);
    expect(resolved.cpu.priceSource).toBe('estimate');
    expect(resolved.gpu.priceSource).toBe('estimate');
    expect(resolved.inStockSlots).toBe(5);
  });

  it.each([
    { gpuPrice: 372_388, total: 1_100_000, fitsBudget: true },
    { gpuPrice: 372_389, total: 1_100_001, fitsBudget: false },
  ])('trata un millón como techo editorial de $total', ({ gpuPrice, total, fitsBudget }) => {
    const guide = getBudgetGuideBySlug('pc-gamer-1-millon')!;
    const catalog = entryGuideCatalog();
    catalog[1].prices[0].price = gpuPrice;
    const resolved = resolveLiveGuideSlots(guide, catalog);
    expect(resolved.inStockSlots).toBe(7);
    expect(resolved.catalogTotal).toBe(total);
    expect(resolved.fitsBudget).toBe(fitsBudget);
  });

  it('no presenta un CPU AM4 como reemplazo de un Ryzen AM5 especificado', () => {
    const guide = getBudgetGuideBySlug('pc-gamer-3-millones');
    if (!guide) throw new Error('missing guide');

    const resolved = resolveLiveGuideSlots(guide, [
      listed('cpu-5600', 'AMD Ryzen 5 5600', 'procesadores', 150_000),
      listed('gpu-6600', 'Gigabyte RX 6600 Eagle 8GB', 'tarjetas-graficas', 300_000),
      listed('ram-16', 'Memoria Kingston 16GB DDR4 3200', 'memoria-ram', 50_000),
      listed('ssd-500', 'SSD NVMe 500GB', 'almacenamiento', 40_000),
      listed('psu-550', 'Fuente 550W 80 Plus Bronze', 'fuentes-alimentacion', 50_000),
      listed('case-mid', 'Gabinete Mid Tower Mesh', 'gabinetes', 40_000),
    ]);

    expect(resolved.cpu.priceSource).toBe('estimate');
    expect(resolved.cpu.name).toMatch(/7600/);
    expect(resolved.motherboard.priceSource).toBe('estimate');
    expect(resolved.motherboard.name).toMatch(/B650/i);
  });

  it('resuelve la guía de tres millones con siete piezas, cooler incluido y sin estimaciones', () => {
    const guide = getBudgetGuideBySlug('pc-gamer-3-millones')!;
    const resolved = resolveLiveGuideSlots(guide, expandedGuideCatalog());
    expect(resolved.inStockSlots).toBe(7);
    expect(resolved.hasEstimates).toBe(false);
    expect(resolved.catalogTotal).toBe(2_867_060);
    expect(resolved.fitsBudget).toBe(true);
    expect(resolved.cpu.name).toMatch(/Wraith Stealth/);
    expect(resolved.ram.name).toContain('2x16GB');
    expect(resolved.gpu.name).toContain('16GB');
  });

  it.each([
    { gpuPrice: 1_089_540, total: 3_000_000, fitsBudget: true },
    { gpuPrice: 1_389_540, total: 3_300_000, fitsBudget: true },
    { gpuPrice: 1_389_541, total: 3_300_001, fitsBudget: false },
  ])('trata tres millones como techo editorial para $total', ({ gpuPrice, total, fitsBudget }) => {
    const guide = getBudgetGuideBySlug('pc-gamer-3-millones')!;
    const resolved = resolveLiveGuideSlots(guide, expandedGuideCatalog(gpuPrice));
    expect(resolved.inStockSlots).toBe(7);
    expect(resolved.catalogTotal).toBe(total);
    expect(resolved.fitsBudget).toBe(fitsBudget);
  });

  it.each(['AMD Ryzen 5 7600X', 'AMD Ryzen 5 7600 AM5 sin cooler', 'AMD Ryzen 7 7700X'])('rechaza %s como reemplazo del CPU con cooler de tres millones', (name) => {
    const guide = getBudgetGuideBySlug('pc-gamer-3-millones')!;
    const resolved = resolveLiveGuideSlots(guide, [listed('other-cpu', name, 'procesadores', 300_000)]);
    expect(resolved.cpu.priceSource).toBe('estimate');
    expect(resolved.catalogTotal).toBe(0);
  });

  it('no usa una GPU de 8 GB aunque su título normalizado anuncie los 16 GB de la guía', () => {
    const guide = getBudgetGuideBySlug('pc-gamer-3-millones')!;
    const catalog = expandedGuideCatalog();
    catalog[1].name = 'Placa de Video Asrock Radeon RX 9060 XT 8GB GDDR6 Challenger OC';
    catalog[1].normalizedTitle = guide.components.gpu.name;
    const resolved = resolveLiveGuideSlots(guide, catalog);
    expect(resolved.gpu.priceSource).toBe('estimate');
    expect(resolved.inStockSlots).toBe(6);
  });

  it.each(['out-of-stock', 'expired'] as const)('no publica siete ofertas cuando una pieza está %s', (condition) => {
    const guide = getBudgetGuideBySlug('pc-gamer-3-millones')!;
    const catalog = expandedGuideCatalog();
    if (condition === 'out-of-stock') catalog[2].prices[0].stock = 'out-of-stock';
    else catalog[2].prices[0].lastUpdated = new Date(Date.now() - 3 * 60 * 60 * 1000 - 1000);
    const resolved = resolveLiveGuideSlots(guide, catalog);
    expect(resolved.inStockSlots).toBe(6);
    expect(resolved.hasEstimates).toBe(true);
  });

  it('resuelve el presupuesto revisado dentro de dos millones con cooler y siete piezas compatibles', () => {
    const guide = getBudgetGuideBySlug('pc-gamer-2-millones')!;
    const catalog = reviewedGuideCatalog(900_000);
    const resolved = resolveLiveGuideSlots(guide, catalog);
    expect(resolved.inStockSlots).toBe(7);
    expect(resolved.hasEstimates).toBe(false);
    expect(resolved.catalogTotal).toBe(1_979_170);
    expect(resolved.catalogTotal).toBeLessThan(guide.budget);
    expect(resolved.fitsBudget).toBe(true);
    expect(resolved.cpu.name).toMatch(/5700.*cooler/i);
    expect(resolved.motherboard.name).toContain('B550M-HDV');
    expect(resolved.ram.name).toContain('DDR4');
    expect(resolved.gpu.name).toContain('16GB');
  });

  it.each([
    { gpuPrice: 520_830, total: 1_600_000, fitsBudget: true },
    { gpuPrice: 920_830, total: 2_000_000, fitsBudget: true },
    { gpuPrice: 1_120_830, total: 2_200_000, fitsBudget: true },
    { gpuPrice: 1_120_831, total: 2_200_001, fitsBudget: false },
  ])('trata dos millones como techo editorial para $total', ({ gpuPrice, total, fitsBudget }) => {
    const guide = getBudgetGuideBySlug('pc-gamer-2-millones')!;
    const resolved = resolveLiveGuideSlots(guide, reviewedGuideCatalog(gpuPrice));

    expect(resolved.inStockSlots).toBe(7);
    expect(resolved.catalogTotal).toBe(total);
    expect(resolved.fitsBudget).toBe(fitsBudget);
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
