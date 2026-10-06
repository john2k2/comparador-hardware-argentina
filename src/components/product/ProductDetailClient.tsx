'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { saveRecentlyViewedProduct } from '@/lib/client/recently-viewed';
import { normalizeDisplayText } from '@/lib/text-utils';
import type { InstallmentInfo, Product } from '@/lib/types';
import { trackProductView } from '@/lib/analytics';
import { ANALYTICS_READY_EVENT } from '@/lib/analytics/consent';
import { resolveBackHref } from '@/lib/product/product-cache-utils';
import { useProductDetailState } from '@/lib/product/product-detail-hooks';
import { resolveHardwareCategoryForProduct } from '@/lib/catalog/hardware-categories';
import { getProductImageSource } from '@/lib/product-images';
import { productDescriptionText, buildTechnicalSheet } from '@/lib/product/technical-sheet';
import { NotFoundState } from '@/components/functional/NotFoundState';
import { ProductImage } from './ProductImage';
import { PriceSummary } from './PriceSummary';
import { StoresList } from './StoresList';
import { SpecsTable } from './SpecsTable';
import { MotherboardMemorySupport } from './MotherboardMemorySupport';
import { AdvisoryCta } from '@/components/commercial/AdvisoryCta';
import { OfferReportLink } from '@/components/commercial/OfferReportLink';
import { RefreshOffersButton } from '@/components/pc-builder/RefreshOffersButton';
import { buildProductRefreshTargets } from '@/lib/product/product-refresh-targets';

type ProductDetailClientProps = { id: string; initialProduct: Product | null };

export function ProductDetailClient({ id, initialProduct }: ProductDetailClientProps) {
  return <ProductDetailClientInner key={id} id={id} initialProduct={initialProduct} />;
}

function ProductDetailClientInner({ id, initialProduct }: ProductDetailClientProps) {
  const searchParams = useSearchParams();
  const backHref = resolveBackHref(searchParams.get('from'));
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentInfo | null>(null);
  const { product, isLoading, merchantPrices, lowestComparablePrice, highestComparablePrice, reloadProduct } = useProductDetailState(id, initialProduct);

  useEffect(() => {
    if (!product) return;
    saveRecentlyViewedProduct(product);
    const track = () => trackProductView({ productId: product.id, productName: product.name,
      category: product.category, brand: product.brand, price: product.lowestPrice, storeCount: merchantPrices.length });
    track();
    window.addEventListener(ANALYTICS_READY_EVENT, track);
    return () => window.removeEventListener(ANALYTICS_READY_EVENT, track);
  }, [product, merchantPrices.length]);

  if (isLoading) return (
    <div className="container mx-auto px-4 py-8" aria-busy="true" aria-label="Cargando ficha del producto">
      <div className="animate-pulse space-y-6 bg-card border-[3px] border-border p-6 pixel-shadow">
        <div className="h-8 w-3/4 bg-muted" />
        <div className="grid lg:grid-cols-2 gap-6"><div className="aspect-[4/3] bg-muted" /><div className="h-64 bg-muted" /></div>
      </div>
    </div>
  );
  if (!product) return <NotFoundState product backHref={backHref} />;

  // La presentación corrige una categoría inequívoca sin escribir en el catálogo.
  const displayProduct = { ...product, category: resolveHardwareCategoryForProduct(product.name, product.category) };
  const displayName = productDescriptionText(product.name);
  const displayBrand = normalizeDisplayText(product.brand);
  const displayModel = productDescriptionText(product.model);
  const description = productDescriptionText(product.description);
  const facts = buildTechnicalSheet(displayProduct);
  const publishedBrand = facts.find((fact) => fact.label === 'Marca')?.value;
  const refreshTargets = buildProductRefreshTargets(product);
  const hasDistinctDescription = description && description.toLowerCase() !== displayName.toLowerCase();

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      <nav className="mb-4" aria-label="Volver al catálogo">
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 font-mono text-sm text-muted-foreground hover:text-primary font-bold">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Volver al catálogo
        </Link>
      </nav>
      <header className="min-w-0 mb-6">
        <p className="font-mono text-sm font-bold text-secondary mb-2">{displayBrand && !/^gen[eé]rica$/i.test(displayBrand)
          ? displayBrand : publishedBrand ? `Marca publicada: ${publishedBrand}` : 'Marca por confirmar'}</p>
        <h1 className="product-detail-title max-w-[45ch] text-foreground">{displayName}</h1>
        {displayModel && displayModel.toLowerCase() !== displayName.toLowerCase() &&
          <p className="font-body text-sm text-muted-foreground mt-3 break-words">Modelo publicado: {displayModel}</p>}
        <div className="flex flex-wrap gap-x-5 mt-3 font-body text-sm">
          <a href="#ofertas-por-tienda" className="min-h-11 inline-flex items-center text-secondary underline underline-offset-4">Ofertas por tienda</a>
          <a href="#ficha-tecnica" className="min-h-11 inline-flex items-center text-secondary underline underline-offset-4">Ficha técnica</a>
          <OfferReportLink context={{ productId: product.id, productName: product.name }} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start mb-8">
        <ProductImage image={getProductImageSource(displayProduct)} productName={displayName} priority />
        <PriceSummary product={displayProduct} merchantPrices={merchantPrices}
          lowestComparablePrice={lowestComparablePrice} highestComparablePrice={highestComparablePrice}
          selectedInstallment={selectedInstallment} onSelectInstallment={setSelectedInstallment} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-start">
        <div className="min-w-0 space-y-6">
          <StoresList product={displayProduct} merchantPrices={merchantPrices} />
          {refreshTargets.length > 0 && (
            <details className="bg-card border-[3px] border-border p-4 md:p-6 pixel-shadow">
              <summary className="min-h-11 cursor-pointer font-mono text-sm font-bold text-accent">¿El precio cambió? Solicitar una comprobación</summary>
              <p className="font-body text-sm leading-relaxed my-4">La cola puede demorarse y el pedido vence a los 30 minutos. Si no termina, conservamos la fecha anterior de cada precio.</p>
              <RefreshOffersButton targets={refreshTargets} onUpdated={reloadProduct} actionLabel="Solicitar verificación de ofertas" />
            </details>
          )}
        </div>
        <div className="min-w-0 space-y-6">
          <SpecsTable product={displayProduct} />
          {hasDistinctDescription && (
            <details className="bg-card border-[3px] border-border p-4 md:p-6 pixel-shadow" open={!facts.length}>
              <summary className="min-h-11 cursor-pointer font-mono text-sm font-bold text-secondary">Descripción publicada por la tienda</summary>
              <p className="font-body text-base leading-relaxed mt-3 break-words">{description}</p>
              <p className="font-body text-sm text-muted-foreground mt-3">La descripción puede contener afirmaciones del vendedor. Confirmá los datos del modelo exacto con el fabricante.</p>
            </details>
          )}
          <MotherboardMemorySupport product={displayProduct} />
        </div>
      </div>
      <div className="mt-8"><AdvisoryCta surface="product_detail" compact /></div>
    </div>
  );
}

export default ProductDetailClient;
