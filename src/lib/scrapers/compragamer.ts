import { HardwareCategory, Product, StockStatus } from '../types';
import { logger } from '../logger';

const COMPRAGAMER_PRODUCTS_URL = 'https://static.compragamer.com/productos';
const COMPRAGAMER_SUBCATEGORIES_URL = 'https://static.compragamer.com/categorias_sub';
const COMPRAGAMER_BRANDS_URL = 'https://static.compragamer.com/marcas';
const COMPRAGAMER_IMAGE_BASE_URL = 'https://imagenes.compragamer.com/productos';
const STATIC_CACHE_TTL_MS = 5 * 60 * 1000;

const SCRAPE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9',
  Origin: 'https://compragamer.com',
  Referer: 'https://compragamer.com/',
};

interface CompraGamerImage {
  nombre?: string;
}

interface CompraGamerProductResponse {
  id_producto?: number | string;
  nombre?: string;
  precioEspecial?: number | string;
  precioLista?: number | string;
  stock?: number | string;
  vendible?: number | boolean;
  id_subcategoria?: number | string;
  id_marca?: number | string;
  codigo_principal?: unknown;
  garantia?: number | string;
  imagenes?: CompraGamerImage[];
}

interface CompraGamerSubcategoryResponse {
  id?: number | string;
  nombre?: string;
}

interface CompraGamerBrandResponse {
  id?: number | string;
  nombre?: string;
}

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

let catalogCache: CacheEntry<CompraGamerProductResponse[]> | null = null;
let subcategoryMapCache: CacheEntry<Map<number, HardwareCategory>> | null = null;
let brandMapCache: CacheEntry<Map<number, string>> | null = null;

let inFlightCatalogRequest: Promise<CompraGamerProductResponse[]> | null = null;
let inFlightSubcategoryRequest: Promise<Map<number, HardwareCategory>> | null = null;
let inFlightBrandRequest: Promise<Map<number, string>> | null = null;

