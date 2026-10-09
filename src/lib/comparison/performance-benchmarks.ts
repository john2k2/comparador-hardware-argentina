import type { HardwareCategory, Product } from '@/lib/types';
import { compactGpuChip, normalizeIdentityText, parseCpuModelSignature, parseGpuChipSignature } from '@/lib/product-identity';

export type PerformanceBenchmark = {
  model: string;
  primaryLabel: string;
  primaryScore: number;
  secondaryLabel?: string;
  secondaryScore?: number;
  sourceName: string;
  sourceUrl: string;
  measuredAt: string;
  methodology: string;
};

type BenchmarkEntry = PerformanceBenchmark & { pattern: RegExp };

const GEEKBENCH_AMD_5000 = 'https://browser.geekbench.com/processors/amd-ryzen-5-5600';
const GEEKBENCH_AMD_7000 = 'https://browser.geekbench.com/processors/amd-ryzen-5-7600x';
const GEEKBENCH_AMD_9000 = 'https://browser.geekbench.com/processors/amd-ryzen-7-9800x3d';
const GEEKBENCH_INTEL = 'https://browser.geekbench.com/processors/intel-core-i9-14900k';
const TPU_GPU_DATABASE = 'https://www.techpowerup.com/gpu-specs/';

function cpu(model: string, pattern: RegExp, single: number, multi: number, sourceUrl: string): BenchmarkEntry {
  return {
    model, pattern,
    primaryLabel: 'Geekbench CPU multinúcleo', primaryScore: multi,
    secondaryLabel: 'Geekbench CPU un núcleo', secondaryScore: single,
    sourceName: 'Geekbench Processor Benchmark Chart', sourceUrl,
    measuredAt: '2026-09-22',
    methodology: 'Puntajes agregados de resultados enviados por usuarios. Sirven para cómputo general; no equivalen a FPS en juegos.',
  };
}

function gpu(model: string, pattern: RegExp, score: number): BenchmarkEntry {
  return {
    model, pattern,
    primaryLabel: 'Índice gráfico relativo', primaryScore: score,
    sourceName: 'TechPowerUp GPU Database', sourceUrl: TPU_GPU_DATABASE,
    measuredAt: '2026-09-22',
    methodology: 'Índice relativo de GPU de escritorio normalizado con RTX 4060 = 100. Resume raster; el resultado cambia según juego y resolución.',
  };
}

