'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ExternalLink, Store, Shield, Clock } from 'lucide-react';
import { PriceDisplay, InstallmentPicker, ProductCard } from '@/components/functional';
import { cn } from '@/lib/utils';
import { saveRecentlyViewedProduct } from '@/lib/client/recently-viewed';
import { formatPriceARS } from '@/lib/price-utils';
import { normalizeDisplayText } from '@/lib/text-utils';
import type { Product, ProductPrice } from '@/lib/types';

const CLIENT_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const clientProductDetailCache = new Map<string, { expiresAt: number; product: Product | null }>();
const PRODUCT_DETAIL_STORAGE_PREFIX = 'product-detail:v2:';

const WHITELISTED_HOSTS = [
  'mlstatic.com', 'imgur.com', 'unsplash.com', 'vteximg.com.br',
  's3.amazonaws.com', 'compragamer.com', 'venex.com.ar', 'fullh4rd.com.ar',
  'compugarden.com.ar',
  'katech.com.ar', 'dinobyte.ar', 'maxtecno.com.ar', 'thegamershop.com.ar',
  'hardcorecomputacion.com.ar', 'beings.com.ar', 'liontech-gaming.com',
  'portalstore.com.ar', 'goldentechstore.com.ar', 'xt-pc.com.ar',
  'rockethard.com.ar', 'hypergaming.com.ar', '37bytes.com.ar',
  'mitiendanube.com',
];

function toDateValue(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

function normalizeFetchedProduct(product: Product): Product {
  return {
    ...product,
    createdAt: toDateValue(product.createdAt),
    updatedAt: toDateValue(product.updatedAt),
    prices: (product.prices ?? []).map((price) => ({
      ...price,
      lastUpdated: toDateValue(price.lastUpdated),
    })),
  };
}

function isWhitelisted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return WHITELISTED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function getProductStorageKey(id: string): string {
  return `${PRODUCT_DETAIL_STORAGE_PREFIX}${id}`;
}

function readStoredProduct(id: string): { expiresAt: number; product: Product | null } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getProductStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt?: number; product?: Product | null };
    if (!parsed.expiresAt) return null;
    if (parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(getProductStorageKey(id));
      return null;
    }
    return {
      expiresAt: parsed.expiresAt,
      product: parsed.product ?? null,
    };
  } catch {
    return null;
  }
}

function writeStoredProduct(id: string, value: { expiresAt: number; product: Product | null }) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getProductStorageKey(id), JSON.stringify(value));
  } catch {
    // Ignore storage quota errors.
  }
}

function resolveBackHref(fromParam: string | null): string {
  if (!fromParam) return '/search';

  let decoded = fromParam;
  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded.startsWith('/search') ? decoded : '/search';
}

function pickBestStorePrices(prices: ProductPrice[]): ProductPrice[] {
  const bestByStore = new Map<string, ProductPrice>();

  for (const price of prices) {
    const storeKey = price.storeId.toLowerCase();
    const currentBest = bestByStore.get(storeKey);

    if (!currentBest) {
      bestByStore.set(storeKey, price);
      continue;
    }

    if (price.price < currentBest.price) {
      bestByStore.set(storeKey, price);
      continue;
    }

    if (price.price === currentBest.price) {
      const currentUpdatedAt = new Date(currentBest.lastUpdated).getTime();
      const candidateUpdatedAt = new Date(price.lastUpdated).getTime();
      if (candidateUpdatedAt > currentUpdatedAt) {
        bestByStore.set(storeKey, price);
      }
    }
  }

  return Array.from(bestByStore.values()).sort((a, b) => a.price - b.price);
}

type ProductDetailClientProps = {
  id: string;
  initialProduct: Product | null;
};

