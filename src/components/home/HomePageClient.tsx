'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProductGrid, SearchBar } from '@/components/functional';
import { categories, stores as defaultStores } from '@/lib/scrapers/static-data';
import { readRecentlyViewedProducts } from '@/lib/client/recently-viewed';
import type { Product } from '@/lib/types';

const RECENT_PRODUCTS_LIMIT = 4;

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

function normalizeFetchedProducts(products: Product[]): Product[] {
  return products.map(normalizeFetchedProduct);
}

function SectionTitle({
  title,
  subtitle,
  actionHref,
  actionLabel,
}: {
  title: string;
  subtitle: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <header className="mb-4 bg-card border-[3px] border-border pixel-shadow p-4 md:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-[12px] md:text-[14px] font-bold uppercase text-primary tracking-wide">
          {`[ ${title} ]`}
        </h2>
        <p className="text-[9px] uppercase text-muted-foreground mt-1 tracking-wide">{subtitle}</p>
      </div>

      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-flex items-center justify-center border-2 border-secondary text-secondary text-[9px] font-bold uppercase px-3 py-2 hover:bg-secondary hover:text-secondary-foreground transition-colors min-w-[110px]"
        >
          {actionLabel}
        </Link>
      )}
    </header>
  );
}

function PromoBanner({
  label,
  title,
  cta,
}: {
  label: string;
  title: string;
  cta: string;
}) {
  return (
    <section className="my-8 border-[3px] border-dashed border-muted bg-card p-2">
      <div className="text-[8px] uppercase tracking-[0.2em] text-muted-foreground font-bold mb-2 text-center">
        {label}
      </div>
      <div className="border-[3px] border-border bg-gradient-to-r from-background via-muted/60 to-background min-h-[120px] md:min-h-[140px] px-4 py-5 flex flex-col md:flex-row items-center justify-between gap-4 pixel-shadow">
        <p className="text-[11px] md:text-sm uppercase font-bold text-primary text-center md:text-left leading-relaxed">
          {title}
        </p>
        <button className="pixel-button text-[9px] px-4 py-2 min-w-[120px]">{cta}</button>
      </div>
    </section>
  );
}

type HomePageClientProps = {
  initialFeaturedProducts: Product[];
  initialPriceDropProducts: Product[];
  initialFeaturedFallbackUsed: boolean;
  initialPriceDropFallbackUsed: boolean;
};

