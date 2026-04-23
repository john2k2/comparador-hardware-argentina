import type { HardwareCategory, Product, ProductPrice } from '@/lib/types';
import type { SortBy } from '@/lib/search/search-handler-shared';

function createPrice(
  storeId: string,
  storeName: string,
  price: number,
  path: string,
): ProductPrice {
  const now = new Date('2026-04-22T12:00:00.000Z');
  return {
    storeId,
    storeName,
    url: `https://www.comparador-hardware.com.ar${path}`,
    price,
    stock: 'in-stock',
    installment: null,
    lastUpdated: now,
  };
}

function createProduct(input: {
  id: string;
  name: string;
  category: HardwareCategory;
  brand: string;
  model: string;
  description: string;
  prices: ProductPrice[];
  specs: Record<string, string>;
}): Product {
  const now = new Date('2026-04-22T12:00:00.000Z');
  const priceValues = input.prices.map((entry) => entry.price);

  return {
    id: input.id,
    name: input.name,
    category: input.category,
    brand: input.brand,
    model: input.model,
    description: input.description,
    specs: input.specs,
    prices: input.prices,
    lowestPrice: Math.min(...priceValues),
    highestPrice: Math.max(...priceValues),
    averagePrice: Math.round(priceValues.reduce((sum, value) => sum + value, 0) / priceValues.length),
    createdAt: now,
    updatedAt: now,
  };
}

const STABLE_PRODUCTS: Product[] = [
  createProduct({
    id: 'fixture-ryzen-5600',
    name: 'AMD Ryzen 5 5600 6-Core 12-Thread AM4',
    category: 'procesadores',
    brand: 'AMD',
    model: 'Ryzen 5 5600',
    description: 'Procesador de referencia para modo estable E2E.',
    prices: [
      createPrice('mexx', 'Mexx', 185000, '/product/fixture-ryzen-5600'),
      createPrice('venex', 'Venex', 189999, '/product/fixture-ryzen-5600'),
    ],
    specs: {
      nucleos: '6',
      hilos: '12',
      socket: 'AM4',
    },
  }),
  createProduct({
    id: 'fixture-ryzen-5700x',
    name: 'AMD Ryzen 7 5700X 8-Core AM4',
    category: 'procesadores',
    brand: 'AMD',
    model: 'Ryzen 7 5700X',
    description: 'Fixture estable para búsquedas Ryzen.',
    prices: [
      createPrice('fullh4rd', 'FullH4rd', 249999, '/product/fixture-ryzen-5700x'),
      createPrice('compragamer', 'CompraGamer', 255000, '/product/fixture-ryzen-5700x'),
    ],
    specs: {
      nucleos: '8',
      hilos: '16',
      socket: 'AM4',
    },
  }),
  createProduct({
    id: 'fixture-rtx-4060',
    name: 'NVIDIA GeForce RTX 4060 8GB GDDR6',
    category: 'tarjetas-graficas',
    brand: 'NVIDIA',
    model: 'RTX 4060',
    description: 'Fixture estable para búsquedas de GPUs.',
    prices: [
      createPrice('maximus', 'Maximus', 499999, '/product/fixture-rtx-4060'),
      createPrice('gezatek', 'Gezatek', 512000, '/product/fixture-rtx-4060'),
    ],
    specs: {
      memoria: '8GB GDDR6',
      chipset: 'RTX 4060',
    },
  }),
  createProduct({
    id: 'fixture-b650m',
    name: 'Motherboard B650M DDR5 AM5',
    category: 'motherboards',
    brand: 'Gigabyte',
    model: 'B650M',
    description: 'Fixture estable para categoría motherboards.',
    prices: [
      createPrice('mexx', 'Mexx', 229999, '/product/fixture-b650m'),
      createPrice('venex', 'Venex', 239999, '/product/fixture-b650m'),
    ],
    specs: {
      socket: 'AM5',
      memoria: 'DDR5',
    },
  }),
  createProduct({
    id: 'fixture-ddr4-16gb',
    name: 'Memoria RAM 16GB DDR4 3200MHz',
    category: 'memoria-ram',
    brand: 'Kingston',
    model: '16GB DDR4 3200',
    description: 'Fixture estable para categoría memoria RAM.',
    prices: [
      createPrice('mexx', 'Mexx', 75999, '/product/fixture-ddr4-16gb'),
      createPrice('fullh4rd', 'FullH4rd', 78999, '/product/fixture-ddr4-16gb'),
    ],
    specs: {
      capacidad: '16GB',
      velocidad: '3200MHz',
      tipo: 'DDR4',
    },
  }),
  createProduct({
    id: 'fixture-mouse-gamer',
    name: 'Mouse Gamer RGB 12400 DPI',
    category: 'perifericos',
    brand: 'Logitech',
    model: 'G203',
    description: 'Fixture estable para periféricos.',
    prices: [
      createPrice('venex', 'Venex', 45999, '/product/fixture-mouse-gamer'),
      createPrice('mexx', 'Mexx', 47999, '/product/fixture-mouse-gamer'),
    ],
    specs: {
      sensor: '12400 DPI',
      conexion: 'USB',
    },
  }),
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function getStableFixtureProducts(input: {
  query?: string;
  category?: HardwareCategory;
  selectedStoreIds?: Set<string>;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: SortBy;
}): Product[] {
  const normalizedQuery = input.query ? normalizeText(input.query) : '';
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

  let products = STABLE_PRODUCTS.filter((product) => {
    if (input.category && product.category !== input.category) return false;
    if (input.minPrice !== undefined && product.lowestPrice < input.minPrice) return false;
    if (input.maxPrice !== undefined && product.lowestPrice > input.maxPrice) return false;
    if (input.selectedStoreIds && input.selectedStoreIds.size > 0) {
      const hasMatchingStore = product.prices.some((price) => input.selectedStoreIds!.has(price.storeId));
      if (!hasMatchingStore) return false;
    }
    if (!normalizedQuery) return true;

    const haystack = normalizeText(`${product.name} ${product.brand} ${product.model} ${product.description ?? ''}`);
    return queryWords.every((word) => haystack.includes(word));
  });

  if (input.sortBy === 'price-asc') {
    products = [...products].sort((a, b) => a.lowestPrice - b.lowestPrice);
  } else if (input.sortBy === 'price-desc') {
    products = [...products].sort((a, b) => b.lowestPrice - a.lowestPrice);
  } else if (input.sortBy === 'name') {
    products = [...products].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  } else if (input.sortBy === 'newest') {
    products = [...products].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  return products;
}