function nowMs(): number {
  return Date.now();
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function parseArsPrice(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  const text = String(value ?? '').trim();
  if (!text) return 0;

  const digits = text.replace(/\D/g, '');
  return parseInt(digits, 10) || 0;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBrandFromName(name: string): string {
  const upperName = name.toUpperCase();
  if (upperName.includes('AMD')) return 'AMD';
  if (upperName.includes('INTEL')) return 'Intel';
  if (upperName.includes('ASUS')) return 'ASUS';
  if (upperName.includes('GIGABYTE')) return 'Gigabyte';
  if (upperName.includes('MSI')) return 'MSI';
  if (upperName.includes('CORSAIR')) return 'Corsair';
  if (upperName.includes('NVIDIA') || upperName.includes('GEFORCE')) return 'NVIDIA';
  if (upperName.includes('RADEON')) return 'AMD Radeon';
  if (upperName.includes('ASROCK')) return 'ASRock';
  return 'Generica';
}

function inferCategoryFromName(name: string): HardwareCategory | null {
  const normalized = normalizeText(name);

  if (
    normalized.includes('ryzen') ||
    normalized.includes('threadripper') ||
    normalized.includes('core i') ||
    normalized.includes('procesador')
  ) {
    return 'procesadores';
  }

  if (
    normalized.includes('placa de video') ||
    normalized.includes('geforce') ||
    normalized.includes('rtx') ||
    normalized.includes('gtx') ||
    normalized.includes('radeon') ||
    normalized.includes('intel arc')
  ) {
    return 'tarjetas-graficas';
  }

  if (normalized.includes('mother') || normalized.includes('placa madre')) {
    return 'motherboards';
  }

  if (
    normalized.includes('memoria ram') ||
    normalized.includes('ddr4') ||
    normalized.includes('ddr5') ||
    normalized.includes('sodimm') ||
    normalized.includes('udimm')
  ) {
    return 'memoria-ram';
  }

  if (
    normalized.includes('ssd') ||
    normalized.includes('nvme') ||
    normalized.includes('m.2') ||
    normalized.includes('disco')
  ) {
    return 'almacenamiento';
  }

  if (normalized.includes('fuente') || normalized.includes('psu')) {
    return 'fuentes-alimentacion';
  }

  if (normalized.includes('gabinete') || normalized.includes('case')) {
    return 'gabinetes';
  }

  if (
    normalized.includes('cooler') ||
    normalized.includes('refrigeracion') ||
    normalized.includes('watercooling') ||
    normalized.includes('ventilador')
  ) {
    return 'refrigeracion';
  }

  if (
    normalized.includes('mouse') ||
    normalized.includes('teclado') ||
    normalized.includes('keyboard') ||
    normalized.includes('monitor') ||
    normalized.includes('auricular') ||
    normalized.includes('headset') ||
    normalized.includes('headphone') ||
    normalized.includes('parlante') ||
    normalized.includes('speaker') ||
    normalized.includes('microfono') ||
    normalized.includes('microphone') ||
    normalized.includes('webcam') ||
    normalized.includes('camara web') ||
    normalized.includes('joystick') ||
    normalized.includes('gamepad') ||
    normalized.includes('mousepad') ||
    normalized.includes('alfombrilla') ||
    normalized.includes('logitech') ||
    normalized.includes('razer') ||
    normalized.includes('redragon') ||
    normalized.includes('steelseries') ||
    normalized.includes('keychron')
  ) {
    return 'perifericos';
  }

  return null;
}

function inferCategoryFromSubcategoryName(name: string): HardwareCategory | null {
  const normalized = normalizeText(name);

  if (normalized.includes('procesador')) return 'procesadores';
  if (normalized.includes('placas de video') || normalized.includes('placa de video')) return 'tarjetas-graficas';
  if (normalized.includes('mother')) return 'motherboards';
  if (normalized.includes('memorias notebook') || normalized.includes('memorias')) return 'memoria-ram';
  if (normalized.includes('discos') || normalized.includes('ssd') || normalized.includes('optane')) return 'almacenamiento';
  if (normalized.includes('fuentes')) return 'fuentes-alimentacion';
  if (normalized.includes('gabinetes')) return 'gabinetes';
  if (normalized.includes('coolers') || normalized.includes('refrigeracion')) return 'refrigeracion';
  if (
    normalized.includes('periferico') ||
    normalized.includes('mouses') ||
    normalized.includes('mouse') ||
    normalized.includes('teclados') ||
    normalized.includes('teclado') ||
    normalized.includes('monitores') ||
    normalized.includes('monitor') ||
    normalized.includes('auriculares') ||
    normalized.includes('audio') ||
    normalized.includes('webcam') ||
    normalized.includes('microfono') ||
    normalized.includes('joystick') ||
    normalized.includes('gamepad')
  ) {
    return 'perifericos';
  }

  return null;
}

function inferStock(stockValue: unknown, vendibleValue: unknown): StockStatus {
  const vendible = Boolean(Number(vendibleValue));
  const stockNumber = Number(stockValue);

  if (!vendible) return 'out-of-stock';
  if (!Number.isFinite(stockNumber)) return 'unknown';
  if (stockNumber <= 0) return 'out-of-stock';
  if (stockNumber <= 2) return 'low-stock';
  return 'in-stock';
}

function shouldIgnoreBrandName(brand: string): boolean {
  const normalized = normalizeText(brand);
  return (
    normalized === '' ||
    normalized.includes('sin definir') ||
    normalized === 'compra gamer' ||
    normalized === 'venta gamer'
  );
}

function buildImageUrl(imageName: string | undefined): string | undefined {
  const normalizedName = imageName?.trim();
  if (!normalizedName) return undefined;
  return `${COMPRAGAMER_IMAGE_BASE_URL}/compragamer_Imganen_general_${normalizedName}-med.jpg`;
}

function buildProductSlug(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'producto';
}

function buildProductUrl(productId: number, name: string): string {
  const slug = buildProductSlug(name);
  return `https://compragamer.com/producto/${slug}_${productId}`;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? '').trim())
      .filter((entry) => entry.length > 0);
  }

  const single = String(value ?? '').trim();
  return single ? [single] : [];
}

function extractPrimaryProductCode(codes: unknown): string | null {
  const values = toStringList(codes);
  if (values.length === 0) return null;

  for (const value of values) {
    const cleaned = value.replace(/^sku\s*:\s*/i, '').trim();
    if (cleaned) return cleaned;
  }

  return null;
}

function stockLabel(status: StockStatus): string | null {
  if (status === 'in-stock') return 'en stock';
  if (status === 'low-stock') return 'stock bajo';
  if (status === 'out-of-stock') return 'sin stock';
  return null;
}

