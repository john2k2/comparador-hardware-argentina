import { describe, expect, it } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { checkBuildCompatibility } from './compatibility';
import { emptyBuild, type BuildDraft } from './types';
import { candidatesForSlot, quoteBuild } from './model';

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name' | 'category'>): Product {
  const prices = overrides.prices ?? [];
  const lowest = prices.length ? Math.min(...prices.map((price) => price.price)) : 0;
  return {
    brand: 'Test',
    model: overrides.name,
    specs: {},
    prices,
    lowestPrice: lowest,
    highestPrice: lowest,
    averagePrice: lowest,
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    updatedAt: new Date('2026-09-21T12:00:00.000Z'),
    ...overrides,
  };
}

function price(overrides: Partial<ProductPrice> & Pick<ProductPrice, 'storeId' | 'storeName' | 'price'>): ProductPrice {
  return {
    url: `https://store.example/${overrides.storeId}`,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date('2026-09-21T10:00:00.000Z'),
    ...overrides,
  };
}

function draftWithSelections(selections: BuildDraft['selections'], payment: BuildDraft['payment'] = 'cash'): BuildDraft {
  return { ...emptyBuild(2_000_000), payment, selections, shipping: {} };
}

describe('checkBuildCompatibility', () => {
  it('no cotiza ventiladores como gabinete ni packs de ventiladores como disipador', () => {
    const offers = [price({ storeId: 'store', storeName: 'Store', price: 50_000 })];
    const products = [
      product({ id: 'fan-case', name: 'Cooler Gabinete Sentey Fan 120Mm Bulk', category: 'gabinetes', prices: offers }),
      product({ id: 'case', name: 'Gabinete Sentey Coyote Black - Fan x3 Argb', category: 'gabinetes', prices: offers }),
      product({ id: 'coolermaster-case', name: 'Cooler Master Masterbox Gabinete ATX', category: 'gabinetes', prices: offers }),
      product({ id: 'fan-pack', name: 'Cooler Corsair Rx120 Max Rgb 120Mm Pack X3 Icue Link Black', category: 'refrigeracion', prices: offers }),
      product({ id: 'aio', name: 'Water Cooler Corsair Icue Link Titan 240 Rx RGB AIO', category: 'refrigeracion', prices: offers }),
    ];
    expect(candidatesForSlot(products, 'case').map((item) => item.id)).toEqual(['case', 'coolermaster-case']);
    expect(candidatesForSlot(products, 'cooler').map((item) => item.id)).toEqual(['aio']);
    const quote = quoteBuild(draftWithSelections({ case: { productId: 'fan-case', storeId: 'store', url: offers[0].url, quantity: 1 } }), products);
    expect(quote.lines[0].subtotal).toBeNull();
    expect(quote.issues.some((issue) => issue.code === 'missing-case')).toBe(true);
  });

  it('excludes miscategorized CPUs from coolers and external disks from internal storage', () => {
    const offers = [price({ storeId: 'store', storeName: 'Store', price: 100000 })];
    const products = [
      product({ id: 'cpu-as-cooler', name: 'Micro Intel I5-14400F 4.7Ghz 20Mb S.1700 - Tray Sin Cooler', category: 'refrigeracion', prices: offers }),
      product({ id: 'external', name: 'Disco SSD Externo Sandisk Portable 1TB USB-C', category: 'almacenamiento', prices: offers }),
      product({ id: 'cooler', name: 'CPU Cooler Cooler Master DT621', category: 'refrigeracion', prices: offers }),
    ];
    expect(candidatesForSlot(products, 'cooler').map((item) => item.id)).toEqual(['cooler']);
    expect(candidatesForSlot(products, 'ssd')).toEqual([]);
  });

  it('excludes cooling accessories mislabeled as processors while preserving a CPU sold with its cooler', () => {
    const products = [
      product({ id: 'thermal-pad', name: 'Carbice Thermal Pad 1mm', category: 'procesadores', prices: [price({ storeId: 'store', storeName: 'Store', price: 4_000, url: 'https://store.example/carbice-thermal-pad' })] }),
      product({ id: 'heatsink', name: 'DELL HEATSINK FOR 1 CPU', category: 'procesadores', prices: [price({ storeId: 'store', storeName: 'Store', price: 8_000, url: 'https://store.example/dell-heatsink' })] }),
      product({ id: 'paste', name: 'Pasta térmica Arctic MX-6', category: 'procesadores', prices: [price({ storeId: 'store', storeName: 'Store', price: 5_000, url: 'https://store.example/pasta-termica' })] }),
      product({ id: 'liquid', name: 'Refrigeración líquida 240mm', category: 'procesadores', prices: [price({ storeId: 'store', storeName: 'Store', price: 60_000, url: 'https://store.example/refrigeracion-liquida' })] }),
      product({ id: 'cpu', name: 'AMD Ryzen 5 5600 CON COOLER', category: 'procesadores', prices: [price({ storeId: 'store', storeName: 'Store', price: 100_000, url: 'https://store.example/ryzen-5-5600-con-cooler' })] }),
    ];

    expect(candidatesForSlot(products, 'cpu').map((item) => item.id)).toEqual(['cpu']);

    const cpu = products.find((item) => item.id === 'cpu');
    const quote = quoteBuild(draftWithSelections({
      cpu: { productId: 'cpu', storeId: 'store', url: 'https://store.example/ryzen-5-5600-con-cooler', quantity: 1 },
    }), products);
    expect(quote.lines[0]).toMatchObject({ product: cpu, unitPrice: 100_000, subtotal: 100_000 });
  });

  it('requires a separate cooler when the CPU explicitly excludes it', () => {
    const issues = checkBuildCompatibility({ cpu: product({ id: 'cpu', name: 'Ryzen 5 5600 sin cooler', category: 'procesadores', specs: { 'cooler incluido': 'No' } }) }, emptyBuild());
    expect(issues).toContainEqual(expect.objectContaining({ code: 'cooler-required', severity: 'error' }));
  });

  it('respects a selected CPU offer without a cooler over the grouped title', () => {
    const cpu = product({ id: 'cpu', name: 'Ryzen 5 5600 CON COOLER', category: 'procesadores', prices: [price({ storeId: 'store', storeName: 'Store', price: 100000, url: 'https://store.example/ryzen-5-5600-s-cooler' })] });
    const issues = checkBuildCompatibility({ cpu }, emptyBuild());
    expect(issues).toContainEqual(expect.objectContaining({ code: 'cooler-required', severity: 'error' }));
  });

  it('does not mistake micro-ATX support for full ATX support', () => {
    const issues = checkBuildCompatibility({
      motherboard: product({ id: 'board', name: 'Motherboard ATX', category: 'motherboards', specs: { formato: 'ATX' } }),
      case: product({ id: 'case', name: 'Gabinete compacto', category: 'gabinetes', specs: { 'formatos soportados': 'Micro-ATX, Mini-ITX' } }),
    }, emptyBuild());
    expect(issues).toContainEqual(expect.objectContaining({ code: 'case-board', severity: 'error' }));
  });

  it('reports an error when an AM4 CPU is paired with an AM5 motherboard', () => {
    const issues = checkBuildCompatibility({
      cpu: product({ id: 'cpu', name: 'AMD Ryzen 5 5600 AM4', category: 'procesadores' }),
      motherboard: product({ id: 'board', name: 'Motherboard B650 AM5', category: 'motherboards' }),
    }, emptyBuild());

    expect(issues).toContainEqual(expect.objectContaining({ code: 'socket', severity: 'error' }));
  });

  it('reports an error when DDR4 memory is paired with a DDR5 motherboard', () => {
    const issues = checkBuildCompatibility({
      motherboard: product({ id: 'board', name: 'Motherboard AM5 DDR5', category: 'motherboards' }),
      ram: product({ id: 'ram', name: 'Kit 32GB DDR4 3200', category: 'memoria-ram' }),
    }, emptyBuild());

    expect(issues).toContainEqual(expect.objectContaining({ code: 'ram-generation', severity: 'error' }));
  });

  it('warns about unknown RAM generation for an LGA1700 board without assuming DDR5', () => {
    const issues = checkBuildCompatibility({
      cpu: product({ id: 'cpu', name: 'Intel Core i5-12400F LGA1700', category: 'procesadores' }),
      motherboard: product({ id: 'board', name: 'Motherboard LGA1700', category: 'motherboards' }),
      ram: product({ id: 'ram', name: 'Memoria 16GB', category: 'memoria-ram' }),
    }, emptyBuild());

    expect(issues).toContainEqual(expect.objectContaining({ code: 'ram-generation-unknown', severity: 'warning' }));
    expect(issues).not.toContainEqual(expect.objectContaining({ code: 'ram-generation', severity: 'error' }));
  });

  it('rejects more RAM modules than the motherboard slots allow', () => {
    const draft = emptyBuild();
    draft.selections.ram = { productId: 'ram', storeId: 'store', url: 'https://store.example/ram', quantity: 2 };
    const issues = checkBuildCompatibility({
      motherboard: product({ id: 'board', name: 'Motherboard AM4 DDR4', category: 'motherboards', specs: { 'slots de memoria': '2' } }),
      ram: product({ id: 'ram', name: 'Kit 2x16GB DDR4', category: 'memoria-ram', specs: { módulos: '2' } }),
    }, draft);

    expect(issues).toContainEqual(expect.objectContaining({ code: 'ram-slots', severity: 'error' }));
  });

  it('reports a PSU below the GPU declared reference', () => {
    const issues = checkBuildCompatibility({
      cpu: product({ id: 'cpu', name: 'AMD Ryzen 5 5600', category: 'procesadores' }),
      gpu: product({ id: 'gpu', name: 'RTX 4070', category: 'tarjetas-graficas', specs: { 'fuente recomendada': '750W' } }),
      psu: product({ id: 'psu', name: 'Fuente 650W 80 Plus', category: 'fuentes-alimentacion' }),
    }, emptyBuild());

    expect(issues).toContainEqual(expect.objectContaining({ code: 'psu-power', severity: 'error' }));
  });

  it('reports a GPU longer than the case allowance', () => {
    const issues = checkBuildCompatibility({
      motherboard: product({ id: 'board', name: 'Motherboard ATX', category: 'motherboards', specs: { formato: 'ATX' } }),
      gpu: product({ id: 'gpu', name: 'RTX 4070', category: 'tarjetas-graficas', specs: { largo: '330 mm' } }),
      case: product({ id: 'case', name: 'Gabinete ATX', category: 'gabinetes', specs: { 'largo máximo GPU': '300 mm', 'motherboards compatibles': 'ATX' } }),
    }, emptyBuild());

    expect(issues).toContainEqual(expect.objectContaining({ code: 'gpu-length', severity: 'error' }));
  });

  it('requires a GPU when the CPU has no confirmed integrated graphics', () => {
    const issues = checkBuildCompatibility({
      cpu: product({ id: 'cpu', name: 'AMD Ryzen 5 5600', category: 'procesadores', specs: { 'gráficos integrados': 'no' } }),
    }, emptyBuild());

    expect(issues).toContainEqual(expect.objectContaining({ code: 'graphics', severity: 'error' }));
  });

  it('warns when a CPU has no confirmed included cooler', () => {
    const issues = checkBuildCompatibility({
      cpu: product({ id: 'cpu', name: 'AMD Ryzen 5 5600', category: 'procesadores' }),
    }, emptyBuild());

    expect(issues).toContainEqual(expect.objectContaining({ code: 'cooler-required', severity: 'warning' }));
  });
});

