import type { Metadata } from 'next';
import { getBudgetGuideBySlug } from '@/lib/seo/budget-guides-data';
import { getComparisonBySlug } from '@/lib/seo/comparisons-data';
import { parseBuilderBudgetPesos } from '@/lib/seo/budget-query';
import {
  MISSING_CATEGORY_DESCRIPTION,
  MISSING_CATEGORY_TITLE,
  MISSING_COMPARISON_DESCRIPTION,
  MISSING_COMPARISON_TITLE,
  MISSING_GUIDE_DESCRIPTION,
  MISSING_GUIDE_TITLE,
  buildNoIndexMetadata,
} from '@/lib/seo/metadata';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';
import { resolveCategoryFromLandingSlug } from '@/lib/seo/category-landing-routes';
import { buildCategoryLandingState } from '@/lib/search/category-landing-state';
import { resolveSearchMetadata } from '@/lib/search/search-page-metadata';
import { EDITORIAL_UPDATED_AT } from './editorial-freshness';

function buildArticleMetadata(input: {
  path: string;
  title: string;
  absoluteTitle?: string;
  description: string;
  keywords: string[];
}): Metadata {
  const url = `${SITE_URL}${input.path}`;
  return {
    title: input.absoluteTitle ? { absolute: input.absoluteTitle } : input.title,
    description: input.description,
    keywords: input.keywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'article',
      url,
      title: input.title,
      description: input.description,
      images: [`${SITE_URL}/og-image.png`],
      modifiedTime: `${EDITORIAL_UPDATED_AT}T00:00:00.000Z`,
    },
  };
}

export function resolveComparativasHubMetadata(): Metadata {
  return buildArticleMetadata({
    path: '/comparativa',
    title: 'Comparaciones Hardware',
    description:
      'Comparaciones de hardware en Argentina: GPUs, CPUs y más. Encontrá el mejor componente al mejor costo entre 20+ locales.',
    keywords: [
      'comparativa hardware',
      'comparar precios componentes pc',
      'mejor placa video',
      'mejor procesador gaming',
    ],
  });
}

export function resolveGuiasHubMetadata(): Metadata {
  return buildArticleMetadata({
    path: '/guia',
    title: 'Guías PC Gamer Argentina',
    description:
      'Armá tu PC gamer según presupuesto. Configuraciones recomendadas desde $1.000.000 con precios actualizados de tiendas argentinas.',
    keywords: [
      'guia pc gamer',
      'armar pc argentina',
      'pc gamer presupuesto',
      'configuracion pc gaming',
    ],
  });
}

export function resolveArmarPcMetadata(
  pesos?: string | string[],
): Metadata {
  const metadata = buildArticleMetadata({
    path: '/guia/armar',
    title: 'Armá tu PC gamer',
    absoluteTitle: `Armá tu PC gamer con presupuesto | ${SITE_NAME}`,
    description:
      'Ingresá un presupuesto en pesos y armamos un combo con ofertas en stock de tiendas argentinas. Mismo socket, misma RAM y una fuente que cubra el combo.',
    keywords: [
      'armar pc argentina',
      'presupuesto pc gamer',
      'armar pc gamer pesos',
    ],
  });

  if (parseBuilderBudgetPesos(pesos)) {
    return {
      ...metadata,
      robots: { index: false, follow: true },
    };
  }

  return metadata;
}

export function resolveGuidePageMetadata(slug: string): Metadata {
  const guide = getBudgetGuideBySlug(slug);
  if (!guide) {
    return buildNoIndexMetadata({
      title: MISSING_GUIDE_TITLE,
      description: MISSING_GUIDE_DESCRIPTION,
    });
  }

  return buildArticleMetadata({
    path: `/guia/${slug}`,
    title: guide.title,
    absoluteTitle: guide.metadataTitle,
    description: guide.description,
    keywords: guide.keywords,
  });
}

export function resolveComparisonPageMetadata(slug: string): Metadata {
  const comparison = getComparisonBySlug(slug);
  if (!comparison) {
    return buildNoIndexMetadata({
      title: MISSING_COMPARISON_TITLE,
      description: MISSING_COMPARISON_DESCRIPTION,
    });
  }

  return buildArticleMetadata({
    path: `/comparativa/${slug}`,
    title: comparison.title,
    absoluteTitle: comparison.metadataTitle,
    description: comparison.description,
    keywords: comparison.keywords,
  });
}

export function resolveCategoryLandingPageMetadata(slug: string): Metadata {
  const category = resolveCategoryFromLandingSlug(slug);

  if (!category) {
    return buildNoIndexMetadata({
      title: MISSING_CATEGORY_TITLE,
      description: MISSING_CATEGORY_DESCRIPTION,
    });
  }

  return resolveSearchMetadata(buildCategoryLandingState(category));
}