function buildCompraGamerDescription(item: CompraGamerProductResponse, status: StockStatus): string {
  const details: string[] = [];
  const productCode = extractPrimaryProductCode(item.codigo_principal);
  const warrantyMonths = toPositiveInteger(item.garantia);
  const availability = stockLabel(status);

  if (productCode) details.push(`SKU ${productCode}`);
  if (warrantyMonths) details.push(`Garantia ${warrantyMonths} meses`);
  if (availability) details.push(`Disponibilidad ${availability}`);

  if (details.length === 0) {
    return String(item.nombre ?? '').trim();
  }

  return `Ficha CompraGamer: ${details.join(' | ')}`;
}

function buildCompraGamerSpecs(item: CompraGamerProductResponse, status: StockStatus): Record<string, string> {
  const specs: Record<string, string> = {};
  const productCode = extractPrimaryProductCode(item.codigo_principal);
  const warrantyMonths = toPositiveInteger(item.garantia);
  const stockCount = Number(item.stock);
  const availability = stockLabel(status);

  if (productCode) specs['SKU'] = productCode;
  if (warrantyMonths) specs['Garantia'] = `${warrantyMonths} meses`;
  if (Number.isFinite(stockCount) && stockCount >= 0) specs['Stock'] = String(Math.trunc(stockCount));
  if (availability) specs['Disponibilidad'] = availability;

  return specs;
}

function matchesProductQuery(product: CompraGamerProductResponse, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;

  const name = normalizeText(String(product.nombre ?? ''));
  if (name.includes(normalizedQuery)) return true;

  const queryTerms = normalizedQuery.split(/\s+/).filter((term) => term.length >= 2);
  if (queryTerms.length > 0 && queryTerms.every((term) => name.includes(term))) {
    return true;
  }

  const numericQuery = normalizedQuery.replace(/\D/g, '');
  if (!numericQuery) return false;

  const productId = toPositiveInteger(product.id_producto);
  return productId !== null && String(productId) === numericQuery;
}

