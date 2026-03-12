import { HardwareCategory, Product, StockStatus } from '../types';

const WIZTECH_BASE_URL = 'https://wiztech.com.ar';
const WIZTECH_API_URL = `${WIZTECH_BASE_URL}/backend/Controller/ProductosController.php?action=getProductos`;

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'es-AR,es;q=0.9',
};

type WiztechApiProduct = {
  IdProducto: number;
  Marca?: string | null;
  Componente?: string | null;
  Modelo?: string | null;
  Cantidad?: number | string | null;
  Precio?: string | number | null;
  PrecioOferta?: string | number | null;
  Codigo?: string | null;
  Descripcion?: string | null;
  HabilitadoWeb?: number | boolean | null;
  Consultar?: boolean | null;
  ProductUrl?: string | null;
  ImgSrc?: string | null;
  ImgSrcCollection?: string[] | null;
};

type WiztechApiResponse = {
  Ok?: boolean;
  Result?: WiztechApiProduct[];
};

const CATEGORY_COMPONENT_TERMS: Record<HardwareCategory, string[]> = {
  procesadores: ['procesador'],
  'tarjetas-graficas': ['placa de video'],
  motherboards: ['placa madre', 'motherboard', 'mother'],
  'memoria-ram': ['ram', 'memoria'],
  almacenamiento: ['ssd', 'disco', 'almacenamiento'],
  'fuentes-alimentacion': ['fuente', 'psu'],
  gabinetes: ['gabinete', 'case'],
  refrigeracion: ['refrigeracion', 'cooler'],
  perifericos: ['monitor', 'mouse', 'teclado', 'auricular', 'microfono', 'parlante', 'mousepad'],
};

