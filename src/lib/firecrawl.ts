// ============================================
// Firecrawl Scraper - Tiendas argentinas de hardware
// ============================================

import Firecrawl from '@mendable/firecrawl-js';
import { z } from 'zod';
import type { Product, HardwareCategory } from './types';

const firecrawl = process.env.FIRECRAWL_API_KEY
  ? new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY })
  : null;

// Cache en memoria 1 hora
const cache = new Map<string, { data: Product[]; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;

// Tiendas con sus URLs de búsqueda
const STORES = [
  {
    id: 'hardgamers',
    name: 'HardGamers',
    color: '#e53935',
    // Parámetro correcto es "text", no "q"
    searchUrl: (q: string) => `https://www.hardgamers.com.ar/search?text=${encodeURIComponent(q)}`,
  },
  {
    id: 'compugarden',
    name: 'Compugarden',
    color: '#43a047',
    searchUrl: (q: string) => `https://www.compugarden.com.ar/ARTICULOS/m=0/BUS=${encodeURIComponent(q)};/compugarden.aspx`,
  },
  {
    id: 'maximus',
    name: 'Maximus',
    color: '#8e24aa',
    searchUrl: (q: string) => `https://www.maximus.com.ar/Productos/maximus.aspx?/CAT=-1/SCAT=-1/M=-1/BUS=${encodeURIComponent(q)}/OR=1/PAGE=1/`,
  },
  {
    id: 'gezatek',
    name: 'Gezatek',
    color: '#00acc1',
    searchUrl: (q: string) => `https://www.gezatek.com.ar/tienda/?busqueda=${encodeURIComponent(q)}`,
  },
  {
    id: 'venex',
    name: 'Venex',
    color: '#fb8c00',
    searchUrl: (q: string) => `https://www.venex.com.ar/resultado-busqueda.htm?keywords=${encodeURIComponent(q)}`,
  },
];

const extractSchema = z.object({
  products: z.array(z.object({
    name: z.string(),
    price: z.number(),
    url: z.string(),
    image: z.string().optional().nullable(),
    brand: z.string().optional().nullable(),
    installment_count: z.number().optional().nullable(),
    installment_amount: z.number().optional().nullable(),
  })),
});

const KNOWN_BRANDS = [
  'AMD', 'Intel', 'NVIDIA', 'ASUS', 'MSI', 'Gigabyte', 'ASRock',
  'Kingston', 'Corsair', 'G.Skill', 'Samsung', 'WD', 'Seagate',
  'Crucial', 'Patriot', 'XPG', 'Thermaltake', 'Cooler Master',
  'be quiet!', 'Noctua', 'Arctic', 'Sapphire', 'PowerColor', 'Zotac',
  'Einarex', 'Sentey', 'Cougar',
];

function inferBrand(name: string): string {
  for (const brand of KNOWN_BRANDS) {
    if (name.toLowerCase().includes(brand.toLowerCase())) return brand;
  }
  return 'Genérico';
}

function inferCategory(query: string): HardwareCategory {
  const q = query.toLowerCase();
  if (q.includes('procesador') || q.includes('ryzen') || q.includes('core i') || q.includes('cpu')) return 'procesadores';
  if (q.includes('gpu') || q.includes('rtx') || q.includes('rx ') || q.includes('tarjeta') || q.includes('placa de video')) return 'tarjetas-graficas';
  if (q.includes('ram') || q.includes('memoria ddr')) return 'memoria-ram';
  if (q.includes('ssd') || q.includes('disco') || q.includes('nvme') || q.includes('hdd')) return 'almacenamiento';
  if (q.includes('mother') || q.includes('placa madre')) return 'motherboards';
  if (q.includes('fuente')) return 'fuentes-alimentacion';
  if (q.includes('gabinete') || q.includes('case')) return 'gabinetes';
  if (q.includes('refriger') || q.includes('cooler') || q.includes('fan')) return 'refrigeracion';
  if (
    q.includes('mouse')
    || q.includes('teclado')
    || q.includes('keyboard')
    || q.includes('monitor')
    || q.includes('auricular')
    || q.includes('headset')
    || q.includes('headphone')
    || q.includes('parlante')
    || q.includes('speaker')
    || q.includes('microfono')
    || q.includes('microphone')
    || q.includes('webcam')
    || q.includes('camara web')
    || q.includes('joystick')
    || q.includes('gamepad')
    || q.includes('mousepad')
    || q.includes('alfombrilla')
    || q.includes('logitech')
    || q.includes('razer')
    || q.includes('redragon')
    || q.includes('steelseries')
    || q.includes('keychron')
  ) {
    return 'perifericos';
  }
  return 'perifericos';
}

async function scrapeStore(
  store: typeof STORES[number],
  query: string,
  category: HardwareCategory,
): Promise<Product[]> {
  if (!firecrawl) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (firecrawl as any).extract({
      urls: [store.searchUrl(query)],
      prompt:
        `Extraé todos los productos listados en esta página de búsqueda de la tienda ${store.name} (Argentina). ` +
        'Para cada producto obtené: nombre completo, precio en pesos argentinos (número sin puntos ni comas como separador de miles), ' +
        'URL del producto, URL de la imagen, marca si está visible, y si hay cuotas sin interés: cantidad y monto por cuota.',
      schema: extractSchema,
    });

    console.log(`[firecrawl] ${store.name} → success:${result.success} hasData:${!!result.data}`);
    console.log(`[firecrawl] ${store.name} data:`, JSON.stringify(result.data).substring(0, 600));
    if (!result.success || !result.data) return [];

    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = result.data as any;
    const productList: z.infer<typeof extractSchema>['products'] =
      Array.isArray(raw) ? raw :
      Array.isArray(raw?.products) ? raw.products :
      [];
    return productList
      .filter(p => p.price > 0 && p.name && p.url)
      .map((p, i) => {
        const brand = p.brand || inferBrand(p.name);
        const productUrl = p.url.startsWith('http') ? p.url : `${new URL(store.searchUrl(query)).origin}${p.url}`;
        return {
          id: `${store.id}-${Date.now()}-${i}`,
          name: p.name,
          category,
          brand,
          model: p.name,
          image: p.image ?? undefined,
          specs: {},
          prices: [
            {
              storeId: store.id,
              storeName: store.name,
              url: productUrl,
              price: p.price,
              stock: 'in-stock' as const,
              installment:
                p.installment_count && p.installment_amount
                  ? {
                      count: p.installment_count,
                      amount: p.installment_amount,
                      totalAmount: p.installment_count * p.installment_amount,
                      interest: false,
                    }
                  : null,
              lastUpdated: now,
            },
          ],
          lowestPrice: p.price,
          highestPrice: p.price,
          averagePrice: p.price,
          createdAt: now,
          updatedAt: now,
        };
      });
  } catch (e) {
    console.error(`[firecrawl] Error scraping ${store.name}:`, e);
    return [];
  }
}

export async function scrapeStores(query: string): Promise<Product[]> {
  if (!firecrawl) return [];

  const cacheKey = `stores:${query.toLowerCase().trim()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const category = inferCategory(query);

  // Scrapear de a una tienda por vez para no superar el límite de concurrencia del plan free
  const products: Product[] = [];
  for (const store of STORES) {
    const storeProducts = await scrapeStore(store, query, category);
    products.push(...storeProducts);
  }

  cache.set(cacheKey, { data: products, ts: Date.now() });
  return products;
}

export const firecrawlAvailable = !!process.env.FIRECRAWL_API_KEY;
