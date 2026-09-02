import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ProductDetailClient } from '@/components/product/ProductDetailClient';
import { readCanonicalProductIdByKey, readProductByIdFromDatabase } from '@/lib/persistence/product-read';
import { formatPriceARS, getComparableStorePrices } from '@/lib/price-utils';
import { decideProductPageIndexing } from '@/lib/seo/product-indexing';
import { serializeJsonLd } from '@/lib/seo/serialize-jsonld';
import { SITE_NAME } from '@/lib/site-config';
import { normalizeDisplayText } from '@/lib/text-utils';
import type { Product } from '@/lib/types';
import { getProductContent } from '@/lib/product/product-seo-content';
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
};

const getProductForPage = cache(async (id: string): Promise<Product | null> => {
  try {
    return await readProductByIdFromDatabase(id);
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
    ? await readCanonicalProductIdByKey(product.canonicalProductKey)
    : null;
  const resolvedCanonicalId = canonicalProductId ?? id;
  const comparableStoreCount = getComparableStorePrices(product.prices).length;
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

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = await getProductForPage(id);
  if (!product) {
    notFound();
  }

  // Si el producto tiene canonicalProductKey, redirigir al producto agrupado
  // para evitar mostrar precios del producto individual vs el agrupado
  if (product.canonicalProductKey) {
    const canonicalProductId = await readCanonicalProductIdByKey(product.canonicalProductKey);
    if (canonicalProductId && canonicalProductId !== id) {
      permanentRedirect(`/product/${encodeURIComponent(canonicalProductId)}`);
    }
  }
  
  const comparableStoreCount = getComparableStorePrices(product.prices).length;
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
      <ProductDetailClient id={id} initialProduct={product} />
      {product && <ProductSeoSupport product={product} />}
    </>
  );
}

function ProductSeoSupport({ product }: { product: Product }) {
  const displayName = normalizeDisplayText(product.name);
  const displayBrand = normalizeDisplayText(product.brand);
  const storeCount = getComparableStorePrices(product.prices).length;
  const bestPrice = formatPriceARS(product.lowestPrice);
  const content = getProductContent(product);

  return (
    <section className="container mx-auto px-4 pb-10 space-y-6">
      {/* Guía rápida original */}
      <div className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-3">
          [ GUIA RAPIDA DE COMPARACION ]
        </h2>
        <div className="grid md:grid-cols-2 gap-4 text-[11px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/85 font-mono">
          <p>
            Esta ficha compara {displayName} {displayBrand ? `de ${displayBrand}` : ''} entre {storeCount} comercios disponibles.
            El mejor valor detectado al momento de la última actualización es {bestPrice}, pero el importe final puede cambiar
            por stock, promociones, cuotas, envío o condiciones propias de cada local.
          </p>
          <p>
            Antes de comprar, verificá que la variante coincida exactamente con lo que necesitás: modelo, capacidad,
            compatibilidad, garantía y accesorios incluidos. El comparador ayuda a encontrar diferencias rápido, pero la
            confirmación final siempre debe hacerse en el sitio de destino.
          </p>
          <p>
            También conviene revisar si la publicación incluye fotos reales, número de parte, versión del fabricante y
            disponibilidad inmediata. Si dos ofertas parecen iguales pero tienen mucha diferencia de valor, abrí ambas
            tiendas y confirmá que no cambien condiciones clave como cuotas, envío, garantía o retiro en sucursal.
          </p>
        </div>
      </div>

      {/* Contenido enriquecido por categoría */}
      <div className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-3">
          [ DESCRIPCION Y CONTEXTO ]
        </h2>
        <div className="text-[11px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/85 font-mono space-y-4">
          <p>{content.intro}</p>
          <div>
            <h3 className="text-[11px] uppercase font-bold text-primary mb-2">Consejos de compra</h3>
            <ul className="list-disc pl-5 space-y-1">
              {content.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
          {content.relatedTerms.length > 0 && (
            <div>
              <h3 className="text-[11px] uppercase font-bold text-primary mb-2">Componentes relacionados</h3>
              <p>
                Al comprar {displayName}, también necesitás considerar:{' '}
                {content.relatedTerms.join(', ')}.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* FAQs */}
      <div className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow">
        <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-3">
          [ PREGUNTAS FRECUENTES ]
        </h2>
        <div className="space-y-4">
          {content.faqs.map((faq, i) => (
            <div key={i} className="text-[11px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/85 font-mono">
              <h3 className="font-bold text-primary mb-1">{faq.question}</h3>
              <p>{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer final */}
      <div className="bg-muted border-2 border-border p-4">
        <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
          {SITE_NAME} es un comparador independiente. No vendemos productos ni recibimos comisiones por las compras.
          Los valores mostrados son referenciales y pueden variar. Siempre confirmá el importe final, disponibilidad
          y condiciones en el comercio antes de comprar.
        </p>
      </div>
    </section>
  );
}
