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
    title: 'PC Gamer de $1 millón: componentes y precios',
    metadataTitle: `PC gamer de 1 millón: componentes y precios | ${SITE_NAME}`,
    description: 'Componentes para una PC gamer de entrada con un presupuesto de referencia de $1 millón en Argentina: Ryzen 5 5500, Arc A380 y 16 GB DDR4. Compará ofertas recientes, stock y costos adicionales.',
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
      'Presupuesto de referencia: El millón admite hasta un 10% de variación entre revisiones semanales o a pedido, no una cantidad que debas gastar exactamente. Sumá envío, armado, licencia y periféricos antes de pagar.',
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
        answer: 'La selección se revisó para respetar un presupuesto de referencia de $1 millón con siete componentes: Ryzen 5 5500 con cooler, Arc A380 de 6 GB, 16 GB DDR4, SSD SATA de 512 GB, motherboard B550, fuente y gabinete. Verificá que las siete ofertas sigan disponibles y el total no supere el presupuesto de referencia más el 10%; envío y servicios se suman aparte.',
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
    title: 'PC Gamer de $2 millones: componentes y precios',
    metadataTitle: `PC gamer de 2 millones: componentes y precios | ${SITE_NAME}`,
    description: 'Compará componentes para una PC gamer con un presupuesto de referencia de $2 millones en Argentina. Un armado más económico también sirve: verificá disponibilidad, compatibilidad, envíos y costos adicionales.',
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
    title: 'PC Gamer de $3 millones: componentes y precios',
    metadataTitle: `PC gamer de 3 millones: componentes y precios | ${SITE_NAME}`,
    description: 'Compará componentes y ofertas recientes para una PC gamer con una referencia de $3 millones en Argentina: Ryzen 5 7600 con cooler, RX 9060 XT de 16 GB y 32 GB DDR5.',
    keywords: ['pc gamer 3 millones', 'pc gamer rx 9060 xt 16gb', 'pc gaming argentina', 'pc gamer 32gb ddr5'],
    budget: 3000000,
    components: {
      cpu: {
        name: 'AMD Ryzen 5 7600 con Wraith Stealth',
        exactModel: 'Ryzen 5 7600',
        searchTerms: ['ryzen 5 7600'],
        category: 'procesadores',
        description: '6 núcleos / 12 hilos | AM5 | Cooler incluido en la publicación elegida',
        estimatedPrice: 360000,
      },
      gpu: {
        name: 'ASRock Radeon RX 9060 XT 16GB Challenger OC',
        exactModel: 'Challenger OC',
        searchTerms: ['rx 9060 xt 16gb challenger'],
        category: 'tarjetas-graficas',
        description: '16 GB GDDR6 | 249 mm de largo | Alimentación PCIe de 8 pines',
        estimatedPrice: 960000,
      },
      ram: {
        name: 'Patriot Viper Venom 32GB DDR5 6000MHz CL36 (2x16GB)',
        exactModel: 'Viper Venom',
        searchTerms: ['patriot 32gb ddr5 6000 viper venom'],
        category: 'memoria-ram',
        description: 'Kit de dos módulos de 16 GB | 6000 es un perfil de overclock, sujeto a BIOS y estabilidad',
        estimatedPrice: 860000,
      },
      ssd: {
        name: 'SSD Kingston NV3 1TB NVMe Gen4',
        exactModel: 'NV3',
        searchTerms: ['kingston nv3 1tb nvme'],
        category: 'almacenamiento',
        description: '1 TB | M.2 NVMe PCIe 4.0 x4 | No es SATA',
        estimatedPrice: 295000,
      },
      motherboard: {
        name: 'MSI B650M GAMING WIFI AM5 DDR5',
        exactModel: 'B650M GAMING WIFI',
        searchTerms: ['msi b650m gaming wifi'],
        category: 'motherboards',
        description: 'mATX | AM5 | Dos ranuras DDR5 | Wi-Fi 6E y dos M.2 PCIe 4.0',
        estimatedPrice: 215000,
      },
      psu: {
        name: 'ASRock Steel Legend 750W 80 Plus Gold modular',
        exactModel: 'Steel Legend',
        searchTerms: ['asrock 750w steel legend'],
        category: 'fuentes-alimentacion',
        description: 'SL-750G | ATX 3.1 | Modular | Usar sus cables PCIe 6+2 originales',
        estimatedPrice: 135000,
      },
      case: {
        name: 'Antec VX310 RGB Black',
        exactModel: 'VX310',
        searchTerms: ['antec vx310'],
        category: 'gabinetes',
        description: 'Admite mATX | Cuatro ventiladores en la publicación | Confirmar variante RGB/ARGB',
        estimatedPrice: 61000,
      },
    },
    productivity: [
      { task: 'Multitarea', performance: '32 GB en dos módulos; el uso real depende de las aplicaciones' },
      { task: 'Edición de video', performance: 'Revisar códecs, efectos y aceleración admitida por tu editor' },
      { task: 'Streaming', performance: 'Configurar el codificador y comprobar la carga de cada juego' },
      { task: '3D y cómputo', performance: 'GPU AMD: verificar soporte de la aplicación; no ofrece CUDA' },
    ],
    tips: [
      'Presupuesto: La referencia es de tres millones en componentes, con hasta un 10% de variación entre revisiones semanales o a pedido, no una obligación de gastar todo. Sumá envío, armado, licencia y periféricos por separado.',
      'Refrigeración: El Ryzen 5 7600 elegido incluye Wraith Stealth. No lo sustituyas por un 7600X o una publicación sin cooler sin recalcular la refrigeración.',
      'Variante de GPU: La RX 9060 XT elegida es la Challenger OC de 16 GB. Una variante de 8 GB o de otro tamaño no es la misma selección.',
      'Ampliación de RAM: El kit de 32 GB ocupa las dos ranuras DDR5. Para ampliar, habrá que reemplazar el kit; revisá código, QVL y BIOS antes de comprar.',
      'Configuración de memoria: Arrancá con parámetros estables de memoria y probá antes de activar perfiles. Los 6000 anunciados no están garantizados en cada combinación.',
      'Cableado: Conectá la GPU con el cable PCIe 6+2 original de la SL-750G; no mezcles cables de distintas fuentes ni confundas EPS de CPU con PCIe.',
    ],
    faqs: [
      {
        question: '¿Se puede armar una PC gamer con una referencia de 3 millones?',
        answer: 'La lista necesita siete ofertas elegibles y un total dentro de la referencia más el 10% de margen. Envío, armado, licencia y periféricos se suman aparte.',
      },
      {
        question: '¿Qué placa de video incluye esta guía de 3 millones?',
        answer: 'ASRock Radeon RX 9060 XT Challenger OC de 16 GB. No presentamos todas las GPU del mismo chip como equivalentes en memoria, dimensiones o refrigeración.',
      },
      {
        question: '¿Cuántos FPS da esta PC de 3 millones?',
        answer: 'No hicimos un ensayo propio de esta configuración. Contrastá pruebas de tus juegos con resolución, calidad, drivers y hardware comparables.',
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