const CPU_BENCHMARKS: BenchmarkEntry[] = [
  cpu('Ryzen 7 9800X3D', /\b9800x3d\b/i, 2971, 18773, GEEKBENCH_AMD_9000),
  cpu('Ryzen 9 9950X', /\b9950x\b/i, 3056, 25954, GEEKBENCH_AMD_9000),
  cpu('Ryzen 9 9900X', /\b9900x\b/i, 3013, 22065, GEEKBENCH_AMD_9000),
  cpu('Ryzen 7 9700X', /\b9700x\b/i, 3007, 17714, GEEKBENCH_AMD_9000),
  cpu('Ryzen 5 9600X', /\b9600x\b/i, 2914, 14328, GEEKBENCH_AMD_9000),
  cpu('Ryzen 7 7800X3D', /\b7800x3d\b/i, 2426, 15507, GEEKBENCH_AMD_7000),
  cpu('Ryzen 7 7700X', /\b7700x\b/i, 2423, 14063, GEEKBENCH_AMD_7000),
  cpu('Ryzen 7 7700', /\b7700\b/i, 2515, 15258, GEEKBENCH_AMD_7000),
  cpu('Ryzen 5 7600X', /\b7600x\b/i, 2602, 13677, GEEKBENCH_AMD_7000),
  cpu('Ryzen 5 7600', /\b7600\b/i, 2499, 13135, GEEKBENCH_AMD_7000),
  cpu('Ryzen 9 5950X', /\b5950x\b/i, 2084, 15281, GEEKBENCH_AMD_5000),
  cpu('Ryzen 9 5900X', /\b5900x\b/i, 2072, 14029, GEEKBENCH_AMD_5000),
  cpu('Ryzen 7 5800X3D', /\b5800x3d\b/i, 2016, 11819, GEEKBENCH_AMD_5000),
  cpu('Ryzen 7 5800X', /\b5800x\b/i, 2048, 11165, GEEKBENCH_AMD_5000),
  cpu('Ryzen 7 5700X', /\b5700x\b/i, 2031, 10841, GEEKBENCH_AMD_5000),
  cpu('Ryzen 5 5600X', /\b5600x\b/i, 2007, 9264, GEEKBENCH_AMD_5000),
  cpu('Ryzen 5 5600', /\b5600\b/i, 1933, 9179, GEEKBENCH_AMD_5000),
  cpu('Ryzen 5 5500', /\b5500\b/i, 1762, 8217, GEEKBENCH_AMD_5000),
  cpu('Core i9-14900K', /\bi9[ -]?14900k\b/i, 2657, 21907, GEEKBENCH_INTEL),
  cpu('Core i7-14700K', /\bi7[ -]?14700k\b/i, 2580, 20885, GEEKBENCH_INTEL),
  cpu('Core i5-14600K', /\bi5[ -]?14600k\b/i, 2508, 16842, GEEKBENCH_INTEL),
  cpu('Core i5-14400F', /\bi5[ -]?14400f\b/i, 2004, 10878, GEEKBENCH_INTEL),
  cpu('Core i9-13900K', /\bi9[ -]?13900k\b/i, 2616, 23115, GEEKBENCH_INTEL),
  cpu('Core i7-13700K', /\bi7[ -]?13700k\b/i, 2499, 19239, GEEKBENCH_INTEL),
  cpu('Core i5-13600K', /\bi5[ -]?13600k\b/i, 2303, 15384, GEEKBENCH_INTEL),
  cpu('Core i5-13400F', /\bi5[ -]?13400f\b/i, 2000, 11055, GEEKBENCH_INTEL),
];

const GPU_BENCHMARKS: BenchmarkEntry[] = [
  gpu('RTX 5090', /\brtx[ -]?5090\b/i, 409), gpu('RTX 4090', /\brtx[ -]?4090\b/i, 312),
  gpu('RTX 5080', /\brtx[ -]?5080\b/i, 270), gpu('RTX 4080 SUPER', /\brtx[ -]?4080[ -]?super\b/i, 241),
  gpu('RX 7900 XTX', /\brx[ -]?7900[ -]?xtx\b/i, 239), gpu('RTX 5070 Ti', /\brtx[ -]?5070[ -]?ti\b/i, 235),
  gpu('RX 9070 XT', /\brx[ -]?9070[ -]?xt\b/i, 225), gpu('RX 7900 XT', /\brx[ -]?7900[ -]?xt\b/i, 206),
  gpu('RTX 4070 Ti SUPER', /\brtx[ -]?4070[ -]?ti[ -]?super\b/i, 202), gpu('RX 9070', /\brx[ -]?9070\b/i, 201),
  gpu('RTX 5070', /\brtx[ -]?5070\b/i, 183), gpu('RTX 4070 SUPER', /\brtx[ -]?4070[ -]?super\b/i, 172),
  gpu('RTX 4070', /\brtx[ -]?4070\b/i, 164), gpu('RX 7800 XT', /\brx[ -]?7800[ -]?xt\b/i, 160),
  gpu('RTX 5060 Ti', /\brtx[ -]?5060[ -]?ti\b/i, 143), gpu('RX 7700 XT', /\brx[ -]?7700[ -]?xt\b/i, 140),
  gpu('RX 9060 XT', /\brx[ -]?9060[ -]?xt\b/i, 136), gpu('RTX 4060 Ti', /\brtx[ -]?4060[ -]?ti\b/i, 125),
  gpu('RTX 5060', /\brtx[ -]?5060\b/i, 123), gpu('RTX 3060 Ti', /\brtx[ -]?3060[ -]?ti\b/i, 111),
  gpu('RX 7600 XT', /\brx[ -]?7600[ -]?xt\b/i, 100), gpu('RTX 4060', /\brtx[ -]?4060\b/i, 100),
  gpu('Arc B580', /\barc[ -]?b580\b/i, 100), gpu('RX 7600', /\brx[ -]?7600\b/i, 94),
  gpu('RTX 3060 12GB', /\brtx[ -]?3060(?:\s+12\s?gb)?\b/i, 86), gpu('RX 6700 XT', /\brx[ -]?6700[ -]?xt\b/i, 109),
  gpu('RX 6600 XT', /\brx[ -]?6600[ -]?xt\b/i, 84), gpu('RX 6600', /\brx[ -]?6600\b/i, 76),
  gpu('RTX 3050 8GB', /\brtx[ -]?3050(?:\s+8\s?gb)?\b/i, 53), gpu('RX 580', /\brx[ -]?580\b/i, 45),
];

