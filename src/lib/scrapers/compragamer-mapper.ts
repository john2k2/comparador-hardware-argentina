import type { HardwareCategory, Product, StockStatus } from '../types';
import { extractKnownHardwareBrand, normalizeScrapedAbsoluteUrl, parseScrapedArsPrice } from './scraper-helpers';
import type { CompraGamerProductResponse } from './compragamer-catalog';

const COMPRAGAMER_IMAGE_BASE_URL = 'https://imagenes.compragamer.com/productos';

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
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
  if (upperName.includes('RADEON')) return 'AMD Radeon';
  if (upperName.includes('GEFORCE')) return 'NVIDIA';
  return extractKnownHardwareBrand(name);
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
  return normalizeScrapedAbsoluteUrl(
    COMPRAGAMER_IMAGE_BASE_URL,
    `/compragamer_Imganen_general_${normalizedName}-med.jpg`,
  );
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

export function normalizeCompraGamerText(value: string): string {
  return normalizeText(value);
}

export function matchesCompraGamerProductQuery(product: CompraGamerProductResponse, normalizedQuery: string): boolean {
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

export function mapCompraGamerProduct(input: {
  item: CompraGamerProductResponse;
  categoryHint?: HardwareCategory;
  subcategoryMap: Map<number, HardwareCategory>;
  brandMap: Map<number, string>;
}): Product | null {
  const productId = toPositiveInteger(input.item.id_producto);
  const name = String(input.item.nombre ?? '').trim();
  const specialPrice = parseScrapedArsPrice(input.item.precioEspecial);
  if (productId === null || !name || specialPrice <= 0) return null;

  const listPrice = parseScrapedArsPrice(input.item.precioLista);
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
