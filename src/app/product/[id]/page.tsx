import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ProductDetailClient } from '@/components/product/ProductDetailClient';
import { buildCanonicalProductHref, isComparisonProductOrigin } from '@/lib/product/product-cache-utils';
import { readCanonicalProductIdByKey, readProductDetailByIdFromDatabase } from '@/lib/persistence/product-read';
import { getAvailableComparableStorePrices } from '@/lib/price-utils';
import { decideProductPageIndexing } from '@/lib/seo/product-indexing';
import { serializeJsonLd } from '@/lib/seo/serialize-jsonld';
import { SITE_NAME } from '@/lib/site-config';
import type { Product } from '@/lib/types';
import { getProductContent } from '@/lib/product/product-seo-content';
import { isStableRuntimeMode } from '@/lib/server/runtime-flags';
import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';
import {
  PRODUCT_TITLE_SUFFIX,
  buildCanonicalUrl,
  buildProductDescription,
  buildProductJsonLd,
  buildShortProductTitle,
  resolveProductImage,
} from '@/lib/product/product-page-metadata';

type ProductPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
};

const getPresentationNow = cache(() => Date.now());

const getProductForPage = cache(async (id: string): Promise<Product | null> => {
  // El detalle E2E debe resolver el mismo catálogo sintético que la búsqueda.
  if (isStableRuntimeMode()) {
    return getStableFixtureProducts({}).find((product) => product.id === id) ?? null;
  }
  try {
    return await readProductDetailByIdFromDatabase(id);
  } catch (error) {
    console.warn('[Product Page] DB-first detail unavailable for metadata/render:', error);
    return null;
  }
});

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductForPage(id);

  if (!product) {
    return {
      title: 'Producto no encontrado',
      description: 'El producto solicitado no esta disponible en este momento.',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = buildShortProductTitle(product);
  const description = buildProductDescription(product);
  const canonicalProductId = product.canonicalProductKey
    ? await readCanonicalProductIdByKey(product.canonicalProductKey,product)
    : null;
  const resolvedCanonicalId = canonicalProductId ?? id;
  const comparableStoreCount = getAvailableComparableStorePrices(product.prices).length;
  const indexing = decideProductPageIndexing({
    product,
    resolvedCanonicalId,
    comparableStoreCount,
  });
  const indexableProduct = indexing.status === 'index';
  const url = buildCanonicalUrl(resolvedCanonicalId);
  const image = resolveProductImage(product);

  return {
    title: {
      absolute: `${title}${PRODUCT_TITLE_SUFFIX}`,
    },
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
      title: `${title}${PRODUCT_TITLE_SUFFIX}`,
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
      title: `${title}${PRODUCT_TITLE_SUFFIX}`,
      description,
      images: [image],
    },
  };
}

export default async function ProductDetailPage({ params, searchParams }: ProductPageProps) {
  const { id } = await params;
  const product = await getProductForPage(id);
  if (!product) {
    notFound();
  }
  const from = (await searchParams)?.from;

  // Una clave heredada puede unir OEM, outlet y modelos con cooler.
  // Redirigir únicamente cuando la variante del agrupado coincide.
  if (product.canonicalProductKey) {
    const canonicalProductId = await readCanonicalProductIdByKey(product.canonicalProductKey,product);
    // El comparador conserva la publicación elegida. Metadata sigue indicando
    // la variante canónica, sin transferir identidad ni sustituir el lector.
    if (canonicalProductId && canonicalProductId !== id && !isComparisonProductOrigin(from)) {
      permanentRedirect(buildCanonicalProductHref(canonicalProductId, from));
    }
  }
  
  const comparableStoreCount = getAvailableComparableStorePrices(product.prices).length;
  const indexing = decideProductPageIndexing({
    product,
    resolvedCanonicalId: id,
    comparableStoreCount,
  });
  const jsonLd = indexing.status === 'index'
    ? buildProductJsonLd(product, id)
    : null;
  const nonce = (await headers()).get('x-content-security-policy-nonce') ?? undefined;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      <ProductDetailClient id={id} initialProduct={product} initialNow={getPresentationNow()} />
      {product && <ProductSeoSupport product={product} />}
    </>
  );
}

function ProductSeoSupport({ product }: { product: Product }) {
  const content = getProductContent(product);
  return (
    <section className="container mx-auto px-4 pb-10">
      <details className="bg-card border-[3px] border-border p-4 md:p-6 pixel-shadow">
        <summary className="min-h-11 cursor-pointer font-mono text-base font-bold text-secondary">Antes de comprar: compatibilidad y condiciones</summary>
        <div className="max-w-[75ch] font-body text-base leading-relaxed text-foreground/85 mt-4 space-y-5">
          <p>{content.intro}</p>
          <ul className="list-disc pl-5 space-y-2">{content.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
          {content.faqs.map((faq) => <div key={faq.question}><h2 className="font-body! normal-case text-base font-bold text-primary mb-2">{faq.question}</h2><p>{faq.answer}</p></div>)}
        </div>
      </details>
      <p className="font-body text-sm leading-relaxed text-muted-foreground mt-5 max-w-[90ch]">
        {SITE_NAME} compara publicaciones de tiendas. La compra y sus condiciones se acuerdan con el comercio. Los enlaces patrocinados o afiliados se identifican cuando corresponde. Consultá <a href="/acerca" className="text-secondary underline underline-offset-4">cómo comparamos</a>.
      </p>
    </section>
  );
}
