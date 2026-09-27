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
    return `El catálogo registra ofertas para ${cpuName} y ${gpuName}. Revisá la fecha de cada oferta y confirmá stock, compatibilidad y los costos que faltan; ese registro no garantiza una PC completa comprable hoy.`;
  }
  if (!cpuName && !gpuName) {
    return 'No encontramos ofertas registradas de procesador ni placa de video para esta selección. No armes la PC con esos slots estimados.';
  }
  if (!gpuName) {
    return `Hay una oferta registrada para el procesador (${cpuName}), pero no encontramos una para la placa de video; revisá fechas y confirmá stock. No recomendamos esa GPU a precio estimado.`;
  }
  return `Hay una oferta registrada para la placa de video (${gpuName}), pero no encontramos una para el procesador; revisá fechas y confirmá stock. No recomendamos ese CPU a precio estimado.`;
}

function buildGpuAnswer(gpu: ResolvedGuideComponent): string {
  const gpuName = catalogName(gpu);
  if (gpuName) {
    return `La GPU con oferta registrada de esta guía es ${gpuName}. Revisá su fecha y confirmá precio y stock en las tiendas antes de comprar.`;
  }
  return 'La selección no tiene una oferta registrada de GPU; aparece sin stock verificado. No elijas una placa solo por el estimado ni la trates como recomendación de compra.';
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
