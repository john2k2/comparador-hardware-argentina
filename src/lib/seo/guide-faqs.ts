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
    return `Sí, con partes en stock del catálogo: ${cpuName} y ${gpuName}. El total comprable se actualiza con ofertas reales; no uses filas marcadas sin stock.`;
  }
  if (!cpuName && !gpuName) {
    return 'Hoy no hay procesador ni placa de video en stock para este presupuesto. No armes la PC con esos slots estimados.';
  }
  if (!gpuName) {
    return `Podés comprar el procesador en stock (${cpuName}), pero hoy la placa de video no tiene oferta en stock. No recomendamos esa GPU a precio estimado.`;
  }
  return `Podés comprar la placa de video en stock (${gpuName}), pero hoy el procesador no tiene oferta en stock. No recomendamos ese CPU a precio estimado.`;
}

function buildGpuAnswer(gpu: ResolvedGuideComponent): string {
  const gpuName = catalogName(gpu);
  if (gpuName) {
    return `La GPU en stock de esta guía es ${gpuName}. Compará el precio en las tiendas listadas antes de comprar.`;
  }
  return 'Hoy no hay una GPU en stock para este presupuesto. No elijas una placa solo por el estimado ni la trates como recomendación de compra.';
}

function buildFpsAnswer(cpu: ResolvedGuideComponent, gpu: ResolvedGuideComponent): string {
  const cpuName = catalogName(cpu);
  const gpuName = catalogName(gpu);
  if (cpuName && gpuName) {
    return `El rendimiento depende del juego y los ajustes. Esta guía usa ${cpuName} y ${gpuName} en stock; no publica FPS de un combo que no esté en el catálogo.`;
  }
  return 'No hay FPS honestos para esta guía mientras CPU o GPU estén sin stock. No cites números de un combo estimado.';
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
