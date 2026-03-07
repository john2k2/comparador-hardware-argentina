import type { Metadata } from 'next';
import { SearchPageClient } from '@/components/search/SearchPageClient';
import { buildApiSearchKey, hasSearchIntent, parseSearchState, type SearchPageState } from '@/lib/search/search-state';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { SEARCH_PAGE_SIZE } from '@/lib/search/search-pagination';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { categories } from '@/lib/scrapers/static-data';

const SITE_URL = 'https://comparador-hardware.com.ar';

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function readInitialSearchPage(state: SearchPageState): Promise<{
  products: SearchApiResponse['products'];
  pagination: SearchApiResponse['pagination'];
}> {
  if (!hasSearchIntent(state)) {
    return {
      products: [],
      pagination: {
        limit: 0,
        offset: 0,
        total: 0,
        totalPages: 0,
        page: 1,
        pageSize: SEARCH_PAGE_SIZE,
      },
    };
  }

  try {
    const result = await readProductsPageFromDatabase({
      query: state.query || undefined,
      category: state.category,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      storeIds: new Set(state.stores),
      sortBy: state.sortBy,
      page: state.page,
      pageSize: SEARCH_PAGE_SIZE,
    });

    return {
      products: result.products,
      pagination: {
        limit: result.products.length,
        offset: (result.page - 1) * result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
        page: result.page,
        pageSize: result.pageSize,
      },
    };
  } catch (error) {
    console.warn('[Search Page] Initial DB-first render unavailable:', error);
    return {
      products: [],
      pagination: {
        limit: 0,
        offset: 0,
        total: 0,
        totalPages: 0,
        page: state.page,
        pageSize: SEARCH_PAGE_SIZE,
      },
    };
  }
}

function resolveSearchMetadata(state: SearchPageState): Metadata {
  const categoryConfig = state.category
    ? categories.find((category) => category.id === state.category)
    : null;
  const hasAdvancedFilters = state.stores.length > 0
    || state.minPrice !== undefined
    || state.maxPrice !== undefined
    || state.sortBy !== 'relevance'
    || state.page > 1;
  const hasQuery = state.query.length > 0;
  const isIndexableCategoryLanding = Boolean(categoryConfig) && !hasQuery && !hasAdvancedFilters;
  const canonical = isIndexableCategoryLanding
    ? `${SITE_URL}/search?category=${categoryConfig!.id}`
    : `${SITE_URL}/search`;

  if (isIndexableCategoryLanding) {
    return {
      title: `${categoryConfig!.name} en Argentina`,
      description: `Compara precios de ${categoryConfig!.name.toLowerCase()} en multiples tiendas de Argentina y encuentra el mejor valor disponible.`,
      alternates: {
        canonical,
      },
      robots: {
        index: true,
        follow: true,
      },
    };
  }

  if (hasQuery) {
    return {
      title: `Busqueda: ${state.query}`,
      description: `Resultados de busqueda para ${state.query} en el comparador de hardware de Argentina.`,
      alternates: {
        canonical,
      },
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  return {
    title: 'Buscar hardware',
    description: 'Explora hardware, precios y tiendas disponibles en Argentina con filtros por categoria, precio y tienda.',
    alternates: {
      canonical,
    },
    robots: {
      index: false,
      follow: true,
    },
  };
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  return resolveSearchMetadata(parseSearchState(await searchParams));
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const state = parseSearchState(await searchParams);
  const initialPage = await readInitialSearchPage(state);
  const initialResolvedRequestKey = initialPage.pagination.total > 0
    ? `${buildApiSearchKey(state) ?? '__empty__'}|page=${initialPage.pagination.page}`
    : null;

  return (
    <SearchPageClient
      initialState={state}
      initialBaseProducts={initialPage.products}
      initialPagination={initialPage.pagination}
      initialResolvedRequestKey={initialResolvedRequestKey}
      initialHasSearchIntent={hasSearchIntent(state)}
    />
  );
}