// Estas familias tienen variantes de memoria. Sin una variante declarada en
// el dato de rendimiento, no trasladar su puntaje a cualquiera de ellas.
const MEMORY_VARIANT_CHIPS = new Set(['rtx3050', 'rtx3060', 'rtx4060ti', 'rtx5060ti', 'rx9060xt', 'rx580']);

function matchesCpuVariant(product: Pick<Product, 'name' | 'model'>, entry: BenchmarkEntry): boolean {
  const expected = parseCpuModelSignature(entry.model);
  const declared = [parseCpuModelSignature(product.name), parseCpuModelSignature(product.model)].filter(value => value !== null);
  if (!expected || declared.length === 0) return false;
  return declared.every(chip => chip.number === expected.number
    && chip.suffixes.join('') === expected.suffixes.join('')
    && (chip.family === 'unknown' || chip.family === expected.family
      || (chip.family === 'ryzen' && expected.family.startsWith('ryzen'))));
}

function matchesGpuVariant(product: Pick<Product, 'name' | 'model'>, entry: BenchmarkEntry): boolean {
  const text = normalizeIdentityText(`${product.name} ${product.model}`);
  if (/\b(laptop|notebook|mobile|movil|max\s*q|maxq|2048sp)\b/.test(text)
    || /\b(?:rtx|gtx)\s*\d{3,4}\s+d\b/.test(text)) return false;
  const namedChip = parseGpuChipSignature(product.name);
  const modelChip = parseGpuChipSignature(product.model);
  const chip = namedChip ?? modelChip;
  const expected = parseGpuChipSignature(entry.model);
  if (!chip || !expected || compactGpuChip(chip) !== compactGpuChip(expected)) return false;
  if (namedChip && modelChip && compactGpuChip(namedChip) !== compactGpuChip(modelChip)) return false;
  const memory = [...new Set([...text.matchAll(/\b(\d{1,3})\s*gb\b/g)].map(match => Number(match[1])))];
  if (memory.length > 1) return false;
  const expectedMemory = entry.model.match(/\b(\d{1,3})\s*gb\b/i)?.[1];
  if (expectedMemory) return memory.length === 1 && memory[0] === Number(expectedMemory);
  return !MEMORY_VARIANT_CHIPS.has(compactGpuChip(chip));
}

export function findPerformanceBenchmark(product: Pick<Product, 'name' | 'model' | 'category'>): PerformanceBenchmark | null {
  const entries = product.category === 'procesadores'
    ? CPU_BENCHMARKS
    : product.category === 'tarjetas-graficas' ? GPU_BENCHMARKS : [];
  const haystack = `${product.name} ${product.model}`;
  const match = entries.find((entry) => entry.pattern.test(haystack)
    && (product.category === 'tarjetas-graficas' ? matchesGpuVariant(product, entry) : matchesCpuVariant(product, entry)));
  if (!match) return null;
  const { pattern, ...benchmark } = match;
  void pattern;
  return benchmark;
}

export function supportsPerformanceBenchmarks(category: HardwareCategory): boolean {
  return category === 'procesadores' || category === 'tarjetas-graficas';
}
