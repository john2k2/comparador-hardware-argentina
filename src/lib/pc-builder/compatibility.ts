import type { Product } from '@/lib/types';
import { parseListingFlags } from '@/lib/product/listing-flags';
import { inferCpuSocket, inferMotherboardPlatform, inferPsuWatts, requiredPsuWatts } from '@/lib/seo/budget-build-compat';
import type { BuildDraft, BuildIssue, BuildSlot } from './types';

const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function spec(product: Product | undefined, ...keys: string[]): string {
  const names = new Set(keys.map(normalized));
  return Object.entries(product?.specs ?? {}).filter(([key]) => names.has(normalized(key))).map(([, value]) => value).join(' ');
}
function socket(product: Product | undefined): string | null {
  if (!product) return null;
  const declared = `${spec(product, 'socket', 'zócalo')} ${product.name}`.match(/\b(AM[345]|LGA\s*\d{4})\b/i)?.[1];
  return declared?.toLowerCase().replace(/\s/g, '') ?? (product.category === 'procesadores'
    ? inferCpuSocket(product.name) : inferMotherboardPlatform(product.name)?.socket ?? null);
}
function ramGen(product: Product | undefined): string | null {
  if (!product) return null;
  return `${spec(product, 'tipo', 'memoria', 'tipo de memoria', 'tecnología de memoria')} ${product.name}`.match(/DDR\s*([345])/i)?.[1]
    ?? (socket(product) === 'am4' ? '4' : socket(product) === 'am5' ? '5' : null);
}
function millimeters(value: string): number | null {
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*mm\b/i);
  return match ? Number(match[1].replace(',', '.')) : null;
}
function formFactor(value: string): string | null {
  if (/micro[ -]?atx|m[ -]?atx/i.test(value)) return 'micro-atx';
  if (/mini[ -]?itx/i.test(value)) return 'mini-itx';
  if (/\be[ -]?atx/i.test(value)) return 'e-atx';
  return /\batx\b/i.test(value) ? 'atx' : null;
}
export function hasIntegratedGraphics(cpu: Product | undefined): boolean {
  const value = spec(cpu, 'gráficos integrados', 'gpu integrada', 'gráficos').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(no|sin|ninguno)\b/i.test(value)) return false;
  return /\b(si|sí|radeon|uhd|iris|intel graphics)\b/i.test(value)
    || /\bryzen\b.*\b\d{4}g(?:t|e)?\b/i.test(cpu?.name ?? '');
}
export function includesCpuCooler(cpu: Product | undefined): boolean | null {
  if (!cpu) return null;
  // El título agrupado puede describir otra presentación comercial del mismo chip.
  // Una exclusión explícita en la oferta elegida gana sobre ese título.
  if (cpu.prices.length === 1) {
    try {
      const path = decodeURIComponent(new URL(cpu.prices[0].url).pathname).replace(/[_-]/g, ' ');
      if (/\b(?:sin|s)\s+cooler\b|\bwof\b/i.test(path)) return false;
    } catch { /* URL inválida: la oferta se excluye del total por separado. */ }
  }
  const value = spec(cpu, 'cooler incluido', 'disipador incluido').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(no|sin|ninguno)\b/i.test(value)) return false;
  if (/\b(si|sí|incluido)\b/i.test(value)) return true;
  return parseListingFlags(cpu.name).coolerIncluded;
}
export function checkBuildCompatibility(parts: Partial<Record<BuildSlot, Product>>, draft: BuildDraft): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const add = (code: string, severity: BuildIssue['severity'], message: string) => issues.push({ code, severity, message });
  const { cpu, motherboard, ram, gpu, psu, cooler } = parts;
  const cpuSocket = socket(cpu), boardSocket = socket(motherboard);
  if (cpu && motherboard) {
    if (cpuSocket && boardSocket && cpuSocket !== boardSocket) add('socket', 'error', `El procesador usa ${cpuSocket.toUpperCase()} y la motherboard ${boardSocket.toUpperCase()}.`);
    else if (!cpuSocket || !boardSocket) add('socket-unknown', 'warning', 'Falta confirmar el socket de procesador y motherboard.');
    add('bios', 'warning', 'Confirmá la versión de BIOS y el soporte del modelo exacto de CPU en la lista del fabricante de la motherboard.');
  }
  if (motherboard && ram) {
    const boardRam = ramGen(motherboard), memoryRam = ramGen(ram);
    if (boardRam && memoryRam && boardRam !== memoryRam) add('ram-generation', 'error', `La motherboard requiere DDR${boardRam} y elegiste DDR${memoryRam}.`);
    else if (!boardRam || !memoryRam) add('ram-generation-unknown', 'warning', 'Falta confirmar la generación DDR de motherboard o memoria.');
    if (/so[ -]?dimm|notebook|laptop/i.test(`${ram.name} ${spec(ram, 'formato', 'factor de forma')}`)) add('ram-format', 'error', 'La memoria SO-DIMM es de notebook; elegí memoria de escritorio.');
    const modules = Number(spec(ram, 'módulos', 'cantidad de módulos').match(/\d+/)?.[0] ?? ram.name.match(/\b(\d)\s*x\s*\d+\s*gb/i)?.[1] ?? 1);
    const slots = Number(spec(motherboard, 'slots de memoria', 'ranuras de memoria').match(/\d+/)?.[0]);
    if (slots && modules * (draft.selections.ram?.quantity ?? 1) > slots) add('ram-slots', 'error', 'La cantidad de módulos de RAM supera las ranuras declaradas de la motherboard.');
  }
  if (cpu && !gpu && !hasIntegratedGraphics(cpu)) add('graphics', 'error', 'Falta una placa de video o confirmar que este procesador tiene gráficos integrados.');
  if (psu && cpu) {
    const watts = inferPsuWatts(`${spec(psu, 'potencia', 'potencia nominal')} ${psu.name}`);
    const declared = Number(spec(gpu, 'fuente recomendada', 'potencia de fuente recomendada').match(/\d{3,4}/)?.[0]);
    const minimum = declared || (gpu ? requiredPsuWatts(cpu.name, gpu.name) : 450);
    if (watts && watts < minimum) add('psu-power', 'error', `La fuente de ${watts} W queda por debajo de la referencia ${declared ? 'de la ficha' : 'estimada'} de ${minimum} W.`);
    if (!watts) add('psu-unknown', 'warning', 'Falta confirmar la potencia nominal de la fuente.');
    add('psu-connectors', 'warning', 'Confirmá calidad de la fuente, conectores y consumo máximo de los modelos exactos; los watts por sí solos no aseguran compatibilidad.');
  }
  if (cpu && !cooler && includesCpuCooler(cpu) !== true) {
    const missing = includesCpuCooler(cpu) === false;
    add('cooler-required', missing ? 'error' : 'warning', missing ? 'Este procesador no incluye disipador. Agregá refrigeración compatible.' : 'Confirmá si el procesador incluye disipador; si no lo incluye, agregá refrigeración.');
  }
  if (cpu && cooler) {
    const supported = spec(cooler, 'sockets compatibles', 'socket', 'compatibilidad');
    if (cpuSocket && supported && !normalized(supported).includes(cpuSocket)) add('cooler-socket', 'error', 'El socket de CPU no figura entre los soportados por este disipador.');
    else if (!supported) add('cooler-socket-unknown', 'warning', 'Falta confirmar el anclaje del disipador para este socket.');
  }
  const chassis = parts.case;
  if (chassis && motherboard) {
    const boardForm = formFactor(spec(motherboard, 'formato', 'factor de forma'));
    const supported = spec(chassis, 'motherboards compatibles', 'formatos soportados', 'formato motherboard');
    if (boardForm && supported) {
      const normalizedSupported = normalized(supported);
      const matches = boardForm === 'micro-atx' ? /microatx|matx/.test(normalizedSupported)
        : boardForm === 'mini-itx' ? /miniitx/.test(normalizedSupported)
          : boardForm === 'e-atx' ? /eatx/.test(normalizedSupported) : /\batx\b/i.test(supported.replace(/\b(?:micro|m|e)[ -]?atx\b/gi, ''));
      if (!matches) add('case-board', 'error', 'El formato de motherboard no figura entre los admitidos por el gabinete.');
    } else add('case-board-unknown', 'warning', 'Falta confirmar el formato de motherboard admitido por el gabinete.');
  }
  for (const [part, partKey, caseKey, code, label] of [
    [gpu, 'largo', 'largo máximo gpu', 'gpu-length', 'placa de video'],
    [cooler, 'altura', 'altura máxima cooler', 'cooler-height', 'disipador'],
  ] as const) {
    if (!part || !chassis) continue;
    const size = millimeters(spec(part, partKey)), maximum = millimeters(spec(chassis, caseKey));
    if (size && maximum && size > maximum) add(code, 'error', `La medida de ${label} (${size} mm) supera el espacio del gabinete (${maximum} mm).`);
    else if (!size || !maximum) add(`${code}-unknown`, 'warning', `Falta confirmar el espacio del gabinete para la ${label === 'disipador' ? 'refrigeración' : label}.`);
  }
  if (parts.ssd && motherboard) add('storage-interface', 'warning', 'Confirmá interfaz y ranuras libres para cada unidad de almacenamiento (SATA o M.2, tamaño y protocolo).');
  return issues;
}
