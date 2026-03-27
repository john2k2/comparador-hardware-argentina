import type { Metadata } from 'next';
import type { SearchPageState } from './search-state';
import { getCategorySeoCopy, isIndexableCategoryLanding } from './search-seo';
import { SITE_URL } from '@/lib/site-config';

export function resolveSearchMetadata(state: SearchPageState): Metadata {
  const categorySeoCopy = getCategorySeoCopy(state.category);
  const hasQuery = state.query.length > 0;
  const indexableCategoryLanding = isIndexableCategoryLanding(state) && Boolean(categorySeoCopy);
  const canonical = indexableCategoryLanding
    ? `${SITE_URL}/search?category=${state.category}`
    : `${SITE_URL}/search`;

  if (indexableCategoryLanding && categorySeoCopy) {
    return {
      title: categorySeoCopy.title,
      description: categorySeoCopy.description,
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
