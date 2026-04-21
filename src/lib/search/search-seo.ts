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
    title: 'Procesadores en Argentina | AMD Ryzen e Intel Core - Comparador de Precios',
    description: 'Compará precios de procesadores AMD Ryzen y Intel Core en las mejores tiendas de Argentina. Encontrá el mejor precio para tu próxima PC gamer o de trabajo.',
    heading: 'Comparador de precios de procesadores en Argentina',
    intro: 'Explora CPUs AMD Ryzen e Intel Core con precios actualizados, diferencias entre tiendas y opciones para armar o mejorar tu PC sin pagar de mas.',
  },
  'tarjetas-graficas': {
    title: 'Tarjetas Gráficas en Argentina | NVIDIA GeForce y AMD Radeon - Comparador',
    description: 'Compará precios de placas de video NVIDIA GeForce RTX y AMD Radeon RX en tiendas de Argentina. Encontrá el mejor precio para gaming, streaming o trabajo creativo.',
    heading: 'Comparador de precios de tarjetas graficas en Argentina',
    intro: 'Revisa GPUs GeForce y Radeon con stock y precios comparados entre tiendas argentinas para encontrar la mejor opcion para gaming, streaming o trabajo.',
  },
  'motherboards': {
    title: 'Motherboards en Argentina | Placas Madre AMD e Intel - Comparador de Precios',
    description: 'Compará precios de motherboards para procesadores AMD e Intel en Argentina. Encontrá placas madre con mejor relación precio-prestaciones para tu setup.',
    heading: 'Comparador de precios de motherboards en Argentina',
    intro: 'Encuentra placas madre para plataformas AMD e Intel comparando precios, disponibilidad y alternativas en distintas tiendas del pais.',
  },
  'memoria-ram': {
    title: 'Memoria RAM en Argentina | DDR4 y DDR5 - Comparador de Precios Gaming',
    description: 'Compará precios de memoria RAM DDR4 y DDR5 de marcas como Corsair, Kingston y G.Skill en tiendas argentinas. Encontrá el mejor precio para tu PC.',
    heading: 'Comparador de precios de memoria RAM en Argentina',
    intro: 'Busca modulos DDR4 y DDR5 con precios comparados entre tiendas argentinas para actualizar tu PC con mejor costo y disponibilidad.',
  },
  'almacenamiento': {
    title: 'Almacenamiento en Argentina | SSD NVMe y Discos Rigidos - Comparador',
    description: 'Compará precios de SSD NVMe, SATA y discos rígidos HDD en Argentina. Encontrá la mejor opción de almacenamiento según capacidad, velocidad y presupuesto.',
    heading: 'Comparador de precios de almacenamiento en Argentina',
    intro: 'Compara SSD SATA, NVMe y discos HDD entre distintas tiendas para elegir almacenamiento segun capacidad, velocidad y presupuesto.',
  },
  'fuentes-alimentacion': {
    title: 'Fuentes de Alimentación en Argentina | ATX y SFX - Comparador de Precios',
    description: 'Compará precios de fuentes de alimentación para PC de marcas como Corsair, Thermaltake y EVGA en tiendas de Argentina. Encontrá la mejor opción.',
    heading: 'Comparador de precios de fuentes de alimentacion en Argentina',
    intro: 'Explora fuentes ATX y SFX de distintas potencias y certificaciones para encontrar una opcion segura y bien posicionada en precio.',
  },
  'gabinetes': {
    title: 'Gabinetes para PC en Argentina | Mid Tower y Full Tower - Comparador',
    description: 'Compará precios de gabinetes para PC de marcas como Corsair, NZXT y Phanteks en Argentina. Encontrá el mejor modelo con airflow y diseño que necesitás.',
    heading: 'Comparador de precios de gabinetes para PC en Argentina',
    intro: 'Revisa gabinetes mid tower, full tower y compactos comparando precios y disponibilidad para elegir el mas conveniente.',
  },
  'refrigeracion': {
    title: 'Refrigeración PC en Argentina | Coolers y Watercooling - Comparador de Precios',
    description: 'Compará precios de coolers CPU, ventiladores y sistemas de watercooling en Argentina. Encontrá la mejor solución de refrigeración para tu PC gamer.',
    heading: 'Comparador de precios de refrigeracion para PC en Argentina',
    intro: 'Compara soluciones de aire y liquido para mantener tu PC fria, revisando precios y opciones reales en tiendas argentinas.',
  },
  'perifericos': {
    title: 'Periféricos en Argentina | Mouse, Teclados y Más - Comparador Gaming',
    description: 'Compará precios de mouse gamer, teclados mecánicos, auriculares y monitores en Argentina. Encontrá los mejores periféricos para tu setup gaming u oficina.',
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
