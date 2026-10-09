'use client';

import Link from 'next/link';
import { SearchBar, ProductGrid, Filters } from '@/components/functional';
import { getCategorySeoCopy } from '@/lib/search/search-seo';
import { categories, stores as defaultStores } from '@/lib/scrapers/static-data';
import { type Product, type SearchFilters } from '@/lib/types';
import { buildSearchPaginationHref, toSearchFilters } from '@/lib/search/search-state';

type SearchPageViewProps = {
  products: Product[];
  categoryExcludedOnPage?: number;
  identityExcludedOnPage?: number;
  filters: ReturnType<typeof toSearchFilters>;
  searchQuery: string;
  isBusy: boolean;
  hasActiveFilters: boolean;
  totalResults: number;
  totalPages: number;
  currentPage: number;
  isSeoCategoryLanding: boolean;
  categorySeoCopy: ReturnType<typeof getCategorySeoCopy>;
  searchRoute: string;
  availableStores: typeof defaultStores;
  searchError: string | null;
  showNoResultsState: boolean;
  showIdleState: boolean;
  onSearch: (query: string) => void;
  onFiltersChange: (filters: Partial<SearchFilters>) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
};

export function SearchPageView({
  products,
  categoryExcludedOnPage = 0,
  identityExcludedOnPage = 0,
  filters,
  searchQuery,
  isBusy,
  hasActiveFilters,
  totalResults,
  totalPages,
  currentPage,
  isSeoCategoryLanding,
  categorySeoCopy,
  searchRoute,
  availableStores,
  searchError,
  showNoResultsState,
  showIdleState,
  onSearch,
  onFiltersChange,
  onClearFilters,
  onPageChange,
}: SearchPageViewProps) {
  const pageHeading = isSeoCategoryLanding && categorySeoCopy
    ? categorySeoCopy.heading
    : searchQuery
      ? `Resultados para ${searchQuery}`
      : 'Buscar hardware en tiendas argentinas';

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 xl:px-8 py-6">
      {isSeoCategoryLanding && categorySeoCopy && (
        <header className="mb-5 min-w-0">
          <h1 className="font-mono! text-xl md:text-2xl text-primary leading-snug">{categorySeoCopy.heading}</h1>
          <p className="mt-3 max-w-[75ch] font-body text-base text-muted-foreground leading-relaxed line-clamp-2 md:line-clamp-none">{categorySeoCopy.intro}</p>
        </header>
      )}

      {!isSeoCategoryLanding && (
        <h1 className="sr-only">{pageHeading}</h1>
      )}

      <div className="flex flex-col md:flex-row gap-6 mb-8 items-center">
        <div className="w-full">
          <SearchBar
            key={searchQuery}
            onSearch={onSearch}
            placeholder="NUEVA BUSQUEDA..."
            initialValue={searchQuery}
            isLoading={isBusy}
            loadingText={searchQuery ? `Consultando catálogo para ${searchQuery}...` : 'Consultando catálogo y precios...'}
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-72 flex-shrink-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto scrollbar-thin lg:pr-2 pb-4 flex flex-col gap-5 lg:gap-8 order-1">
          <FiltersPanel filters={filters} stores={availableStores} onChange={onFiltersChange} />
        </aside>

        <div className="flex-1 min-w-0 order-2">
          <SearchHeader totalResults={totalResults} searchQuery={searchQuery} isBusy={isBusy} />
          <div className="mb-4 min-w-0 font-body text-sm leading-relaxed">
            <p className="text-muted-foreground">{filters.includeUnavailable
              ? filters.minPrice !== undefined || filters.maxPrice !== undefined
                ? 'El rango de precios se aplica a ofertas recientes. Quitá el rango para consultar referencias anteriores y fichas sin precio.'
                : 'Incluye referencias anteriores y fichas sin una oferta reciente para comparar.'
              : 'Productos con precio, disponibilidad e identidad aptos para comparar, relevados en las últimas 24 h.'}</p>
            <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-secondary" checked={Boolean(filters.includeUnavailable)}
                disabled={isBusy} onChange={(event) => onFiltersChange({ includeUnavailable: event.target.checked })} />
              <span>Mostrar también productos sin oferta reciente</span>
            </label>
          </div>
          {categoryExcludedOnPage > 0 && <p className="mb-4 border-2 border-border bg-card px-4 py-3 font-body text-sm leading-relaxed">
            {categoryExcludedOnPage === 1 ? 'Una publicación pendiente de clasificación no se muestra' : `${categoryExcludedOnPage} publicaciones pendientes de clasificación no se muestran`} en esta página. El total todavía las incluye.
          </p>}
          {identityExcludedOnPage > 0 && <p role="status" className="mb-4 border-2 border-border bg-card px-4 py-3 font-body text-sm leading-relaxed">
            Apartamos {identityExcludedOnPage === 1 ? 'una ficha con ofertas de otro producto' : `${identityExcludedOnPage} fichas con ofertas de otros productos`} de esta página. El total del catálogo todavía las incluye mientras revisamos su identidad.
          </p>}
          {!isBusy && totalResults > 0 && products.length === 0 && <p className="mb-4 font-body text-base text-muted-foreground">Esta página no contiene productos verificables de la categoría elegida. Probá la página siguiente o ampliá los filtros.</p>}
          {isBusy && <LoadingState searchQuery={searchQuery} />}
          <div id="product-grid-start" className="min-w-0 scroll-mt-24 bg-muted p-3 sm:p-4 border-4 border-border relative overflow-hidden">
            {searchError && <SearchErrorState error={searchError} onRetry={() => onSearch(searchQuery)} />}
            {showNoResultsState && <NoResultsState searchQuery={searchQuery} includeUnavailable={filters.includeUnavailable} hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} onRetry={() => onSearch(searchQuery)} />}
            {showIdleState && <IdleState />}
            {!searchError && !showNoResultsState && !showIdleState && (
              <ProductGrid
                products={products}
                isLoading={isBusy}
                emptyMessage="No se encontraron productos"
                returnTo={searchRoute}
                surface="search_results"
              />
            )}
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              isBusy={isBusy}
              searchRoute={searchRoute}
              onPageChange={onPageChange}
            />
          </div>
        </div>
      </div>
      {isSeoCategoryLanding && categorySeoCopy && (
        <section className="mt-8 min-w-0 bg-card border-[3px] border-border p-4 md:p-6 pixel-shadow" aria-label="Ayuda para comparar esta categoría">
          <h2 className="font-mono! text-lg text-secondary">Cómo elegir y comparar</h2>
          <p className="mt-4 text-[12px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/80 font-mono">{categorySeoCopy.intro}</p>
          <div className="mt-4 grid md:grid-cols-2 gap-3 text-[12px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/80 font-mono">
            <p>
              Para comparar mejor, revisá si el producto publicado corresponde exactamente a la variante que buscás:
              capacidad, generación, conectividad, garantía, accesorios incluidos y condiciones finales pueden cambiar entre
              tiendas aunque el título sea parecido.
            </p>
            <p>
              El ordenamiento y los filtros ayudan a reducir ruido, pero la validación final siempre conviene hacerla en el
              comercio de destino. Confirmá stock, cuotas, costo de envío y política de cambios antes de completar la compra.
            </p>
          </div>
          {categorySeoCopy.relatedLinks && categorySeoCopy.relatedLinks.length > 0 && (
            <nav aria-label="Comparativas y guías relacionadas" className="mt-5 border-t-2 border-border pt-4">
              <p className="text-[12px] font-bold uppercase tracking-wide md:tracking-[0.2em] text-secondary mb-3">
                Seguí comparando
              </p>
              <div className="flex flex-wrap gap-2">
                {categorySeoCopy.relatedLinks.map((relatedLink) => (
                  <Link
                    key={relatedLink.href}
                    href={relatedLink.href}
                    className="min-h-11 w-full sm:w-auto inline-flex items-center border-2 border-border bg-background px-3 py-2 text-[12px] md:text-[12px] font-bold text-foreground hover:border-primary hover:text-primary transition-colors break-words"
                  >
                    {relatedLink.label} →
                  </Link>
                ))}
              </div>
            </nav>
          )}
          {categorySeoCopy.faqs && categorySeoCopy.faqs.length > 0 && (
            <section aria-label="Preguntas frecuentes" className="mt-5 border-t-2 border-border pt-4 space-y-3">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.2em] text-secondary">
                Preguntas frecuentes
              </h2>
              {categorySeoCopy.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="text-[12px] md:text-[12px] font-bold normal-case tracking-normal text-foreground font-mono">
                    {faq.question}
                  </h3>
                  <p className="mt-1 text-[12px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/80 font-mono">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </section>
          )}
        </section>
      )}

    </div>
  );
}

