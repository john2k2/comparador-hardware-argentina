import { categories } from '@/lib/scrapers/static-data';
import type { HardwareCategory } from '@/lib/types';
import type { SearchPageState } from './search-state';

type CategorySeoCopy = {
  title: string;
  description: string;
  heading: string;
  intro: string;
};

const CATEGORY_SEO_COPY: Record<HardwareCategory, CategorySeoCopy> = {
  'procesadores': {
    title: 'Procesadores en Argentina',
    description: 'Compará costos de CPUs AMD Ryzen e Intel Core en Argentina, revisá stock, diferencias entre comercios y enlaces directos para comprar mejor.',
    heading: 'Comparador de precios de procesadores en Argentina',
    intro: 'Explora CPUs AMD Ryzen e Intel Core con valores actualizados, diferencias entre locales y opciones para armar o mejorar tu PC sin pagar de mas. Esta categoría sirve para comparar gamas de entrada, modelos para gaming, chips con gráficos integrados y procesadores orientados a productividad. Revisá siempre compatibilidad con motherboard, memoria y refrigeración antes de decidir, porque el gasto final del upgrade depende del conjunto completo y no solo del micro elegido.',
  },
  'tarjetas-graficas': {
    title: 'Placas de video en Argentina',
    description: 'Compará costos de placas de video NVIDIA GeForce RTX y AMD Radeon RX en comercios argentinos, con stock, diferencias y enlaces directos a cada local.',
    heading: 'Comparador de precios de tarjetas graficas en Argentina',
    intro: 'Revisa GPUs GeForce y Radeon con stock y ofertas comparadas entre locales argentinos para encontrar la mejor opcion para gaming, streaming o trabajo. Además de mirar el valor final, conviene validar memoria VRAM, consumo, tamaño físico, garantía, fuente recomendada y rendimiento esperado para tu monitor. Esta landing ayuda a separar modelos similares, detectar variantes convenientes y evitar compras apuradas cuando distintos sitios publican placas con nombres muy parecidos.',
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
