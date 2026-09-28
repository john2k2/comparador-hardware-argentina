import type { HardwareCategory } from '@/lib/types';
import type { GuideSlotSpec } from '@/lib/seo/budget-guide-pricing';
import { SITE_NAME } from '@/lib/site-config';

export type BudgetGuideComponentSpec = GuideSlotSpec & {
  searchTerms: string[];
  category: HardwareCategory;
};

export type BudgetGuideDefinition = {
  slug: string;
  title: string;
  metadataTitle?: string;
  description: string;
  keywords: string[];
  budget: number;
  components: {
    cpu: BudgetGuideComponentSpec;
    gpu: BudgetGuideComponentSpec;
    ram: BudgetGuideComponentSpec;
    ssd: BudgetGuideComponentSpec;
    motherboard: BudgetGuideComponentSpec;
    psu: BudgetGuideComponentSpec;
    case: BudgetGuideComponentSpec;
  };
  productivity: Array<{ task: string; performance: string }>;
  tips: string[];
  faqs: Array<{ question: string; answer: string }>;
};

export const BUDGET_GUIDES: BudgetGuideDefinition[] = [
  {
    slug: 'pc-gamer-1-millon',
    title: 'PC Gamer hasta $1 millón: componentes y precios',
    metadataTitle: `PC gamer hasta 1 millón: componentes y precios | ${SITE_NAME}`,
    description: 'Componentes para una PC gamer de entrada con un máximo de $1 millón en Argentina: Ryzen 5 5500, Arc A380 y 16 GB DDR4. Compará ofertas recientes, stock y costos adicionales.',
    keywords: ['pc gamer 1 millon', 'pc gamer barata argentina', 'armar pc 1 millon pesos', 'pc gaming economica'],
    budget: 1000000,
    components: {
      cpu: {
        name: 'AMD Ryzen 5 5500 con Wraith Stealth',
        exactModel: 'Ryzen 5 5500',
        searchTerms: ['ryzen 5 5500'],
        category: 'procesadores',
        description: '6 núcleos / 12 hilos | AM4 | Cooler incluido en la publicación elegida',
        estimatedPrice: 160000,
      },
      gpu: {
        name: 'ASRock Intel Arc A380 Challenger ITX OC 6GB',
        exactModel: 'Challenger ITX OC',
        searchTerms: ['arc a380 challenger itx'],
        category: 'tarjetas-graficas',
        description: '6 GB GDDR6 | Gaming de entrada | Activar Resizable BAR y actualizar drivers',
        estimatedPrice: 267000,
      },
      ram: {
        name: 'Mancer Vant S 16GB DDR4 3200MHz CL19 (1 módulo)',
        exactModel: 'Vant S',
        searchTerms: ['mancer 16gb ddr4 3200 vant'],
        category: 'memoria-ram',
        description: 'Un módulo de 16 GB | No es dual channel | Revisar QVL antes de ampliar',
        estimatedPrice: 192000,
      },
      ssd: {
        name: 'SSD ADATA SU650SS 512GB SATA',
        exactModel: 'SU650SS',
        searchTerms: ['adata 512gb su650ss'],
        category: 'almacenamiento',
        description: 'SATA 2,5 pulgadas | 512 GB | Requiere cable de datos y alimentación SATA',
        estimatedPrice: 121000,
      },
      motherboard: {
        name: 'ASRock B550M-HDV DDR4 AM4',
        exactModel: 'B550M-HDV',
        searchTerms: ['asrock b550m hdv'],
        category: 'motherboards',
        description: 'mATX | AM4 y DDR4 | Confirmar BIOS para Ryzen 5 5500 y Resizable BAR',
        estimatedPrice: 122000,
      },
      psu: {
        name: 'Antec CSK650DC AR 650W 80 Plus Bronze',
        exactModel: 'CSK650DC AR',
        searchTerms: ['antec csk650dc ar'],
        category: 'fuentes-alimentacion',
        description: '650 W | PCIe 6+2 y SATA según ficha de la tienda | Modelo CSK650DC AR',
        estimatedPrice: 75000,
      },
      case: {
        name: 'Antec VX310 Black con 4 ventiladores',
        exactModel: 'VX310',
        searchTerms: ['antec vx310'],
        category: 'gabinetes',
        description: 'Admite mATX | 4 × 120 mm según publicación | Confirmar variante RGB/ARGB',
        estimatedPrice: 61000,
      },
    },
    productivity: [
      { task: 'Office / Navegación', performance: 'Uso cotidiano con SSD y 16 GB' },
      { task: 'Photoshop', performance: 'Depende del tamaño del proyecto y sus efectos' },
      { task: 'Edición video básica', performance: 'Revisar soporte del programa y los codecs' },
      { task: 'Streaming', performance: 'Comprobar codificador, drivers y carga del juego' },
      { task: 'Programación', performance: 'Según herramientas, contenedores y memoria requerida' },
    ],
    tips: [
      'Presupuesto máximo: El millón es un máximo para componentes, no una cantidad que debas gastar exactamente. Sumá envío, armado, licencia y periféricos antes de pagar.',
      'Arc A380: activá Above 4G Decoding y Resizable BAR; usá arranque UEFI con CSM desactivado y drivers actuales. No garantizamos FPS ni calidad Ultra en todos los juegos.',
      'Ryzen 5 5500: requiere placa de video dedicada; conectá el monitor a la A380. La publicación elegida incluye Wraith Stealth: confirmalo con la tienda.',
      'Motherboard: pedí una BIOS que admita Ryzen 5 5500 y verificá Resizable BAR antes del armado. El procesador trabaja con PCIe 3.0 aunque la placa anuncie PCIe 4.0.',
      'RAM: este presupuesto usa un módulo de 16 GB y no dual channel. Revisá código y QVL antes de ampliar; dos módulos comprados separados no garantizan un conjunto probado.',
      'SSD SATA: permite respetar el límite. No es NVMe; verificá que la motherboard incluya cable SATA y que la fuente tenga alimentación SATA.',
      'Fuente y gabinete: confirmá el conector PCIe de 8 pines, los cuatro ventiladores y su alimentación. La certificación 80 Plus mide eficiencia, no toda la calidad de una fuente.',
    ],
    faqs: [
      {
        question: '¿Se puede armar una PC gamer con 1 millón de pesos?',
        answer: 'La selección se revisó para respetar un máximo de $1 millón con siete componentes: Ryzen 5 5500 con cooler, Arc A380 de 6 GB, 16 GB DDR4, SSD SATA de 512 GB, motherboard B550, fuente y gabinete. Verificá que las siete ofertas sigan disponibles y el total entre en el límite; envío y servicios se suman aparte.',
      },
      {
        question: '¿Qué placa de video comprar para PC de 1 millón?',
        answer: 'La selección usa ASRock Arc A380 Challenger ITX OC de 6 GB para mantener el costo completo por debajo del millón en el corte comprobado. Es una opción de entrada: necesita Resizable BAR y drivers adecuados. Revisá pruebas de tus juegos y no la tomes como equivalente a una RX 6600.',
      },
      {
        question: '¿Cuántos FPS puedo esperar de esta PC?',
        answer: 'No hicimos un benchmark propio de esta configuración ni prometemos una cantidad de FPS. El resultado depende del juego, resolución, ajustes, drivers y Resizable BAR. El total solo cubre los componentes disponibles; envío, armado, sistema operativo, monitor y periféricos no están incluidos.',
      },
    ],
  },
  {
    slug: 'pc-gamer-2-millones',
    title: 'PC Gamer hasta $2 millones: componentes y precios',
    metadataTitle: `PC gamer hasta 2 millones: componentes y precios | ${SITE_NAME}`,
    description: 'Compará componentes para una PC gamer con un máximo de $2 millones en Argentina. Un armado más económico también sirve: verificá disponibilidad, compatibilidad, envíos y costos adicionales.',
    keywords: ['pc gamer 2 millones', 'pc gaming argentina 2m', 'mejor pc gamer precio calidad', 'pc gamer rtx 4060'],
    budget: 2000000,
    components: {
      cpu: {
        name: 'AMD Ryzen 5 7600 con Wraith Stealth',
        searchTerms: ['ryzen 5 7600'],
        category: 'procesadores',
        description: '6 núcleos / 12 hilos | AM5 | Confirmar cooler incluido en la publicación',
        estimatedPrice: 350000,
      },
      gpu: {
        name: 'RTX 4060 / RX 7600',
        searchTerms: ['rtx 4060', 'rx 7600'],
        category: 'tarjetas-graficas',
        description: '8 GB GDDR6 | Funciones y rendimiento según juego y versión',
        estimatedPrice: 500000,
      },
      ram: {
        name: '16GB DDR5 5600MHz (1 módulo)',
        searchTerms: ['16gb ddr5 5600'],
        category: 'memoria-ram',
        description: 'Un módulo de 16 GB: revisar código, QVL y perfil de memoria antes de ampliar',
        estimatedPrice: 150000,
      },
      ssd: {
        name: 'SSD Kingston NV3 NVMe 1TB',
        searchTerms: ['kingston nv3 1tb'],
        category: 'almacenamiento',
        description: 'M.2 2280 NVMe | Capacidad de 1 TB | Revisar condiciones de garantía',
        estimatedPrice: 80000,
      },
      motherboard: {
        name: 'MSI PRO B650M-B AM5',
        exactModel: 'B650M-B',
        searchTerms: ['msi pro b650m b'],
        category: 'motherboards',
        description: 'mATX | DDR5 | PCIe 4.0 | Revisar BIOS y QVL del modelo exacto',
        estimatedPrice: 200000,
      },
      psu: {
        name: '650W 80 Plus Gold',
        searchTerms: ['650w'],
        category: 'fuentes-alimentacion',
        description: '650 W | Revisar conectores y garantía del modelo elegido',
        estimatedPrice: 100000,
      },
      case: {
        name: 'Cooler Master Elite 302',
        exactModel: 'Elite 302',
        searchTerms: ['cooler master elite 302'],
        category: 'gabinetes',
        description: 'Mini Tower | Admite mATX/Mini-ITX | Confirmar ventiladores y dimensiones',
        estimatedPrice: 80000,
      },
    },
    productivity: [
      { task: 'Photoshop / Illustrator', performance: 'Depende del proyecto y las piezas finales' },
      { task: 'Edición video 1080p', performance: 'Depende del formato y la complejidad' },
      { task: 'Streaming 1080p60', performance: 'Verificar codificador y carga simultánea' },
      { task: '3D Modeling básico', performance: 'Verificar requisitos del software' },
      { task: 'Desarrollo software', performance: 'Depende del proyecto y las piezas finales' },
    ],
    tips: [
      'Invertí en el monitor: Elegí resolución y frecuencia según tus juegos; no garantizamos FPS para una combinación sin probar.',
      'Cooler incluido: Esta selección usa Ryzen 5 7600 con Wraith Stealth. Confirmá que la tienda lo entregue; una versión sin cooler requiere otro presupuesto.',
      'RAM de 16 GB en un módulo: Permite entrar en el presupuesto, pero ofrece menos capacidad y ancho de banda que dos módulos. Para ampliar, revisá QVL y comprá una combinación probada; no garantizamos compatibilidad al mezclar módulos.',
      'RAM DDR5: Revisá QVL, CPU y BIOS antes de activar XMP/EXPO. AMD especifica hasta DDR5-5200 para el 7600; 5600 es un perfil que depende del conjunto.',
      'Gabinete con buen airflow: Priorizá ventilación sobre RGB, sobre todo con GPU de gama media/alta.',
      'Upgrade path: AM5 sigue teniendo recorrido; confirmá chipset y BIOS antes de un micro más nuevo.',
    ],
    faqs: [
      {
        question: '¿Se puede armar una PC gamer con 2 millones de pesos?',
        answer: 'El resultado depende de las ofertas registradas y de costos adicionales. Revisá total parcial, faltantes y compatibilidad antes de comprar.',
      },
      {
        question: '¿RTX 4060 o RX 7600 para PC de 2 millones?',
        answer: 'Compará pruebas de tus juegos, funciones y ofertas recientes. No asumimos una ganadora de precio o rendimiento para todo uso.',
      },
      {
        question: '¿Cuántos FPS da una PC de 2 millones en Cyberpunk?',
        answer: 'No medimos FPS de esta configuración; consultá pruebas con versiones, ajustes y hardware comparables.',
      },
    ],
  },
  {
    slug: 'pc-gamer-3-millones',
    title: 'PC Gamer por $3 millones: componentes y precios',
    metadataTitle: `PC gamer 3 millones: componentes y precios | ${SITE_NAME}`,
    description: 'Compará componentes y precios para armar una PC gamer por $3 millones en Argentina: Ryzen 7, RTX 5070 o RX 7800 XT y 32 GB DDR5.',
    keywords: ['pc gamer 3 millones', 'pc alta gama argentina', 'pc gamer rtx 5070', 'pc gaming 1440p'],
    budget: 3000000,
    components: {
      cpu: {
        name: 'AMD Ryzen 7 7700X / 7800X3D',
        searchTerms: ['ryzen 7 7700x', 'ryzen 7 7800x3d'],
        category: 'procesadores',
        description: '8 núcleos / 16 hilos | AM5 | DDR5 | Hasta 5.4 GHz',
        estimatedPrice: 500000,
      },
      gpu: {
        name: 'RTX 5070 / RX 7800 XT',
        searchTerms: ['rtx 5070', 'rx 7800 xt'],
        category: 'tarjetas-graficas',
        description: '12-16GB GDDR6/GDDR7 | 1440p Ultra / 4K High',
        estimatedPrice: 900000,
      },
      ram: {
        name: '32GB DDR5 6000MHz (2x16GB)',
        searchTerms: ['32gb ddr5'],
        category: 'memoria-ram',
        description: 'Dual Channel DDR5 | Baja latencia CL30',
        estimatedPrice: 200000,
      },
      ssd: {
        name: 'SSD NVMe 2TB Gen4',
        searchTerms: ['ssd 2tb', 'nvme 2tb'],
        category: 'almacenamiento',
        description: 'NVMe Gen4 x4 | 7000+ MB/s lectura',
        estimatedPrice: 150000,
      },
      motherboard: {
        name: 'AM5 X670 / B650E',
        searchTerms: ['x670', 'b650e'],
        category: 'motherboards',
        description: 'VRMs premium | PCIe 5.0 | WiFi 6E | USB-C',
        estimatedPrice: 350000,
      },
      psu: {
        name: '850W 80 Plus Gold Modular',
        searchTerms: ['850w'],
        category: 'fuentes-alimentacion',
        description: 'Cableado modular | Eficiencia | Futuro proof',
        estimatedPrice: 150000,
      },
      case: {
        name: 'Full Tower premium',
        searchTerms: ['full tower'],
        category: 'gabinetes',
        description: '6+ fans | Radiador 360mm | Panel cristal templado',
        estimatedPrice: 120000,
      },
    },
    productivity: [
      { task: 'Edición video 4K', performance: 'Fluido' },
      { task: '3D Rendering', performance: 'Excelente' },
      { task: 'Streaming 1440p60', performance: 'Sin problemas' },
      { task: 'Machine Learning', performance: 'Bueno (CUDA)' },
      { task: 'Desarrollo AAA', performance: 'Excelente' },
    ],
    tips: [
      'Monitor 1440p 144Hz o 4K 60Hz: Aprovechá el poder de esta PC con un monitor acorde.',
      'AIO o torre: Si el CPU es WOF, necesitás refrigeración acorde al TDP del listing, no un cooler genérico de 30 W.',
      'Gabinete con excelente airflow: Invertí en ventilación real; el RGB no mueve aire.',
      'Cable management: Una fuente modular ayuda. Organizá los cables para mejor airflow.',
      'Almacenamiento: Si el SSD del armado queda justo, un segundo disco es más honesto que inflar el presupuesto con un HDD lento.',
    ],
    faqs: [
      {
        question: '¿Se puede armar una PC de alta gama con 3 millones?',
        answer: 'Sí, con 3 millones armás una PC de alta gama para 1440p Ultra y 4K High con Ryzen 7 7700X y RTX 5070.',
      },
      {
        question: '¿RTX 5070 o RX 7800 XT para PC de 3 millones?',
        answer: 'La RTX 5070 tiene DLSS 4 y mejor Ray Tracing. La RX 7800 XT tiene más VRAM (16GB) y mejor precio. Ambas son excelentes.',
      },
      {
        question: '¿Cuántos FPS da una PC de 3 millones en 4K?',
        answer: 'En 4K Ultra con RTX 5070 obtenés 60+ FPS en la mayoría de juegos. Títulos muy exigentes como Alan Wake 2 necesitan DLSS/FSR.',
      },
    ],
  },
];

export function getBudgetGuideBySlug(slug: string): BudgetGuideDefinition | undefined {
  return BUDGET_GUIDES.find(g => g.slug === slug);
}

export function getAllBudgetGuideSlugs(): string[] {
  return BUDGET_GUIDES.map(g => g.slug);
}
