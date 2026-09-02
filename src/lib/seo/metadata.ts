import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export const HOME_PAGE_TITLE = 'Comparador Hardware Argentina: precios de PC';
export const HOME_PAGE_DESCRIPTION = 'Compará componentes de PC entre tiendas argentinas: precios, stock y enlaces de procesadores, placas de video, RAM y SSD. No vendemos hardware.';
export const DEFAULT_SITE_DESCRIPTION = 'Compará precios de hardware y encontrá ofertas de componentes para PC en tiendas de Argentina.';
export const NOT_FOUND_PAGE_TITLE = 'Página no encontrada';
export const NOT_FOUND_PAGE_DESCRIPTION = 'Esta URL no existe en Comparador Hardware Argentina. Volvé al inicio o buscá un componente.';
export const MISSING_GUIDE_TITLE = 'Guía no encontrada';
export const MISSING_GUIDE_DESCRIPTION = 'Esta guía no existe en Comparador Hardware Argentina.';
export const MISSING_COMPARISON_TITLE = 'Comparativa no encontrada';
export const MISSING_COMPARISON_DESCRIPTION = 'Esta comparativa no existe en Comparador Hardware Argentina.';

export function buildCanonicalUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildPublicPageMetadata(input: {
  path: string;
  title: string;
  description: string;
  absoluteTitle?: boolean;
}): Metadata {
  const canonicalUrl = buildCanonicalUrl(input.path);
  const socialTitle = input.absoluteTitle ? input.title : `${input.title} | ${SITE_NAME}`;

  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'website',
      url: canonicalUrl,
      title: socialTitle,
      description: input.description,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: socialTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
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