function FiltersPanel({ filters, stores, onChange }: { filters: ReturnType<typeof toSearchFilters>; stores: typeof defaultStores; onChange: (f: Partial<SearchFilters>) => void }) {
  return (
    <div className="bg-card border-4 border-border p-4 flex-shrink-0 min-w-0">
      <Filters filters={filters} onChange={onChange} categories={categories} stores={stores} />
    </div>
  );
}

function SearchHeader({ totalResults, searchQuery, isBusy }: { totalResults: number; searchQuery: string; isBusy: boolean }) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div className="bg-primary text-primary-foreground p-2 inline-block border-2 border-border">
        <p className="text-[12px] uppercase font-bold" aria-live="polite">{isBusy ? 'BUSCANDO...' : `RESULTADOS: ${totalResults} ITEMS`}</p>
      </div>
      {searchQuery && (
        <div className="min-w-0 text-[12px] uppercase font-bold text-foreground/80 break-words">
          BUSQUEDA: <span className="text-secondary">&quot;{searchQuery}&quot;</span>
        </div>
      )}
    </div>
  );
}

function LoadingState({ searchQuery }: { searchQuery: string }) {
  return (
    <div role="status" aria-live="polite" className="min-w-0 mb-4 border-2 border-secondary bg-card px-3 sm:px-4 py-3 pixel-shadow motion-safe:animate-pulse overflow-hidden">
      <p className="text-[12px] uppercase font-bold text-secondary tracking-wide break-words">
        {searchQuery ? `CONSULTANDO CATÁLOGO PARA "${searchQuery}"...` : 'CONSULTANDO CATÁLOGO Y PRECIOS...'}
      </p>
      <p className="text-[12px] uppercase text-foreground/80 mt-1 tracking-wide">
        Espera a que termine la busqueda antes de asumir que no hay stock o resultados.
      </p>
    </div>
  );
}

