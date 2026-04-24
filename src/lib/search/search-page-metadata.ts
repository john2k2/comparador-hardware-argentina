import type { Metadata } from 'next';
import type { SearchPageState } from './search-state';
import { getCategorySeoCopy, isIndexableCategoryLanding } from './search-seo';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';
import { stores as defaultStores } from '@/lib/scrapers/static-data';

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.svg`;

function buildSearchMetadata(input: {
  title: string;
  description: string;
  canonical: string;
  index: boolean;
}): Metadata {
  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: input.canonical,
    },
    openGraph: {
      type: 'website',
      url: input.canonical,
      title: `${input.title} | ${SITE_NAME}`,
      description: input.description,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: `${input.title} | ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${input.title} | ${SITE_NAME}`,
      description: input.description,
      images: [DEFAULT_OG_IMAGE],
    },
    robots: {
      index: input.index,
      follow: true,
    },
  };
}

export function resolveSearchMetadata(state: SearchPageState): Metadata {
  const categorySeoCopy = getCategorySeoCopy(state.category);
  const hasQuery = state.query.length > 0;
  const indexableCategoryLanding = isIndexableCategoryLanding(state) && Boolean(categorySeoCopy);
  const selectedStoreNames = state.stores
    .map((storeId) => defaultStores.find((store) => store.id === storeId)?.name ?? storeId)
    .filter(Boolean);
  const hasStoreFilter = selectedStoreNames.length > 0;
  const hasSortOnly = !hasQuery && !state.category && !hasStoreFilter && state.sortBy !== 'relevance';
  const canonical = indexableCategoryLanding
    ? `${SITE_URL}/search?category=${state.category}`
    : `${SITE_URL}/search`;

  if (indexableCategoryLanding && categorySeoCopy) {
    return buildSearchMetadata({
      title: categorySeoCopy.title,
      description: categorySeoCopy.description,
      canonical,
      index: true,
    });
  }

  if (hasQuery) {
    return buildSearchMetadata({
      title: `Busqueda: ${state.query}`,
      description: `Resultados de busqueda para ${state.query} en tiendas argentinas de hardware, con precios comparados, stock disponible, filtros por comercio y enlaces directos.`,
      canonical,
      index: false,
    });
  }

  if (hasStoreFilter) {
    const storeLabel = selectedStoreNames.slice(0, 2).join(' y ');
    return buildSearchMetadata({
      title: `Ofertas en ${storeLabel}`,
      description: `Explorá hardware disponible en ${storeLabel}, compará precios publicados, revisá categorías y usá filtros para encontrar productos de PC en Argentina.`,
      canonical,
      index: false,
    });
  }

  if (hasSortOnly) {
    const sortLabel = state.sortBy === 'price-asc'
      ? 'menor precio'
      : state.sortBy === 'price-desc'
        ? 'mayor precio'
        : state.sortBy === 'newest'
          ? 'más recientes'
          : 'nombre';

    return buildSearchMetadata({
      title: `Hardware por ${sortLabel}`,
      description: `Explorá el catálogo de hardware ordenado por ${sortLabel}, con filtros por tienda, categoría y rango de precios para comparar opciones en Argentina.`,
      canonical,
      index: false,
    });
  }

  return buildSearchMetadata({
    title: 'Buscar hardware',
    description: 'Buscá hardware en Argentina y compará precios por categoría, tienda y rango de precio. Encontrá procesadores, placas de video, RAM, SSD y más.',
    canonical,
    index: false,
  });
}
