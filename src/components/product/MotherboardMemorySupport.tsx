import type { Product } from '@/lib/types';

// Directorios oficiales verificados el 27/09/2026. No construimos URLs de modelos
// desde títulos de tiendas: revisión, DDR y variantes Wi-Fi pueden cambiar la QVL.
const SUPPORT_SOURCES = [
  { brand: 'ASUS', url: 'https://www.asus.com/support/download-center/', section: 'CPU / Memory Support → Memory' },
  { brand: 'MSI', url: 'https://www.msi.com/support', section: 'Support → Compatibility → Memory' },
  { brand: 'Gigabyte', url: 'https://www.gigabyte.com/Support/Consumer', section: 'Support → Memory Support List' },
  { brand: 'ASRock', url: 'https://www.asrock.com/support/index.asp', section: 'Support → Memory QVL' },
] as const;

export function MotherboardMemorySupport({ product }: { product: Product }) {
  if (product.category !== 'motherboards') return null;

  const brand = product.brand.trim().toLowerCase();
  const manufacturer = SUPPORT_SOURCES.find((source) => source.brand.toLowerCase() === brand
    || (source.brand === 'Gigabyte' && brand === 'aorus'));
  const sources = manufacturer ? [manufacturer] : SUPPORT_SOURCES;

  return (
    <section className="bg-card border-4 border-border p-4 md:p-6 pixel-shadow" aria-label="Memorias probadas por el fabricante">
      <h2 className="text-[12px] font-bold uppercase mb-3 text-secondary">MEMORIAS PROBADAS: LISTA QVL</h2>
      <p className="font-body text-sm leading-relaxed">Antes de elegir RAM, consultá la lista QVL de tu motherboard: reúne módulos que el fabricante probó en determinadas condiciones.</p>
      <ol className="list-decimal pl-5 font-body text-sm leading-relaxed space-y-2 mt-3">
        <li>Buscá el modelo completo y la revisión de la placa en el soporte oficial. Confirmá variantes como DDR4/DDR5 y Wi-Fi.</li>
        <li>Abrí la lista de memoria y buscá el código exacto del kit de RAM, no solo su marca, capacidad o velocidad.</li>
        <li>Revisá CPU, versión de BIOS, cantidad de módulos y velocidad probada. No asumás que dos kits separados equivalen al kit validado.</li>
      </ol>
      {!manufacturer && <p className="font-body text-sm mt-3">No identificamos un fabricante de esta lista. Elegí el que corresponda; si no aparece, consultá su soporte oficial.</p>}
      <ul className="mt-4 space-y-3 font-body text-sm">
        {sources.map((source) => (
          <li key={source.brand}>
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4 text-secondary focus-visible:outline-2 focus-visible:outline-offset-4">
              Buscar mi modelo en {source.brand} ↗<span className="sr-only"> (abre una pestaña nueva)</span>
            </a>
            <p className="text-xs text-muted-foreground">{source.section}</p>
          </li>
        ))}
      </ul>
      <p className="font-body text-xs leading-relaxed mt-4 border-t-2 border-border pt-3">Estos enlaces abren el soporte del fabricante; todavía no verificamos la QVL de este modelo ni de tu RAM. Que un kit no figure no demuestra incompatibilidad. Figurar tampoco garantiza estabilidad con otra configuración.</p>
    </section>
  );
}
