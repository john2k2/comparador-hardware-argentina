import type { Product, HardwareCategory } from '@/lib/types';
import { normalizeDisplayText } from '@/lib/text-utils';

type ProductContent = {
  intro: string;
  tips: string[];
  faqs: Array<{ question: string; answer: string }>;
  relatedTerms: string[];
};

const CATEGORY_CONTENT: Record<HardwareCategory, (product: Product) => ProductContent> = {
  'procesadores': (product) => {
    const brand = normalizeDisplayText(product.brand);
    const name = normalizeDisplayText(product.name);
    return {
      intro: `El procesador es el cerebro de tu PC. ${name} ofrece un equilibrio entre rendimiento y eficiencia energética. Al elegir un CPU, considerá el socket, la compatibilidad con tu motherboard actual o futura, y si el cooler incluido alcanza para tus necesidades. Los procesadores modernos de ${brand} destacan por su arquitectura optimizada para gaming y productividad.`,
      tips: [
        'Verificá que el socket del procesador coincida con tu motherboard.',
        'Considerá el TDP: procesadores de alto consumo necesitan refrigeración superior.',
        'Los CPUs con gráficos integrados son ideales para builds sin placa de video dedicada.',
        'Revisá si el cooler viene incluido o necesitás comprar uno por separado.',
      ],
      faqs: [
        {
          question: `¿${name} incluye cooler de fábrica?`,
          answer: 'Depende del modelo específico. Algunos procesadores incluyen cooler stock, mientras que otros requieren una solución de refrigeración aftermarket. Consultá las especificaciones técnicas del fabricante.',
        },
        {
          question: '¿Qué motherboard necesito para este procesador?',
          answer: `Necesitás una motherboard con el socket compatible. Revisá el chipset recomendado para ${brand} y asegurate de que tenga soporte para este modelo específico, especialmente si es una generación reciente.`,
        },
        {
          question: '¿Este procesador sirve para streaming y edición de video?',
          answer: 'Los procesadores con más núcleos e hilos rinden mejor en tareas multitarea como streaming y edición. Para gaming puro, la frecuencia y el IPC son más importantes.',
        },
      ],
      relatedTerms: ['motherboard', 'cooler', 'memoria ram', 'placa de video'],
    };
  },
  'tarjetas-graficas': (product) => {
    const brand = normalizeDisplayText(product.brand);
    const name = normalizeDisplayText(product.name);
    return {
      intro: `La placa de video determina el rendimiento gráfico de tu PC. ${name} está diseñada para ofrecer una experiencia de gaming fluida y capacidades de renderizado profesional. Las GPUs de ${brand} se destacan por su arquitectura optimizada para diferentes presupuestos y necesidades. Al elegir una placa de video, considerá la resolución de tu monitor, la potencia de tu fuente y el espacio disponible en el gabinete.`,
      tips: [
        'Verificá que tu fuente de alimentación tenga los watts y conectores necesarios.',
        'Medí el espacio disponible en tu gabinete: algunas GPUs son muy largas.',
        'La VRAM importa: para 1080p 8GB suele alcanzar, para 1440p/4K considerá 12GB+.',
        'Revisá los puertos de video: necesitás HDMI, DisplayPort o USB-C según tu monitor.',
      ],
      faqs: [
        {
          question: `¿Cuánta VRAM tiene ${name}?`,
          answer: 'La cantidad de VRAM varía según el modelo específico. Revisá las especificaciones técnicas del fabricante. Para gaming moderno, recomendamos al menos 8GB para 1080p y 12GB+ para resoluciones mayores.',
        },
        {
          question: '¿Qué fuente necesito para esta placa de video?',
          answer: 'Revisá el TDP del fabricante y sumá un margen de seguridad del 20-30%. Las GPUs de gama alta pueden requerir fuentes de 750W o más, además de conectores PCIe específicos.',
        },
        {
          question: '¿Esta GPU sirve para minería o renderizado 3D?',
          answer: 'Las GPUs modernas con arquitectura reciente son aptas para renderizado y cargas de trabajo profesionales. Para minería, investigá la rentabilidad actual ya que cambia constantemente.',
        },
      ],
      relatedTerms: ['fuente de alimentación', 'gabinete', 'monitor', 'procesador'],
    };
  },
  'motherboards': (product) => {
    const name = normalizeDisplayText(product.name);
    return {
      intro: `La motherboard es la columna vertebral de tu PC. ${name} determina qué componentes podés usar y qué features tendrás disponibles. Una buena elección de placa madre te da estabilidad, opciones de overclocking y conectividad moderna. Considerá el chipset, el tamaño del formato, las ranuras de expansión y la calidad de los VRMs para asegurar compatibilidad con tu procesador y futuros upgrades.`,
      tips: [
        'Verificá compatibilidad de socket con tu procesador.',
        'El chipset determina las features: overclocking, PCIe 4.0/5.0, USB 3.2 Gen 2x2.',
        'Las placas con mejores VRMs sostienen mejor CPUs de alto consumo.',
        'Revisá cantidad de ranuras M.2 y SATA para tus necesidades de almacenamiento.',
      ],
      faqs: [
        {
          question: '¿Esta motherboard soporta overclocking?',
          answer: 'Depende del chipset. Las placas con chipset Z (Intel) o X/B con buenos VRMs (AMD) suelen soportar overclocking. Revisá las especificaciones del fabricante.',
        },
        {
          question: '¿Qué tamaño de gabinete necesito?',
          answer: 'Las motherboards vienen en formatos ATX, Micro-ATX e ITX. Asegurate de que tu gabinete soporte el tamaño de tu placa.',
        },
        {
          question: '¿Cuánta RAM soporta?',
          answer: 'Revisá las especificaciones del fabricante. La mayoría de placas modernas soportan 64GB o más, con velocidades que dependen del chipset y el procesador.',
        },
      ],
      relatedTerms: ['procesador', 'memoria ram', 'gabinete', 'almacenamiento'],
    };
  },
  'memoria-ram': (product) => {
    const name = normalizeDisplayText(product.name);
    return {
      intro: `La memoria RAM es fundamental para el rendimiento multitarea de tu PC. ${name} ofrece la velocidad y capacidad necesarias para gaming, productividad y cargas de trabajo pesadas. Al elegir RAM, considerá la capacidad total, la frecuencia, las latencias y la compatibilidad con tu motherboard. La configuración en dual channel mejora significativamente el ancho de banda.`,
      tips: [
        'El dual channel (2 módulos) mejora el rendimiento vs un solo módulo.',
        'Verificá la frecuencia máxima soportada por tu motherboard.',
        'Las latencias (CL) más bajas ofrecen mejor respuesta.',
        'Para gaming moderno, 16GB es el mínimo recomendado; 32GB para productividad.',
      ],
      faqs: [
        {
          question: '¿DDR4 o DDR5?',
          answer: 'DDR5 ofrece mayor ancho de banda pero requiere plataformas nuevas. DDR4 sigue siendo excelente y más económica. Elegí según tu plataforma actual o futura.',
        },
        {
          question: '¿Cuánta RAM necesito para gaming?',
          answer: '16GB es el estándar actual para gaming. 32GB te da margen para multitarea y futuros juegos más exigentes.',
        },
        {
          question: '¿Qué significa el número CL?',
          answer: 'CL (CAS Latency) mide el retardo de acceso. Números más bajos = mejor rendimiento. Una RAM de 3200MHz CL16 rinde similar a 3600MHz CL18.',
        },
      ],
      relatedTerms: ['procesador', 'motherboard', 'cooler', 'almacenamiento'],
    };
  },
  'almacenamiento': (product) => {
    const name = normalizeDisplayText(product.name);
    return {
      intro: `El almacenamiento determina la velocidad de carga de tu sistema y aplicaciones. ${name} ofrece diferentes niveles de rendimiento según tu presupuesto y necesidades. Los SSD NVMe son ideales para el sistema operativo y juegos frecuentes, mientras que los HDD de alta capacidad son económicos para bibliotecas grandes. Considerá la velocidad de lectura/escritura, la durabilidad (TBW) y el formato físico.`,
      tips: [
        'Usá NVMe para SO y juegos, HDD para almacenamiento masivo.',
        'La velocidad secuencial importa para archivos grandes; la aleatoria para el SO.',
        'Revisá el TBW (Total Bytes Written) para estimar la vida útil.',
        'El formato M.2 necesita ranura disponible en tu motherboard.',
      ],
      faqs: [
        {
          question: '¿NVMe o SATA SSD?',
          answer: 'NVMe es significativamente más rápido (hasta 7GB/s vs 550MB/s). SATA SSD sigue siendo bueno para upgrades económicos. Para el SO, recomendamos NVMe.',
        },
        {
          question: '¿Cuánto dura un SSD?',
          answer: 'Los SSD modernos duran años bajo uso normal. El TBW indica la resistencia a escrituras. Para uso doméstico, cualquier SSD de marca conocida dura más de 5 años.',
        },
        {
          question: '¿Necesito disipador térmico?',
          answer: 'Algunos NVMe de alta velocidad se calientan bajo carga sostenida. Muchas motherboards incluyen disipadores M.2, o podés comprar uno aftermarket.',
        },
      ],
      relatedTerms: ['motherboard', 'gabinete', 'fuente de alimentación', 'procesador'],
    };
  },
  'fuentes-alimentacion': (product) => {
    const name = normalizeDisplayText(product.name);
    return {
      intro: `La fuente de alimentación es uno de los componentes más importantes para la estabilidad de tu PC. ${name} debe entregar potencia limpia y estable a todos los componentes. Una fuente de calidad con buena certificación de eficiencia (80 Plus) protege tu inversión y reduce el consumo eléctrico. Considerá los watts necesarios, la certificación, los conectores disponibles y si es modular para facilitar el cable management.`,
      tips: [
        'Calculá el consumo total y dejá un margen del 20-30% para upgrades futuros.',
        'Las certificaciones 80 Plus Gold o superior ofrecen mejor eficiencia y menos calor.',
        'Las fuentes modulares facilitan el cable management.',
        'Verificá que tenga los conectores PCIe necesarios para tu placa de video.',
      ],
      faqs: [
        {
          question: '¿Cuántos watts necesito?',
          answer: 'Sumá el TDP de CPU + GPU + 100W para el resto. Para una PC gamer moderna, 650W es el mínimo recomendado; 750W+ para builds de gama alta.',
        },
        {
          question: '¿Qué significa 80 Plus?',
          answer: 'Es una certificación de eficiencia energética. Bronze (82%), Silver (85%), Gold (90%), Platinum (92%), Titanium (94%). Mayor eficiencia = menos calor y consumo.',
        },
        {
          question: '¿Fuente modular o no modular?',
          answer: 'Las modulares te permiten conectar solo los cables que necesitás, mejorando el flujo de aire y la estética. Las semi-modulares son un buen equilibrio precio/practicidad.',
        },
      ],
      relatedTerms: ['gabinete', 'placa de video', 'procesador', 'cooler'],
    };
  },
  'gabinetes': (product) => {
    const name = normalizeDisplayText(product.name);
    return {
      intro: `El gabinete no solo define la estética de tu PC sino también su temperatura y facilidad de mantenimiento. ${name} debe ofrecer buen flujo de aire, espacio para tus componentes y facilidad para el armado. Considerá el tamaño (ATX, Micro-ATX, ITX), la cantidad de ventiladores incluidos, el espacio para cable management y los filtros de polvo. Un buen gabinete puede reducir temperaturas y extender la vida útil de tus componentes.`,
      tips: [
        'El flujo de aire frontal a trasero es el más eficiente.',
        'Verificá el espacio máximo para placa de video y cooler.',
        'Los filtros de polvo reducen el mantenimiento a largo plazo.',
        'El panel lateral de vidrio o malla afecta tanto la estética como la ventilación.',
      ],
      faqs: [
        {
          question: '¿Qué tamaño de gabinete necesito?',
          answer: 'Depende de tu motherboard y componentes. ATX Full Tower para builds grandes, Mid Tower para la mayoría, Mini ITX para builds compactas.',
        },
        {
          question: '¿Cuántos ventiladores necesito?',
          answer: 'Mínimo 2 (entrada y salida). Para gaming, 3-4 ventiladores mantienen mejores temperaturas. El gabinete debe tener espacio suficiente.',
        },
        {
          question: '¿Vidrio templado o panel de malla?',
          answer: 'La malla ofrece mejor ventilación. El vidrio templado se ve mejor pero puede limitar el flujo de aire si no tiene entradas laterales.',
        },
      ],
      relatedTerms: ['motherboard', 'placa de video', 'fuente de alimentación', 'cooler'],
    };
  },
  'refrigeracion': (product) => {
    const name = normalizeDisplayText(product.name);
    return {
      intro: `Una buena refrigeración es esencial para mantener temperaturas óptimas y evitar throttling térmico. ${name} debe ser compatible con tu socket y caber en tu gabinete. Considerá el TDP de tu procesador, el espacio disponible y el nivel de ruido que tolerás. Las soluciones de aire son económicas y confiables, mientras que el watercooling ofrece mejor rendimiento para CPUs de alto consumo.`,
      tips: [
        'Verificá compatibilidad de socket antes de comprar.',
        'Medí la altura máxima de cooler que admite tu gabinete.',
        'Los radiadores de 240mm o 360mm ofrecen mejor rendimiento que los de 120mm.',
        'El ruido se mide en dBA: valores bajo 30dBA son silenciosos.',
      ],
      faqs: [
        {
          question: '¿Aire o agua?',
          answer: 'Las torres de aire de gama alta rinden similar a AIOs de 240mm. El watercooling custom es para entusiastas. Para la mayoría, un cooler de aire premium o un AIO de 240mm es suficiente.',
        },
        {
          question: '¿Cuánto TDP debe disipar mi cooler?',
          answer: 'El TDP del cooler debe ser igual o mayor al TDP de tu procesador. Dejá un margen del 20% para overclocking o ambientes calurosos.',
        },
        {
          question: '¿El cooler incluye pasta térmica?',
          answer: 'Algunos incluyen pasta pre-aplicada o en tubo. Es recomendable usar pasta térmica de calidad para mejorar la transferencia de calor.',
        },
      ],
      relatedTerms: ['procesador', 'gabinete', 'motherboard', 'fuente de alimentación'],
    };
  },
  'perifericos': (product) => {
    const name = normalizeDisplayText(product.name);
    return {
      intro: `Los periféricos definen tu experiencia de uso diaria. ${name} debe adaptarse a tu tipo de uso: gaming competitivo, trabajo creativo, oficina o uso casual. Considerá la ergonomía, la calidad de construcción, la conectividad y las características específicas que necesitás. Un buen monitor, teclado y mouse pueden transformar completamente tu productividad y confort.`,
      tips: [
        'Para gaming, buscá monitores con alta tasa de refresco (144Hz+) y bajo input lag.',
        'Los teclados mecánicos ofrecen mejor respuesta táctil que los de membrana.',
        'Los mouse con sensor óptico de alta DPI son más precisos.',
        'Considerá la ergonomía para sesiones largas de uso.',
      ],
      faqs: [
        {
          question: '¿Monitor 144Hz o 240Hz?',
          answer: '144Hz es el estándar para gaming. 240Hz+ es para gaming competitivo profesional. Asegurate de que tu GPU pueda alcanzar esos FPS.',
        },
        {
          question: '¿Teclado mecánico o de membrana?',
          answer: 'Los mecánicos duran más, ofrecen mejor respuesta y son personalizables. Los de membrana son más silenciosos y económicos.',
        },
        {
          question: '¿Mouse inalámbrico tiene lag?',
          answer: 'Los mouse gaming inalámbricos modernos tienen latencia imperceptible (1ms). La batería y el peso son consideraciones más importantes.',
        },
      ],
      relatedTerms: ['procesador', 'placa de video', 'gabinete', 'monitor'],
    };
  },
};

export function getProductContent(product: Product): ProductContent {
  const generator = CATEGORY_CONTENT[product.category];
  return generator ? generator(product) : {
    intro: `Este producto ofrece características destacadas para tu setup de PC.`,
    tips: ['Compará especificaciones entre modelos similares.', 'Verificá compatibilidad con tus componentes actuales.'],
    faqs: [
      { question: '¿Este producto tiene garantía?', answer: 'Consultá la política de garantía del comercio donde realices la compra.' },
    ],
    relatedTerms: [],
  };
}
