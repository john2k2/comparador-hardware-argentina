export type BudgetGuideDefinition = {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  budget: number;
  performance: string;
  components: {
    cpu: { name: string; searchTerms: string[]; description: string; estimatedPrice: number };
    gpu: { name: string; searchTerms: string[]; description: string; estimatedPrice: number };
    ram: { name: string; searchTerms: string[]; description: string; estimatedPrice: number };
    ssd: { name: string; searchTerms: string[]; description: string; estimatedPrice: number };
    motherboard: { name: string; description: string; estimatedPrice: number };
    psu: { name: string; description: string; estimatedPrice: number };
    case: { name: string; description: string; estimatedPrice: number };
  };
  gamesPerformance: Array<{ game: string; fps: string; settings: string }>;
  productivity: Array<{ task: string; performance: string }>;
  tips: string[];
  faqs: Array<{ question: string; answer: string }>;
};

export const BUDGET_GUIDES: BudgetGuideDefinition[] = [
  {
    slug: 'pc-gamer-1-millon',
    title: 'PC Gamer por $1.000.000: Mejor Configuración Argentina 2026',
    description: 'Armá la mejor PC gamer por 1 millón de pesos. Componentes recomendados con precios actualizados de 20+ tiendas de Argentina.',
    keywords: ['pc gamer 1 millon', 'pc gamer barata argentina', 'armar pc 1 millon pesos', 'pc gaming economica'],
    budget: 1000000,
    performance: '1080p 60FPS+',
    components: {
      cpu: {
        name: 'AMD Ryzen 5 5600 / 5500',
        searchTerms: ['ryzen 5 5600', 'ryzen 5 5500'],
        description: '6 núcleos / 12 hilos | Socket AM4',
        estimatedPrice: 150000,
      },
      gpu: {
        name: 'AMD RX 6600 8GB',
        searchTerms: ['rx 6600'],
        description: '8GB GDDR6 | Gaming 1080p Ultra',
        estimatedPrice: 300000,
      },
      ram: {
        name: '16GB DDR4 3200MHz (2x8GB)',
        searchTerms: ['16gb ddr4', '16gb 3200mhz'],
        description: 'Dual Channel | Ideal para gaming',
        estimatedPrice: 50000,
      },
      ssd: {
        name: 'SSD NVMe 500GB',
        searchTerms: ['ssd 500gb', 'nvme 500gb'],
        description: 'NVMe M.2 | Velocidad SSD',
        estimatedPrice: 40000,
      },
      motherboard: {
        name: 'AM4 B450/B550',
        description: 'Compatible con Ryzen 5000 | PCIe 3.0/4.0',
        estimatedPrice: 80000,
      },
      psu: {
        name: '550W 80 Plus Bronze',
        description: 'Certificada | Suficiente para esta config',
        estimatedPrice: 50000,
      },
      case: {
        name: 'Mid Tower con airflow',
        description: '2-3 fans incluidos | Buena ventilación',
        estimatedPrice: 40000,
      },
    },
    gamesPerformance: [
      { game: 'Fortnite', fps: '120+', settings: 'High' },
      { game: 'Valorant', fps: '200+', settings: 'High' },
      { game: 'GTA V', fps: '60+', settings: 'Very High' },
      { game: 'Elden Ring', fps: '60', settings: 'High' },
      { game: 'Cyberpunk 2077', fps: '45-60', settings: 'Medium' },
    ],
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
    title: 'PC Gamer por $2.000.000: Configuración Ideal Argentina 2026',
    description: 'La mejor PC gamer por 2 millones de pesos. RTX 4060 o RX 7600, Ryzen 5 7600X y más. Precios actualizados de 20+ tiendas.',
    keywords: ['pc gamer 2 millones', 'pc gaming argentina 2m', 'mejor pc gamer precio calidad', 'pc gamer rtx 4060'],
    budget: 2000000,
    performance: '1080p Ultra 100FPS+ | 1440p 60FPS+',
    components: {
      cpu: {
        name: 'AMD Ryzen 5 7600X / 7500F',
        searchTerms: ['ryzen 5 7600x', 'ryzen 5 7500f'],
        description: '6 núcleos / 12 hilos | AM5 | DDR5 | Hasta 5.3 GHz',
        estimatedPrice: 350000,
      },
      gpu: {
        name: 'RTX 4060 / RX 7600',
        searchTerms: ['rtx 4060', 'rx 7600'],
        description: '8GB GDDR6 | DLSS 3 / FSR 3 | 1080p Ultra / 1440p High',
        estimatedPrice: 500000,
      },
      ram: {
        name: '32GB DDR5 5600MHz (2x16GB)',
        searchTerms: ['32gb ddr5', 'ddr5 5600mhz'],
        description: 'Dual Channel DDR5 | Futuro proof',
        estimatedPrice: 150000,
      },
      ssd: {
        name: 'SSD NVMe 1TB',
        searchTerms: ['ssd 1tb', 'nvme 1tb'],
        description: 'NVMe Gen4 | Velocidad ultrarrápida',
        estimatedPrice: 80000,
      },
      motherboard: {
        name: 'AM5 B650',
        description: 'Compatible Ryzen 7000 | PCIe 4.0/5.0 | DDR5',
        estimatedPrice: 200000,
      },
      psu: {
        name: '650W 80 Plus Gold',
        description: 'Alta eficiencia | Cabeza para upgrades',
        estimatedPrice: 100000,
      },
      case: {
        name: 'Mid Tower premium con airflow',
        description: '4 fans | Panel mesh | Buena gestión cables',
        estimatedPrice: 80000,
      },
    },
    gamesPerformance: [
      { game: 'Fortnite', fps: '240+', settings: 'Epic' },
      { game: 'Valorant', fps: '300+', settings: 'High' },
      { game: 'Cyberpunk 2077', fps: '60+', settings: 'Ultra + RT' },
      { game: 'Elden Ring', fps: '60', settings: 'Max' },
      { game: 'Call of Duty', fps: '120+', settings: 'Ultra' },
    ],
    productivity: [
      { task: 'Photoshop / Illustrator', performance: 'Excelente' },
      { task: 'Edición video 1080p', performance: 'Fluido' },
      { task: 'Streaming 1080p60', performance: 'Sin problemas' },
      { task: '3D Modeling básico', performance: 'Bueno' },
      { task: 'Desarrollo software', performance: 'Excelente' },
    ],
    tips: [
      'Invertí en el monitor: Con esta PC, un monitor 1440p 144Hz o 1080p 240Hz es ideal.',
      'Cooler aftermarket: El 7600X no incluye cooler stock. Un AIO 240mm o torre dual es recomendado.',
      'RAM DDR5: Asegurate de activar el perfil XMP/EXPO en la BIOS para los 5600MHz.',
      'Gabinete con buen airflow: El 7600X y RTX 4060 generan calor. Priorizá ventilación sobre RGB.',
      'Upgrade path: AM5 tiene soporte hasta 2027+. Podés upgradear a un 9800X3D en el futuro.',
    ],
    faqs: [
      {
        question: '¿Se puede armar una PC gamer con 2 millones de pesos?',
        answer: 'Sí, con 2 millones armás una PC excelente para 1080p Ultra y 1440p High con Ryzen 5 7600X y RTX 4060.',
      },
      {
        question: '¿RTX 4060 o RX 7600 para PC de 2 millones?',
        answer: 'Ambas son buenas opciones. La RTX 4060 tiene DLSS 3 y mejor Ray Tracing. La RX 7600 suele ser más barata con similar performance.',
      },
      {
        question: '¿Cuántos FPS da una PC de 2 millones en Cyberpunk?',
        answer: 'Con RTX 4060 + Ryzen 5 7600X obtenés 60+ FPS en 1080p Ultra con Ray Tracing activado.',
      },
    ],
  },
  {
    slug: 'pc-gamer-3-millones',
    title: 'PC Gamer por $3.000.000: Alta Gama en Argentina [2026]',
    description: 'PC gamer alta gama por 3 millones: RTX 5070, Ryzen 7 9800X3D, 32GB DDR5. Configuración recomendada con precios de 20+ tiendas argentinas.',
    keywords: ['pc gamer 3 millones', 'pc alta gama argentina', 'pc gamer rtx 5070', 'pc gaming 1440p'],
    budget: 3000000,
    performance: '1440p Ultra 120FPS+ | 4K 60FPS+',
    components: {
      cpu: {
        name: 'AMD Ryzen 7 7700X / 7800X3D',
        searchTerms: ['ryzen 7 7700x', 'ryzen 7 7800x3d'],
        description: '8 núcleos / 16 hilos | AM5 | DDR5 | Hasta 5.4 GHz',
        estimatedPrice: 500000,
      },
      gpu: {
        name: 'RTX 5070 / RX 7800 XT',
        searchTerms: ['rtx 5070', 'rx 7800 xt'],
        description: '12-16GB GDDR6/GDDR7 | 1440p Ultra / 4K High',
        estimatedPrice: 900000,
      },
      ram: {
        name: '32GB DDR5 6000MHz (2x16GB)',
        searchTerms: ['32gb ddr5', 'ddr5 6000mhz'],
        description: 'Dual Channel DDR5 | Baja latencia CL30',
        estimatedPrice: 200000,
      },
      ssd: {
        name: 'SSD NVMe 2TB Gen4',
        searchTerms: ['ssd 2tb', 'nvme 2tb'],
        description: 'NVMe Gen4 x4 | 7000+ MB/s lectura',
        estimatedPrice: 150000,
      },
      motherboard: {
        name: 'AM5 X670 / B650E',
        description: 'VRMs premium | PCIe 5.0 | WiFi 6E | USB-C',
        estimatedPrice: 350000,
      },
      psu: {
        name: '850W 80 Plus Gold Modular',
        description: 'Cableado modular | Eficiencia | Futuro proof',
        estimatedPrice: 150000,
      },
      case: {
        name: 'Full Tower premium',
        description: '6+ fans | Radiador 360mm | Panel cristal templado',
        estimatedPrice: 120000,
      },
    },
    gamesPerformance: [
      { game: 'Cyberpunk 2077', fps: '100+', settings: 'Ultra + RT + DLSS' },
      { game: 'Alan Wake 2', fps: '60+', settings: '4K High + RT' },
      { game: 'Call of Duty', fps: '200+', settings: 'Ultra' },
      { game: 'Forza Horizon 5', fps: '120+', settings: '4K Ultra' },
      { game: 'Starfield', fps: '80+', settings: 'Ultra' },
    ],
    productivity: [
      { task: 'Edición video 4K', performance: 'Fluido' },
      { task: '3D Rendering', performance: 'Excelente' },
      { task: 'Streaming 1440p60', performance: 'Sin problemas' },
      { task: 'Machine Learning', performance: 'Bueno (CUDA)' },
      { task: 'Desarrollo AAA', performance: 'Excelente' },
    ],
    tips: [
      'Monitor 1440p 144Hz o 4K 60Hz: Aprovechá el poder de esta PC con un monitor acorde.',
      'AIO 360mm o torre premium: El 7700X/7800X3D necesita buena refrigeración para mantener boost clocks.',
      'Gabinete con excelente airflow: Invertí en fans de calidad (Noctua, Arctic, Corsair).',
      'Cable management: Una fuente modular ayuda mucho. Organizá los cables para mejor airflow.',
      'Almacenamiento: Con 2TB tenés espacio para varios juegos AAA. Considerá un HDD 4TB para almacenamiento masivo.',
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
