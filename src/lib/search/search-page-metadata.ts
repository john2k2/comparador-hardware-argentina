import type { Metadata } from 'next';
import type { SearchPageState } from './search-state';
import { getCategorySeoCopy, isIndexableCategoryLanding } from './search-seo';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';

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
      description: `Resultados de busqueda para ${state.query} en el comparador de hardware de Argentina.`,
      canonical,
      index: false,
    });
  }

  return buildSearchMetadata({
    title: 'Buscar hardware',
    description: 'Explora hardware, precios y tiendas disponibles en Argentina con filtros por categoria, precio y tienda.',
    canonical,
    index: false,
  });
}
