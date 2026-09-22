import Link from 'next/link';

export function BuilderCta({ budget }: { budget?: number }) {
  return <section className="border-4 border-secondary bg-card p-5 my-6" aria-label="Armá y compartí tu presupuesto">
    <h2 className="font-pixel text-xs text-secondary leading-relaxed">Llevá la comparación a tu PC completa</h2>
    <p className="font-body text-sm mt-3 mb-4">Elegí componentes y tiendas, agregá envíos y revisá las comprobaciones de compatibilidad. Podés compartir el presupuesto sin crear una cuenta.</p>
    <Link href={budget ? `/guia/armar?pesos=${budget}` : '/guia/armar'} prefetch={false} className="pixel-button inline-flex min-h-11 items-center text-xs">Armar y compartir mi PC →</Link>
  </section>;
}