function NoResultsState({ searchQuery, includeUnavailable, hasActiveFilters, onClearFilters, onRetry }: { searchQuery: string; includeUnavailable?: boolean; hasActiveFilters: boolean; onClearFilters: () => void; onRetry: () => void }) {
  return (
    <div className="border-4 border-primary bg-card p-6 md:p-8 text-center pixel-shadow">
      <p className="text-[12px] uppercase font-bold text-primary">[ SIN RESULTADOS ]</p>
      <p className="text-[12px] uppercase text-foreground/80 mt-2 leading-relaxed">
        {includeUnavailable
          ? searchQuery ? `No encontramos coincidencias para "${searchQuery}".` : 'No encontramos coincidencias con los filtros actuales.'
          : 'No tenemos ofertas recientes aptas para comparar con esta búsqueda y estos filtros.'}
      </p>
      <p className="font-body text-sm text-foreground/80 mt-2 leading-relaxed">{includeUnavailable
        ? 'Probá otra palabra, una marca o modelo más corto, o ampliá los filtros.'
        : 'Esto no confirma que el producto esté agotado. Podés consultar las referencias anteriores activando la opción de arriba.'}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {hasActiveFilters && <button onClick={onClearFilters} className="pixel-button text-[12px] px-4 py-3 min-h-11">LIMPIAR FILTROS</button>}
        <button onClick={onRetry} className="pixel-button text-[12px] px-4 py-3 min-h-11">REINTENTAR BUSQUEDA</button>
      </div>
    </div>
  );
}

