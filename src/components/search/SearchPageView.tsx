'use client';

import { SearchBar, ProductGrid, Filters } from '@/components/functional';
import { getCategorySeoCopy } from '@/lib/search/search-seo';
import { categories, stores as defaultStores } from '@/lib/scrapers/static-data';
import { type HardwareCategory, type Product, type SearchFilters } from '@/lib/types';
import { toSearchFilters } from '@/lib/search/search-state';

type SearchPageViewProps = {
  products: Product[];
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
  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 xl:px-8 py-6">
      {isSeoCategoryLanding && categorySeoCopy && (
        <header className="mb-8 bg-card border-4 border-border p-5 md:p-6 pixel-shadow">
          <p className="text-[8px] uppercase tracking-[0.3em] text-secondary font-bold mb-3">LANDING DE CATEGORIA</p>
          <h1 className="text-sm md:text-lg uppercase font-bold leading-relaxed text-foreground">{categorySeoCopy.heading}</h1>
          <p className="mt-4 text-[11px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/80 font-mono">{categorySeoCopy.intro}</p>
        </header>
      )}

      <div className="flex flex-col md:flex-row gap-6 mb-8 items-center">
        <div className="w-full">
          <SearchBar
            key={searchQuery}
            onSearch={onSearch}
            placeholder="NUEVA BUSQUEDA..."
            initialValue={searchQuery}
            isLoading={isBusy}
            loadingText={searchQuery ? `Consultando tiendas para ${searchQuery}...` : 'Consultando tiendas y precios...'}
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-72 flex-shrink-0 lg:sticky lg:top-8 max-h-[calc(100vh-4rem)] overflow-y-auto scrollbar-thin pr-2 pb-4 flex flex-col gap-8">
          <FiltersPanel filters={filters} stores={availableStores} onChange={onFiltersChange} />
          <CategoriesPanel filters={filters} onChange={onFiltersChange} />
        </aside>

        <div className="flex-1">
          <SearchHeader totalResults={totalResults} searchQuery={searchQuery} isBusy={isBusy} />
          {isBusy && <LoadingState searchQuery={searchQuery} />}
          <div id="product-grid-start" className="bg-muted p-4 border-4 border-border relative">
            {searchError && <SearchErrorState error={searchError} onRetry={() => onSearch(searchQuery)} />}
            {showNoResultsState && <NoResultsState searchQuery={searchQuery} hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} onRetry={() => onSearch(searchQuery)} />}
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
            <PaginationControls currentPage={currentPage} totalPages={totalPages} isBusy={isBusy} onPageChange={onPageChange} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FiltersPanel({ filters, stores, onChange }: { filters: ReturnType<typeof toSearchFilters>; stores: typeof defaultStores; onChange: (f: Partial<SearchFilters>) => void }) {
  return (
    <div className="bg-card border-4 border-border p-4 flex-shrink-0">
      <h2 className="text-[12px] mb-6 border-b-4 border-primary pb-2 uppercase font-bold text-primary">FILTROS</h2>
      <Filters filters={filters} onChange={onChange} categories={categories} stores={stores} />
    </div>
  );
}

