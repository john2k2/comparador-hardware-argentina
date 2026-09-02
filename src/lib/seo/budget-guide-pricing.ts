import { isBundleLikeTitle, isCompleteComputerTitle } from '@/lib/product-identity';
import { computeComparableStorePriceStats } from '@/lib/price-utils';
import type { HardwareCategory, Product, ProductPrice } from '@/lib/types';

export type GuideSlotSpec = {
  name: string;
  description: string;
  estimatedPrice: number;
  searchTerms?: string[];
  category?: HardwareCategory;
};

export type GuideStoreOffer = {
  storeName: string;
  price: number;
  stock: 'in-stock' | 'low-stock';
  url: string;
};

export type ResolvedGuideComponent = {
  name: string;
  description: string;
  price: number;
  priceSource: 'catalog' | 'estimate';
  bestStoreName: string | null;
  bestStoreUrl: string | null;
  storeCount: number;
  storeNames: string[];
  offers: GuideStoreOffer[];
  productId?: string;
};

const EXCLUDED_NAME_TERMS = [
  'sodimm',
  'so dimm',
  'notebook',
  'laptop',
];

const CASE_ACCESSORY_TERMS = [
  ' fan ',
  'ventilador',
  'cooler gabinete',
  'bulk',
];

const PC_BUILD_TERMS = [
  'pc gamer',
  'pc ',
  'combo',
  'armado',
  'pc completa',
  'computadora',
  'desktop',
  'workstation',
  'notebook',
  'laptop',
  'all in one',
  'aio ',
  'netbook',
  'chromebook',
  'kit ',
  'bundle',
  'paquete',
  'gaming pc',
  'cpu +',
  'procesador +',
  'usado',
  'refurbished',
  'open box',
  'reacondicionado',
  'segunda mano',
];

export const GUIDE_CATALOG_CATEGORIES: HardwareCategory[] = [
  'procesadores',
  'tarjetas-graficas',
  'memoria-ram',
  'almacenamiento',
  'motherboards',
  'fuentes-alimentacion',
  'gabinetes',
];

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPcBuild(name: string): boolean {
  const lowerName = name.toLowerCase();
  return PC_BUILD_TERMS.some((term) => lowerName.includes(term));
}

function isExcludedProduct(product: Product): boolean {
  const haystack = ` ${normalizeSearchText(product.name)} `;
  if (EXCLUDED_NAME_TERMS.some((term) => haystack.includes(term))) return true;
  if (product.category === 'gabinetes' && CASE_ACCESSORY_TERMS.some((term) => haystack.includes(term))) {
    return !haystack.includes('mid tower') && !haystack.includes('full tower');
  }
  return false;
}

function isGroupedProduct(product: Product): boolean {
  return product.id.startsWith('agrupado-');
}

function tokenMatchesGuideWord(token: string, word: string): boolean {
  if (token === word) return true;
  if (/^\d+w$/.test(word)) return false;
  return token.startsWith(word) && token.length <= word.length + 2;
}

export function textMatchesGuideTerms(text: string, searchTerms: string[]): boolean {
  const searchableTokens = normalizeSearchText(text).split(' ').filter(Boolean);

  return searchTerms.some((term) => {
    const normalizedTerm = normalizeSearchText(term);
    const termWords = normalizedTerm.split(/\s+/).filter((word) => word.length > 1);
    if (termWords.length === 0) return false;
    return termWords.every((word) => searchableTokens.some((token) => tokenMatchesGuideWord(token, word)));
  });
}

