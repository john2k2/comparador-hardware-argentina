import Link from 'next/link';

export function NotFoundState({ product = false, backHref = '/' }: { product?: boolean; backHref?: string }) {
  return (
    <section className="container mx-auto px-4 py-12 md:py-20 text-center">
      <div className="bg-card border-[3px] border-primary p-5 md:p-8 max-w-2xl mx-auto pixel-shadow-primary">
        <p className="font-mono text-sm font-bold text-primary mb-4">ERROR 404</p>
        <h1 className="font-mono! text-xl md:text-2xl font-bold mb-4">{product ? 'Producto no encontrado' : 'Página no encontrada'}</h1>
        <p className="font-body text-base text-muted-foreground leading-relaxed mb-6">No pudimos encontrar {product ? 'esta ficha' : 'esta página'}. El enlace puede haber cambiado. Podés volver o buscar otro producto.</p>
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4">
          <Link href={backHref} className="pixel-button font-mono text-sm min-h-11">Volver {backHref === '/' ? 'al inicio' : 'al catálogo'}</Link>
          <Link href="/search" className="border-2 border-border bg-background min-h-11 px-4 py-3 font-mono text-sm text-secondary font-bold inline-flex justify-center items-center">Buscar productos</Link>
        </div>
      </div>
    </section>
  );
}
