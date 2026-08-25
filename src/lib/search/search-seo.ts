import { categories } from '@/lib/scrapers/static-data';
import type { HardwareCategory } from '@/lib/types';
import type { SearchPageState } from './search-state';

type CategorySeoCopy = {
  title: string;
  description: string;
  heading: string;
  intro: string;
  relatedLinks?: Array<{
    href: string;
    label: string;
  }>;
};

const CATEGORY_SEO_COPY: Record<HardwareCategory, CategorySeoCopy> = {
  'procesadores': {
    title: 'Procesadores AMD e Intel: precios',
    description: 'Compará precios de procesadores AMD Ryzen e Intel Core en tiendas de Argentina. Revisá stock, modelos y ofertas actuales antes de comprar.',
    heading: 'Compará precios de procesadores AMD e Intel',
    intro: 'Encontrá y compará precios de procesadores AMD Ryzen e Intel Core publicados por tiendas argentinas. Revisá modelos para gaming, trabajo y PCs con gráficos integrados, junto con su stock y mejor precio disponible. Antes de decidir, confirmá el socket, la compatibilidad con motherboard y memoria, el cooler incluido y el costo total de la plataforma: un micro más barato no siempre produce el upgrade más conveniente.',
    relatedLinks: [
      {
        href: '/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x',
        label: 'Ryzen 7600X vs 5700X: cuál conviene',
      },
      {
        href: '/guia/pc-gamer-2-millones',
        label: 'PC gamer por $2 millones',
      },
    ],
  },
  'tarjetas-graficas': {
    title: 'Placas de video RTX y Radeon: precios',
    description: 'Compará precios de placas de video NVIDIA GeForce RTX y AMD Radeon en Argentina. Encontrá stock y ofertas actuales en múltiples tiendas.',
    heading: 'Compará precios de placas de video RTX y Radeon',
    intro: 'Compará precios de placas de video NVIDIA GeForce RTX y AMD Radeon publicadas por tiendas argentinas. Encontrá modelos para gaming, streaming y trabajo, con stock y mejor precio disponible. Además del importe final, revisá VRAM, consumo, tamaño físico, garantía, fuente recomendada y rendimiento para la resolución de tu monitor. Así podés distinguir variantes parecidas y evitar pagar de más por una publicación con menos memoria o refrigeración inferior.',
    relatedLinks: [
      {
        href: '/comparativa/rtx-4060-vs-rx-7600',
        label: 'RTX 4060 vs RX 7600',
      },
      {
        href: '/guia/pc-gamer-2-millones',
        label: 'PC gamer por $2 millones',
      },
      {
        href: '/guia/pc-gamer-3-millones',
        label: 'PC gamer por $3 millones',
      },
    ],
  },
  'motherboards': {
    title: 'Motherboards en Argentina',
    description: 'Compará costos de placas madre AMD e Intel en Argentina, revisá disponibilidad por local y encontrá opciones convenientes para armar o actualizar tu PC.',
    heading: 'Comparador de precios de motherboards en Argentina',
    intro: 'Encuentra placas madre para plataformas AMD e Intel comparando disponibilidad y alternativas en distintos comercios del pais. Antes de elegir, revisá socket, chipset, tamaño, soporte de memoria, ranuras M.2, conectividad, fases de alimentación y actualizaciones de BIOS. Una motherboard barata puede ser suficiente para una PC simple, pero una configuración exigente necesita mejores prestaciones para sostener procesadores potentes, almacenamiento rápido y futuras ampliaciones sin quedar limitada.',
  },
  'memoria-ram': {
    title: 'Memoria RAM en Argentina',
    description: 'Compará valores de memoria RAM DDR4 y DDR5 en comercios argentinos, revisá stock, capacidades y alternativas para actualizar tu computadora.',
    heading: 'Comparador de precios de memoria RAM en Argentina',
    intro: 'Busca modulos DDR4 y DDR5 con ofertas comparadas entre locales argentinos para actualizar tu PC con mejor gasto y disponibilidad. Mirá capacidad, frecuencia, latencias, cantidad de módulos y compatibilidad con tu plataforma antes de comprar. Para gaming suele convenir priorizar kits dual channel equilibrados, mientras que edición, virtualización o trabajo pesado pueden necesitar más capacidad total. Esta página ayuda a filtrar opciones repetidas y encontrar alternativas razonables.',
  },
  'almacenamiento': {
    title: 'SSD y discos en Argentina',
    description: 'Compará importes de SSD NVMe, SATA y discos rígidos en Argentina, con disponibilidad por local y enlaces directos para decidir mejor.',
    heading: 'Comparador de precios de almacenamiento en Argentina',
    intro: 'Compara SSD SATA, NVMe y discos HDD entre distintos comercios para elegir almacenamiento segun capacidad, velocidad y presupuesto. Un NVMe rápido mejora cargas y transferencias, pero un SATA o HDD todavía puede servir para bibliotecas grandes, backups o equipos económicos. Revisá formato, interfaz, garantía, TBW y espacio real necesario. La mejor compra suele combinar unidad principal veloz con almacenamiento secundario amplio y confiable.',
  },
  'fuentes-alimentacion': {
    title: 'Fuentes de PC en Argentina',
    description: 'Compará costos de fuentes de alimentación para PC en Argentina, revisá potencia, disponibilidad y opciones de locales para comprar con más contexto.',
    heading: 'Comparador de precios de fuentes de alimentacion en Argentina',
    intro: 'Explora fuentes ATX y SFX de distintas potencias y certificaciones para encontrar una opcion segura y bien posicionada. La fuente es una pieza crítica: no alcanza con mirar watts publicados. Conviene validar marca, protecciones, certificación, conectores para GPU, garantía y margen para futuros upgrades. Una buena elección reduce riesgos de inestabilidad y protege el resto del hardware, especialmente en PCs con placas de video de consumo alto.',
  },
  'gabinetes': {
    title: 'Gabinetes PC en Argentina',
    description: 'Compará valores de gabinetes para PC gamer y oficina en Argentina, revisá stock y enlaces de comercios para elegir el formato más conveniente.',
    heading: 'Comparador de precios de gabinetes para PC en Argentina',
    intro: 'Revisa gabinetes mid tower, full tower y compactos comparando disponibilidad para elegir el mas conveniente. Además del aspecto visual, importan flujo de aire, espacio para GPU, altura de cooler, soporte para radiadores, cantidad de bahías, filtros de polvo y comodidad de armado. Un gabinete correcto mejora temperaturas, mantenimiento y ruido. Esta categoría ayuda a encontrar opciones equilibradas para PCs gamer, oficina o estaciones de trabajo.',
  },
  'refrigeracion': {
    title: 'Coolers PC en Argentina',
    description: 'Compará importes de coolers CPU, ventiladores y watercooling para PC en Argentina, con stock por local y referencias útiles antes de comprar.',
    heading: 'Comparador de precios de refrigeracion para PC en Argentina',
    intro: 'Compara soluciones de aire y liquido para mantener tu PC fria, revisando opciones reales en comercios argentinos. Antes de elegir, considerá socket compatible, altura disponible, tamaño del radiador, ruido, mantenimiento y capacidad térmica del procesador. Un cooler adecuado evita thermal throttling, mejora estabilidad y puede extender la vida útil del equipo. Para builds compactas o CPUs exigentes, la compatibilidad física es tan importante como el rendimiento anunciado.',
  },
  'computadoras': {
    title: 'Computadoras armadas en Argentina',
    description: 'Compará precios de PCs armadas, notebooks y equipos completos en comercios argentinos sin mezclarlos con componentes individuales.',
    heading: 'Comparador de precios de computadoras en Argentina',
    intro: 'Compará equipos completos por procesador, placa de video, memoria y almacenamiento. Verificá que la publicación incluya exactamente los componentes indicados, el sistema operativo, la garantía de la tienda y las posibilidades de actualización antes de comprar.',
  },
  'perifericos': {
    title: 'Periféricos en Argentina',
    description: 'Compará costos de mouse, teclados, auriculares, monitores y periféricos en Argentina, revisando disponibilidad y enlaces directos a comercios.',
    heading: 'Comparador de precios de perifericos en Argentina',
    intro: 'Busca mouse, teclados, auriculares, monitores y otros periféricos comparando valores reales entre múltiples locales argentinos. En estos productos importan ergonomía, tipo de uso, conectividad, garantía y preferencias personales. Un teclado mecánico, un mouse liviano o un monitor con buena tasa de refresco pueden cambiar mucho la experiencia diaria. Esta sección ayuda a explorar alternativas sin depender de un solo sitio o de nombres comerciales confusos.',
  },
};

export function getCategorySeoCopy(category?: HardwareCategory): CategorySeoCopy | null {
  if (!category) return null;
  return CATEGORY_SEO_COPY[category] ?? null;
}

export function isIndexableCategoryLanding(state: SearchPageState): boolean {
  return Boolean(
    state.category
    && !state.query
    && state.stores.length === 0
    && state.minPrice === undefined
    && state.maxPrice === undefined
    && state.sortBy === 'relevance'
    && state.page === 1,
  );
}

export function getCategoryLabel(category?: HardwareCategory): string | null {
  return categories.find((entry) => entry.id === category)?.name ?? null;
}