export function productMatchesGuideTerms(product: Product, searchTerms: string[]): boolean {
  const searchable = [
    product.name,
    product.brand,
    product.model,
    product.normalizedTitle ?? '',
    product.canonicalProductKey ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return textMatchesGuideTerms(searchable, searchTerms);
}

export function isBuyableGuideStock(stock: ProductPrice['stock']): stock is 'in-stock' | 'low-stock' {
  return stock === 'in-stock' || stock === 'low-stock';
}

const EXCLUDED_OFFER_TERMS = [
  ...EXCLUDED_NAME_TERMS,
  'sodimm',
  'so dimm',
  'fury impact',
  'pc gamer',
  'combo',
  '2230',
  '2242',
];

const OFFER_NAME_STOPWORDS = new Set([
  'memoria',
  'ram',
  'disco',
  'ssd',
  'placa',
  'video',
  'procesador',
  'micro',
  'amd',
  'intel',
  'ddr4',
  'ddr5',
  'mhz',
  'nvme',
  'pcie',
  'gaming',
  'rgb',
  'udimm',
  'dimm',
  'kit',
  'box',
  'white',
  'black',
  'expo',
  'xmp',
]);

function offerConflictsWithGuide(offer: ProductPrice): boolean {
  const haystack = ` ${normalizeSearchText(`${offer.url} ${offer.storeName}`)} `;
  return EXCLUDED_OFFER_TERMS.some((term) => haystack.includes(term));
}

function offerAgreesWithProductName(product: Product, offer: ProductPrice): boolean {
  const urlTokens = normalizeSearchText(offer.url).split(' ').filter((token) => token.length > 2);
  if (urlTokens.length < 5) return true;

  const nameTokens = normalizeSearchText(product.name)
    .split(' ')
    .filter((token) => token.length > 2 && !OFFER_NAME_STOPWORDS.has(token));
  const capacities = nameTokens.filter((token) => /^\d+(gb|tb)$/.test(token));
  const urlHaystack = ` ${urlTokens.join(' ')} `;
  if (capacities.some((capacity) => !urlHaystack.includes(` ${capacity} `))) return false;

  const speeds = [...normalizeSearchText(product.name).matchAll(/\b([2-8]\d{3})\b/g)].map((match) => match[1]);
  if (speeds.length > 0 && !speeds.some((speed) => urlTokens.some((token) => token === speed || token.startsWith(speed)))) {
    return false;
  }

  const brandTokens = new Set([
    'kingston',
    'adata',
    'corsair',
    'patriot',
    'samsung',
    'hiksemi',
    'crucial',
    'team',
    'geil',
    'pny',
  ]);
  const distinctive = nameTokens.filter((token) => (
    !/^\d+[a-z]*$/.test(token)
    && !/^cl\d+$/.test(token)
    && token.length > 3
  ));
  const modelTokens = distinctive.filter((token) => !brandTokens.has(token));
  if (modelTokens.length === 0) {
    return distinctive.some((token) => urlHaystack.includes(` ${token} `));
  }
  return modelTokens.every((token) => urlHaystack.includes(` ${token} `));
}

function buyableOffers(product: Product): ProductPrice[] {
  const inStock = product.prices.filter((offer) => (
    offer.price > 0
    && isBuyableGuideStock(offer.stock)
    && !offerConflictsWithGuide(offer)
    && offerAgreesWithProductName(product, offer)
  ));
  if (inStock.length === 0) return [];

  const stats = computeComparableStorePriceStats(inStock);
  return stats.comparablePrices
    .filter((offer) => (
      offer.price > 0
      && isBuyableGuideStock(offer.stock)
      && !offerConflictsWithGuide(offer)
      && offerAgreesWithProductName(product, offer)
    ))
    .sort((left, right) => left.price - right.price);
}

function toGuideOffers(offers: ProductPrice[]): GuideStoreOffer[] {
  return offers.flatMap((offer) => {
    if (!isBuyableGuideStock(offer.stock)) return [];
    return [{
      storeName: offer.storeName,
      price: offer.price,
      stock: offer.stock,
      url: offer.url,
    }];
  });
}

export function toEstimatedGuideComponent(spec: GuideSlotSpec): ResolvedGuideComponent {
  return {
    name: spec.name,
    description: spec.description,
    price: spec.estimatedPrice,
    priceSource: 'estimate',
    bestStoreName: null,
    bestStoreUrl: null,
    storeCount: 0,
    storeNames: [],
    offers: [],
  };
}

export function toResolvedCatalogComponent(
  product: Product,
  offers: ProductPrice[],
  description = '',
): ResolvedGuideComponent {
  const best = offers[0];
  const storeNames = [...new Set(offers.map((offer) => offer.storeName).filter(Boolean))];

  return {
    name: product.name,
    description,
    price: best?.price ?? 0,
    priceSource: 'catalog',
    bestStoreName: best?.storeName ?? null,
    bestStoreUrl: best?.url ?? null,
    storeCount: storeNames.length,
    storeNames,
    offers: toGuideOffers(offers),
    productId: product.id,
  };
}

function toCatalogOffer(spec: GuideSlotSpec, product: Product, offers: ProductPrice[]): ResolvedGuideComponent {
  const resolved = toResolvedCatalogComponent(product, offers, '');
  if (resolved.price > 0) return resolved;
  return { ...resolved, price: spec.estimatedPrice };
}

export type BuyableGuideCandidate = {
  product: Product;
  offers: ProductPrice[];
  price: number;
};

function isBlockedBuilderProduct(product: Product): boolean {
  if (isExcludedProduct(product) || isCompleteComputerTitle(product.name)) return true;
  if (product.category === 'memoria-ram' || product.category === 'almacenamiento') return false;
  return isPcBuild(product.name) || isBundleLikeTitle(product.name);
}

export function listBuyableGuideCandidates(
  products: Product[],
  category: HardwareCategory,
): BuyableGuideCandidate[] {
  return products
    .filter((product) => product.category === category && !isBlockedBuilderProduct(product))
    .map((product) => {
      const offers = buyableOffers(product);
      return { product, offers, price: offers[0]?.price ?? Number.POSITIVE_INFINITY };
    })
    .filter((candidate) => candidate.offers.length > 0)
    .sort((left, right) => left.price - right.price);
}

export function resolveGuideComponent(
  spec: GuideSlotSpec,
  products: Product[],
): ResolvedGuideComponent {
  const searchTerms = spec.searchTerms?.filter(Boolean) ?? [];
  if (searchTerms.length === 0) {
    return toEstimatedGuideComponent(spec);
  }

  const matches = products.filter((product) => {
    if (isPcBuild(product.name) || isExcludedProduct(product)) return false;
    if (spec.category && product.category !== spec.category) return false;
    return productMatchesGuideTerms(product, searchTerms);
  });

  if (matches.length === 0) {
    return toEstimatedGuideComponent(spec);
  }

  const ranked = matches
    .map((product) => {
      const offers = buyableOffers(product);
      return { product, offers, bestPrice: offers[0]?.price ?? Number.POSITIVE_INFINITY };
    })
    .filter((candidate) => candidate.offers.length > 0)
    .sort((left, right) => {
      const leftGrouped = isGroupedProduct(left.product) ? 1 : 0;
      const rightGrouped = isGroupedProduct(right.product) ? 1 : 0;
      if (leftGrouped !== rightGrouped) return leftGrouped - rightGrouped;
      return left.bestPrice - right.bestPrice;
    });

  const winner = ranked[0];
  if (!winner) {
    return toEstimatedGuideComponent(spec);
  }

  return toCatalogOffer(spec, winner.product, winner.offers);
}

export type ResolvedGuideSlotTotals<T extends Record<string, ResolvedGuideComponent>> = T & {
  total: number;
  catalogTotal: number;
  estimateTotal: number;
  inStockSlots: number;
  hasEstimates: boolean;
};

export function summarizeGuideComponents<T extends Record<string, ResolvedGuideComponent>>(
  resolved: T,
): ResolvedGuideSlotTotals<T> {
  const values = Object.values(resolved) as ResolvedGuideComponent[];
  const catalogItems = values.filter((item) => item.priceSource === 'catalog');
  const estimateItems = values.filter((item) => item.priceSource === 'estimate');
  return {
    ...resolved,
    catalogTotal: catalogItems.reduce((sum, item) => sum + item.price, 0),
    estimateTotal: estimateItems.reduce((sum, item) => sum + item.price, 0),
    total: values.reduce((sum, item) => sum + item.price, 0),
    inStockSlots: catalogItems.length,
    hasEstimates: estimateItems.length > 0,
  };
}

export function resolveGuideSlots<T extends Record<string, GuideSlotSpec>>(
  slots: T,
  products: Product[],
): ResolvedGuideSlotTotals<{ [K in keyof T]: ResolvedGuideComponent }> {
  const resolved = Object.fromEntries(
    Object.entries(slots).map(([key, spec]) => [key, resolveGuideComponent(spec, products)]),
  ) as { [K in keyof T]: ResolvedGuideComponent };

  return summarizeGuideComponents(resolved);
}
