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
    description: 'Compara precios de procesadores AMD e Intel en multiples tiendas de Argentina y encontra el mejor valor actualizado.',
    heading: 'Comparador de precios de procesadores en Argentina',
    intro: 'Explora CPUs AMD Ryzen e Intel Core con precios actualizados, diferencias entre tiendas y opciones para armar o mejorar tu PC sin pagar de mas.',
  },
  'tarjetas-graficas': {
    title: 'Tarjetas graficas en Argentina',
    description: 'Compara precios de placas de video NVIDIA GeForce y AMD Radeon en tiendas de Argentina y detecta el mejor precio disponible.',
    heading: 'Comparador de precios de tarjetas graficas en Argentina',
    intro: 'Revisa GPUs GeForce y Radeon con stock y precios comparados entre tiendas argentinas para encontrar la mejor opcion para gaming, streaming o trabajo.',
  },
  'motherboards': {
    title: 'Motherboards en Argentina',
    description: 'Compara precios de motherboards AMD e Intel en Argentina y encuentra la opcion con mejor relacion precio-prestaciones.',
    heading: 'Comparador de precios de motherboards en Argentina',
    intro: 'Encuentra placas madre para plataformas AMD e Intel comparando precios, disponibilidad y alternativas en distintas tiendas del pais.',
  },
  'memoria-ram': {
    title: 'Memoria RAM en Argentina',
    description: 'Compara precios de memoria RAM DDR4 y DDR5 en tiendas de Argentina para comprar al mejor valor.',
    heading: 'Comparador de precios de memoria RAM en Argentina',
    intro: 'Busca modulos DDR4 y DDR5 con precios comparados entre tiendas argentinas para actualizar tu PC con mejor costo y disponibilidad.',
  },
  'almacenamiento': {
    title: 'Almacenamiento en Argentina',
    description: 'Compara precios de SSD, NVMe y discos rigidos en Argentina y encuentra la mejor opcion por capacidad y precio.',
    heading: 'Comparador de precios de almacenamiento en Argentina',
    intro: 'Compara SSD SATA, NVMe y discos HDD entre distintas tiendas para elegir almacenamiento segun capacidad, velocidad y presupuesto.',
  },
  'fuentes-alimentacion': {
    title: 'Fuentes de alimentacion en Argentina',
    description: 'Compara precios de fuentes de alimentacion para PC en tiendas de Argentina y detecta la mejor oferta.',
    heading: 'Comparador de precios de fuentes de alimentacion en Argentina',
    intro: 'Explora fuentes ATX y SFX de distintas potencias y certificaciones para encontrar una opcion segura y bien posicionada en precio.',
  },
  'gabinetes': {
    title: 'Gabinetes para PC en Argentina',
    description: 'Compara precios de gabinetes para PC en Argentina y encuentra modelos con mejor relacion entre espacio, airflow y precio.',
    heading: 'Comparador de precios de gabinetes para PC en Argentina',
    intro: 'Revisa gabinetes mid tower, full tower y compactos comparando precios y disponibilidad para elegir el mas conveniente.',
  },
  'refrigeracion': {
    title: 'Refrigeracion para PC en Argentina',
    description: 'Compara precios de coolers, ventiladores y watercooling en Argentina y encuentra la mejor opcion.',
    heading: 'Comparador de precios de refrigeracion para PC en Argentina',
    intro: 'Compara soluciones de aire y liquido para mantener tu PC fria, revisando precios y opciones reales en tiendas argentinas.',
  },
  'perifericos': {
    title: 'Perifericos en Argentina',
    description: 'Compara precios de perifericos gamer y de oficina en Argentina para encontrar el mejor precio entre tiendas.',
    heading: 'Comparador de precios de perifericos en Argentina',
    intro: 'Busca mouse, teclados, auriculares, monitores y otros perifericos comparando precios reales entre multiples tiendas argentinas.',
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
