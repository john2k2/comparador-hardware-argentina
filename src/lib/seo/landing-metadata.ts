import type { Metadata } from 'next';
import { getBudgetGuideBySlug } from '@/lib/seo/budget-guides-data';
import { getComparisonBySlug } from '@/lib/seo/comparisons-data';
import {
  MISSING_COMPARISON_DESCRIPTION,
  MISSING_COMPARISON_TITLE,
  MISSING_GUIDE_DESCRIPTION,
  MISSING_GUIDE_TITLE,
  buildNoIndexMetadata,
} from '@/lib/seo/metadata';
import { SITE_URL } from '@/lib/site-config';
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
