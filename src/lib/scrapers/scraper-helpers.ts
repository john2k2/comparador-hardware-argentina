import { parseLocalizedArsPrice } from '../price-utils';
import { sanitizeProduct } from '../product-sanitizer';
import type { HardwareCategory, Product, StockStatus } from '../types';

export const KNOWN_HARDWARE_BRANDS = [
  'AMD',
  'Intel',
  'NVIDIA',
  'ASUS',
  'MSI',
  'Gigabyte',
  'ASRock',
  'Kingston',
  'Corsair',
  'G.Skill',
  'Samsung',
  'WD',
  'Seagate',
  'Crucial',
  'Patriot',
  'XPG',
  'Thermaltake',
  'Cooler Master',
  'be quiet!',
  'Noctua',
  'Arctic',
  'Sapphire',
  'PowerColor',
  'Zotac',
  'EVGA',
  'PNY',
  'HyperX',
  'Redragon',
  'Logitech',
  'Razer',
  'Lenovo',
  'HP',
  'Dell',
  'Acer',
] as const;

export function cleanScrapedText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeScrapedAbsoluteUrl(baseUrl: string, href: string | null | undefined): string {
  const normalizedHref = cleanScrapedText(href);
  if (!normalizedHref) return '';
  if (/^https?:\/\//i.test(normalizedHref)) return normalizedHref;
  if (normalizedHref.startsWith('//')) return `https:${normalizedHref}`;

  try {
    return new URL(normalizedHref, baseUrl).toString();
  } catch {
    return '';
  }
}

export function parseScrapedArsPrice(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  const text = cleanScrapedText(String(value ?? ''));
  if (!text) return 0;
  return parseLocalizedArsPrice(text);
}

export function extractKnownHardwareBrand(name: string, fallback = 'Generica'): string {
  const normalizedName = cleanScrapedText(name).toUpperCase();
  if (!normalizedName) return fallback;

  for (const brand of KNOWN_HARDWARE_BRANDS) {
    if (normalizedName.includes(brand.toUpperCase())) {
      return brand;
    }
  }

  return fallback;
}

export function extractFirstSrcSetUrl(srcset: string | null | undefined): string {
  const normalizedSrcSet = cleanScrapedText(srcset);
  if (!normalizedSrcSet) return '';

  return normalizedSrcSet
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .find(Boolean) ?? '';
}

export function slugFromScrapedUrl(url: string): string {
  const normalizedUrl = cleanScrapedText(url);
  if (!normalizedUrl) return '';

  try {
    const parsed = new URL(normalizedUrl);
    const pathnameSegment = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
    if (pathnameSegment) return pathnameSegment;
  } catch {
    // ignore and fallback to string parsing
  }

  const rawSegment = normalizedUrl.split('/').filter(Boolean).findLast((segment) => !segment.startsWith('?')) ?? '';
  return rawSegment.split('?')[0].split('#')[0];
}

type BuildSinglePriceProductInput = {
  id: string;
  name: string;
  category: HardwareCategory;
  storeId: string;
  storeName: string;
  storeBaseUrl?: string;
  url: string;
  price: number | string;
  stock: StockStatus;
  image?: string | null;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  specs?: Record<string, string>;
  originalPrice?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export function buildSinglePriceProduct(input: BuildSinglePriceProductInput): Product | null {
  const name = cleanScrapedText(input.name);
  const url = normalizeScrapedAbsoluteUrl(input.storeBaseUrl ?? '', input.url);
  const price = parseScrapedArsPrice(input.price);

  if (!name || !url || price <= 0) return null;

  const createdAt = input.createdAt ?? new Date();
  const updatedAt = input.updatedAt ?? createdAt;
  const image = input.image
    ? normalizeScrapedAbsoluteUrl(input.storeBaseUrl ?? '', input.image)
    : undefined;
  const description = cleanScrapedText(input.description) || name;
  const model = cleanScrapedText(input.model) || name;
  const brand = cleanScrapedText(input.brand) || extractKnownHardwareBrand(name);

  return sanitizeProduct({
    id: input.id,
    name,
    category: input.category,
    brand,
    model,
    description,
    image: image || undefined,
    lowestPrice: price,
    highestPrice: price,
    averagePrice: price,
    prices: [
      {
        storeId: input.storeId,
        storeName: cleanScrapedText(input.storeName) || input.storeId,
        url,
        price,
        originalPrice: input.originalPrice && input.originalPrice > price ? input.originalPrice : undefined,
        installment: null,
        stock: input.stock,
        lastUpdated: updatedAt,
      },
    ],
    specs: input.specs ?? {},
    createdAt,
    updatedAt,
  });
}
