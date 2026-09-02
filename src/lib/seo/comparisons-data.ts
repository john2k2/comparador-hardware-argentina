import type { Product } from '@/lib/types';
import { SITE_NAME } from '@/lib/site-config';

export type ComparisonSource = {
  name: string;
  url: string;
};

export type ComparisonDefinition = {
  slug: string;
  title: string;
  metadataTitle?: string;
  description: string;
  keywords: string[];
  product1: {
    name: string;
    searchTerms: string[];
    category: string;
    specs: string;
    pros: string[];
    cons: string[];
  };
  product2: {
    name: string;
    searchTerms: string[];
    category: string;
    specs: string;
    pros: string[];
    cons: string[];
  };
  conclusion: string;
  faqs: Array<{ question: string; answer: string }>;
  sources: ComparisonSource[];
};

export const COMPARISONS: ComparisonDefinition[] = [
  {
    slug: 'rtx-4060-vs-rx-7600',
    title: 'RTX 4060 vs RX 7600',
    metadataTitle: `RTX 4060 vs RX 7600: precios | ${SITE_NAME}`,
    description: 'Compará precios de RTX 4060 vs RX 7600 en tiendas de Argentina. Encontrá la mejor placa de video para gaming 1080p al mejor precio.',
    keywords: ['rtx 4060 vs rx 7600', '4060 vs 7600 argentina', 'mejor placa video 1080p', 'rtx 4060 precio argentina'],
    product1: {
      name: 'RTX 4060',
      searchTerms: ['rtx 4060'],
      category: 'tarjetas-graficas',
      specs: '8GB GDDR6 | 128-bit | 115W TDP | DLSS 3 | Ray Tracing',
      pros: ['DLSS 3 y Frame Generation', 'Mejor Ray Tracing', 'Menor consumo energético', 'NVENC para streaming'],
      cons: ['Precio más alto en Argentina'],
    },
    product2: {
      name: 'RX 7600',
      searchTerms: ['rx 7600'],
      category: 'tarjetas-graficas',
      specs: '8GB GDDR6 | 128-bit | 165W TDP | FSR 3 | Mejor precio',
      pros: ['Mejor precio por performance', 'FSR funciona en más juegos', 'Más stock disponible'],
      cons: ['Sin DLSS 3', 'Ray Tracing inferior', 'Mayor consumo energético'],
    },
    conclusion:
      'En Argentina la RX 7600 suele salir más barata; la 4060 suma DLSS 3. Según TechPowerUp, en raster 1080p la RTX 4060 queda unos 4% adelante de la RX 7600; con ray tracing el margen sube a ~22%. El precio y el stock locales son el dato propio: no medimos FPS acá.',
    faqs: [
      {
        question: '¿RTX 4060 o RX 7600 para gaming 1080p?',
        answer:
          'TechPowerUp, en su review de la RTX 4060, midió ~4% a favor de NVIDIA en raster 1080p frente a la 7600. Con ray tracing la 4060 se abre más (~22%). En 1080p Ultra ambas siguen siendo cartas de 60+ FPS en la mayoría de títulos de esa prueba. Confirmá el precio en ARS antes de decidir.',
      },
      {
        question: '¿Cuánto cuesta la RTX 4060 en Argentina?',
        answer: 'El precio cambia entre tiendas. Compará placas de video del mismo chip y VRAM para ver el valor publicado hoy.',
      },
      {
        question: '¿La RX 7600 es mejor que la RTX 3060?',
        answer:
          'No publicamos un head-to-head propio 7600 vs 3060. TechPowerUp sí midió a la 4060 ~20% sobre la 3060 y ~4% sobre la 7600 en 1080p raster: la 7600 no es un “sí, siempre gana”. Si el precio local de la 7600 cierra y no te importa DLSS, tiene sentido.',
      },
    ],
    sources: [
      {
        name: 'TechPowerUp — ASUS GeForce RTX 4060 Dual OC (conclusión)',
        url: 'https://www.techpowerup.com/review/asus-geforce-rtx-4060-dual-oc/42.html',
      },
      {
        name: 'TechPowerUp — AMD Radeon RX 7600',
        url: 'https://www.techpowerup.com/review/amd-radeon-rx-7600/',
      },
    ],
  },
  {
    slug: 'ryzen-5-7600x-vs-ryzen-7-5700x',
    title: 'Ryzen 5 7600X vs Ryzen 7 5700X: precios',
    metadataTitle: `Ryzen 5 7600X vs Ryzen 7 5700X: precios | ${SITE_NAME}`,
    description: 'Compará Ryzen 5 7600X vs Ryzen 7 5700X, sus precios y plataformas para decidir si conviene armar en AM5 o actualizar una PC AM4.',
    keywords: ['7600x vs 5700x', 'ryzen 5 vs ryzen 7', 'mejor procesador gaming argentina', 'am5 vs am4'],
    product1: {
      name: 'Ryzen 5 7600X',
      searchTerms: ['ryzen 5 7600x', '7600x'],
      category: 'procesadores',
      specs: '6 núcleos / 12 hilos | 4.7-5.3 GHz | AM5 | DDR5 | 105W',
      pros: ['Mayor IPC y frecuencia', 'Plataforma AM5 futura', 'Soporte hasta 2027+', 'PCIe 5.0'],
      cons: ['No incluye cooler stock', 'Motherboards AM5 más caras', 'RAM DDR5 más cara'],
    },
    product2: {
      name: 'Ryzen 7 5700X',
      searchTerms: ['ryzen 7 5700x', '5700x'],
      category: 'procesadores',
      specs: '8 núcleos / 16 hilos | 3.4-4.6 GHz | AM4 | DDR4 | 65W',
      pros: ['Más núcleos (8 vs 6)', 'Plataforma AM4 madura', 'Motherboards y RAM más baratas', 'Incluye cooler stock'],
      cons: ['Menor IPC', 'Plataforma sin futuro upgrades', 'Frecuencia más baja'],
    },
    conclusion:
      'Hoy en Argentina el 5700X suele salir más barato si ya tenés AM4 y DDR4. El 7600X pide mother AM5 + DDR5: mirá el costo total, no solo el micro. TechPowerUp midió al 7600X ~25% sobre el 5600X en apps; el 5700X no es ese chip (8 núcleos vs 6). Armando de cero, AM5 suele ser la apuesta.',
    faqs: [
      {
        question: '¿Vale la pena AM5 sobre AM4 en 2026?',
        answer:
          'Si armás una PC nueva, AM5 es la plataforma con más recorrido. TechPowerUp documenta al 7600X como Zen 4; no es un salto de FPS que midamos nosotros. El costo total (micro + mother DDR5) es el dato local.',
      },
      {
        question: '¿Cuánto cuesta el Ryzen 5 7600X en Argentina?',
        answer: 'El 7600X suele salir más caro que el 5700X porque pide motherboard AM5 y RAM DDR5. El precio del micro cambia entre tiendas; para decidir, usá la página de comparar procesadores y mirá el costo total de la plataforma, no una sola publicación.',
      },
      {
        question: '¿El Ryzen 7 5700X es mejor para streaming?',
        answer:
          'Los 8 núcleos del 5700X ayudan a jugar y streamear a la vez. El 7600X tiene menos núcleos y más IPC: TechPowerUp lo mide fuerte en apps frente a 5600X, no frente al 5700X. Elegí según si ya tenés AM4 o si pagás AM5 completo.',
      },
    ],
    sources: [
      {
        name: 'TechPowerUp — AMD Ryzen 5 7600X (conclusión)',
        url: 'https://www.techpowerup.com/review/amd-ryzen-5-7600x/28.html',
      },
    ],
  },
  {
    slug: 'rtx-5070-vs-rtx-4070',
    title: 'RTX 5070 vs RTX 4070',
    metadataTitle: `RTX 5070 vs RTX 4070: precios | ${SITE_NAME}`,
    description: 'Comparativa RTX 5070 vs RTX 4070. Precios actualizados, rendimiento en juegos y análisis de valor para elegir la mejor GPU en Argentina.',
    keywords: ['rtx 5070 vs 4070', '5070 vs 4070 argentina', 'mejor placa video 1440p', 'rtx 5070 precio'],
    product1: {
      name: 'RTX 5070',
      searchTerms: ['rtx 5070'],
      category: 'tarjetas-graficas',
      specs: '12GB GDDR7 | 250W TDP | DLSS 4 | Frame Generation 2',
      pros: ['DLSS 4 con mejor calidad', 'GDDR7 más rápida', 'Mejor Ray Tracing', 'Frame Generation 2'],
      cons: ['Precio más alto', 'Mayor consumo energético', 'Stock limitado inicialmente'],
    },
    product2: {
      name: 'RTX 4070',
      searchTerms: ['rtx 4070'],
      category: 'tarjetas-graficas',
      specs: '12GB GDDR6X | 200W TDP | DLSS 3 | Buena relación precio',
      pros: ['Mejor precio actual', 'Menor consumo energético', 'Stock estable', 'Suficiente para 1440p'],
      cons: ['Sin DLSS 4', 'GDDR6X más lenta', 'Menor performance en RT'],
    },
    conclusion:
      'Hoy en Argentina compará el precio en stock: si la diferencia es chica, la 5070 suma generación. TechPowerUp midió a la RTX 5070 Founders ~22% por encima de la 4070 en raster 1440p y ~25% en 4K; con ray tracing a 1440p el salto baja a ~15%. No es un salto uniforme en todos los escenarios. Si ya tenés 4070, el upgrade es chico.',
    faqs: [
      {
        question: '¿Cuánto más rápida es la RTX 5070 vs 4070?',
        answer:
          'En la review de TechPowerUp de la 5070 FE: +22% raster 1440p, +25% raster 4K, +15% RT 1440p. El TGP sube a 250 W contra 200 W de la 4070. 12 GB GDDR7 en bus 192-bit, igual de angosto que la 4070.',
      },
      {
        question: '¿Vale la pena upgradear de 4070 a 5070?',
        answer:
          'Con esos deltas de TechPowerUp, no es un cambio de generación grande. Si la 4070 te cierra, esperá o mirá 5080/5090. Si armás de cero, compará el precio local de ambas.',
      },
      {
        question: '¿La RTX 5070 sirve para 4K?',
        answer:
          'TechPowerUp la pone ~25% arriba de la 4070 en raster 4K. Para nativo ultra en todo, sigue siendo territorio 5080/5090. DLSS 4 ayuda; no lo medimos nosotros.',
      },
    ],
    sources: [
      {
        name: 'TechPowerUp — NVIDIA GeForce RTX 5070 Founders Edition (conclusión)',
        url: 'https://www.techpowerup.com/review/nvidia-geforce-rtx-5070-founders-edition/46.html',
      },
    ],
  },
  {
    slug: 'ryzen-7-9800x3d-vs-i9-14900k',
    title: 'Ryzen 7 9800X3D vs i9-14900K',
    metadataTitle: `Ryzen 7 9800X3D vs i9-14900K: precios | ${SITE_NAME}`,
    description: 'Comparativa definitiva: Ryzen 7 9800X3D vs Intel i9-14900K. Precios actualizados en Argentina, rendimiento gaming y productividad.',
    keywords: ['9800x3d vs 14900k', 'ryzen vs intel gaming', 'mejor procesador 2026 argentina', '9800x3d precio'],
    product1: {
      name: 'Ryzen 7 9800X3D',
      searchTerms: ['ryzen 7 9800x3d', '9800x3d'],
      category: 'procesadores',
      specs: '8 núcleos / 16 hilos | 4.7-5.2 GHz | 104MB Cache | AM5 | 120W',
      pros: ['Mejor procesador para gaming', 'X3D V-Cache enorme', 'Eficiencia energética', 'Temperaturas controladas'],
      cons: ['Precio muy alto', 'Menor performance en productividad', 'Stock limitado'],
    },
    product2: {
      name: 'Intel Core i9-14900K',
      searchTerms: ['i9-14900k', '14900k', 'intel core i9'],
      category: 'procesadores',
      specs: '24 núcleos / 32 hilos | 3.2-6.0 GHz | 36MB Cache | LGA1700 | 253W',
      pros: ['Mejor en productividad', 'Más núcleos', 'Overclocking extremo', 'Precio más bajo'],
      cons: ['Consumo energético muy alto', 'Temperaturas altas', 'Necesita cooler premium', 'Menor performance en gaming vs 9800X3D'],
    },
    conclusion:
      'En Argentina el precio de plataforma (cooler, mother, consumo) suele decidir más que un puñado de FPS. TechPowerUp titula al 9800X3D como el mejor CPU gaming de esa review: ~7% sobre Raptor Lake a 1080p. En apps, el 14900K sale ~20% adelante. Juegos → 9800X3D. Renders y muchos hilos → 14900K.',
    faqs: [
      {
        question: '¿El 9800X3D es el mejor procesador para gaming?',
        answer:
          'Según TechPowerUp, el 9800X3D gana el ranking gaming de esa prueba (~7% vs Raptor Lake a 1080p). El 3D V-Cache se nota. El 14900K recupera terreno en productividad.',
      },
      {
        question: '¿Cuánto cuesta el 9800X3D en Argentina?',
        answer: 'Es de los procesadores más caros. Compará procesadores del mismo modelo para ver el precio publicado hoy en Argentina.',
      },
      {
        question: '¿El i9-14900K es mejor para streaming?',
        answer:
          'Los 24 núcleos ayudan a jugar y streamear a la vez. TechPowerUp marca al 14900K ~20% arriba del 9800X3D en apps; el costo es watts y cooler. Confirmá el precio local de ambos.',
      },
    ],
    sources: [
      {
        name: 'TechPowerUp — AMD Ryzen 7 9800X3D (conclusión)',
        url: 'https://www.techpowerup.com/review/amd-ryzen-7-9800x3d/30.html',
      },
    ],
  },
  {
    slug: 'i5-14600k-vs-ryzen-5-7600x',
    title: 'i5-14600K vs Ryzen 5 7600X',
    description: '¿Intel o AMD para gaming? Compará precios de i5-14600K vs Ryzen 5 7600X en tiendas argentinas y elegí el mejor procesador.',
    keywords: ['14600k vs 7600x', 'intel vs amd', 'mejor procesador gaming 2026', 'i5 14600k precio argentina'],
    product1: {
      name: 'Intel Core i5-14600K',
      searchTerms: ['i5-14600k', '14600k', 'intel core i5'],
      category: 'procesadores',
      specs: '14 núcleos / 20 hilos | 3.5-5.3 GHz | LGA1700 | DDR4/DDR5 | 125W',
      pros: ['Más núcleos (14 vs 6)', 'Compatible DDR4', 'Mejor en productividad', 'Precio competitivo'],
      cons: ['Mayor consumo energético', 'Temperaturas altas', 'Plataforma sin futuro'],
    },
    product2: {
      name: 'Ryzen 5 7600X',
      searchTerms: ['ryzen 5 7600x', '7600x'],
      category: 'procesadores',
      specs: '6 núcleos / 12 hilos | 4.7-5.3 GHz | AM5 | DDR5 | 105W',
      pros: ['Arquitectura Zen 4 más nueva', 'Plataforma AM5 futura', 'Eficiencia energética', 'PCIe 5.0'],
      cons: ['Menos núcleos', 'Solo DDR5', 'Motherboards más caras'],
    },
    conclusion:
      'TechPowerUp, en apps, deja al 7600X cerca de 25% detrás del i5-14600K. En el wrap-up gaming de esa review, el 14600K le gana a los Ryzen sin 3D V-Cache. El 7600X sigue siendo AM5. No invertimos el ranking de FPS a favor del Ryzen. Precio de plataforma, acá.',
    faqs: [
      {
        question: '¿i5-14600K o Ryzen 5 7600X para gaming?',
        answer:
          'TechPowerUp no respalda un empate o una ventaja gaming del 7600X. En esa review el 14600K queda adelante de los Ryzen no-X3D en juegos, y ~25% adelante del 7600X en apps. Si te importa el socket a futuro, AM5 pesa más que un puñado de FPS.',
      },
      {
        question: '¿Cuánto cuesta el i5-14600K en Argentina?',
        answer: 'El precio cambia según la tienda. Compará procesadores del mismo modelo para ver el valor publicado hoy.',
      },
      {
        question: '¿El i5-14600K se calienta mucho?',
        answer:
          'Puede irse alto bajo carga (90-100 °C no es raro sin un cooler serio). TechPowerUp también marca consumo alto en esa generación. AIO 240 o torre premium, y mirá el precio local del cooler.',
      },
    ],
    sources: [
      {
        name: 'TechPowerUp — Intel Core i5-14600K (conclusión)',
        url: 'https://www.techpowerup.com/review/intel-core-i5-14600k/27.html',
      },
      {
        name: 'TechPowerUp — AMD Ryzen 5 7600X (conclusión)',
        url: 'https://www.techpowerup.com/review/amd-ryzen-5-7600x/28.html',
      },
    ],
  },
  {
    slug: 'rtx-5090-vs-rx-9070-xt',
    title: 'RTX 5090 vs RX 9070 XT',
    metadataTitle: `RTX 5090 vs RX 9070 XT: precios | ${SITE_NAME}`,
    description: 'Compará precios de RTX 5090 vs RX 9070 XT en tiendas de Argentina. Rendimiento 4K, ray tracing, DLSS 4 vs FSR 4 y cuál elegir.',
    keywords: ['rtx 5090 vs rx 9070 xt', '5090 vs 9070 xt argentina', 'mejor placa video 4k', 'rtx 5090 precio argentina'],
    product1: {
      name: 'RTX 5090',
      searchTerms: ['rtx 5090', '5090'],
      category: 'tarjetas-graficas',
      specs: '32GB GDDR7 | 575W TDP | DLSS 4 | Frame Generation 2',
      pros: ['Mejor performance del mercado', 'DLSS 4 con mejor calidad', '32GB VRAM para 4K/8K', 'Ray Tracing de nueva generación'],
      cons: ['Precio extremadamente alto', 'Consumo energético muy alto', 'Requiere fuente 1000W+', 'Stock muy limitado'],
    },
    product2: {
      name: 'RX 9070 XT',
      searchTerms: ['rx 9070 xt', '9070 xt', 'rx 9070'],
      category: 'tarjetas-graficas',
      specs: '16GB GDDR6 | 256-bit | 350W TDP | FSR 4 | Ray Tracing mejorado',
      pros: ['Mejor relación precio/performance', 'FSR 4 funciona en más juegos', 'Consumo energético moderado', '16GB GDDR6 para 1440p/4K'],
      cons: ['Sin DLSS 4', 'Ray Tracing inferior a NVIDIA', 'Menor performance bruta', 'Stock limitado inicialmente'],
    },
    conclusion:
      'En Argentina la 9070 XT suele costar una fracción de la 5090. No son el mismo segmento. TechPowerUp midió a la 5090 ~35% sobre la 4090 en raster 4K (~32% con RT). La 9070 XT, en reviews TPU, pelea con 5070 / 5070 Ti, no con la flagship. El dato propio es si el precio ARS de cada una cierra.',
    faqs: [
      {
        question: '¿RTX 5090 o RX 9070 XT para gaming 4K?',
        answer:
          'La 5090 es el techo de NVIDIA según TechPowerUp (salto grande vs 4090 en 4K). La 9070 XT es high-end de AMD contra 5070/5070 Ti, con 16 GB GDDR6. Compararlas como si fueran pares infla un porcentaje que no está en esas reviews.',
      },
      {
        question: '¿Cuánto cuesta la RTX 5090 en Argentina?',
        answer: 'Es la placa más cara del mercado. Compará placas de video del mismo modelo para ver el precio publicado hoy.',
      },
      {
        question: '¿La RX 9070 XT sirve para 4K?',
        answer:
          'TechPowerUp la mide en el rango 5070/5070 Ti: 4K se puede, no es 5090. 16 GB, no 24. FSR 4 ayuda; el stock y el precio en Argentina deciden más que un ranking de techo.',
      },
    ],
    sources: [
      {
        name: 'TechPowerUp — NVIDIA GeForce RTX 5090 Founders Edition (conclusión)',
        url: 'https://www.techpowerup.com/review/nvidia-geforce-rtx-5090-founders-edition/46.html',
      },
      {
        name: 'TechPowerUp — Sapphire Radeon RX 9070 XT Pulse (conclusión)',
        url: 'https://www.techpowerup.com/review/sapphire-radeon-rx-9070-xt-pulse/35.html',
      },
    ],
  },
  {
    slug: 'ddr5-vs-ddr4',
    title: 'DDR5 vs DDR4',
    description: 'Comparativa DDR5 vs DDR4. Diferencias de precio, rendimiento y compatibilidad. Encontrá el mejor precio en tiendas argentinas.',
    keywords: ['ddr5 vs ddr4', 'memoria ddr5 precio argentina', 'ddr5 vale la pena', 'memoria ram gaming'],
    product1: {
      name: 'DDR5',
      searchTerms: ['ddr5', 'memoria ddr5'],
      category: 'memoria-ram',
      specs: '4800-6400 MHz | Menor latencia | Más eficiente | AM5/LGA1700',
      pros: ['Mayor ancho de banda', 'Mejor eficiencia energética', 'Futuro del mercado', 'Mejor para integrados'],
      cons: ['Precio más alto', 'Requiere plataforma nueva', 'Latencia inicial más alta'],
    },
    product2: {
      name: 'DDR4',
      searchTerms: ['ddr4', 'memoria ddr4'],
      category: 'memoria-ram',
      specs: '3200-3600 MHz | Latencia baja | Madura | AM4/LGA1200',
      pros: ['Precio más bajo', 'Plataformas maduras', 'Mucho stock', 'Latencia optimizada'],
      cons: ['Ancho de banda limitado', 'Sin futuro upgrades', 'Obsoleta en 2-3 años'],
    },
    conclusion:
      'Si armás AM5 o Intel 12va+, DDR5 es lo que pide el socket. Si ya tenés AM4 o LGA1200, DDR4 sigue. TechPowerUp comparó DDR4 vs DDR5 en un 12900K: en juegos el salto suele ser chico frente a cambiar de plataforma. El precio del kit en Argentina es el dato nuestro.',
    faqs: [
      {
        question: '¿Vale la pena upgradear de DDR4 a DDR5?',
        answer: 'Solo si cambiás de plataforma (AM4→AM5 o LGA1200→LGA1700). No vale la pena cambiar motherboard solo por RAM.',
      },
      {
        question: '¿Cuánto cuesta la DDR5 en Argentina?',
        answer: 'Suele salir más cara que un kit DDR4 equivalente. Compará memoria RAM del mismo kit y frecuencia para ver el precio actual.',
      },
      {
        question: '¿DDR5 mejora el FPS en juegos?',
        answer:
          'TechPowerUp, en su prueba 12900K DDR4 vs DDR5, encontró un delta de gaming chico/marginal, no un salto de generación. El cuello de botella suele ser GPU o CPU, no el estándar de RAM solo.',
      },
    ],
    sources: [
      {
        name: 'TechPowerUp — Intel Core i9-12900K Alder Lake DDR4 vs DDR5',
        url: 'https://www.techpowerup.com/review/intel-core-i9-12900k-alder-lake-ddr4-vs-ddr5/',
      },
    ],
  },
];