function CategoriesPanel({ filters, onChange }: { filters: ReturnType<typeof toSearchFilters>; onChange: (f: Partial<SearchFilters>) => void }) {
  return (
    <div className="bg-card border-4 border-border p-4 flex-shrink-0">
      <h3 className="text-[10px] uppercase font-bold text-primary mb-3 border-b-2 border-muted pb-2">CATEGORIAS</h3>
      <div className="flex flex-col gap-1">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onChange({ category: category.id as HardwareCategory })}
            aria-label={`Filtrar por categoría: ${category.name}`}
            className={`text-left text-[9px] uppercase font-bold px-2 py-1.5 transition-colors ${filters.category === category.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchHeader({ totalResults, searchQuery, isBusy }: { totalResults: number; searchQuery: string; isBusy: boolean }) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div className="bg-primary text-primary-foreground p-2 inline-block border-2 border-border">
        <p className="text-[10px] uppercase font-bold" aria-live="polite">{isBusy ? 'BUSCANDO...' : `RESULTADOS: ${totalResults} ITEMS`}</p>
      </div>
      {searchQuery && (
        <div className="text-[10px] uppercase font-bold text-muted-foreground">
          BUSQUEDA: <span className="text-secondary">&quot;{searchQuery}&quot;</span>
        </div>
      )}
    </div>
  );
}

function LoadingState({ searchQuery }: { searchQuery: string }) {
  return (
    <div className="mb-4 border-2 border-secondary bg-card px-4 py-3 pixel-shadow animate-pulse">
      <p className="text-[10px] uppercase font-bold text-secondary tracking-wide">
        {searchQuery ? `ESCANEANDO TIENDAS PARA "${searchQuery}"...` : 'ESCANEANDO TIENDAS Y PRECIOS...'}
      </p>
      <p className="text-[8px] uppercase text-muted-foreground mt-1 tracking-wide">
        Espera a que termine la busqueda antes de asumir que no hay stock o resultados.
      </p>
    </div>
  );
}

function NoResultsState({ searchQuery, hasActiveFilters, onClearFilters, onRetry }: { searchQuery: string; hasActiveFilters: boolean; onClearFilters: () => void; onRetry: () => void }) {
  return (
    <div className="border-4 border-primary bg-card p-6 md:p-8 text-center pixel-shadow">
      <p className="text-[11px] uppercase font-bold text-primary">[ SIN RESULTADOS ]</p>
      <p className="text-[9px] uppercase text-muted-foreground mt-2 leading-relaxed">
        {searchQuery ? `No encontramos coincidencias para "${searchQuery}".` : 'No encontramos coincidencias con los filtros actuales.'}
      </p>
      <p className="text-[8px] uppercase text-muted-foreground mt-2 leading-relaxed">Proba otra palabra, una marca/modelo mas corto o amplia los filtros.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {hasActiveFilters && <button onClick={onClearFilters} className="pixel-button text-[9px] px-3 py-2">LIMPIAR FILTROS</button>}
        <button onClick={onRetry} className="pixel-button text-[9px] px-3 py-2">REINTENTAR BUSQUEDA</button>
      </div>
    </div>
  );
}

function IdleState() {
  return (
    <div className="border-4 border-border bg-card p-8 text-center pixel-shadow">
      <p className="text-[10px] uppercase font-bold text-primary">[ LISTO PARA BUSCAR ]</p>
      <p className="text-[9px] uppercase text-muted-foreground mt-2">Escribi un producto para empezar (ej: RTX 5060, Ryzen 7600).</p>
    </div>
  );
}

function SearchErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="border-4 border-destructive bg-card p-8 text-center pixel-shadow">
      <p className="text-[10px] uppercase font-bold text-destructive">[ ERROR EN LA BUSQUEDA ]</p>
      <p className="text-[9px] uppercase text-muted-foreground mt-2 mb-4">{error}</p>
      <button onClick={onRetry} className="pixel-button text-[10px]">
        REINTENTAR
      </button>
    </div>
  );
}

function PaginationControls({ currentPage, totalPages, isBusy, onPageChange }: { currentPage: number; totalPages: number; isBusy: boolean; onPageChange: (p: number) => void }) {
  if (isBusy || currentPage >= totalPages || totalPages <= 1) return null;
  return (
    <div className="flex justify-between items-center mt-6 pt-6 border-t-4 border-border border-dashed">
      <button
        onClick={() => { onPageChange(currentPage - 1); document.getElementById('product-grid-start')?.scrollIntoView({ behavior: 'smooth' }); }}
        disabled={currentPage === 1}
        className="pixel-button disabled:opacity-50 disabled:active:translate-y-0 disabled:active:translate-x-0 disabled:cursor-not-allowed text-[10px]"
      >
        {`<< PREV`}
      </button>
      <div className="text-[10px] font-bold uppercase text-primary px-4 py-2 border-2 border-primary bg-card pixel-shadow-primary flex items-center gap-2">
        <span className="hidden sm:inline">NIVEL</span> {currentPage} / {totalPages}
      </div>
      <button
        onClick={() => { onPageChange(currentPage + 1); document.getElementById('product-grid-start')?.scrollIntoView({ behavior: 'smooth' }); }}
        disabled={currentPage === totalPages}
        className="pixel-button disabled:opacity-50 disabled:active:translate-y-0 disabled:active:translate-x-0 disabled:cursor-not-allowed text-[10px]"
      >
        {`NEXT >>`}
      </button>
    </div>
  );
}
