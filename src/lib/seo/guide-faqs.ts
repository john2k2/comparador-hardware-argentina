import type { ResolvedGuideComponent } from './budget-guide-pricing';

export type GuideFaq = {
  question: string;
  answer: string;
};

function catalogName(slot: ResolvedGuideComponent): string | null {
  return slot.priceSource === 'catalog' ? slot.name : null;
}

function buildCanBuildAnswer(cpu: ResolvedGuideComponent, gpu: ResolvedGuideComponent): string {
  const cpuName = catalogName(cpu);
  const gpuName = catalogName(gpu);

  if (cpuName && gpuName) {
    return `El catálogo observó ofertas recientes para ${cpuName} y ${gpuName}. Confirmá precio, stock, compatibilidad y los costos que faltan directamente en cada tienda; esa observación no garantiza una PC completa comprable hoy.`;
  }
  if (!cpuName && !gpuName) {
    return 'No encontramos ofertas observadas en las últimas 3 horas de procesador ni placa de video para esta selección. No hay un precio comprobable para ese armado.';
  }
  if (!gpuName) {
    return `Hay una oferta reciente observada para el procesador (${cpuName}), pero la placa de video no tiene precio ni stock observados recientemente. Confirmá el CPU en la tienda y no compres la GPU por un estimado.`;
  }
  return `Hay una oferta reciente observada para la placa de video (${gpuName}), pero el procesador no tiene precio ni stock observados recientemente. Confirmá la GPU en la tienda y no compres el CPU por un estimado.`;
}

function buildGpuAnswer(gpu: ResolvedGuideComponent): string {
  const gpuName = catalogName(gpu);
  if (gpuName) {
    return `La GPU con oferta observada recientemente en esta guía es ${gpuName}. Su precio y stock pueden haber cambiado; confirmalos en la tienda antes de comprar.`;
  }
  return 'Estamos buscando una GPU disponible para este presupuesto. La lista de compra solo incluye placas con precio y stock comprobados; no recomendamos comprar a partir de una estimación.';
}

function buildFpsAnswer(cpu: ResolvedGuideComponent, gpu: ResolvedGuideComponent): string {
  const cpuName = catalogName(cpu);
  const gpuName = catalogName(gpu);
  if (cpuName && gpuName) {
    return `El rendimiento depende del juego y los ajustes. Esta selección registra ${cpuName} y ${gpuName}; no tenemos ensayos propios que permitan prometer FPS para tu equipo.`;
  }
  return 'La selección está incompleta y no tenemos ensayos propios del conjunto. No prometemos FPS a partir de nombres o precios estimados.';
}

export function resolveGuideFaqs(
  faqs: GuideFaq[],
  cpu: ResolvedGuideComponent,
  gpu: ResolvedGuideComponent,
): GuideFaq[] {
  return faqs.map((faq, index) => {
    if (index === 0) {
      return { question: faq.question, answer: buildCanBuildAnswer(cpu, gpu) };
    }
    if (index === 1) {
      return { question: faq.question, answer: buildGpuAnswer(gpu) };
    }
    if (index === 2) {
      return { question: faq.question, answer: buildFpsAnswer(cpu, gpu) };
    }
    return faq;
  });
}
