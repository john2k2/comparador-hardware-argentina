'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProductGrid, SearchBar } from '@/components/functional';
import { SponsoredStoresSection } from '@/components/home/SponsoredStoresSection';
import { resolveSponsoredStores } from '@/lib/commercial';
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
        <p className="text-[9px] uppercase text-foreground/80 mt-1 tracking-wide">{subtitle}</p>
      </div>

      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-flex min-h-11 items-center justify-center border-2 border-secondary text-secondary text-[9px] font-bold uppercase px-3 py-2 hover:bg-secondary hover:text-secondary-foreground transition-colors min-w-[110px]"
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
  href,
}: {
  label: string;
  title: string;
  cta: string;
  href: string;
}) {
  return (
    <section className="my-8 border-[3px] border-dashed border-muted bg-card p-2">
      <div className="text-[8px] uppercase tracking-[0.2em] text-foreground/80 font-bold mb-2 text-center">
        {label}
      </div>
      <div className="border-[3px] border-border bg-gradient-to-r from-background via-muted/60 to-background min-h-[120px] md:min-h-[140px] px-4 py-5 flex flex-col md:flex-row items-center justify-between gap-4 pixel-shadow">
        <p className="text-[11px] md:text-sm uppercase font-bold text-primary text-center md:text-left leading-relaxed">
          {title}
        </p>
        <Link href={href} className="pixel-button text-[9px] px-4 py-3 min-h-11 min-w-[120px] text-center">{cta}</Link>
      </div>
    </section>
  );
}

type HomePageClientProps = {
  initialFeaturedProducts: Product[];
  initialPriceDropProducts: Product[];
  initialFeaturedFallbackUsed: boolean;
  initialPriceDropFallbackUsed: boolean;
  initialPopularProducts: Product[];
};

