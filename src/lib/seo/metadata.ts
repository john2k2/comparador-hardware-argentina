import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';

export function buildCanonicalUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildPublicPageMetadata(input: {
  path: string;
  title: string;
  description: string;
}): Metadata {
  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: buildCanonicalUrl(input.path),
    },
    openGraph: {
      type: 'website',
      url: buildCanonicalUrl(input.path),
      title: `${input.title} | ${SITE_NAME}`,
      description: input.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${input.title} | ${SITE_NAME}`,
      description: input.description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export function buildNoIndexMetadata(input: {
  path?: string;
  title: string;
  description: string;
  follow?: boolean;
}): Metadata {
  return {
    title: input.title,
    description: input.description,
    alternates: input.path
      ? {
          canonical: buildCanonicalUrl(input.path),
        }
      : undefined,
    robots: {
      index: false,
      follow: input.follow ?? false,
    },
  };
}
