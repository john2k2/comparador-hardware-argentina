import { cache } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ProductDetailClient } from '@/components/product/ProductDetailClient';
import { readCanonicalProductIdByKey, readProductByIdFromDatabase } from '@/lib/persistence/product-read';
import { formatPriceARS, getComparableStorePrices } from '@/lib/price-utils';
import { isIndexableProductId } from '@/lib/seo/sitemap';
import { SITE_URL } from '@/lib/site-config';
import { normalizeDisplayText } from '@/lib/text-utils';
import type { Product } from '@/lib/types';
import { getProductContent } from '@/lib/product/product-seo-content';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.svg`;
const PRODUCT_TITLE_SUFFIX = ' | HardwareAR';

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

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const sliced = normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  const lastSpace = sliced.lastIndexOf(' ');
  const safeSlice = lastSpace > maxLength * 0.55 ? sliced.slice(0, lastSpace) : sliced;
  return `${safeSlice.trimEnd()}…`;
}

function buildShortProductTitle(product: Product, id: string): string {
  const brand = normalizeDisplayText(product.brand);
  const model = normalizeDisplayText(product.model);
  const fallbackName = normalizeDisplayText(product.name);
  const compact = [brand, model].filter(Boolean).join(' ').trim() || fallbackName;
  const suffix = id.split('-').at(-1)?.slice(0, 6) ?? '';
  const base = truncateText(compact, suffix ? 38 : 46);

  return suffix ? `${base} #${suffix}` : base;
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
  const storesCompared = getComparableStorePrices(product.prices).length;
  const bestPrice = formatPriceARS(product.lowestPrice);

  return truncateText(
    `Compara ${name} en ${storesCompared} tiendas de Argentina. Mejor precio detectado: ${bestPrice}. Revisa stock, cuotas y condiciones en la tienda final.`,
    155,
  );
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
        follow: true,
      },
    };
  }

  const title = buildShortProductTitle(product, id);
  const description = buildProductDescription(product);
  const canonicalProductId = product.canonicalProductKey
    ? await readCanonicalProductIdByKey(product.canonicalProductKey)
    : null;
  const resolvedCanonicalId = canonicalProductId ?? id;
  const comparableStoreCount = getComparableStorePrices(product.prices).length;
  const indexableProduct = isIndexableProductId(id) && resolvedCanonicalId === id && comparableStoreCount >= 2;
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
  
  // Si el producto tiene canonicalProductKey, redirigir al producto agrupado
  // para evitar mostrar precios del producto individual vs el agrupado
  if (product?.canonicalProductKey) {
    const canonicalProductId = await readCanonicalProductIdByKey(product.canonicalProductKey);
    if (canonicalProductId && canonicalProductId !== id) {
      redirect(`/product/${encodeURIComponent(canonicalProductId)}`);
    }
  }
  
  const jsonLd = product && isIndexableProductId(id) && getComparableStorePrices(product.prices).length >= 2
    ? buildProductJsonLd(product, id)
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
          HardwareAR es un comparador independiente. No vendemos productos ni recibimos comisiones por las compras.
          Los valores mostrados son referenciales y pueden variar. Siempre confirmá el importe final, disponibilidad
          y condiciones en el comercio antes de comprar.
        </p>
      </div>
    </section>
  );
}
