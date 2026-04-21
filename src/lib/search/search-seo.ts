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
    title: 'Procesadores AMD Ryzen e Intel | Argentina',
    description: 'Compará precios de procesadores AMD Ryzen y Intel Core en Argentina.',
    heading: 'Comparador de precios de procesadores en Argentina',
    intro: 'Explora CPUs AMD Ryzen e Intel Core con precios actualizados, diferencias entre tiendas y opciones para armar o mejorar tu PC sin pagar de mas.',
  },
  'tarjetas-graficas': {
    title: 'Placas de Video NVIDIA RTX y AMD RX | Argentina',
    description: 'Compará precios de GPUs NVIDIA GeForce RTX y AMD Radeon RX en Argentina.',
    heading: 'Comparador de precios de tarjetas graficas en Argentina',
    intro: 'Revisa GPUs GeForce y Radeon con stock y precios comparados entre tiendas argentinas para encontrar la mejor opcion para gaming, streaming o trabajo.',
  },
  'motherboards': {
    title: 'Motherboards AMD e Intel | Argentina',
    description: 'Compará precios de motherboards para AMD e Intel en Argentina.',
    heading: 'Comparador de precios de motherboards en Argentina',
    intro: 'Encuentra placas madre para plataformas AMD e Intel comparando precios, disponibilidad y alternativas en distintas tiendas del pais.',
  },
  'memoria-ram': {
    title: 'Memoria RAM DDR4 y DDR5 | Argentina',
    description: 'Compará precios de memoria RAM DDR4 y DDR5 en Argentina.',
    heading: 'Comparador de precios de memoria RAM en Argentina',
    intro: 'Busca modulos DDR4 y DDR5 con precios comparados entre tiendas argentinas para actualizar tu PC con mejor costo y disponibilidad.',
  },
  'almacenamiento': {
    title: 'SSD y Discos Rigidos | Argentina',
    description: 'Compará precios de SSD NVMe, SATA y HDD en Argentina.',
    heading: 'Comparador de precios de almacenamiento en Argentina',
    intro: 'Compara SSD SATA, NVMe y discos HDD entre distintas tiendas para elegir almacenamiento segun capacidad, velocidad y presupuesto.',
  },
  'fuentes-alimentacion': {
    title: 'Fuentes de PC | Argentina',
    description: 'Compará precios de fuentes de alimentación para PC en Argentina.',
    heading: 'Comparador de precios de fuentes de alimentacion en Argentina',
    intro: 'Explora fuentes ATX y SFX de distintas potencias y certificaciones para encontrar una opcion segura y bien posicionada en precio.',
  },
  'gabinetes': {
    title: 'Gabinetes para PC | Argentina',
    description: 'Compará precios de gabinetes para PC gamer en Argentina.',
    heading: 'Comparador de precios de gabinetes para PC en Argentina',
    intro: 'Revisa gabinetes mid tower, full tower y compactos comparando precios y disponibilidad para elegir el mas conveniente.',
  },
  'refrigeracion': {
    title: 'Coolers y Watercooling PC | Argentina',
    description: 'Compará precios de coolers CPU y sistemas de refrigeración en Argentina.',
    heading: 'Comparador de precios de refrigeracion para PC en Argentina',
    intro: 'Compara soluciones de aire y liquido para mantener tu PC fria, revisando precios y opciones reales en tiendas argentinas.',
  },
  'perifericos': {
    title: 'Periféricos Gamer y Oficina | Argentina',
    description: 'Compará precios de mouse, teclados, auriculares y monitores en Argentina.',
    heading: 'Comparador de precios de perifericos en Argentina',
    intro: 'Busca mouse, teclados, auriculares, monitores y otros periféricos comparando precios reales entre múltiples tiendas argentinas.',
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