export function HomePageClient({
  initialFeaturedProducts,
  initialPriceDropProducts,
  initialFeaturedFallbackUsed,
  initialPriceDropFallbackUsed,
  initialPopularProducts,
}: HomePageClientProps) {
  const router = useRouter();
  const stores = useMemo(() => defaultStores, []);
  const sponsoredStores = useMemo(() => resolveSponsoredStores(defaultStores), []);

  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [featuredProducts] = useState<Product[]>(normalizeFetchedProducts(initialFeaturedProducts));
  const [priceDropProducts] = useState<Product[]>(normalizeFetchedProducts(initialPriceDropProducts));
  const [popularProducts] = useState<Product[]>(normalizeFetchedProducts(initialPopularProducts));
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
          <p className="text-[8px] md:text-[9px] uppercase text-foreground/80 mt-2 tracking-wide">
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
          surface="home_recent"
        />
      ) : (
        <div className="border-[3px] border-border bg-card p-8 text-center pixel-shadow">
          <p className="text-[10px] uppercase text-foreground/80 mb-4">
            Todavia no hay productos vistos.
          </p>
          <Link href="/search" className="pixel-button inline-flex text-[9px] px-4 py-3 min-h-11">
            VER PRODUCTOS
          </Link>
        </div>
      )}

      <PromoBanner
        label="-- INFO COMPARADOR --"
        title="COMPARA EL MISMO PRODUCTO ENTRE MULTIPLES TIENDAS Y ENTRA A LA OPCION MAS CONVENIENTE"
        cta="COMO FUNCIONA"
        href="/acerca"
      />

      <SectionTitle
        title="CATEGORIAS POPULARES"
        subtitle="EXPLORA POR TIPO DE COMPONENTE"
        actionHref="/search"
        actionLabel="VER TODO"
      />
      <section className="mb-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[
          { id: 'tarjetas-graficas', name: 'Placas de Video', icon: 'GPU' },
          { id: 'procesadores', name: 'Procesadores', icon: 'CPU' },
          { id: 'memoria-ram', name: 'Memoria RAM', icon: 'RAM' },
          { id: 'almacenamiento', name: 'SSD / Discos', icon: 'SSD' },
          { id: 'motherboards', name: 'Motherboards', icon: 'MB' },
          { id: 'fuentes-alimentacion', name: 'Fuentes', icon: 'PSU' },
          { id: 'gabinetes', name: 'Gabinetes', icon: 'CASE' },
          { id: 'refrigeracion', name: 'Coolers', icon: 'FAN' },
        ].map((cat) => (
          <Link
            key={cat.id}
            href={`/search?category=${cat.id}`}
            className="block group"
          >
            <article className="bg-card border-4 border-border p-3 pixel-shadow transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 text-center">
              <div className="text-[8px] uppercase tracking-widest text-secondary font-bold mb-1">
                {cat.icon}
              </div>
              <h3 className="text-[11px] font-bold uppercase text-foreground leading-tight">
                {cat.name}
              </h3>
              <div className="mt-1 text-[8px] uppercase font-bold text-primary">
                EXPLORAR →
              </div>
            </article>
          </Link>
        ))}
      </section>

      <SectionTitle
        title="PRODUCTOS DESTACADOS"
        subtitle={featuredFallbackUsed
          ? 'SELECCION ACTIVA DEL CATALOGO MIENTRAS SE RECONSTRUYE LA CURACION AUTOMATICA'
          : 'EN STOCK + ACTUALIZADOS < 24H + MEJOR PRECIO POR CATEGORIA'}
        actionHref="/search?q=rtx"
        actionLabel="VER TODO"
      />
      {featuredProducts.length > 0 || isSectionsLoading ? (
        <ProductGrid
          products={featuredProducts}
          isLoading={isSectionsLoading}
          emptyMessage="No se pudieron cargar destacados en este momento."
          surface="home_featured"
        />
      ) : (
        <HomeEmptyCatalogState
          message="Todavia no hay destacados cargados en esta instancia."
          href="/search?category=tarjetas-graficas"
          cta="EXPLORAR GPUS"
        />
      )}

      <PromoBanner
        label="-- ACTUALIZACION --"
        title="ACTUALIZAMOS PRECIOS Y STOCK EN TIEMPO REAL PARA AYUDARTE A DECIDIR MEJOR"
        cta="VER METODO"
        href="/acerca"
      />

      <SectionTitle
        title={priceDropFallbackUsed ? 'RECIEN ACTUALIZADOS' : 'BAJARON DE PRECIO'}
        subtitle={priceDropFallbackUsed
          ? 'FALLBACK HONESTO: MOSTRAMOS PRODUCTOS ACTIVOS HASTA TENER HISTORIAL SUFICIENTE'
          : 'PRODUCTOS CON BAJA REAL EN HISTORIAL DE 24H'}
        actionHref="/search?sortBy=price-asc"
        actionLabel={priceDropFallbackUsed ? 'VER CATALOGO' : 'MAS BARATOS'}
      />
      {priceDropProducts.length > 0 || isSectionsLoading ? (
        <ProductGrid
          products={priceDropProducts}
          isLoading={isSectionsLoading}
          emptyMessage={priceDropFallbackUsed
            ? 'No se pudieron cargar productos activos para esta seccion.'
            : 'No hay productos con baja de precio detectada por ahora.'}
          surface="home_price_drop"
        />
      ) : (
        <HomeEmptyCatalogState
          message={priceDropFallbackUsed
            ? 'No se pudieron cargar productos activos para esta seccion.'
            : 'No hay bajas detectadas por ahora; podes buscar los mas baratos por categoria.'}
          href="/search?sortBy=price-asc"
          cta="VER MAS BARATOS"
        />
      )}

      {popularProducts.length > 0 && (
        <>
          <SectionTitle
            title="PRODUCTOS POPULARES"
            subtitle="LOS MAS BUSCADOS Y COMPARADOS"
            actionHref="/search"
            actionLabel="VER CATALOGO"
          />
          <ProductGrid
            products={popularProducts}
            emptyMessage="No hay productos populares para mostrar."
            surface="home_popular"
          />
        </>
      )}

      <SectionTitle
        title="COMPARATIVAS POPULARES"
        subtitle="ANALISIS DETALLADO DE PRECIOS Y RENDIMIENTO"
        actionHref="/comparativa"
        actionLabel="VER TODAS"
      />
      <section className="mb-8 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { slug: 'rtx-4060-vs-rx-7600', title: 'RTX 4060 vs RX 7600', category: 'GPUs' },
          { slug: 'ryzen-5-7600x-vs-ryzen-7-5700x', title: 'Ryzen 5 7600X vs 7 5700X', category: 'CPUs' },
          { slug: 'rtx-5070-vs-rtx-4070', title: 'RTX 5070 vs RTX 4070', category: 'GPUs' },
          { slug: 'i5-14600k-vs-ryzen-5-7600x', title: 'Intel i5-14600K vs Ryzen 5 7600X', category: 'CPUs' },
          { slug: 'ddr5-vs-ddr4', title: 'DDR5 vs DDR4', category: 'RAM' },
          { slug: 'ryzen-7-9800x3d-vs-i9-14900k', title: 'Ryzen 7 9800X3D vs i9-14900K', category: 'CPUs' },
          { slug: 'rtx-5090-vs-rx-9070-xt', title: 'RTX 5090 vs RX 9070 XT', category: 'GPUs' },
        ].map((comparison) => (
          <Link
            key={comparison.slug}
            href={`/comparativa/${comparison.slug}`}
            className="block group"
          >
            <article className="bg-card border-4 border-border p-4 pixel-shadow transition-transform group-hover:-translate-y-1 group-hover:translate-x-1">
              <div className="text-[7px] uppercase tracking-widest text-secondary font-bold mb-2">
                {comparison.category}
              </div>
              <h3 className="text-[11px] font-bold uppercase text-foreground leading-tight">
                {comparison.title}
              </h3>
              <div className="mt-2 text-[8px] uppercase font-bold text-primary">
                VER COMPARATIVA →
              </div>
            </article>
          </Link>
        ))}
      </section>

      <SectionTitle
        title="GUIAS PC GAMER"
        subtitle="BUILDS RECOMENDADAS POR PRESUPUESTO"
        actionHref="/guia"
        actionLabel="VER TODAS"
      />
      <section className="mb-8 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { slug: 'pc-gamer-1-millon', title: '$1.000.000', target: '1080p 60fps' },
          { slug: 'pc-gamer-1-5-millones', title: '$1.500.000', target: '1080p 144Hz' },
          { slug: 'pc-gamer-2-millones', title: '$2.000.000', target: '1440p 60fps' },
          { slug: 'pc-gamer-3-millones', title: '$3.000.000', target: '1440p 144Hz' },
          { slug: 'pc-gamer-4-millones', title: '$4.000.000+', target: '4K Gaming' },
        ].map((guide) => (
          <Link
            key={guide.slug}
            href={`/guia/${guide.slug}`}
            className="block group"
          >
            <article className="bg-card border-4 border-border p-4 pixel-shadow transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 text-center">
              <h3 className="text-[14px] font-bold uppercase text-primary mb-1">
                {guide.title}
              </h3>
              <p className="text-[9px] uppercase text-foreground/80 mb-2">
                {guide.target}
              </p>
              <div className="text-[8px] uppercase font-bold text-secondary">
                VER BUILD →
              </div>
            </article>
          </Link>
        ))}
      </section>

      <SponsoredStoresSection stores={sponsoredStores} />

      <PromoBanner
        label="-- AVISO IMPORTANTE --"
        title="LA COMPRA FINAL Y LAS CONDICIONES SE REALIZAN SIEMPRE EN LA TIENDA DE DESTINO"
        cta="VER TIENDAS"
        href="/search"
      />

      <section className="mt-10 bg-card border-[3px] border-border pixel-shadow p-4">
        <h2 className="text-[11px] uppercase text-primary font-bold mb-3">[ CATEGORIAS RAPIDAS ]</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/search?category=${category.id}`}
              className="min-h-11 border-2 border-border p-3 text-[9px] uppercase font-bold text-center bg-muted/40 hover:border-secondary hover:text-secondary transition-colors flex items-center justify-center"
            >
              {category.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function HomeEmptyCatalogState({
  message,
  href,
  cta,
}: {
  message: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="border-[3px] border-border bg-card p-6 text-center pixel-shadow">
      <p className="text-[10px] uppercase text-foreground/80 leading-relaxed mb-4">
        {message}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href={href} className="pixel-button inline-flex items-center justify-center text-[9px] px-4 py-3 min-h-11">
          {cta}
        </Link>
        <Link href="/search" className="inline-flex min-h-11 items-center justify-center border-2 border-secondary px-4 py-3 text-[9px] uppercase font-bold text-secondary hover:bg-secondary hover:text-secondary-foreground transition-colors">
          BUSCAR MANUALMENTE
        </Link>
      </div>
    </div>
  );
}

export default HomePageClient;
