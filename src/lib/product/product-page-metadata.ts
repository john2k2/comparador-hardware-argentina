import { formatPriceARS, getComparableStorePrices } from '@/lib/price-utils';
import { SITE_URL } from '@/lib/site-config';
import { normalizeDisplayText } from '@/lib/text-utils';
import type { Product } from '@/lib/types';

export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
export const PRODUCT_TITLE_SUFFIX = ' | HardwareAR';

export function buildCanonicalUrl(id: string): string {
  return `${SITE_URL}/product/${encodeURIComponent(id)}`;
}

export function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const sliced = normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  const lastSpace = sliced.lastIndexOf(' ');
  const safeSlice = lastSpace > maxLength * 0.55 ? sliced.slice(0, lastSpace) : sliced;
  return `${safeSlice.trimEnd()}…`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// El modelo scrapeado a veces ya trae la marca metida adentro del texto
// (ej: model="MOTHER GIGABYTE (LGA1851) Z890 EAGLE" con brand="Gigabyte"),
// lo que duplicaba la marca en el title tag ("Gigabyte MOTHER GIGABYTE...").
function stripBrandFromModel(model: string, brand: string): string {
  if (!brand) return model;
  const pattern = new RegExp(`\\b${escapeRegExp(brand)}\\b`, 'gi');
  return model.replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
}

export function buildShortProductTitle(product: Product): string {
  const brand = normalizeDisplayText(product.brand);
  const rawModel = normalizeDisplayText(product.model);
  const model = stripBrandFromModel(rawModel, brand);
  const fallbackName = normalizeDisplayText(product.name);
  const compact = [brand, model].filter(Boolean).join(' ').trim() || fallbackName;

  return truncateText(compact, 46);
}

export function resolveProductImage(product: Product | null): string {
  const rawImage = (product?.image ?? '').trim();
  if (!rawImage) return DEFAULT_OG_IMAGE;

  if (/^https?:\/\//i.test(rawImage)) {
    return rawImage;
  }

  if (rawImage.startsWith('/')) {
    return `${SITE_URL}${rawImage}`;
  }

  return DEFAULT_OG_IMAGE;
}

export function buildProductDescription(product: Product): string {
  const name = normalizeDisplayText(product.name);
  const storesCompared = getComparableStorePrices(product.prices).length;
  const bestPrice = formatPriceARS(product.lowestPrice);

  const core = truncateText(`Compara ${name} en ${storesCompared} tiendas de Argentina.`, 120);
  const withPrice = `${core} Mejor precio detectado: ${bestPrice}.`;

  return withPrice.length <= 160 ? withPrice : core;
}

export function stockToSchemaAvailability(stock: Product['prices'][number]['stock']): string {
  if (stock === 'in-stock' || stock === 'low-stock') {
    return 'https://schema.org/InStock';
  }
  if (stock === 'out-of-stock') {
    return 'https://schema.org/OutOfStock';
  }
  return 'https://schema.org/LimitedAvailability';
}

export function buildProductJsonLd(product: Product, id: string) {
  const productUrl = buildCanonicalUrl(id);
  const displayName = normalizeDisplayText(product.name);
  const displayBrand = normalizeDisplayText(product.brand || 'Generica');
  const displayDescription = normalizeDisplayText(product.description || product.name);
  const offers = getComparableStorePrices(product.prices)
    .filter((price) => price.price > 0 && price.url)
    .map((price) => ({
      '@type': 'Offer',
      priceCurrency: 'ARS',
      price: price.price,
      availability: stockToSchemaAvailability(price.stock),
      url: price.url,
      seller: {
        '@type': 'Organization',
        name: normalizeDisplayText(price.storeName || price.storeId),
      },
      itemCondition: 'https://schema.org/NewCondition',
    }));

  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Inicio',
      item: SITE_URL,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Buscar',
      item: `${SITE_URL}/search`,
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: product.category,
      item: `${SITE_URL}/search?category=${encodeURIComponent(product.category)}`,
    },
    {
      '@type': 'ListItem',
      position: 4,
      name: displayName,
      item: productUrl,
    },
  ];

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}#organization`,
      name: 'Comparador Hardware Argentina',
      url: SITE_URL,
      logo: `${SITE_URL}/og-image.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      '@id': `${productUrl}#product`,
      name: displayName,
      description: displayDescription,
      url: productUrl,
      image: [resolveProductImage(product)],
      sku: normalizeDisplayText(product.model || product.id),
      mpn: normalizeDisplayText(product.model || product.id),
      category: product.category,
      brand: {
        '@type': 'Brand',
        name: displayBrand,
      },
      offers,
    },
  ];
}
