'use client';

import { useCallback, useMemo, useState } from 'react';
import { ProductGrid } from '@/components/functional';
import { hydrateProducts } from '@/lib/product-serialization';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { useProductLoader } from '@/lib/search/search-hooks';
import { buildApiSearchKey, parseSearchState } from '@/lib/search/search-state';

type Props = {
  searchRoute: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onRetry: () => void;
  onShowReferences: () => void;
};

/** Las referencias se consultan aparte: nunca reemplazan la caché de ofertas actuales. */
export function SearchEmptyState(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <SearchEmptyStateContent key={`${props.searchRoute}:${attempt}`} {...props} onRetryReferences={() => setAttempt(value => value + 1)} />;
}

function SearchEmptyStateContent({ searchRoute, hasActiveFilters, onClearFilters, onRetry, onShowReferences, onRetryReferences }: Props & { onRetryReferences: () => void }) {
  const state = useMemo(() => parseSearchState(Object.fromEntries(new URLSearchParams(searchRoute.split('?')[1]))), [searchRoute]);
  const hasPriceRange = state.minPrice !== undefined || state.maxPrice !== undefined;
  const canShowReferences = !state.includeUnavailable && !hasPriceRange;
  const canReadReferences = Boolean(state.query && canShowReferences);
  const referenceState = useMemo(() => ({ ...state, page: 1, includeUnavailable: true }), [state]);
  const requestKey = `${buildApiSearchKey(referenceState)}|page=1`;
  const [references, setReferences] = useState<SearchApiResponse['products']>([]);
  const [isLoading, setIsLoading] = useState(canReadReferences);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useProductLoader({
    currentState: referenceState,
    hasSearchIntent: canReadReferences,
    requestKey,
    pageSize: 12,
    onLoadingChange: setIsLoading,
    onResolvedRequestKey: setResolvedKey,
    onProductsLoaded: useCallback((products) => setReferences(hydrateProducts(products)), []),
    onError: setError,
  });
  const pending = canReadReferences && (isLoading || resolvedKey !== requestKey);
  const hasReferences = canReadReferences && !pending && !error && references.length > 0;

  return (
    <div>
      <div className="border-4 border-primary bg-card p-6 md:p-8 text-center pixel-shadow" role="status">
        <p className="text-[12px] uppercase font-bold text-primary">{pending
          ? '[ BUSCANDO FICHAS DEL PRODUCTO ]'
          : error ? '[ ERROR AL CONSULTAR FICHAS ]' : hasReferences ? '[ PRODUCTO EN EL CATÁLOGO ]' : '[ SIN RESULTADOS ]'}</p>
        <p className="font-body text-base text-foreground mt-3 leading-relaxed">{hasReferences
          ? `Encontramos fichas para «${state.query}», pero la búsqueda no tiene ofertas recientes para comparar.`
          : state.includeUnavailable
            ? state.query ? `No encontramos coincidencias para "${state.query}".` : 'No encontramos coincidencias con los filtros actuales.'
            : 'No tenemos ofertas recientes aptas para comparar con esta búsqueda y estos filtros.'}</p>
        <p className="font-body text-sm text-foreground/80 mt-2 leading-relaxed">{hasReferences
          ? 'Podés abrir estas fichas y consultar sus referencias anteriores. Los precios antiguos no confirman el precio ni el stock actual.'
          : error
            ? 'No pudimos consultar las fichas anteriores. Probá abrir las referencias de esta búsqueda.'
            : state.includeUnavailable
              ? 'Probá otra palabra, una marca o modelo más corto, o ampliá los filtros.'
              : hasPriceRange
                ? 'El rango de precios se aplica a ofertas recientes. Quitá el rango para consultar referencias anteriores.'
              : 'Esto no confirma que el producto esté agotado. Las referencias anteriores pueden no tener precio o disponibilidad actualizados.'}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {canShowReferences && !pending && (
            <button type="button" onClick={onShowReferences} className="pixel-button text-[12px] px-4 py-3 min-h-11">
              {hasReferences ? 'VER TODAS LAS FICHAS' : 'VER REFERENCIAS ANTERIORES'}
            </button>
          )}
          {hasActiveFilters && <button type="button" onClick={onClearFilters} className="pixel-button text-[12px] px-4 py-3 min-h-11">LIMPIAR FILTROS</button>}
          <button type="button" onClick={error ? onRetryReferences : onRetry} className="pixel-button text-[12px] px-4 py-3 min-h-11">{error ? 'REINTENTAR FICHAS' : 'REINTENTAR BUSQUEDA'}</button>
        </div>
      </div>
      {hasReferences && (
        <section className="mt-6" aria-label="Fichas del catálogo sin ofertas recientes">
          <h2 className="font-body text-lg font-bold mb-2">Referencias del catálogo</h2>
          <p className="font-body text-sm text-muted-foreground mb-4">Estas fichas se muestran por separado de las ofertas recientes.</p>
          <ProductGrid products={references.slice(0, 6)} returnTo={searchRoute} surface="search_results" />
        </section>
      )}
    </div>
  );
}