function parseArsPrice(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const raw = String(value ?? '').replace(/[^0-9,.]/g, '');
  if (!raw) return 0;
  const normalized = raw.replace(/[,.]\d{1,2}$/, '').replace(/[,.]/g, '');
  return parseInt(normalized, 10) || 0;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeSearchValue(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function inferCategory(component: string, name: string): HardwareCategory {
  const normalized = normalizeSearchValue(`${component} ${name}`);

  if (normalized.includes('placa de video') || normalized.includes('rtx') || normalized.includes('radeon') || normalized.includes('geforce')) {
    return 'tarjetas-graficas';
  }
  if (normalized.includes('procesador') || normalized.includes('ryzen') || normalized.includes('core i') || normalized.includes('core ultra')) {
    return 'procesadores';
  }
  if (normalized.includes('placa madre') || normalized.includes('mother')) {
    return 'motherboards';
  }
  if (normalized.includes('ram') || normalized.includes('memoria')) {
    return 'memoria-ram';
  }
  if (normalized.includes('ssd') || normalized.includes('almacenamiento') || normalized.includes('disco')) {
    return 'almacenamiento';
  }
  if (normalized.includes('fuente') || normalized.includes('psu')) {
    return 'fuentes-alimentacion';
  }
  if (normalized.includes('gabinete') || normalized.includes('case')) {
    return 'gabinetes';
  }
  if (normalized.includes('refrigeracion') || normalized.includes('cooler')) {
    return 'refrigeracion';
  }
  return 'perifericos';
}

function inferStock(product: WiztechApiProduct): StockStatus {
  const quantity = Number(product.Cantidad ?? 0);
  if (Number.isFinite(quantity)) {
    if (quantity <= 0) return 'out-of-stock';
    if (quantity <= 3) return 'low-stock';
    return 'in-stock';
  }
  if (product.Consultar) return 'unknown';
  return 'in-stock';
}

function isWebEnabled(product: WiztechApiProduct): boolean {
  const habilitado = product.HabilitadoWeb;
  if (habilitado === false || habilitado === 0) return false;
  const quantity = Number(product.Cantidad ?? 0);
  if (Number.isFinite(quantity)) return quantity > 0;
  return true;
}

function buildImageUrl(product: WiztechApiProduct): string | undefined {
  const raw = cleanText(product.ImgSrc || product.ImgSrcCollection?.[0]);
  if (!raw) return undefined;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${WIZTECH_BASE_URL}/assets/images/products/${raw.replace(/^\/+/, '')}`;
}

function buildProductUrl(product: WiztechApiProduct): string | undefined {
  const raw = cleanText(product.ProductUrl);
  if (!raw) return undefined;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${WIZTECH_BASE_URL}/${raw.replace(/^\/+/, '')}`;
}

function matchesCategory(product: WiztechApiProduct, category: HardwareCategory): boolean {
  const haystack = normalizeSearchValue(`${product.Componente ?? ''} ${product.Modelo ?? ''}`);
  return CATEGORY_COMPONENT_TERMS[category].some((term) => haystack.includes(normalizeSearchValue(term)));
}

function matchesQuery(product: WiztechApiProduct, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;

  const haystack = normalizeSearchValue([
    product.Marca,
    product.Modelo,
    product.Componente,
    product.Descripcion,
    product.Codigo,
  ].filter(Boolean).join(' '));

  const matched = tokens.filter((token) => haystack.includes(token)).length;
  if (tokens.length === 1) return matched === 1;
  if (tokens.length === 2) return matched === 2;
  return matched >= Math.ceil(tokens.length * 0.7);
}

function toProduct(product: WiztechApiProduct, category?: HardwareCategory): Product | null {
  const name = cleanText([product.Marca, product.Modelo].filter(Boolean).join(' ')) || cleanText(product.Modelo);
  const price = parseArsPrice(product.Precio);
  if (!name || price <= 0) return null;

  const originalPrice = parseArsPrice(product.PrecioOferta);
  const inferredCategory = category ?? inferCategory(cleanText(product.Componente), name);
  const productUrl = buildProductUrl(product);
  if (!productUrl) return null;

  const slug = slugify(name);
  const id = `wiztech-${product.IdProducto}-${slug}`;

  return {
    id,
    name,
    category: inferredCategory,
    brand: cleanText(product.Marca) || 'Generica',
    model: cleanText(product.Modelo) || name,
    description: cleanText(product.Descripcion) || name,
    image: buildImageUrl(product),
    lowestPrice: price,
    highestPrice: price,
    averagePrice: price,
    prices: [
      {
        storeId: 'wiztech',
        storeName: 'WizTech',
        url: productUrl,
        price,
        originalPrice: originalPrice > price ? originalPrice : undefined,
        installment: null,
        stock: inferStock(product),
        lastUpdated: new Date(),
      },
    ],
    specs: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function fetchWiztechCatalog(signal?: AbortSignal): Promise<WiztechApiProduct[]> {
  const response = await fetch(WIZTECH_API_URL, {
    headers: SCRAPE_HEADERS,
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as WiztechApiResponse;
  const products = Array.isArray(payload.Result) ? payload.Result : [];
  return products.filter(isWebEnabled);
}

export async function fetchWiztechProducts(query: string, category: HardwareCategory, signal?: AbortSignal): Promise<Product[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const products = await fetchWiztechCatalog(signal);
  return products
    .filter((product) => matchesCategory(product, category))
    .filter((product) => matchesQuery(product, trimmedQuery))
    .map((product) => toProduct(product, category))
    .filter((product): product is Product => Boolean(product));
}

export async function fetchWiztechCategory(category: HardwareCategory, signal?: AbortSignal): Promise<Product[]> {
  const products = await fetchWiztechCatalog(signal);
  return products
    .filter((product) => matchesCategory(product, category))
    .map((product) => toProduct(product, category))
    .filter((product): product is Product => Boolean(product));
}

export async function fetchWiztechProductById(id: string, fallbackCategory: HardwareCategory, signal?: AbortSignal): Promise<Product | null> {
  const match = id.trim().toLowerCase().match(/^wiztech-(\d+)-/);
  if (!match) return null;

  const productId = Number(match[1]);
  if (!Number.isFinite(productId)) return null;

  const products = await fetchWiztechCatalog(signal);
  const product = products.find((entry) => Number(entry.IdProducto) === productId);
  return product ? toProduct(product, fallbackCategory) : null;
}
