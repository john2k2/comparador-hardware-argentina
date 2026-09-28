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
    title: 'PC Gamer $1M 2026',
    description: 'Explorá una PC gamer con presupuesto objetivo de 1 millón de pesos. Los precios solo se muestran cuando hay ofertas observadas recientemente en tiendas argentinas.',
    keywords: ['pc gamer 1 millon', 'pc gamer barata argentina', 'armar pc 1 millon pesos', 'pc gaming economica'],
    budget: 1000000,
    components: {
      cpu: {
        name: 'AMD Ryzen 5 5600 / 5500',
        searchTerms: ['ryzen 5 5600', 'ryzen 5 5500'],
        category: 'procesadores',
        description: '6 núcleos / 12 hilos | Socket AM4',
        estimatedPrice: 150000,
      },
      gpu: {
        name: 'AMD RX 6600 8GB',
        searchTerms: ['rx 6600'],
        category: 'tarjetas-graficas',
        description: '8GB GDDR6 | Gaming 1080p Ultra',
        estimatedPrice: 300000,
      },
      ram: {
        name: '16GB DDR4 3200MHz (2x8GB)',
        searchTerms: ['16gb ddr4'],
        category: 'memoria-ram',
        description: 'Dual Channel | Ideal para gaming',
        estimatedPrice: 50000,
      },
      ssd: {
        name: 'SSD NVMe 500GB',
        searchTerms: ['ssd 500gb', 'nvme 500gb'],
        category: 'almacenamiento',
        description: 'NVMe M.2 | Velocidad SSD',
        estimatedPrice: 40000,
      },
      motherboard: {
        name: 'AM4 B450/B550',
        searchTerms: ['b450', 'b550'],
        category: 'motherboards',
        description: 'Compatible con Ryzen 5000 | PCIe 3.0/4.0',
        estimatedPrice: 80000,
      },
      psu: {
        name: '550W 80 Plus Bronze',
        searchTerms: ['550w'],
        category: 'fuentes-alimentacion',
        description: 'Certificada | Suficiente para esta config',
        estimatedPrice: 50000,
      },
      case: {
        name: 'Mid Tower con airflow',
        searchTerms: ['mid tower'],
        category: 'gabinetes',
        description: '2-3 fans incluidos | Buena ventilación',
        estimatedPrice: 40000,
      },
    },
    productivity: [
      { task: 'Office / Navegación', performance: 'Fluido' },
      { task: 'Photoshop', performance: 'Buen rendimiento' },
      { task: 'Edición video básica', performance: '1080p OK' },
      { task: 'Streaming', performance: '720p60 con OBS' },
      { task: 'Programación', performance: 'Excelente' },
    ],
    tips: [
      'Comprá por partes: Si no tenés todo el dinero junto, comprá primero la motherboard, CPU y RAM.',
      'No ahorres en la fuente: Una fuente de mala calidad puede quemar todo tu sistema. Buscá 80 Plus Bronze de marca conocida.',
      'Motherboard con VRMs decentes: Evitá las A520 más baratas. Una B450/B550 de gama media es ideal.',
      'RAM en dual channel: Siempre 2 módulos (2x8GB) en lugar de 1x16GB. Mejora 10-15% en gaming.',
      'Gabinete con airflow: No compres gabinetes cerrados sin ventilación. El calor es el enemigo #1.',
    ],
    faqs: [
      {
        question: '¿Se puede armar una PC gamer con 1 millón de pesos?',
        answer: 'Sí, con 1 millón podés armar una excelente PC para gaming 1080p con Ryzen 5 5600 y RX 6600.',
      },
      {
        question: '¿Qué placa de video comprar para PC de 1 millón?',
        answer: 'La AMD RX 6600 8GB es la mejor opción. Ofrece excelente rendimiento 1080p y buena relación precio/performance.',
      },
      {
        question: '¿Cuántos FPS da una PC de 1 millón en Fortnite?',
        answer: 'Con Ryzen 5 5600 + RX 6600 obtenés 120+ FPS en 1080p High. En competitivo (Low) podés llegar a 200+ FPS.',
      },
    ],
  },
  {
    slug: 'pc-gamer-2-millones',
    title: 'PC Gamer por $2 millones: componentes y precios',
    metadataTitle: `PC gamer 2 millones: componentes y precios | ${SITE_NAME}`,
    description: 'Compará componentes y precios para armar una PC gamer por $2 millones en Argentina: Ryzen 5 7600 con cooler, RTX 4060 o RX 7600, 16 GB DDR5 y SSD NVMe de 1 TB.',
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
        name: 'AM5 B650',
        searchTerms: ['b650'],
        category: 'motherboards',
        description: 'Compatible Ryzen 7000 | PCIe 4.0/5.0 | DDR5',
        estimatedPrice: 200000,
      },
      psu: {
        name: '650W 80 Plus Gold',
        searchTerms: ['650w'],
        category: 'fuentes-alimentacion',
        description: 'Alta eficiencia | Cabeza para upgrades',
        estimatedPrice: 100000,
      },
      case: {
        name: 'Mid Tower premium con airflow',
        searchTerms: ['mid tower'],
        category: 'gabinetes',
        description: 'Verificar ventiladores incluidos, tamaño de GPU y altura de cooler',
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
