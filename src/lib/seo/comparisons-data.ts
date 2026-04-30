import type { Product } from '@/lib/types';

export type ComparisonDefinition = {
  slug: string;
  title: string;
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
};

export const COMPARISONS: ComparisonDefinition[] = [
  {
    slug: 'rtx-4060-vs-rx-7600',
    title: 'RTX 4060 vs RX 7600',
    description: 'Compará precios de RTX 4060 vs RX 7600 en 20+ tiendas de Argentina. Encontrá la mejor placa de video para gaming 1080p al mejor precio.',
    keywords: ['rtx 4060 vs rx 7600', '4060 vs 7600 argentina', 'mejor placa video 1080p', 'rtx 4060 precio argentina'],
    product1: {
      name: 'RTX 4060',
      searchTerms: ['rtx 4060'],
      category: 'tarjetas-graficas',
      specs: '8GB GDDR6 | 115W TDP | DLSS 3 | Ray Tracing',
      pros: ['DLSS 3 y Frame Generation', 'Mejor Ray Tracing', 'Menor consumo energético', 'NVENC para streaming'],
      cons: ['Bus de memoria de 128-bit', 'Precio más alto en Argentina'],
    },
    product2: {
      name: 'RX 7600',
      searchTerms: ['rx 7600'],
      category: 'tarjetas-graficas',
      specs: '8GB GDDR6 | 165W TDP | FSR 3 | Mejor precio',
      pros: ['Mejor precio por performance', 'Bus de memoria 128-bit', 'FSR funciona en más juegos', 'Más stock disponible'],
      cons: ['Sin DLSS 3', 'Ray Tracing inferior', 'Mayor consumo energético'],
    },
    conclusion: 'Para jugar en 1080p Ultra a 60+ FPS, cualquiera de las dos sirve. Elegí RTX 4060 si te interesa el DLSS 3 o hacés streaming. Elegí RX 7600 si buscás la mejor relación precio/poder de fuego.',
    faqs: [
      {
        question: '¿RTX 4060 o RX 7600 para gaming 1080p?',
        answer: 'Ambas rinden 60+ FPS en 1080p Ultra. La RTX 4060 tiene ventaja con DLSS 3 activado, mientras que la RX 7600 ofrece mejor precio por performance bruta.',
      },
      {
        question: '¿Cuánto cuesta la RTX 4060 en Argentina?',
        answer: 'El precio varía entre tiendas. Usá nuestro comparador para ver el precio actualizado en tiempo real.',
      },
      {
        question: '¿La RX 7600 es mejor que la RTX 3060?',
        answer: 'Sí, la RX 7600 supera a la RTX 3060 en la mayoría de juegos, especialmente en 1080p. Ofrece mejor performance por menos dinero.',
      },
    ],
  },
  {
    slug: 'ryzen-5-7600x-vs-ryzen-7-5700x',
    title: 'Ryzen 5 7600X vs 7 5700X',
    description: '¿AM5 con DDR5 o AM4 con DDR4? Compará precios de Ryzen 5 7600X vs Ryzen 7 5700X en tiendas argentinas y elegí el mejor procesador.',
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
    conclusion: 'Armando una PC desde cero, el Ryzen 5 7600X es la mejor inversión por su plataforma AM5 con futuro. Si ya tenés una PC con socket AM4 y querés upgradear sin cambiar todo, el Ryzen 7 5700X te da 8 núcleos por menos plata.',
    faqs: [
      {
        question: '¿Vale la pena AM5 sobre AM4 en 2026?',
        answer: 'Sí, AM5 es la plataforma futura de AMD con soporte garantizado hasta 2027+. Si armás una PC nueva, AM5 es la mejor inversión.',
      },
      {
        question: '¿Cuánto cuesta el Ryzen 5 7600X en Argentina?',
        answer: 'El precio varía según la tienda. Consultá nuestro comparador para ver precios actualizados en tiempo real.',
      },
      {
        question: '¿El Ryzen 7 5700X es mejor para streaming?',
        answer: 'Sí, los 8 núcleos del 5700X ayudan en tareas multitarea como streaming mientras jugás. Sin embargo, el 7600X con su mayor IPC también rinde bien.',
      },
    ],
  },
  {
    slug: 'rtx-5070-vs-rtx-4070',
    title: 'RTX 5070 vs RTX 4070',
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
    conclusion: 'La RTX 5070 rinde un 25-30% más que la 4070, ideal si estás armando una PC nueva. Si ya tenés una RTX 4070, no vale la pena cambiarla. Para juegos en 1440p Ultra, ambas son excelentes opciones.',
    faqs: [
      {
        question: '¿Cuánto más rápida es la RTX 5070 vs 4070?',
        answer: 'Aproximadamente 25-30% más rápida en gaming 1440p, con mejoras significativas en Ray Tracing y DLSS 4.',
      },
      {
        question: '¿Vale la pena upgradear de 4070 a 5070?',
        answer: 'No, la diferencia no justifica el costo. Si tenés una 4070, esperá a la próxima generación o saltá a una 5080/5090.',
      },
      {
        question: '¿La RTX 5070 sirve para 4K?',
        answer: 'Sí, con DLSS 4 rinde bien en 4K en la mayoría de juegos. Para 4K nativo ultra, considerá una 5080 o 5090.',
      },
    ],
  },
  {
    slug: 'ryzen-7-9800x3d-vs-i9-14900k',
    title: 'Ryzen 7 9800X3D vs i9-14900K',
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
    conclusion: 'Si tu prioridad es el gaming, el Ryzen 7 9800X3D es la opción más rápida del mercado. Para trabajo pesado como edición de video o renders 3D, el i9-14900K es mejor opción por sus 24 núcleos. Para la mayoría de gamers, el 9800X3D es la mejor elección.',
    faqs: [
      {
        question: '¿El 9800X3D es el mejor procesador para gaming?',
        answer: 'Sí, actualmente el Ryzen 7 9800X3D es el procesador más rápido para gaming gracias a su enorme caché X3D V-Cache de 104MB.',
      },
      {
        question: '¿Cuánto cuesta el 9800X3D en Argentina?',
        answer: 'Es uno de los procesadores más caros. Consultá nuestro comparador para ver precios actualizados en tiempo real.',
      },
      {
        question: '¿El i9-14900K es mejor para streaming?',
        answer: 'Sí, los 24 núcleos del i9-14900K son superiores para streaming mientras jugás y tareas de productividad pesadas.',
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
      pros: ['Mayor IPC en gaming', 'Plataforma AM5 futura', 'Eficiencia energética', 'PCIe 5.0'],
      cons: ['Menos núcleos', 'Solo DDR5', 'Motherboards más caras'],
    },
    conclusion: 'Para gaming puro, el Ryzen 5 7600X tiene mejor rendimiento por su arquitectura más moderna. Para streaming, edición de video o multitarea pesada, el i5-14600K con sus 14 núcleos es superior. Elegí según qué hagas más tiempo: jugar o trabajar.',
    faqs: [
      {
        question: '¿i5-14600K o Ryzen 5 7600X para gaming?',
        answer: 'El 7600X tiene mejor performance en gaming por su mayor IPC, aunque el 14600K tiene más núcleos. La diferencia en FPS es de 5-10% a favor del 7600X.',
      },
      {
        question: '¿Cuánto cuesta el i5-14600K en Argentina?',
        answer: 'El precio varía según la tienda. Usá nuestro comparador para ver precios actualizados en tiempo real.',
      },
      {
        question: '¿El i5-14600K se calienta mucho?',
        answer: 'Sí, puede alcanzar 90-100°C bajo carga. Se recomienda un cooler de gama alta (AIO 240mm o torre premium).',
      },
    ],
  },
  {
    slug: 'rtx-5090-vs-rx-9070-xt',
    title: 'RTX 5090 vs RX 9070 XT',
    description: 'Compará precios de RTX 5090 vs RX 9070 XT en 20+ comercios argentinos. Rendimiento 4K, ray tracing, DLSS 4 vs FSR 4 y cuál elegir.',
    keywords: ['rtx 5090 vs rx 9070 xt', '5090 vs 9070 xt argentina', 'mejor placa video 4k', 'rtx 5090 precio argentina'],
    product1: {
      name: 'RTX 5090',
      searchTerms: ['rtx 5090', '5090'],
      category: 'tarjetas-graficas',
      specs: '32GB GDDR7 | 575W TDP | DLSS 4 | Frame Generation 2 | 4K 120+ FPS',
      pros: ['Mejor performance del mercado', 'DLSS 4 con mejor calidad', '32GB VRAM para 4K/8K', 'Ray Tracing de nueva generación'],
      cons: ['Precio extremadamente alto', 'Consumo energético muy alto', 'Requiere fuente 1000W+', 'Stock muy limitado'],
    },
    product2: {
      name: 'RX 9070 XT',
      searchTerms: ['rx 9070 xt', '9070 xt', 'rx 9070'],
      category: 'tarjetas-graficas',
      specs: '24GB GDDR6 | 350W TDP | FSR 4 | Ray Tracing mejorado | 4K 60+ FPS',
      pros: ['Mejor relación precio/performance', 'FSR 4 funciona en más juegos', 'Consumo energético moderado', '24GB VRAM suficiente para 4K'],
      cons: ['Sin DLSS 4', 'Ray Tracing inferior a NVIDIA', 'Menor performance bruta', 'Stock limitado inicialmente'],
    },
    conclusion: 'La RTX 5090 es la placa más potente del mercado, ideal para 4K Ultra a 120+ FPS y trabajo profesional. La RX 9070 XT es la opción inteligente si buscás jugar en 4K 60 FPS sin gastar el triple. Elegí RTX 5090 si necesitás la máxima performance y DLSS 4. Elegí RX 9070 XT si buscás la mejor relación precio/calidad en high-end.',
    faqs: [
      {
        question: '¿RTX 5090 o RX 9070 XT para gaming 4K?',
        answer: 'Ambas rinden en 4K. La RTX 5090 llega a 120+ FPS en la mayoría de juegos, mientras que la RX 9070 XT mantiene 60+ FPS en 4K Ultra. La diferencia es de aproximadamente 40-50% a favor de la 5090.',
      },
      {
        question: '¿Cuánto cuesta la RTX 5090 en Argentina?',
        answer: 'Es la placa más cara del mercado. Usá nuestro comparador para ver precios actualizados en tiempo real.',
      },
      {
        question: '¿La RX 9070 XT sirve para 4K?',
        answer: 'Sí, rinde 60+ FPS en 4K Ultra en la mayoría de juegos. Para juegos más exigentes, bajando algunos settings a Alto mantiene 60 FPS estables.',
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
    conclusion: 'Si estás armando una PC nueva con AM5 o Intel 12va/13va generación, DDR5 es el camino. Si tenés una PC con AM4 o Intel 10ma/11va generación, quedate con DDR4 que sigue rindiendo perfecto. La diferencia en juegos es mínima (3-8%), así que no vale cambiar todo solo por la RAM.',
    faqs: [
      {
        question: '¿Vale la pena upgradear de DDR4 a DDR5?',
        answer: 'Solo si cambiás de plataforma (AM4→AM5 o LGA1200→LGA1700). No vale la pena cambiar motherboard solo por RAM.',
      },
      {
        question: '¿Cuánto cuesta la DDR5 en Argentina?',
        answer: 'Aproximadamente 30-50% más cara que DDR4 equivalente. Consultá nuestro comparador para precios actualizados.',
      },
      {
        question: '¿DDR5 mejora el FPS en juegos?',
        answer: 'Sí, pero la diferencia es de 3-8% dependiendo del juego. No es un upgrade revolucionario por sí solo.',
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