export function HomePageClient({
  initialFeaturedProducts,
  initialPriceDropProducts,
  initialFeaturedFallbackUsed,
  initialPriceDropFallbackUsed,
}: HomePageClientProps) {
  const router = useRouter();
  const stores = useMemo(() => defaultStores, []);

  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [featuredProducts] = useState<Product[]>(normalizeFetchedProducts(initialFeaturedProducts));
  const [priceDropProducts] = useState<Product[]>(normalizeFetchedProducts(initialPriceDropProducts));
  const [featuredFallbackUsed] = useState(initialFeaturedFallbackUsed);
  const [priceDropFallbackUsed] = useState(initialPriceDropFallbackUsed);
  const [isSectionsLoading] = useState(false);

  useEffect(() => {
    const loadRecent = () => {
      setRecentProducts(normalizeFetchedProducts(readRecentlyViewedProducts(RECENT_PRODUCTS_LIMIT)));
    };

    loadRecent();
    window.addEventListener('focus', loadRecent);
    return () => window.removeEventListener('focus', loadRecent);
  }, []);

  const handleSearch = (query: string) => {
    const nextQuery = query.trim();
    if (nextQuery) {
      router.push(`/search?q=${encodeURIComponent(nextQuery)}`);
    } else {
      router.push('/search');
    }
  };

  return (
    <div className="w-full max-w-[1760px] mx-auto px-4 xl:px-8 py-8">
      <section className="mb-6 bg-card/95 border-[3px] border-border pixel-shadow p-4 md:p-6 flex flex-col lg:flex-row gap-5 lg:items-center lg:justify-between backdrop-blur-[1px]">
        <div>
          <h1 className="text-xl md:text-3xl font-bold uppercase text-foreground tracking-tight">
            [ COMPARA PRECIOS DE HARDWARE EN ARGENTINA ]
          </h1>
          <p className="text-[10px] md:text-xs uppercase text-secondary font-bold mt-2 tracking-[0.14em]">
            PROCESADORES, GPUS, RAM, SSD Y MAS EN MULTIPLES TIENDAS
          </p>
          <p className="text-[8px] md:text-[9px] uppercase text-muted-foreground mt-2 tracking-wide">
            COMPARADOR INDEPENDIENTE: NO VENDEMOS, SOLO MOSTRAMOS PRECIOS, DISPONIBILIDAD Y ENLACES A TIENDAS
          </p>
        </div>

        <div className="w-full lg:w-[480px] border-[3px] border-primary p-1 bg-background">
          <SearchBar
            onSearch={handleSearch}
            placeholder="[ BUSCAR PRODUCTO... ]"
          />
        </div>
      </section>

      <section className="mb-8 border-y-[3px] border-muted py-2 overflow-hidden bg-transparent w-screen relative left-1/2 right-1/2 -mx-[50vw]">
        <div className="relative flex overflow-hidden">
          <div className="flex w-max animate-marquee">
            <div className="flex items-center gap-6 pr-6 shrink-0">
              {stores.map((store) => (
                <div key={`store-1-${store.id}`} className="px-6 py-2 bg-card border-2 border-border text-foreground shrink-0">
                  <span className="text-[10px] sm:text-xs font-bold uppercase text-accent">{`@ ${store.name}`}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-6 pr-6 shrink-0" aria-hidden="true">
              {stores.map((store) => (
                <div key={`store-2-${store.id}`} className="px-6 py-2 bg-card border-2 border-border text-foreground shrink-0">
                  <span className="text-[10px] sm:text-xs font-bold uppercase text-accent">{`@ ${store.name}`}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SectionTitle
        title="VISTOS RECIENTEMENTE"
        subtitle="ULTIMOS PRODUCTOS QUE ABRISTE"
        actionHref="/search"
        actionLabel="IR A BUSQUEDA"
      />
      {recentProducts.length > 0 ? (
        <ProductGrid
          products={recentProducts}
          emptyMessage="Todavia no viste productos."
        />
      ) : (
        <div className="border-[3px] border-border bg-card p-8 text-center pixel-shadow">
          <p className="text-[10px] uppercase text-muted-foreground mb-4">
            Todavia no hay productos vistos.
          </p>
          <Link href="/search" className="pixel-button inline-flex text-[9px] px-4 py-2">
            VER PRODUCTOS
          </Link>
        </div>
      )}

      <PromoBanner
        label="-- INFO COMPARADOR --"
        title="COMPARA EL MISMO PRODUCTO ENTRE MULTIPLES TIENDAS Y ENTRA A LA OPCION MAS CONVENIENTE"
        cta="COMO FUNCIONA"
      />

      <SectionTitle
        title="PRODUCTOS DESTACADOS"
        subtitle={featuredFallbackUsed
          ? 'SELECCION ACTIVA DEL CATALOGO MIENTRAS SE RECONSTRUYE LA CURACION AUTOMATICA'
          : 'EN STOCK + ACTUALIZADOS < 24H + MEJOR PRECIO POR CATEGORIA'}
        actionHref="/search?q=rtx"
        actionLabel="VER TODO"
      />
      <ProductGrid
        products={featuredProducts}
        isLoading={isSectionsLoading}
        emptyMessage="No se pudieron cargar destacados en este momento."
      />

      <PromoBanner
        label="-- ACTUALIZACION --"
        title="ACTUALIZAMOS PRECIOS Y STOCK EN TIEMPO REAL PARA AYUDARTE A DECIDIR MEJOR"
        cta="VER METODO"
      />

      <SectionTitle
        title={priceDropFallbackUsed ? 'RECIEN ACTUALIZADOS' : 'BAJARON DE PRECIO'}
        subtitle={priceDropFallbackUsed
          ? 'FALLBACK HONESTO: MOSTRAMOS PRODUCTOS ACTIVOS HASTA TENER HISTORIAL SUFICIENTE'
          : 'PRODUCTOS CON BAJA REAL EN HISTORIAL DE 24H'}
        actionHref="/search?sortBy=price-asc"
        actionLabel={priceDropFallbackUsed ? 'VER CATALOGO' : 'MAS BARATOS'}
      />
      <ProductGrid
        products={priceDropProducts}
        isLoading={isSectionsLoading}
        emptyMessage={priceDropFallbackUsed
          ? 'No se pudieron cargar productos activos para esta seccion.'
          : 'No hay productos con baja de precio detectada por ahora.'}
      />

      <PromoBanner
        label="-- AVISO IMPORTANTE --"
        title="LA COMPRA FINAL Y LAS CONDICIONES SE REALIZAN SIEMPRE EN LA TIENDA DE DESTINO"
        cta="VER TIENDAS"
      />

      <section className="mt-10 bg-card border-[3px] border-border pixel-shadow p-4">
        <h3 className="text-[11px] uppercase text-primary font-bold mb-3">[ CATEGORIAS RAPIDAS ]</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/search?category=${category.id}`}
              className="border-2 border-border p-3 text-[9px] uppercase font-bold text-center bg-muted/40 hover:border-secondary hover:text-secondary transition-colors"
            >
              {category.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default HomePageClient;