async function fetchJsonArray<T>(url: string, signal?: AbortSignal): Promise<T[]> {
  const res = await fetch(url, {
    headers: SCRAPE_HEADERS,
    signal,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${url}`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data as T[];
}

async function getCompraGamerCatalog(signal?: AbortSignal): Promise<CompraGamerProductResponse[]> {
  if (catalogCache && catalogCache.expiresAt > nowMs()) {
    return catalogCache.value;
  }

  if (inFlightCatalogRequest) return inFlightCatalogRequest;

  inFlightCatalogRequest = fetchJsonArray<CompraGamerProductResponse>(COMPRAGAMER_PRODUCTS_URL, signal)
    .then((items) => {
      catalogCache = {
        value: items,
        expiresAt: nowMs() + STATIC_CACHE_TTL_MS,
      };
      return items;
    })
    .finally(() => {
      inFlightCatalogRequest = null;
    });

  return inFlightCatalogRequest;
}

async function getCompraGamerSubcategoryMap(signal?: AbortSignal): Promise<Map<number, HardwareCategory>> {
  if (subcategoryMapCache && subcategoryMapCache.expiresAt > nowMs()) {
    return subcategoryMapCache.value;
  }

  if (inFlightSubcategoryRequest) return inFlightSubcategoryRequest;

  inFlightSubcategoryRequest = fetchJsonArray<CompraGamerSubcategoryResponse>(COMPRAGAMER_SUBCATEGORIES_URL, signal)
    .then((items) => {
      const map = new Map<number, HardwareCategory>();
      for (const item of items) {
        const subcategoryId = toPositiveInteger(item.id);
        const subcategoryName = String(item.nombre ?? '').trim();
        if (subcategoryId === null || !subcategoryName) continue;

        const inferredCategory = inferCategoryFromSubcategoryName(subcategoryName);
        if (inferredCategory) {
          map.set(subcategoryId, inferredCategory);
        }
      }

      subcategoryMapCache = {
        value: map,
        expiresAt: nowMs() + STATIC_CACHE_TTL_MS,
      };
      return map;
    })
    .finally(() => {
      inFlightSubcategoryRequest = null;
    });

  return inFlightSubcategoryRequest;
}

async function getCompraGamerBrandMap(signal?: AbortSignal): Promise<Map<number, string>> {
  if (brandMapCache && brandMapCache.expiresAt > nowMs()) {
    return brandMapCache.value;
  }

  if (inFlightBrandRequest) return inFlightBrandRequest;

  inFlightBrandRequest = fetchJsonArray<CompraGamerBrandResponse>(COMPRAGAMER_BRANDS_URL, signal)
    .then((items) => {
      const map = new Map<number, string>();
      for (const item of items) {
        const brandId = toPositiveInteger(item.id);
        const brandName = String(item.nombre ?? '').trim();
        if (brandId === null || !brandName) continue;
        map.set(brandId, brandName);
      }

      brandMapCache = {
        value: map,
        expiresAt: nowMs() + STATIC_CACHE_TTL_MS,
      };
      return map;
    })
    .finally(() => {
      inFlightBrandRequest = null;
    });

  return inFlightBrandRequest;
}

function mapCompraGamerProduct(input: {
  item: CompraGamerProductResponse;
  categoryHint?: HardwareCategory;
  subcategoryMap: Map<number, HardwareCategory>;
  brandMap: Map<number, string>;
}): Product | null {
  const productId = toPositiveInteger(input.item.id_producto);
  const name = String(input.item.nombre ?? '').trim();
  const specialPrice = parseArsPrice(input.item.precioEspecial);
  if (productId === null || !name || specialPrice <= 0) return null;

  const listPrice = parseArsPrice(input.item.precioLista);
  const finalListPrice = listPrice > 0 ? listPrice : specialPrice;

  const subcategoryId = toPositiveInteger(input.item.id_subcategoria);
  const inferredBySubcategory = subcategoryId !== null ? input.subcategoryMap.get(subcategoryId) : undefined;
  const inferredByName = inferCategoryFromName(name);
  const category = inferredBySubcategory ?? inferredByName ?? input.categoryHint;
  if (!category) return null;

  const brandId = toPositiveInteger(input.item.id_marca);
  const brandById = brandId !== null ? input.brandMap.get(brandId) : undefined;
  const brand = brandById && !shouldIgnoreBrandName(brandById) ? brandById : extractBrandFromName(name);
  const stockStatus = inferStock(input.item.stock, input.item.vendible);

  const mainImageName = input.item.imagenes?.[0]?.nombre;
  const mainImage = buildImageUrl(mainImageName) ?? '/pixel-box.svg';

  return {
    id: `cg-${productId}`,
    name,
    category,
    brand,
    model: name,
    description: buildCompraGamerDescription(input.item, stockStatus),
    image: mainImage,
    lowestPrice: specialPrice,
    highestPrice: finalListPrice,
    averagePrice: specialPrice,
    prices: [
      {
        storeId: 'compragamer',
        storeName: 'CompraGamer',
        url: buildProductUrl(productId, name),
        price: specialPrice,
        installment: null,
        stock: stockStatus,
        lastUpdated: new Date(),
      },
    ],
    specs: buildCompraGamerSpecs(input.item, stockStatus),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function fetchCompraGamerProducts(
  _categoryId: number,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  try {
    const [catalog, subcategoryMap, brandMap] = await Promise.all([
      getCompraGamerCatalog(signal),
      getCompraGamerSubcategoryMap(signal),
      getCompraGamerBrandMap(signal),
    ]);

    const products: Product[] = [];
    const seen = new Set<string>();

    for (const item of catalog) {
      const mapped = mapCompraGamerProduct({
        item,
        subcategoryMap,
        brandMap,
      });
      if (!mapped || mapped.category !== categorySlug) continue;

      if (seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      products.push(mapped);
    }

    logger.info(`[CompraGamer Scraper] Categoria ${categorySlug}: ${products.length} productos`);
    return products;
  } catch (error) {
    logger.error('[CompraGamer Scraper] Error al obtener catalogo estatico por categoria', { error });
    return [];
  }
}

export async function searchCompraGamerProducts(
  query: string,
  categoryHint?: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  try {
    const [catalog, subcategoryMap, brandMap] = await Promise.all([
      getCompraGamerCatalog(signal),
      getCompraGamerSubcategoryMap(signal),
      getCompraGamerBrandMap(signal),
    ]);

    const products: Product[] = [];
    const seen = new Set<string>();

    for (const item of catalog) {
      if (!matchesProductQuery(item, normalizedQuery)) continue;

      const mapped = mapCompraGamerProduct({
        item,
        categoryHint,
        subcategoryMap,
        brandMap,
      });
      if (!mapped) continue;

      if (seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      products.push(mapped);
    }

    logger.info(`[CompraGamer Scraper] Busqueda "${query}": ${products.length} productos`);
    return products;
  } catch (error) {
    logger.error('[CompraGamer Scraper] Error al buscar en catalogo estatico', { error });
    return [];
  }
}