export function ProductDetailClient({ id, initialProduct }: ProductDetailClientProps) {
  const searchParams = useSearchParams();
  const backHref = resolveBackHref(searchParams.get('from'));
  const normalizedInitialProduct = useMemo(
    () => (initialProduct ? normalizeFetchedProduct(initialProduct) : null),
    [initialProduct],
  );
  const [product, setProduct] = useState<Product | null>(normalizedInitialProduct);
  const [selectedInstallment, setSelectedInstallment] = useState<{
    count: number;
    amount: number;
    totalAmount: number;
    interest: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(!normalizedInitialProduct);

  useEffect(() => {
    const controller = new AbortController();
    const cached = clientProductDetailCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      setProduct(cached.product);
      setIsLoading(false);
      return () => controller.abort();
    }

    const stored = readStoredProduct(id);
    if (stored) {
      clientProductDetailCache.set(id, stored);
      setProduct(stored.product);
      setIsLoading(false);
      return () => controller.abort();
    }

    const shouldShowLoader = !normalizedInitialProduct;
    if (shouldShowLoader) {
      setIsLoading(true);
    }

    const loadProduct = async () => {
      try {
        const res = await fetch(`/api/products?id=${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          if (shouldShowLoader) {
            const entry = {
              expiresAt: Date.now() + CLIENT_DETAIL_CACHE_TTL_MS,
              product: null,
            };
            clientProductDetailCache.set(id, entry);
            writeStoredProduct(id, entry);
            setProduct(null);
          }
          return;
        }

        const fetched = normalizeFetchedProduct(await res.json() as Product);
        const entry = {
          expiresAt: Date.now() + CLIENT_DETAIL_CACHE_TTL_MS,
          product: fetched,
        };
        clientProductDetailCache.set(id, entry);
        writeStoredProduct(id, entry);
        setProduct(fetched);
      } catch (error) {
        if ((error as Error).name !== 'AbortError' && shouldShowLoader) {
          setProduct(null);
        }
      } finally {
        if (!controller.signal.aborted && shouldShowLoader) {
          setIsLoading(false);
        }
      }
    };

    void loadProduct();
    return () => controller.abort();
  }, [id, normalizedInitialProduct]);

  useEffect(() => {
    setProduct(normalizedInitialProduct);
    setIsLoading(!normalizedInitialProduct);
  }, [normalizedInitialProduct]);

  useEffect(() => {
    if (!product) return;
    saveRecentlyViewedProduct(product);
  }, [product]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-8 bg-card border-4 border-border p-8 pixel-shadow">
          <div className="h-4 w-32 bg-muted mb-8" />
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="aspect-square bg-muted border-4 border-border" />
            <div className="space-y-4">
              <div className="h-6 bg-muted w-3/4" />
              <div className="h-4 bg-muted w-1/2" />
              <div className="h-8 bg-muted w-1/3 mt-8" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="bg-card border-4 border-primary p-8 max-w-lg mx-auto pixel-shadow-primary">
          <h1 className="text-xl font-bold text-primary mb-4 uppercase animate-pixel-blink">
            [ ERROR 404: ITEM NO ENCONTRADO ]
          </h1>
          <p className="text-[10px] text-muted-foreground uppercase mb-8">
            El item ha sido dropeado o ya no existe en la base de datos.
          </p>
          <Link href={backHref}>
            <button className="pixel-button">
              {`< VOLVER A LA BASE `}
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const merchantPrices = pickBestStorePrices(product.prices);
  const bestPrice = merchantPrices[0] ?? product.prices.find((price) => price.price === product.lowestPrice);
  const installments = bestPrice?.installment ? [bestPrice.installment] : [];
  const displayName = normalizeDisplayText(product.name);
  const displayBrand = normalizeDisplayText(product.brand);
  const displayModel = normalizeDisplayText(product.model);
  const displayDescription = normalizeDisplayText(product.description || product.name);
  const specsEntries = Object.entries(product.specs ?? {}).map(([key, value]) => ([
    normalizeDisplayText(key),
    normalizeDisplayText(String(value)),
  ] as const));
  const storesCompared = merchantPrices.length;
  const highestComparablePrice = merchantPrices.length > 0
    ? Math.max(...merchantPrices.map((price) => price.price))
    : product.highestPrice;
  const priceSpread = Math.max(0, highestComparablePrice - product.lowestPrice);
  const spreadPercent = highestComparablePrice > 0
    ? Math.round((priceSpread / highestComparablePrice) * 100)
    : 0;
  const latestSyncAtMs = merchantPrices.reduce((max, price) => {
    const timestamp = new Date(price.lastUpdated).getTime();
    if (!Number.isFinite(timestamp)) return max;
    return Math.max(max, timestamp);
  }, 0);
  const latestSyncLabel = latestSyncAtMs > 0
    ? new Date(latestSyncAtMs).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    : null;

  const relatedProducts: Product[] = [];

  return (
    <div className="container mx-auto px-4 py-8">
      <nav className="mb-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-[10px] uppercase text-muted-foreground hover:text-primary transition-colors font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          [ VOLVER AL INVENTARIO ]
        </Link>
      </nav>

      <div className="grid lg:grid-cols-2 gap-8 mb-12">
        <div className="flex flex-col gap-6">
          <div className="relative aspect-square bg-black border-4 border-border pixel-shadow p-4 flex items-center justify-center">
            <div className="absolute top-2 left-2 w-4 h-4 border-t-4 border-l-4 border-primary" />
            <div className="absolute top-2 right-2 w-4 h-4 border-t-4 border-r-4 border-primary" />
            <div className="absolute bottom-2 left-2 w-4 h-4 border-b-4 border-l-4 border-primary" />
            <div className="absolute bottom-2 right-2 w-4 h-4 border-b-4 border-r-4 border-primary" />

            {product.image ? (
              <div className="relative w-full h-full">
                {isWhitelisted(product.image) ? (
                  <Image
                    src={product.image}
                    alt={displayName}
                    fill
                    className="object-contain image-pixelated p-4"
                    priority
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image}
                    alt={displayName}
                    className="object-contain image-pixelated p-4 w-full h-full"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>
            ) : (
              <div className="relative w-full h-full">
                <Image
                  src="/pixel-box.svg"
                  alt="No image"
                  fill
                  className="object-contain image-pixelated p-8 opacity-50"
                />
              </div>
            )}
            <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-[8px] font-bold uppercase border-l-4 border-t-4 border-border">
              {latestSyncLabel ? `ACT: ${latestSyncLabel}` : 'ACT: N/D'}
            </div>
          </div>

          <div className="bg-card border-4 border-border p-6 pixel-shadow">
            <p className="text-[10px] text-secondary font-bold uppercase tracking-widest mb-2">
              {`// BRAND: ${displayBrand}`}
            </p>
            <h1 className="text-xl md:text-2xl font-bold text-foreground uppercase leading-tight mb-2">
              {displayName}
            </h1>
            <p className="text-[8px] text-muted-foreground uppercase">
              MODELO: {displayModel}
            </p>
            <p className="text-[12px] md:text-[13px] text-foreground/85 mt-3 leading-relaxed normal-case tracking-normal font-mono">
              {displayDescription}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border-4 border-border p-6 pixel-shadow">
            <h3 className="text-[12px] font-bold uppercase mb-4 text-secondary border-b-4 border-secondary inline-block pb-1">
              RESUMEN COMPARADOR
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border-2 border-border bg-muted/40 p-3">
                <p className="text-[8px] uppercase text-muted-foreground mb-1">Tiendas</p>
                <p className="text-[12px] font-bold text-foreground">{storesCompared}</p>
              </div>
              <div className="border-2 border-border bg-muted/40 p-3">
                <p className="text-[8px] uppercase text-muted-foreground mb-1">Diferencia</p>
                <p className="text-[12px] font-bold text-primary">{formatPriceARS(priceSpread)}</p>
              </div>
              <div className="border-2 border-border bg-muted/40 p-3">
                <p className="text-[8px] uppercase text-muted-foreground mb-1">Ahorro Max</p>
                <p className="text-[12px] font-bold text-secondary">{spreadPercent}%</p>
              </div>
            </div>

            <p className="text-[8px] uppercase text-muted-foreground mt-3">
              {`Rango actual: ${formatPriceARS(product.lowestPrice)} - ${formatPriceARS(highestComparablePrice)}`}
            </p>
          </div>

          <div className="bg-muted border-4 border-border p-6 pixel-shadow flex flex-col gap-4">
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-2">MEJOR PRECIO DETECTADO</p>
              <PriceDisplay
                price={selectedInstallment ? selectedInstallment.totalAmount : product.lowestPrice}
                originalPrice={bestPrice?.originalPrice}
                size="lg"
              />
            </div>

            {installments.length > 0 && (
              <div className="pt-4 border-t-4 border-border border-dashed">
                <InstallmentPicker
                  installments={installments}
                  currentPrice={product.lowestPrice}
                  onSelect={setSelectedInstallment}
                />
              </div>
            )}
          </div>

          {specsEntries.length > 0 && (
            <div className="bg-card border-4 border-border p-6 pixel-shadow">
              <h3 className="text-[12px] font-bold uppercase mb-4 text-primary border-b-4 border-primary inline-block pb-1">
                STATS DEL ITEM
              </h3>
              <dl className="space-y-3">
                {specsEntries.map(([key, value]) => (
                  <div key={key} className="flex justify-between text-[10px] uppercase border-b-2 border-muted border-dashed pb-2">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="font-bold text-foreground text-right ml-4">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="bg-card border-4 border-border p-6 pixel-shadow">
            <h3 className="text-[12px] font-bold uppercase mb-4 text-accent border-b-4 border-accent inline-block pb-1">
              TIENDAS DISPONIBLES
            </h3>
            <div className="space-y-3">
              {merchantPrices.map((price, index) => (
                <div
                  key={price.storeId}
                  className={cn(
                    'flex flex-col sm:flex-row sm:items-center justify-between p-3 border-2 gap-3',
                    index === 0
                      ? 'border-secondary bg-secondary/10'
                      : 'border-muted hover:border-border transition-colors',
                  )}
                >
                  <div className="flex flex-col gap-1">
                    {index === 0 && (
                      <span className="text-[8px] font-bold uppercase text-secondary">
                        [ MEJOR PRECIO ]
                      </span>
                    )}
                    <span className="text-[10px] uppercase font-bold text-foreground">
                      {`@${normalizeDisplayText(price.storeName)}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 justify-between sm:justify-end w-full sm:w-auto">
                    <PriceDisplay
                      price={price.price}
                      originalPrice={price.originalPrice}
                      size="sm"
                    />
                    <a
                      href={price.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'px-3 py-2 text-[8px] uppercase font-bold transition-transform active:translate-x-1 active:translate-y-1 flex items-center gap-2',
                        index === 0 ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-foreground border-2 border-border',
                      )}
                    >
                      VER EN TIENDA <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-[8px] uppercase font-bold text-muted-foreground p-4 bg-muted border-4 border-border">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span>GARANTIA OK</span>
            </div>
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-secondary" />
              <span>ENLACE A TIENDA</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              <span>SYNC REAL-TIME</span>
            </div>
          </div>
        </div>
      </div>

      {relatedProducts.length > 0 && (
        <section className="mt-16 border-t-4 border-muted pt-8">
          <h2 className="text-xl font-bold text-foreground mb-6 uppercase inline-block border-b-4 border-primary pb-2">
            ITEMS SIMILARES
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={relatedProduct.id} product={relatedProduct} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default ProductDetailClient;