export function getComparisonBySlug(slug: string): ComparisonDefinition | undefined {
  return COMPARISONS.find(c => c.slug === slug);
}

export function getAllComparisonSlugs(): string[] {
  return COMPARISONS.map(c => c.slug);
}

function isPcBuild(name: string): boolean {
  const pcBuildTerms = [
    'pc gamer', 'combo', 'armado', 'pc completa', 'computadora', 'desktop', 'workstation',
    'notebook', 'laptop', 'all in one', 'aio ', 'netbook', 'chromebook',
    'kit ', 'bundle', 'paquete', 'gaming pc', 'cpu +', 'procesador +',
    'usado', 'refurbished', 'open box', 'reacondicionado', 'segunda mano'
  ];
  const lowerName = name.toLowerCase();
  return pcBuildTerms.some(term => lowerName.includes(term));
}

function isGroupedProduct(product: Product): boolean {
  return product.id.startsWith('agrupado-');
}

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function productMatchesTerms(product: Product, searchTerms: string[]): boolean {
  const searchable = [
    product.name,
    product.brand,
    product.model,
    product.normalizedTitle ?? '',
    product.canonicalProductKey ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const normalizedSearchable = normalizeSearchText(searchable);

  return searchTerms.some(term => {
    const normalizedTerm = normalizeSearchText(term);
    const termWords = normalizedTerm.split(/\s+/).filter(w => w.length > 1);

    if (termWords.length === 0) return false;

    // Todas las palabras del término deben aparecer en el producto
    return termWords.every(word => normalizedSearchable.includes(word));
  });
}

export function findProductInComparison(comparison: ComparisonDefinition, allProducts: Product[]): {
  product1?: Product;
  product2?: Product;
} {
  // Separar productos agrupados de individuales
  const groupedProducts = allProducts.filter(isGroupedProduct);
  const individualProducts = allProducts.filter(p => !isGroupedProduct(p));

  // Primero buscar en productos AGRUPADOS (tienen todos los precios fusionados)
  let product1 = groupedProducts.find(p =>
    p.category === comparison.product1.category &&
    productMatchesTerms(p, comparison.product1.searchTerms)
  );

  let product2 = groupedProducts.find(p =>
    p.category === comparison.product2.category &&
    productMatchesTerms(p, comparison.product2.searchTerms)
  );

  // Si no encontró en agrupados, buscar en individuales con filtros estrictos
  if (!product1) {
    product1 = individualProducts.find(p =>
      p.category === comparison.product1.category &&
      !isPcBuild(p.name) &&
      productMatchesTerms(p, comparison.product1.searchTerms)
    );
  }

  if (!product2) {
    product2 = individualProducts.find(p =>
      p.category === comparison.product2.category &&
      !isPcBuild(p.name) &&
      productMatchesTerms(p, comparison.product2.searchTerms)
    );
  }

  return { product1, product2 };
}
