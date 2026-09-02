import { categories } from '@/lib/scrapers/static-data';
import type { HardwareCategory } from '@/lib/types';
import type { SearchPageState } from './search-state';

type CategoryFaq = {
  question: string;
  answer: string;
};

type CategorySeoCopy = {
  title: string;
  description: string;
  heading: string;
  intro: string;
  relatedLinks?: Array<{
    href: string;
    label: string;
  }>;
  faqs?: CategoryFaq[];
};

const CATEGORY_SEO_COPY: Record<HardwareCategory, CategorySeoCopy> = {
  'procesadores': {
    title: 'Comparar procesadores: precios AMD e Intel',
    description: 'Compará procesadores AMD Ryzen e Intel Core entre tiendas de Argentina. Precio, stock y costo de plataforma antes de comprar.',
    heading: 'Comparar procesadores AMD e Intel',
    intro: 'Encontrá y compará precios de procesadores AMD Ryzen e Intel Core publicados por tiendas argentinas. Revisá modelos para gaming, trabajo y PCs con gráficos integrados, junto con su stock y mejor precio disponible. Antes de decidir, confirmá el socket, la compatibilidad con motherboard y memoria, el cooler incluido y el costo total de la plataforma: un micro más barato no siempre produce el upgrade más conveniente.',
    relatedLinks: [
      {
        href: '/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x',
        label: 'Ryzen 5 7600X vs Ryzen 7 5700X: precios',
      },
      {
        href: '/comparativa/i5-14600k-vs-ryzen-5-7600x',
        label: 'i5-14600K vs Ryzen 5 7600X',
      },
      {
        href: '/comparativa/ryzen-7-9800x3d-vs-i9-14900k',
        label: '9800X3D vs i9-14900K',
      },
      {
        href: '/guia/pc-gamer-2-millones',
        label: 'PC gamer por $2 millones',
      },
    ],
    faqs: [
      {
        question: '¿Cómo comparar procesadores en Argentina?',
        answer: 'Compará el mismo modelo entre tiendas: precio publicado, stock, garantía y si incluye cooler. Después mirá socket, generación y el costo de motherboard más RAM. Un micro más barato puede salir más caro si obliga a cambiar toda la plataforma.',
      },
      {
        question: '¿AMD Ryzen o Intel Core, cuál conviene?',
        answer: 'Para armar una PC nueva, Ryzen AM5 suele rendir mejor a futuro. Intel puede convivir si ya tenés motherboard y memoria compatibles, o si un modelo puntual está mucho más barato. Compará el total de plataforma, no solo el procesador.',
      },
      {
        question: '¿Qué mirar además del precio del procesador?',
        answer: 'Socket (AM4, AM5, LGA 1700 o 1851), TDP, cooler incluido y si necesitás DDR4 o DDR5. También confirmá que la publicación sea exactamente el modelo que buscás: tray, box o con gráficos integrados no son intercambiables.',
      },
    ],
  },
  'tarjetas-graficas': {
    title: 'Comparar placas de video: precios RTX y Radeon',
    description: 'Compará placas de video NVIDIA RTX y AMD Radeon entre tiendas de Argentina. Precio, stock y VRAM del mismo chip.',
    heading: 'Comparar placas de video RTX y Radeon',
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
      {
        href: '/comparativa/rtx-5070-vs-rtx-4070',
        label: 'RTX 5070 vs RTX 4070',
      },
    ],
    faqs: [
      {
        question: '¿Cómo comparar placas de video en Argentina?',
        answer: 'Filtrá por el mismo chip y la misma cantidad de VRAM. Entre tiendas cambian el cooler, el tamaño y el consumo, aunque el nombre sea parecido. Después compará precio, stock y garantía de cada publicación.',
      },
      {
        question: '¿RTX o Radeon, cuál conviene?',
        answer: 'NVIDIA suele ganar en Ray Tracing, DLSS y encoding para streaming. AMD Radeon a veces ofrece más rendimiento raster por peso. La decisión correcta sale de tu resolución, fuente y del precio real de cada modelo en el comparador.',
      },
      {
        question: '¿Qué mirar además del precio de la GPU?',
        answer: 'VRAM, largo de la placa, conector de alimentación y watts recomendados de la fuente. Una 8 GB puede alcanzar en 1080p, pero 1440p o texturas altas piden más memoria y mejor refrigeración.',
      },
    ],
  },
  'motherboards': {
    title: 'Motherboards AMD e Intel: precios',
    description: 'Compará precios de motherboards AMD e Intel en tiendas de Argentina. Revisá socket, chipset, stock y ofertas actuales antes de comprar.',
    heading: 'Compará precios de motherboards AMD e Intel',
    intro: 'Compará precios de motherboards AMD e Intel publicadas por tiendas argentinas. Antes de elegir, revisá socket, chipset, tamaño, soporte de memoria, ranuras M.2, conectividad y fases de alimentación. Una motherboard barata puede alcanzar para una PC simple, pero un procesador exigente necesita mejor VRM y BIOS al día.',
    relatedLinks: [
      {
        href: '/comparativa/ddr5-vs-ddr4',
        label: 'DDR5 vs DDR4: cuál conviene',
      },
      {
        href: '/search?category=procesadores',
        label: 'Comparar procesadores',
      },
      {
        href: '/guia/pc-gamer-2-millones',
        label: 'PC gamer por $2 millones',
      },
    ],
    faqs: [
      {
        question: '¿Cómo comparar motherboards en Argentina?',
        answer: 'Primero filtrá por el mismo socket y chipset. Después compará precio, stock, cantidad de M.2, soporte de RAM y si la publicación es el modelo exacto. Un nombre parecido puede cambiar VRM, puertos o BIOS.',
      },
      {
        question: '¿Qué motherboard conviene para AM5 o LGA 1700?',
        answer: 'En AM5 un B650 suele alcanzar para Ryzen 5 y 7. En Intel LGA 1700, B760 o Z790 según si vas a overclockear. Compará el costo total con procesador y RAM, no solo la placa.',
      },
      {
        question: '¿Qué mirar además del precio de la motherboard?',
        answer: 'Socket, formato (ATX, mATX, ITX), ranuras RAM, M.2, USB y si necesita update de BIOS. Una placa más barata puede limitar el procesador o pedirte un flash previo.',
      },
    ],
  },
  'memoria-ram': {
    title: 'Memoria RAM DDR4 y DDR5: precios',
    description: 'Compará precios de memoria RAM DDR4 y DDR5 en tiendas de Argentina. Revisá kits, capacidad, frecuencia y stock actual antes de comprar.',
    heading: 'Compará precios de memoria RAM DDR4 y DDR5',
    intro: 'Compará precios de módulos DDR4 y DDR5 publicados por tiendas argentinas. Mirá capacidad, frecuencia, latencias, cantidad de módulos y compatibilidad con tu plataforma. Para gaming suele convenir un kit dual channel; edición o virtualización pueden pedir más capacidad total.',
    relatedLinks: [
      {
        href: '/comparativa/ddr5-vs-ddr4',
        label: 'DDR5 vs DDR4: cuál conviene',
      },
      {
        href: '/search?category=procesadores',
        label: 'Comparar procesadores',
      },
      {
        href: '/guia/pc-gamer-2-millones',
        label: 'PC gamer por $2 millones',
      },
    ],
    faqs: [
      {
        question: '¿Cómo comparar memoria RAM en Argentina?',
        answer: 'Compará el mismo kit: tipo (DDR4 o DDR5), capacidad total, frecuencia y cantidad de módulos. Después mirá precio, stock y si la publicación es 1x16 o 2x8. No son intercambiables si tu motherboard pide dual channel.',
      },
      {
        question: '¿DDR5 o DDR4, cuál conviene?',
        answer: 'Si armás en AM5 o Intel reciente, DDR5 es el camino. Si tu plataforma es AM4 o LGA 1200, quedate en DDR4. La diferencia en juegos es chica; el salto caro es cambiar motherboard y procesador.',
      },
      {
        question: '¿Qué mirar además del precio de la RAM?',
        answer: 'Capacidad, frecuencia, latencia y que el kit sea compatible con tu motherboard. Un módulo suelto puede salir más barato y después no rendir en dual channel.',
      },
    ],
  },
  'almacenamiento': {
    title: 'SSD NVMe y SATA: precios',
    description: 'Compará precios de SSD NVMe, SATA y discos en tiendas de Argentina. Revisá capacidad, velocidad y stock actual antes de comprar.',
    heading: 'Compará precios de SSD NVMe y SATA',
    intro: 'Compará precios de SSD NVMe, SATA y discos HDD publicados por tiendas argentinas. Un NVMe rápido mejora cargas; un SATA o HDD todavía sirve para bibliotecas grandes o backups. Revisá formato, interfaz, garantía y espacio real que necesitás.',
    relatedLinks: [
      {
        href: '/guia/pc-gamer-2-millones',
        label: 'PC gamer por $2 millones',
      },
      {
        href: '/guia/pc-gamer-3-millones',
        label: 'PC gamer por $3 millones',
      },
      {
        href: '/search?category=procesadores',
        label: 'Comparar procesadores',
      },
    ],
    faqs: [
      {
        question: '¿Cómo comparar SSD en Argentina?',
        answer: 'Filtrá por la misma capacidad e interfaz (NVMe M.2 o SATA). Después compará precio, stock, garantía y si la publicación es Gen3 o Gen4. Un nombre parecido puede cambiar velocidad y TBW.',
      },
      {
        question: '¿NVMe o SATA, cuál conviene?',
        answer: 'NVMe es la mejor unidad principal para Windows y juegos. SATA alcanza para archivos o PCs más viejas. Si tu motherboard tiene M.2, conviene comparar SSD NVMe del tamaño que vas a llenar.',
      },
      {
        question: '¿Qué mirar además del precio del SSD?',
        answer: 'Capacidad usable, interfaz, DRAM o no, garantía y TBW. Un NVMe barato de 512 GB puede quedar corto si instalás pocos juegos AAA.',
      },
    ],
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

export function isCategoryCanonicalLanding(state: SearchPageState): boolean {
  return Boolean(
    state.category
    && !state.query
    && state.stores.length === 0
    && state.minPrice === undefined
    && state.maxPrice === undefined
    && state.sortBy === 'relevance',
  );
}

export function isIndexableCategoryLanding(state: SearchPageState): boolean {
  return isCategoryCanonicalLanding(state) && state.page === 1;
}

export function getCategoryLabel(category?: HardwareCategory): string | null {
  return categories.find((entry) => entry.id === category)?.name ?? null;
}