describe('quoteBuild', () => {
  it('does not quote a saved draft whose processor is a cooling accessory', () => {
    const paste = product({
      id: 'paste',
      name: 'Pasta térmica Arctic MX-6',
      category: 'procesadores',
      prices: [price({ storeId: 'store', storeName: 'Store', price: 5_000, url: 'https://store.example/pasta-termica' })],
    });
    const quote = quoteBuild(draftWithSelections({
      cpu: { productId: 'paste', storeId: 'store', url: 'https://store.example/pasta-termica', quantity: 1 },
    }), [paste]);

    expect(quote.lines[0]).toMatchObject({ unitPrice: null, subtotal: null });
    expect(quote.subtotal).toBe(0);
    expect(quote.unquoted).toBe(1);
  });

  it('excludes GPU variant conflicts from candidates and saved-draft totals', () => {
    const gpuTi = product({
      id: 'gpu-ti',
      name: 'GeForce RTX 4060 Ti 8GB',
      category: 'tarjetas-graficas',
      prices: [price({ storeId: 'store', storeName: 'Store', price: 400_000, url: 'https://store.example/geforce-rtx-4060-8gb' })],
    });
    const gpuMemory = product({
      id: 'gpu-memory',
      name: 'GeForce RTX 4060 16GB',
      category: 'tarjetas-graficas',
      prices: [price({ storeId: 'store', storeName: 'Store', price: 450_000, url: 'https://store.example/geforce-rtx-4060-8gb' })],
    });
    const products = [gpuTi, gpuMemory];

    expect(candidatesForSlot(products, 'gpu')).toEqual([]);

    const quote = quoteBuild(draftWithSelections({
      gpu: { productId: 'gpu-memory', storeId: 'store', url: 'https://store.example/geforce-rtx-4060-8gb', quantity: 1 },
    }), products);
    expect(quote.lines[0]).toMatchObject({ unitPrice: null, subtotal: null });
    expect(quote.subtotal).toBe(0);
    expect(quote.unquoted).toBe(1);
  });

  it('keeps a build partial until CPU cooling is selected or explicitly included', () => {
    const definitions = [
      ['cpu', 'AMD Ryzen 5 5600G', 'procesadores'], ['motherboard', 'Motherboard A520 AM4 DDR4', 'motherboards'],
      ['ram', 'Memoria 16GB DDR4', 'memoria-ram'], ['ssd', 'SSD 1TB', 'almacenamiento'],
      ['psu', 'Fuente 650W', 'fuentes-alimentacion'], ['case', 'Gabinete ATX', 'gabinetes'],
    ] as const;
    const products = definitions.map(([id, name, category]) => product({ id, name, category, prices: [price({ storeId: 'store', storeName: 'Store', price: 100000, url: `https://store.example/${id}` })] }));
    const draft = emptyBuild();
    for (const [slot] of definitions) draft.selections[slot] = { productId: slot, storeId: 'store', url: `https://store.example/${slot}`, quantity: 1 };
    expect(quoteBuild(draft, products).complete).toBe(false);
    products[0].specs['cooler incluido'] = 'Sí';
    expect(quoteBuild(draft, products).complete).toBe(true);
  });

  it('sums quantities and charges shipping once per store', () => {
    const cpu = product({ id: 'cpu', name: 'AMD Ryzen 5 5600', category: 'procesadores', prices: [price({ storeId: 'store', storeName: 'Store', price: 100_000, url: 'https://store.example/cpu' })] });
    const ram = product({ id: 'ram', name: 'Kit 2x16GB DDR4', category: 'memoria-ram', prices: [price({ storeId: 'store', storeName: 'Store', price: 40_000, url: 'https://store.example/ram' })] });
    const draft = draftWithSelections({
      cpu: { productId: 'cpu', storeId: 'store', url: 'https://store.example/cpu', quantity: 1 },
      ram: { productId: 'ram', storeId: 'store', url: 'https://store.example/ram', quantity: 2 },
    });
    draft.shipping.store = 10_000;

    const quote = quoteBuild(draft, [cpu, ram]);

    expect(quote.subtotal).toBe(180_000);
    expect(quote.shipping).toBe(10_000);
    expect(quote.total).toBe(190_000);
    expect(quote.storeIds).toEqual(['store']);
  });

  it('does not count pending or out-of-stock offers', () => {
    const pending = product({ id: 'pending', name: 'CPU pendiente', category: 'procesadores', prices: [price({ storeId: 'store-a', storeName: 'A', price: 100_000, identityReview: { version: 1, status: 'needs-review', reason: 'low-confidence', reviewedAt: null, model: null, confidence: null, subject: { name: '', category: '', url: '' } } })] });
    const unavailable = product({ id: 'unavailable', name: 'Motherboard agotada', category: 'motherboards', prices: [price({ storeId: 'store-b', storeName: 'B', price: 200_000, stock: 'out-of-stock', url: 'https://store.example/board' })] });
    const quote = quoteBuild(draftWithSelections({
      cpu: { productId: 'pending', storeId: 'store-a', url: 'https://store.example/store-a', quantity: 1 },
      motherboard: { productId: 'unavailable', storeId: 'store-b', url: 'https://store.example/board', quantity: 1 },
    }), [pending, unavailable]);

    expect(quote.subtotal).toBe(0);
    expect(quote.unquoted).toBe(2);
    expect(quote.lines.every((line) => line.unitPrice === null)).toBe(true);
  });

  it('does not substitute cash when installments are requested but absent', () => {
    const cpu = product({ id: 'cpu', name: 'AMD Ryzen 5 5600', category: 'procesadores', prices: [price({ storeId: 'store', storeName: 'Store', price: 100_000, url: 'https://store.example/cpu' })] });
    const quote = quoteBuild(draftWithSelections({
      cpu: { productId: 'cpu', storeId: 'store', url: 'https://store.example/cpu', quantity: 1 },
    }, 'installments'), [cpu]);

    expect(quote.lines[0].unitPrice).toBeNull();
    expect(quote.subtotal).toBe(0);
    expect(quote.issues).toContainEqual(expect.objectContaining({ code: 'offer-cpu', severity: 'error' }));
  });

  it('warns about an old offer without renewing its source date', () => {
    const oldDate = new Date('2026-09-01T10:00:00.000Z');
    const cpu = product({ id: 'cpu', name: 'AMD Ryzen 5 5600', category: 'procesadores', prices: [price({ storeId: 'store', storeName: 'Store', price: 100_000, url: 'https://store.example/cpu', lastUpdated: oldDate })] });
    const quote = quoteBuild(draftWithSelections({
      cpu: { productId: 'cpu', storeId: 'store', url: 'https://store.example/cpu', quantity: 1 },
    }), [cpu], Date.parse('2026-09-21T12:00:00.000Z'));

    expect(quote.lines[0].offer?.lastUpdated).toBe(oldDate);
    expect(quote.issues).toContainEqual(expect.objectContaining({ code: 'stale-cpu', severity: 'warning' }));
  });
});