function IdleState() {
  return (
    <div className="border-4 border-border bg-card p-8 text-center pixel-shadow">
      <p className="text-[12px] uppercase font-bold text-primary">[ LISTO PARA BUSCAR ]</p>
      <p className="text-[12px] uppercase text-foreground/80 mt-2">Escribi un producto para empezar (ej: RTX 5060, Ryzen 7600).</p>
    </div>
  );
}

function SearchErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="border-4 border-destructive bg-card p-8 text-center pixel-shadow" role="alert">
      <p className="text-[12px] uppercase font-bold text-destructive">[ ERROR EN LA BUSQUEDA ]</p>
      <p className="text-[12px] uppercase text-foreground/80 mt-2 mb-4">{error}</p>
      <button type="button" onClick={onRetry} className="pixel-button text-[12px] min-h-11">
        REINTENTAR
      </button>
    </div>
  );
}

type PaginationControlsProps = {
  currentPage: number;
  totalPages: number;
  isBusy: boolean;
  searchRoute: string;
  onPageChange: (page: number) => void;
};

export function PaginationControls({
  currentPage,
  totalPages,
  isBusy,
  searchRoute,
  onPageChange,
}: PaginationControlsProps) {
  if (isBusy || totalPages <= 1) return null;

  const navigateToPage = (page: number) => {
    onPageChange(page);
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    document.getElementById('product-grid-start')?.scrollIntoView({ behavior });
  };

  return (
    <nav aria-label="Paginación de resultados" className="flex justify-between items-center mt-6 pt-6 border-t-4 border-border border-dashed">
      {currentPage > 1 ? (
        <Link
          href={buildSearchPaginationHref(searchRoute, currentPage - 1)}
          prefetch={false}
          onNavigate={(event) => {
            event.preventDefault();
            navigateToPage(currentPage - 1);
          }}
          rel="prev"
          aria-label={`Ir a la página ${currentPage - 1}`}
          className="pixel-button text-[12px] min-h-11"
        >
          {`<< PREV`}
        </Link>
      ) : (
        <span aria-disabled="true" className="pixel-button opacity-50 cursor-not-allowed text-[12px] min-h-11">
          {`<< PREV`}
        </span>
      )}
      <div className="text-[12px] font-bold uppercase text-primary px-4 py-2 border-2 border-primary bg-card pixel-shadow-primary flex items-center gap-2">
        <span className="sr-only">{`Página ${currentPage} de ${totalPages}`}</span>
        <span aria-hidden="true"><span className="hidden sm:inline">NIVEL</span> {currentPage} / {totalPages}</span>
      </div>
      {currentPage < totalPages ? (
        <Link
          href={buildSearchPaginationHref(searchRoute, currentPage + 1)}
          prefetch={false}
          onNavigate={(event) => {
            event.preventDefault();
            navigateToPage(currentPage + 1);
          }}
          rel="next"
          aria-label={`Ir a la página ${currentPage + 1}`}
          className="pixel-button text-[12px] min-h-11"
        >
          {`NEXT >>`}
        </Link>
      ) : (
        <span aria-disabled="true" className="pixel-button opacity-50 cursor-not-allowed text-[12px] min-h-11">
          {`NEXT >>`}
        </span>
      )}
    </nav>
  );
}
