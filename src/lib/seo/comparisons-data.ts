import type { HardwareCategory } from '@/lib/types';
import type { Product } from '@/lib/types';
import { SITE_NAME } from '@/lib/site-config';

export type ComparisonSource = {
  name: string;
  url: string;
};

export type ComparisonDefinition = {
  slug: string;
  reviewedAt?: string;
  title: string;
  metadataTitle?: string;
  description: string;
  keywords: string[];
  product1: {
    name: string;
    searchTerms: string[];
    category: HardwareCategory;
    specs: string;
    pros: string[];
    cons: string[];
  };
  product2: {
    name: string;
    searchTerms: string[];
    category: HardwareCategory;
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
    reviewedAt: '2026-10-09',
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
      cons: ['8 GB pueden limitar ajustes de textura exigentes; revisar cada juego'],
    },
    product2: {
      name: 'RX 7600',
      searchTerms: ['rx 7600'],
      category: 'tarjetas-graficas',
      specs: '8GB GDDR6 | 128-bit | 165W TBP | FSR según juego y versión',
      pros: ['Alternativa de 8 GB para comparar según precio final', 'Compatibilidad FSR según juego y versión'],
      cons: ['Sin DLSS 3', 'Ray Tracing inferior', 'Mayor consumo energético'],
    },
    conclusion:
      'Elegí según los juegos, funciones y precio final que verificás en las tiendas. TechPowerUp aporta pruebas externas; no medimos FPS ni afirmamos que una placa sea siempre más barata en Argentina. Sin dos ofertas recientes comparables no declaramos una ganadora de precio.',
    faqs: [
      {
        question: '¿RTX 4060 o RX 7600 para gaming 1080p?',
        answer:
          'Consultá pruebas de tus juegos con la misma resolución, calidad y uso de ray tracing. TechPowerUp es una referencia externa, no un resultado garantizado para tu PC. Compará funciones que uses y ofertas locales recientes con las mismas condiciones de pago.',
      },
      {
        question: '¿Cuánto cuesta la RTX 4060 en Argentina?',
        answer: 'El precio cambia entre tiendas y versiones del ensamblador. Compará el mismo chip y VRAM, revisá la fecha de relevamiento y confirmá envío y garantía en la publicación.',
      },
      {
        question: '¿La RX 7600 es mejor que la RTX 3060?',
        answer:
          'No hicimos una prueba propia entre esos modelos. Buscá una prueba que incluya la variante exacta de RTX 3060 y los juegos que te interesan; la memoria, los ajustes y las funciones cambian la decisión. No trasladamos porcentajes entre comparaciones distintas.',
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
    reviewedAt: '2026-10-09',
    title: 'Ryzen 5 7600X vs Ryzen 7 5700X: precios',
    metadataTitle: `Ryzen 5 7600X vs Ryzen 7 5700X: precios | ${SITE_NAME}`,
    description: 'Compará Ryzen 5 7600X vs Ryzen 7 5700X, sus precios y plataformas para decidir si conviene armar en AM5 o actualizar una PC AM4.',
    keywords: ['7600x vs 5700x', 'ryzen 5 vs ryzen 7', 'mejor procesador gaming argentina', 'am5 vs am4'],
    product1: {
      name: 'Ryzen 5 7600X',
      searchTerms: ['ryzen 5 7600x', '7600x'],
      category: 'procesadores',
      specs: '6 núcleos / 12 hilos | 4.7-5.3 GHz | AM5 | DDR5 | 105W',
      pros: ['Plataforma AM5 con DDR5', 'Soporte sujeto a motherboard y BIOS exactas'],
      cons: ['No incluye cooler stock', 'Requiere motherboard AM5 y memoria DDR5; comparar el costo completo'],
    },
    product2: {
      name: 'Ryzen 7 5700X',
      searchTerms: ['ryzen 7 5700x', '5700x'],
      category: 'procesadores',
      specs: '8 núcleos / 16 hilos | 3.4-4.6 GHz | AM4 | DDR4 | 65W',
      pros: ['Más núcleos (8 vs 6)', 'Posible reutilización de AM4 y DDR4 con soporte de BIOS'],
      cons: ['No incluye cooler stock', 'Las actualizaciones AM4 dependen de la lista de CPU y BIOS de la motherboard'],
    },
    conclusion:
      'Si ya tenés AM4 y DDR4, compará el costo de actualizar frente a una plataforma AM5 completa para el 7600X. TechPowerUp aporta una review del 7600X; sus resultados contra otro CPU no prueban esta comparación. No hay una recomendación universal sin uso, compatibilidad y presupuesto completo.',
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
          'Depende del codificador, juego y carga simultánea. El número de núcleos aislado no decide el resultado; revisá pruebas de esa tarea y si usás codificación por GPU. No presentamos una review frente al 5600X como un ensayo contra el 5700X.',
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
    reviewedAt: '2026-10-09',
    title: 'RTX 5070 vs RTX 4070',
    metadataTitle: `RTX 5070 vs RTX 4070: precios | ${SITE_NAME}`,
    description: 'Comparativa RTX 5070 vs RTX 4070. Precios actualizados, rendimiento en juegos y análisis de valor para elegir la mejor GPU en Argentina.',
    keywords: ['rtx 5070 vs 4070', '5070 vs 4070 argentina', 'mejor placa video 1440p', 'rtx 5070 precio'],
    product1: {
      name: 'RTX 5070',
      searchTerms: ['rtx 5070'],
      category: 'tarjetas-graficas',
      specs: '12GB GDDR7 | 250W TGP de referencia | DLSS | Multi Frame Generation',
      pros: ['Multi Frame Generation en juegos compatibles', 'Memoria GDDR7', 'Ventaja en las pruebas externas citadas, variable según juego'],
      cons: ['Mayor TGP de referencia que la RTX 4070', 'Multi Frame Generation no equivale a FPS renderizados ni elimina la latencia'],
    },
    product2: {
      name: 'RTX 4070',
      searchTerms: ['rtx 4070'],
      category: 'tarjetas-graficas',
      specs: '12GB | 200W TGP de referencia | DLSS con Frame Generation',
      pros: ['Menor TGP de referencia', 'Compatible con mejoras de DLSS 4 en Super Resolution, Ray Reconstruction y Frame Generation'],
      cons: ['Sin Multi Frame Generation de RTX 50', 'Revisar la variante de memoria y las funciones disponibles en cada juego y driver'],
    },
    conclusion:
      'TechPowerUp midió a la RTX 5070 Founders ~22% por encima de la 4070 en raster 1440p y ~25% en 4K; con ray tracing a 1440p el salto baja a ~15%. Son resultados de esa prueba, no FPS garantizados. NVIDIA distingue Multi Frame Generation de RTX 50 de otras mejoras de DLSS compatibles con RTX 40. Sin dos ofertas recientes comparables no declaramos una ganadora de precio ni aseguramos stock.',
    faqs: [
      {
        question: '¿Cuánto más rápida es la RTX 5070 vs 4070?',
        answer:
          'En la review de TechPowerUp de la 5070 FE: +22% raster 1440p, +25% raster 4K, +15% RT 1440p. El TGP sube a 250 W contra 200 W de la 4070. 12 GB GDDR7 en bus 192-bit, igual de angosto que la 4070.',
      },
      {
        question: '¿Vale la pena upgradear de 4070 a 5070?',
        answer:
          'Compará el costo del cambio con las pruebas de los juegos y aplicaciones que usás. La RTX 4070 recibe varias mejoras de DLSS 4; lo exclusivo de RTX 50 en esa generación es Multi Frame Generation. Confirmá soporte del juego y driver. No hay una recomendación universal de recambio.',
      },
      {
        question: '¿La RTX 5070 sirve para 4K?',
        answer:
          'TechPowerUp la pone ~25% arriba de la 4070 en raster 4K en esa prueba. Revisá FPS, memoria y ajustes de tus juegos: esa media no garantiza jugar todo en ultra. Separá renderizado nativo, reescalado y cuadros generados al comparar resultados.',
      },
    ],
    sources: [
      {
        name: 'TechPowerUp — NVIDIA GeForce RTX 5070 Founders Edition (conclusión)',
        url: 'https://www.techpowerup.com/review/nvidia-geforce-rtx-5070-founders-edition/46.html',
      },
      {
        name: 'NVIDIA — DLSS 4 y compatibilidad de sus funciones',
        url: 'https://www.nvidia.com/en-us/geforce/news/dlss4-multi-frame-generation-ai-innovations/',
      },
      {
        name: 'NVIDIA — especificaciones RTX 5070',
        url: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/',
      },
    ],
  },
  {
    slug: 'ryzen-7-9800x3d-vs-i9-14900k',
    reviewedAt: '2026-10-09',
    title: 'Ryzen 7 9800X3D vs i9-14900K',
    metadataTitle: `Ryzen 7 9800X3D vs i9-14900K: precios | ${SITE_NAME}`,
    description: 'Compará Ryzen 7 9800X3D vs Intel i9-14900K: plataformas, pruebas externas de gaming y productividad, y ofertas relevadas en Argentina.',
    keywords: ['9800x3d vs 14900k', 'ryzen vs intel gaming', 'mejor procesador 2026 argentina', '9800x3d precio'],
    product1: {
      name: 'Ryzen 7 9800X3D',
      searchTerms: ['ryzen 7 9800x3d', '9800x3d'],
      category: 'procesadores',
      specs: '8 núcleos / 16 hilos | 4.7-5.2 GHz | 104MB Cache | AM5 | 120W',
      pros: ['3D V-Cache', 'Ventaja gaming en la prueba citada de TechPowerUp', 'Plataforma AM5 con DDR5'],
      cons: ['Requiere refrigeración por separado', 'La ventaja gaming no se traslada a todas las aplicaciones'],
    },
    product2: {
      name: 'Intel Core i9-14900K',
      searchTerms: ['i9-14900k', '14900k', 'intel core i9'],
      category: 'procesadores',
      specs: '24 núcleos (8P + 16E) / 32 hilos | Hasta 6.0 GHz | LGA1700 | 253W turbo máximo',
      pros: ['Ventaja en el conjunto de aplicaciones de la prueba citada', 'Más núcleos, con arquitectura híbrida'],
      cons: ['Dimensionar cooler, alimentación y límites de potencia', 'Actualizar BIOS y revisar las recomendaciones vigentes de Intel'],
    },
    conclusion:
      'Compará el costo completo de CPU, motherboard, RAM y cooler. En la review citada de TechPowerUp, el 9800X3D encabeza el conjunto gaming y el 14900K tiene ventaja en aplicaciones. Eso no convierte a uno en ganador de todos los juegos, renders o tareas de streaming. Revisá las cargas concretas y ofertas recientes con la misma condición de pago.',
    faqs: [
      {
        question: '¿El 9800X3D es el mejor procesador para gaming?',
        answer:
          'Encabeza el conjunto gaming de la review citada de TechPowerUp. Es un resultado de esa selección de juegos, GPU y ajustes, no una garantía ni un ranking permanente del mercado.',
      },
      {
        question: '¿Cuánto cuesta el 9800X3D en Argentina?',
        answer: 'Consultá las ofertas del mismo modelo, su fecha y condición de pago. Sumá motherboard, memoria y cooler antes de comparar el costo de plataforma.',
      },
      {
        question: '¿El i9-14900K es mejor para streaming?',
        answer:
          'Depende del codificador y la carga simultánea. Una media de aplicaciones de TechPowerUp no prueba el rendimiento de tu transmisión. Si codificás por GPU, sus funciones también importan; buscá pruebas con el juego y codificador que vas a usar.',
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
    reviewedAt: '2026-10-09',
    title: 'i5-14600K vs Ryzen 5 7600X',
    description: '¿Intel o AMD para gaming? Compará precios de i5-14600K vs Ryzen 5 7600X en tiendas argentinas y elegí el mejor procesador.',
    keywords: ['14600k vs 7600x', 'intel vs amd', 'mejor procesador gaming 2026', 'i5 14600k precio argentina'],
    product1: {
      name: 'Intel Core i5-14600K',
      searchTerms: ['i5-14600k', '14600k', 'intel core i5'],
      category: 'procesadores',
      specs: '14 núcleos (6P + 8E) / 20 hilos | Hasta 5.3 GHz | LGA1700 | 125W base / 181W turbo máximo',
      pros: ['DDR4 o DDR5 según la motherboard', 'Ventaja en el conjunto de aplicaciones de la prueba citada'],
      cons: ['Necesita cooler por separado y límites de potencia adecuados', 'No permite instalar DDR4 en una placa DDR5 ni al revés'],
    },
    product2: {
      name: 'Ryzen 5 7600X',
      searchTerms: ['ryzen 5 7600x', '7600x'],
      category: 'procesadores',
      specs: '6 núcleos / 12 hilos | 4.7-5.3 GHz | AM5 | DDR5 | 105W',
      pros: ['Plataforma AM5 con DDR5', 'Posibles actualizaciones según el soporte de CPU y BIOS de la placa'],
      cons: ['Solo DDR5', 'Necesita cooler por separado', 'Comparar el costo de motherboard y memoria además del CPU'],
    },
    conclusion:
      'TechPowerUp, en el conjunto de aplicaciones de la review citada, deja al 7600X cerca de 25% detrás del i5-14600K. El porcentaje usa al Intel como referencia; no equivale a decir que Intel está 25% delante. Para elegir, contrastá las pruebas de tu tarea y el costo de motherboard, memoria y cooler. El 14600K admite DDR4 o DDR5 según la placa; el 7600X requiere AM5 y DDR5.',
    faqs: [
      {
        question: '¿i5-14600K o Ryzen 5 7600X para gaming?',
        answer:
          'Revisá las pruebas gaming de TechPowerUp y de los títulos que usás, con la misma GPU y ajustes. El dato de aplicaciones citado —7600X cerca de 25% detrás del 14600K— no es una predicción de FPS. La plataforma y su costo también forman parte de la decisión.',
      },
      {
        question: '¿Cuánto cuesta el i5-14600K en Argentina?',
        answer: 'El precio cambia según la tienda. Compará procesadores del mismo modelo para ver el valor publicado hoy.',
      },
      {
        question: '¿El i5-14600K se calienta mucho?',
        answer:
          'Intel especifica 125 W de potencia base y 181 W de turbo máximo. La temperatura depende del cooler, gabinete, ambiente y límites configurados. Presupuestá refrigeración compatible y revisá una prueba de ese cooler; no garantizamos una temperatura por su tamaño o precio.',
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
      {
        name: 'Intel — Core i5-14600K, memoria y potencia',
        url: 'https://www.intel.com/content/www/us/en/products/sku/236799/intel-core-i5-processor-14600k-24m-cache-up-to-5-30-ghz/specifications.html',
      },
    ],
  },
  {
    slug: 'rtx-5090-vs-rx-9070-xt',
    reviewedAt: '2026-10-09',
    title: 'RTX 5090 vs RX 9070 XT',
    metadataTitle: `RTX 5090 vs RX 9070 XT: precios | ${SITE_NAME}`,
    description: 'Compará precios de RTX 5090 vs RX 9070 XT en tiendas de Argentina. Rendimiento 4K, ray tracing, DLSS 4 vs FSR 4 y cuál elegir.',
    keywords: ['rtx 5090 vs rx 9070 xt', '5090 vs 9070 xt argentina', 'mejor placa video 4k', 'rtx 5090 precio argentina'],
    product1: {
      name: 'RTX 5090',
      searchTerms: ['rtx 5090', '5090'],
      category: 'tarjetas-graficas',
      specs: '32GB GDDR7 | 575W TGP de referencia | DLSS | Multi Frame Generation',
      pros: ['32 GB de VRAM', 'Multi Frame Generation en juegos compatibles', 'Referencia de rendimiento 4K en la review citada'],
      cons: ['TGP elevado; revisar fuente y conectores del modelo exacto', 'Verificar espacio de gabinete y holgura de cables'],
    },
    product2: {
      name: 'RX 9070 XT',
      searchTerms: ['rx 9070 xt', '9070 xt', 'rx 9070'],
      category: 'tarjetas-graficas',
      specs: '16GB GDDR6 | 256-bit | 304W TBP en Sapphire Pulse | FSR según juego y versión',
      pros: ['16 GB de VRAM', 'Menor potencia de placa en el modelo Pulse citado frente a la RTX 5090 de referencia'],
      cons: ['Las funciones de reescalado dependen del juego y driver', 'Consumo, dimensiones y conectores varían entre ensambladores'],
    },
    conclusion:
      'Son alternativas de distinto segmento y costo de plataforma. Las reviews de TechPowerUp permiten revisar resolución, ajustes y consumo; un porcentaje de la RTX 5090 frente a la 4090 no demuestra esta comparación con la RX 9070 XT. Compará resultados de ambas en el mismo juego y precio final de ofertas recientes. Sin esas ofertas no declaramos una ganadora de valor.',
    faqs: [
      {
        question: '¿RTX 5090 o RX 9070 XT para gaming 4K?',
        answer:
          'Consultá las reviews de TechPowerUp con los juegos y ajustes que querés usar. Separá rasterizado, ray tracing, reescalado y cuadros generados. Los 32 GB de la 5090 y 16 GB de la 9070 XT son una diferencia de capacidad, no un porcentaje de FPS.',
      },
      {
        question: '¿Cuánto cuesta la RTX 5090 en Argentina?',
        answer: 'Consultá ofertas recientes del modelo exacto y confirmá pago, envío y garantía. Incluí cualquier cambio necesario de fuente o gabinete en el costo de compra.',
      },
      {
        question: '¿La RX 9070 XT sirve para 4K?',
        answer:
          'La review de TechPowerUp incluye pruebas en 4K. Revisá los FPS de tus títulos y ajustes; tener 16 GB no garantiza una calidad o tasa de cuadros. La Sapphire Pulse usada como referencia consume 304 W de potencia típica de placa según su fabricante; otras versiones pueden diferir.',
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
      {
        name: 'Sapphire — Pulse RX 9070 XT, SKU 11348-03-20G',
        url: 'https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-9070-xt-16g-gddr6',
      },
      {
        name: 'NVIDIA — especificaciones RTX 5090 de referencia',
        url: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/',
      },
    ],
  },
  {
    slug: 'ddr5-vs-ddr4',
    reviewedAt: '2026-10-09',
    title: 'DDR5 vs DDR4',
    description: 'Comparativa DDR5 vs DDR4. Diferencias de precio, rendimiento y compatibilidad. Encontrá el mejor precio en tiendas argentinas.',
    keywords: ['ddr5 vs ddr4', 'memoria ddr5 precio argentina', 'ddr5 vale la pena', 'memoria ram gaming'],
    product1: {
      name: 'DDR5',
      searchTerms: ['ddr5', 'memoria ddr5'],
      category: 'memoria-ram',
      specs: 'Velocidad en MT/s y latencia según kit | AM5 y placas Intel compatibles con DDR5',
      pros: ['Mayores tasas de transferencia del estándar frente a DDR4', 'Memoria requerida por AM5'],
      cons: ['No se instala en una ranura DDR4', 'Perfiles de velocidad sujetos al CPU, motherboard, BIOS y kit'],
    },
    product2: {
      name: 'DDR4',
      searchTerms: ['ddr4', 'memoria ddr4'],
      category: 'memoria-ram',
      specs: 'Velocidad en MT/s y latencia según kit | AM4 y placas Intel compatibles con DDR4',
      pros: ['Permite reutilizar memoria existente en una plataforma compatible', 'También disponible en motherboards LGA1700 específicas'],
      cons: ['No se instala en una ranura DDR5', 'La capacidad y velocidad admitidas dependen de la placa y CPU'],
    },
    conclusion:
      'AM5 requiere DDR5. Intel Core de 12.ª a 14.ª generación en LGA1700 admite DDR4 o DDR5 según la motherboard: el socket por sí solo no decide y las ranuras no son intercambiables. Revisá el modelo exacto de CPU, placa y kit. TechPowerUp comparó DDR4 y DDR5 con un 12900K; ese resultado no se traslada automáticamente a otros equipos o juegos. Compará el costo total y ofertas recientes de kits equivalentes.',
    faqs: [
      {
        question: '¿Vale la pena upgradear de DDR4 a DDR5?',
        answer: 'Necesitás una motherboard que admita DDR5. En LGA1700 puede ser posible conservar el CPU al cambiar de placa DDR4 a DDR5, pero hay que comprobar soporte y BIOS. Compará el costo de placa y memoria con una mejora medida en tus tareas; no hay una conveniencia universal.',
      },
      {
        question: '¿Cuánto cuesta la DDR5 en Argentina?',
        answer: 'Compará capacidad total, cantidad de módulos, MT/s, latencias y condición de pago. Un módulo de 16 GB no equivale a un kit de 2×16 GB. Confirmá precio, stock y compatibilidad en la publicación de la tienda.',
      },
      {
        question: '¿DDR5 mejora el FPS en juegos?',
        answer:
          'Depende del juego, CPU, GPU, configuración y kit. La prueba de TechPowerUp con 12900K es una referencia concreta, no una promesa. Tampoco un CL menor garantiza menor demora: Kingston explica que la latencia CAS en nanosegundos depende de CL y MT/s, calculada como CL × 2000 / MT/s.',
      },
    ],
    sources: [
      {
        name: 'TechPowerUp — Intel Core i9-12900K Alder Lake DDR4 vs DDR5',
        url: 'https://www.techpowerup.com/review/intel-core-i9-12900k-alder-lake-ddr4-vs-ddr5/',
      },
      {
        name: 'Intel — Core i5-14600K, soporte DDR4 y DDR5',
        url: 'https://www.intel.com/content/www/us/en/products/sku/236799/intel-core-i5-processor-14600k-24m-cache-up-to-5-30-ghz/specifications.html',
      },
      {
        name: 'Kingston — latencia CAS, CL y tasa de transferencia',
        url: 'https://www.kingston.com/en/blog/gaming/cas-latency-cl-ram-timing-explained',
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
