import type { Metadata } from 'next';
import { ProductComparisonBuilder } from '@/components/comparison/ProductComparisonBuilder';

export const metadata: Metadata = {
  title: 'Comparar componentes de PC por producto',
  description: 'Elegí dos componentes y compará precios, ofertas, especificaciones, compatibilidad y conveniencia.',
  alternates: { canonical: '/comparativa/comparar' },
};

export default function DynamicComparisonPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <header className="mb-7 max-w-4xl">
        <p className="mb-2 text-[10px] font-bold text-muted-foreground">COMPARADOR ABIERTO</p>
        <h1 className="font-pixel text-[16px] leading-relaxed text-primary md:text-[20px]">Compará dos componentes</h1>
        <p className="mt-4 text-[11px] font-mono leading-relaxed text-muted-foreground md:text-[12px]">
          Buscá cualquier producto del catálogo. Contrastamos ofertas válidas, diferencia de precio, especificaciones y compatibilidad informada. Si faltan benchmarks, lo decimos en vez de inventar un ganador de rendimiento.
        </p>
      </header>
      <ProductComparisonBuilder />
    </main>
  );
}
