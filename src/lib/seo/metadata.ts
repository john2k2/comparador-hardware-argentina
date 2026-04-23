import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.svg`;

export function buildCanonicalUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildPublicPageMetadata(input: {
  path: string;
  title: string;
  description: string;
}): Metadata {
  const canonicalUrl = buildCanonicalUrl(input.path);

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'website',
      url: canonicalUrl,
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
