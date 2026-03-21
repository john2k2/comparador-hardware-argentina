import { cache } from 'react';
import type { Metadata } from 'next';
import { ProductDetailClient } from '@/components/product/ProductDetailClient';
import { readProductByIdFromDatabase } from '@/lib/persistence/product-read';
import { getComparableStorePrices } from '@/lib/price-utils';
import { isIndexableProductId } from '@/lib/seo/sitemap';
import { SITE_URL } from '@/lib/site-config';
import { normalizeDisplayText } from '@/lib/text-utils';
import type { Product } from '@/lib/types';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.svg`;

type ProductPageProps = {
  params: Promise<{ id: string }>;
};

const getProductForPage = cache(async (id: string): Promise<Product | null> => {
  try {
    return await readProductByIdFromDatabase(id);
  } catch (error) {
    console.warn('[Product Page] DB-first detail unavailable for metadata/render:', error);
    return null;
  }
});

function buildCanonicalUrl(id: string): string {
  return `${SITE_URL}/product/${encodeURIComponent(id)}`;
}

function formatPriceArs(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return 'ARS 0';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(price);
}

function resolveProductImage(product: Product | null): string {
  const rawImage = (product?.image ?? '').trim();
  if (!rawImage) return DEFAULT_OG_IMAGE;

  if (/^https?:\/\//i.test(rawImage)) {
    return rawImage;
  }

  if (rawImage.startsWith('/')) {
    return `${SITE_URL}${rawImage}`;
  }

  return DEFAULT_OG_IMAGE;
}

function buildProductDescription(product: Product): string {
  const name = normalizeDisplayText(product.name);
  const brand = normalizeDisplayText(product.brand);
  const model = normalizeDisplayText(product.model);
  const storesCompared = getComparableStorePrices(product.prices).length;
  const bestPrice = formatPriceArs(product.lowestPrice);

  return [
    `Compara precios de ${name} en ${storesCompared} tiendas de Argentina.`,
    `Mejor precio detectado: ${bestPrice}.`,
    `Marca ${brand}. Modelo ${model}.`,
  ].join(' ');
}

function stockToSchemaAvailability(stock: Product['prices'][number]['stock']): string {
  if (stock === 'in-stock' || stock === 'low-stock') {
    return 'https://schema.org/InStock';
  }
  if (stock === 'out-of-stock') {
    return 'https://schema.org/OutOfStock';
  }
  return 'https://schema.org/LimitedAvailability';
}

function buildProductJsonLd(product: Product, id: string) {
  const productUrl = buildCanonicalUrl(id);
  const displayName = normalizeDisplayText(product.name);
  const displayBrand = normalizeDisplayText(product.brand || 'Generica');
  const displayDescription = normalizeDisplayText(product.description || product.name);
  const offers = getComparableStorePrices(product.prices)
    .filter((price) => price.price > 0 && price.url)
    .map((price) => ({
      '@type': 'Offer',
      priceCurrency: 'ARS',
      price: price.price,
      availability: stockToSchemaAvailability(price.stock),
      url: price.url,
      seller: {
        '@type': 'Organization',
        name: normalizeDisplayText(price.storeName || price.storeId),
      },
      itemCondition: 'https://schema.org/NewCondition',
    }));

  // Build breadcrumb schema
  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Inicio',
      item: SITE_URL,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Buscar',
      item: `${SITE_URL}/search`,
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: product.category,
      item: `${SITE_URL}/search?category=${encodeURIComponent(product.category)}`,
    },
    {
      '@type': 'ListItem',
      position: 4,
      name: displayName,
      item: productUrl,
    },
  ];

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}#organization`,
      name: 'Comparador Hardware Argentina',
      url: SITE_URL,
      logo: `${SITE_URL}/og-image.svg`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      '@id': `${productUrl}#product`,
      name: displayName,
      description: displayDescription,
      url: productUrl,
      image: [resolveProductImage(product)],
      sku: normalizeDisplayText(product.model || product.id),
      mpn: normalizeDisplayText(product.model || product.id),
      category: product.category,
      brand: {
        '@type': 'Brand',
        name: displayBrand,
      },
      offers,
    },
  ];
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductForPage(id);
  const indexableProduct = isIndexableProductId(id);

  if (!product) {
    return {
      title: 'Producto no encontrado',
      description: 'El producto solicitado no esta disponible en este momento.',
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const title = normalizeDisplayText(product.name);
  const description = buildProductDescription(product);
  const url = buildCanonicalUrl(id);
  const image = resolveProductImage(product);

  return {
    title,
    description,
    alternates: indexableProduct
      ? {
          canonical: url,
        }
      : undefined,
    robots: {
      index: indexableProduct,
      follow: true,
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      images: [
        {
          url: image,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = await getProductForPage(id);
  const jsonLd = product && isIndexableProductId(id) ? buildProductJsonLd(product, id) : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductDetailClient id={id} initialProduct={product} />
    </>
  );
}
