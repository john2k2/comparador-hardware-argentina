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
        answer: 'No hay una marca ganadora para todos los usos. Si conservás piezas, comprobá primero qué procesadores admite tu motherboard y desde qué BIOS. Si armás desde cero, compará CPU, motherboard, RAM y refrigeración, junto con pruebas de los modelos exactos en tu tarea.',
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
        answer: 'Elegí modelos concretos y contrastá pruebas en tus juegos o aplicaciones. Revisá memoria, funciones requeridas por el programa, consumo y conectores de la variante publicada. El nombre de la marca no demuestra mejor rendimiento por peso ni compatibilidad con tu equipo.',
      },
      {
        question: '¿Qué mirar además del precio de la GPU?',
        answer: 'Memoria, dimensiones, salidas de video, conectores y fuente recomendada para la edición exacta. Contrastá pruebas con tu resolución y ajustes: una cantidad de VRAM por sí sola no garantiza una calidad de imagen ni una tasa de cuadros.',
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
        href: '/comparar/procesadores',
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
        answer: 'El chipset no alcanza para elegir. Contrastá CPU exacto, revisión de la placa, BIOS requerida, memoria y conexiones en el soporte del fabricante. Después compará el costo completo y las funciones que realmente necesitás.',
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
        href: '/comparar/procesadores',
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
        answer: 'Compará el código exacto del kit, generación, capacidad total, cantidad de módulos, velocidad y latencia. Un módulo de 16 GB y dos de 8 GB suman lo mismo, pero ocupan distintas ranuras. Consultá las configuraciones admitidas por tu motherboard y CPU; no se deducen de la capacidad total.',
      },
      {
        question: '¿DDR5 o DDR4, cuál conviene?',
        answer: 'Comprá la generación admitida por la motherboard y el procesador exactos. DDR4 y DDR5 no son intercambiables. Para cambiar de plataforma, presupuestá también las piezas que debés reemplazar; no asumimos una diferencia de rendimiento universal entre generaciones.',
      },
      {
        question: '¿Qué mirar además del precio de la RAM?',
        answer: 'Revisá formato, generación, cantidad de módulos y código del kit. Contrastá la QVL y las condiciones de CPU y BIOS: un perfil XMP o EXPO es una configuración de overclock, no una velocidad garantizada para cualquier equipo.',
      },
    ],
  },
  'almacenamiento': {
    title: 'SSD NVMe y SATA: precios',
    description: 'Compará precios de SSD NVMe, SATA y discos en tiendas de Argentina. Revisá capacidad, velocidad y stock actual antes de comprar.',
    heading: 'Compará precios de SSD NVMe y SATA',
    intro: 'Compará precios de SSD NVMe, SATA y discos HDD publicados por tiendas argentinas. Revisá capacidad, formato, interfaz, garantía y conexiones disponibles en tu equipo. Separá las velocidades anunciadas de los resultados medidos en la tarea que necesitás.',
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
        href: '/comparar/procesadores',
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
        answer: 'Primero verificá las interfaces admitidas por tu equipo. Una ranura M.2 puede admitir SATA, PCIe/NVMe o ambas según la motherboard. Entre opciones compatibles, compará capacidad, garantía, precio y pruebas de tu tarea; el formato por sí solo no decide la compra.',
      },
      {
        question: '¿Qué mirar además del precio del SSD?',
        answer: 'Capacidad, interfaz, formato, garantía y resistencia publicada para el código exacto. Calculá el espacio que ocupan tus programas y archivos, y revisá las limitaciones de la ranura. No deduzcas velocidades sostenidas ni componentes internos únicamente de la marca.',
      },
    ],
  },
  'fuentes-alimentacion': {
    title: 'Fuentes de PC en Argentina',
    description: 'Compará costos de fuentes de alimentación para PC en Argentina, revisá potencia, disponibilidad y opciones de locales para comprar con más contexto.',
    heading: 'Comparador de precios de fuentes de alimentacion en Argentina',
    intro: 'Compará publicaciones de fuentes por modelo exacto, potencia, formato y conectores. Revisá protecciones documentadas, accesorios y garantía. El precio, la marca o la certificación de eficiencia por sí solos no acreditan la calidad ni la compatibilidad de una fuente.',
  },
  'gabinetes': {
    title: 'Gabinetes PC en Argentina',
    description: 'Compará valores de gabinetes para PC gamer y oficina en Argentina, revisá stock y enlaces de comercios para elegir el formato más conveniente.',
    heading: 'Comparador de precios de gabinetes para PC en Argentina',
    intro: 'Compará gabinetes por formato, espacio interior y accesorios incluidos. Contrastá las medidas de tu GPU, fuente, cooler y radiadores con la configuración que vas a instalar. Separá las piezas incluidas de las que sólo aparecen en las fotos de la tienda.',
  },
  'refrigeracion': {
    title: 'Coolers PC en Argentina',
    description: 'Compará importes de coolers CPU, ventiladores y watercooling para PC en Argentina, con stock por local y referencias útiles antes de comprar.',
    heading: 'Comparador de precios de refrigeracion para PC en Argentina',
    intro: 'Compará coolers, ventiladores y refrigeración líquida por modelo, montaje y dimensiones. Confirmá soportes para el socket, espacio y conexiones disponibles en tu PC. Las temperaturas y el ruido requieren pruebas del conjunto: no los deducimos de la foto o del precio.',
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
    && !state.includeUnavailable
    && state.sortBy === 'relevance',
  );
}

export function isIndexableCategoryLanding(state: SearchPageState): boolean {
  return isCategoryCanonicalLanding(state) && state.page === 1;
}

export function getCategoryLabel(category?: HardwareCategory): string | null {
  return categories.find((entry) => entry.id === category)?.name ?? null;
}
