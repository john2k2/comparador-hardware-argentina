// ============================================
// Store APIs - Tiendas argentinas con APIs públicas
// ============================================

import type { Product, HardwareCategory } from './types';

// Cache en memoria 1 hora
const cache = new Map<string, { data: Product[]; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;

const KNOWN_BRANDS = [
  'AMD', 'Intel', 'NVIDIA', 'ASUS', 'MSI', 'Gigabyte', 'ASRock',
  'Kingston', 'Corsair', 'G.Skill', 'Samsung', 'WD', 'Seagate',
  'Crucial', 'Patriot', 'XPG', 'Thermaltake', 'Cooler Master',
  'be quiet!', 'Noctua', 'Arctic', 'Sapphire', 'PowerColor', 'Zotac',
  'Einarex', 'Sentey', 'Cougar', 'HyperX', 'EVGA', 'PNY',
];

function inferBrand(name: string): string {
  for (const brand of KNOWN_BRANDS) {
    if (name.toLowerCase().includes(brand.toLowerCase())) return brand;
  }
  return 'Genérico';
}

function inferCategory(title: string): HardwareCategory {
  const t = title.toLowerCase();
  if (t.includes('procesador') || t.includes('ryzen') || t.includes('core i') || t.includes(' cpu')) return 'procesadores';
  if (t.includes('rtx') || t.includes('rx ') || t.includes('radeon') || t.includes('geforce') || t.includes('placa de video') || t.includes('tarjeta de video') || t.includes('placa video')) return 'tarjetas-graficas';
  if (t.includes(' ram') || t.includes('ddr4') || t.includes('ddr5') || t.includes('memoria ram')) return 'memoria-ram';
  if (t.includes('ssd') || t.includes('nvme') || t.includes('disco ssd') || t.includes('disco rigido') || t.includes('hdd')) return 'almacenamiento';
  if (t.includes('motherboard') || t.includes('placa madre') || t.includes('mother')) return 'motherboards';
  if (t.includes('fuente') && (t.includes('alimentacion') || t.includes('poder') || t.includes('watts') || t.includes('w '))) return 'fuentes-alimentacion';
  if (t.includes('gabinete') || t.includes('case') || t.includes('torre')) return 'gabinetes';
  if (t.includes('cooler') || t.includes('refriger') || t.includes('ventilador') || t.includes('fan')) return 'refrigeracion';
  if (
    t.includes('mouse')
    || t.includes('teclado')
    || t.includes('keyboard')
    || t.includes('monitor')
    || t.includes('auricular')
    || t.includes('headset')
    || t.includes('headphone')
    || t.includes('parlante')
    || t.includes('speaker')
    || t.includes('microfono')
    || t.includes('microphone')
    || t.includes('webcam')
    || t.includes('camara web')
    || t.includes('joystick')
    || t.includes('gamepad')
    || t.includes('mousepad')
    || t.includes('alfombrilla')
    || t.includes('logitech')
    || t.includes('razer')
    || t.includes('redragon')
    || t.includes('steelseries')
    || t.includes('keychron')
  ) {
    return 'perifericos';
  }
  return 'perifericos';
}

// ============================================
// Mercado Libre Argentina — API pública, sin clave
// ============================================

interface MeliItem {
  id: string;
  title: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  thumbnail: string;
  permalink: string;
  condition: string;
  installments?: {
    quantity: number;
    amount: number;
    rate: number;
  };
}

export async function searchMercadoLibre(query: string, category: HardwareCategory): Promise<Product[]> {
  const url = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=20&condition=new`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`MeLi API ${res.status}`);
  const data = await res.json() as { results: MeliItem[] };

  const now = new Date();
  return data.results
    .filter(item => item.currency_id === 'ARS' && item.price > 0)
    .map((item, i) => ({
      id: `meli-${item.id}-${i}`,
      name: item.title,
      category,
      brand: inferBrand(item.title),
      model: item.title,
      image: item.thumbnail?.replace('-I.', '-O.') ?? undefined,
      specs: {},
      prices: [
        {
          storeId: 'mercadolibre',
          storeName: 'Mercado Libre',
          url: item.permalink,
          price: item.price,
          stock: item.available_quantity > 0 ? ('in-stock' as const) : ('out-of-stock' as const),
          installment:
            item.installments
              ? {
                count: item.installments.quantity,
                amount: item.installments.amount,
                totalAmount: item.installments.quantity * item.installments.amount,
                interest: item.installments.rate > 0,
              }
              : null,
          lastUpdated: now,
        },
      ],
      lowestPrice: item.price,
      highestPrice: item.price,
      averagePrice: item.price,
      createdAt: now,
      updatedAt: now,
    }));
}

// ============================================
// Exportación principal
// ============================================

const SCRAPERS: Array<{ name: string; fn: (query: string, category: HardwareCategory) => Promise<Product[]> }> = [
  // { name: 'Mercado Libre', fn: searchMercadoLibre },
];

export async function searchStoreAPIs(query: string): Promise<Product[]> {
  const cacheKey = `storeapis:${query.toLowerCase().trim()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const category = inferCategory(query);
  const products: Product[] = [];

  for (const scraper of SCRAPERS) {
    try {
      const results = await scraper.fn(query, category);
      console.log(`[store-api] ${scraper.name} → ${results.length} productos`);
      products.push(...results);
    } catch (e) {
      console.error(`[store-api] ${scraper.name} error:`, e);
    }
  }

  cache.set(cacheKey, { data: products, ts: Date.now() });
  return products;
}
