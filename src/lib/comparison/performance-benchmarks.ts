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
  consultedAt: string;
  benchmarkVersion: string;
  sourceModel: string;
  modelSourceUrl: string;
  evidenceReference: string;
  comparisonGroup: string;
  methodology: string;
};

type BenchmarkEntry = PerformanceBenchmark & { pattern: RegExp };

const GEEKBENCH_CHART = 'https://browser.geekbench.com/processor-benchmarks';

function cpu(model: string, pattern: RegExp, single: number, multi: number, modelSourceUrl: string): BenchmarkEntry {
  return {
    model, pattern,
    primaryLabel: 'Geekbench 7 CPU multinúcleo', primaryScore: multi,
    secondaryLabel: 'Geekbench 7 CPU un núcleo', secondaryScore: single,
    sourceName: `Geekbench 7 Processor Benchmark Chart · ${model}`,
    sourceUrl: GEEKBENCH_CHART,
    sourceModel: `${model.startsWith('Core ') ? 'Intel' : 'AMD'} ${model}`,
    modelSourceUrl,
    consultedAt: '2026-10-10T01:19:01.876Z',
    benchmarkVersion: 'Geekbench 7',
    comparisonGroup: 'geekbench-7-processor-chart-2026-10-09',
    evidenceReference: 'docs/reports/benchmarks-maximus-2026-10-09/benchmarks.md',
    methodology: 'Puntajes agregados de usuarios del chart de Geekbench 7, que exige al menos cinco resultados únicos por CPU. Son una referencia de cómputo general, no FPS ni una medición en un equipo idéntico. La fecha es de consulta, no de ejecución del benchmark.',
  };
}

// Sólo estas filas tienen ambos puntajes y versión constatados en el chart.
// Las páginas de modelo dicen GB6 y GB7: sólo acreditan la identidad del enlace,
// no la versión ni la procedencia numérica. Ver evidencia y límites en el reporte.
const CPU_BENCHMARKS: BenchmarkEntry[] = [
  cpu('Ryzen 7 9800X3D', /\b9800x3d\b/i, 2971, 18751, 'https://browser.geekbench.com/processors/amd-ryzen-7-9800x3d'),
  cpu('Ryzen 9 9950X', /\b9950x\b/i, 3061, 26053, 'https://browser.geekbench.com/processors/amd-ryzen-9-9950x'),
  cpu('Ryzen 9 9900X', /\b9900x\b/i, 3030, 22410, 'https://browser.geekbench.com/processors/amd-ryzen-9-9900x'),
  cpu('Ryzen 7 9700X', /\b9700x\b/i, 3010, 17767, 'https://browser.geekbench.com/processors/amd-ryzen-7-9700x'),
  cpu('Ryzen 5 9600X', /\b9600x\b/i, 2912, 14259, 'https://browser.geekbench.com/processors/amd-ryzen-5-9600x'),
  cpu('Ryzen 7 7800X3D', /\b7800x3d\b/i, 2431, 15574, 'https://browser.geekbench.com/processors/amd-ryzen-7-7800x3d'),
  cpu('Ryzen 7 7700X', /\b7700x\b/i, 2454, 14449, 'https://browser.geekbench.com/processors/amd-ryzen-7-7700x'),
  cpu('Ryzen 7 7700', /\b7700\b/i, 2495, 15114, 'https://browser.geekbench.com/processors/amd-ryzen-7-7700'),
  cpu('Ryzen 5 7600X', /\b7600x\b/i, 2592, 13583, 'https://browser.geekbench.com/processors/amd-ryzen-5-7600x'),
  cpu('Ryzen 5 7600', /\b7600\b/i, 2484, 12979, 'https://browser.geekbench.com/processors/amd-ryzen-5-7600'),
  cpu('Ryzen 9 5950X', /\b5950x\b/i, 2083, 15331, 'https://browser.geekbench.com/processors/amd-ryzen-9-5950x'),
  cpu('Ryzen 9 5900X', /\b5900x\b/i, 2066, 14009, 'https://browser.geekbench.com/processors/amd-ryzen-9-5900x'),
  cpu('Ryzen 7 5800X3D', /\b5800x3d\b/i, 2013, 11807, 'https://browser.geekbench.com/processors/amd-ryzen-7-5800x3d'),
  cpu('Ryzen 7 5800X', /\b5800x\b/i, 2053, 11239, 'https://browser.geekbench.com/processors/amd-ryzen-7-5800x'),
  cpu('Ryzen 7 5700X', /\b5700x\b/i, 2031, 10800, 'https://browser.geekbench.com/processors/amd-ryzen-7-5700x'),
  cpu('Ryzen 5 5600X', /\b5600x\b/i, 2003, 9239, 'https://browser.geekbench.com/processors/amd-ryzen-5-5600x'),
  cpu('Ryzen 5 5600', /\b5600\b/i, 1930, 9167, 'https://browser.geekbench.com/processors/amd-ryzen-5-5600'),
  cpu('Ryzen 5 5500', /\b5500\b/i, 1752, 8167, 'https://browser.geekbench.com/processors/amd-ryzen-5-5500'),
  cpu('Core i9-14900K', /\bi9[ -]?14900k\b/i, 2668, 22178, 'https://browser.geekbench.com/processors/intel-core-i9-14900k'),
  cpu('Core i7-14700K', /\bi7[ -]?14700k\b/i, 2565, 20912, 'https://browser.geekbench.com/processors/intel-core-i7-14700k'),
  cpu('Core i5-14600K', /\bi5[ -]?14600k\b/i, 2512, 17154, 'https://browser.geekbench.com/processors/intel-core-i5-14600k'),
  cpu('Core i5-14400F', /\bi5[ -]?14400f\b/i, 2009, 10923, 'https://browser.geekbench.com/processors/intel-core-i5-14400f'),
  cpu('Core i9-13900K', /\bi9[ -]?13900k\b/i, 2619, 23105, 'https://browser.geekbench.com/processors/intel-core-i9-13900k'),
  cpu('Core i7-13700K', /\bi7[ -]?13700k\b/i, 2476, 19155, 'https://browser.geekbench.com/processors/intel-core-i7-13700k'),
  cpu('Core i5-13600K', /\bi5[ -]?13600k\b/i, 2308, 15584, 'https://browser.geekbench.com/processors/intel-core-i5-13600k'),
  cpu('Core i5-13400F', /\bi5[ -]?13400f\b/i, 2014, 11169, 'https://browser.geekbench.com/processors/intel-core-i5-13400f'),
];

// El índice previo RTX 4060 = 100 no conserva medición ni derivación verificable.
// No convertir la base de especificaciones de GPU en evidencia de rendimiento.
const GPU_BENCHMARKS: BenchmarkEntry[] = [];

// Estas familias tienen variantes de memoria. Sin una variante declarada en
// el dato de rendimiento, no trasladar su puntaje a cualquiera de ellas.
const MEMORY_VARIANT_CHIPS = new Set(['rtx3050', 'rtx3060', 'rtx4060ti', 'rtx5060ti', 'rx9060xt', 'rx580']);

function matchesCpuVariant(product: Pick<Product, 'name' | 'model'>, entry: PerformanceBenchmark): boolean {
  const expected = parseCpuModelSignature(entry.model);
  const declared = [parseCpuModelSignature(product.name), parseCpuModelSignature(product.model)].filter(value => value !== null);
  if (!expected || declared.length === 0) return false;
  return declared.every(chip => chip.number === expected.number
    && chip.suffixes.join('') === expected.suffixes.join('')
    && (chip.family === 'unknown' || chip.family === expected.family
      || (chip.family === 'ryzen' && expected.family.startsWith('ryzen'))));
}

function matchesGpuVariant(product: Pick<Product, 'name' | 'model'>, entry: PerformanceBenchmark): boolean {
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

// Esta guarda valida el contrato y la identidad; la constatación de la fuente
// sigue siendo editorial y debe quedar registrada en evidenceReference.
export function isPerformanceBenchmarkEvidenceValid(benchmark: PerformanceBenchmark, category: HardwareCategory): boolean {
  if (!benchmark.benchmarkVersion?.trim() || !benchmark.comparisonGroup?.trim()
    || !benchmark.evidenceReference?.trim() || !benchmark.methodology?.trim()
    || !/^\d{4}-\d{2}-\d{2}T/.test(benchmark.consultedAt)
    || !Number.isFinite(Date.parse(benchmark.consultedAt))
    || !Number.isFinite(benchmark.primaryScore) || benchmark.primaryScore <= 0
    || (benchmark.secondaryScore != null && (!Number.isFinite(benchmark.secondaryScore) || benchmark.secondaryScore <= 0))) return false;
  let modelUrl: URL;
  try {
    if (new URL(benchmark.sourceUrl).protocol !== 'https:') return false;
    modelUrl = new URL(benchmark.modelSourceUrl);
    if (modelUrl.protocol !== 'https:') return false;
  } catch { return false; }
  if (category === 'procesadores') {
    // La fuente debe aportar su propia firma; benchmark.model no puede suplirla.
    if (!matchesCpuVariant({ name: benchmark.sourceModel, model: benchmark.sourceModel }, benchmark)) return false;
    // Una URL Geekbench de otro modelo no acredita la fila de este procesador.
    return modelUrl.hostname !== 'browser.geekbench.com'
      || (/^\/processors\/[^/]+\/?$/.test(modelUrl.pathname)
        && matchesCpuVariant({ name: modelUrl.pathname.replaceAll('-', ' '), model: '' }, benchmark));
  }
  if (category !== 'tarjetas-graficas'
    || !matchesGpuVariant({ name: benchmark.sourceModel, model: benchmark.sourceModel }, benchmark)) return false;
  if (modelUrl.hostname === 'www.techpowerup.com' || modelUrl.hostname === 'techpowerup.com') {
    const sourceChip = parseGpuChipSignature(modelUrl.pathname.replaceAll('-', ' '));
    const expectedChip = parseGpuChipSignature(benchmark.model);
    return /^\/gpu-specs\/[^/]+\/?$/.test(modelUrl.pathname) && sourceChip !== null && expectedChip !== null
      && compactGpuChip(sourceChip) === compactGpuChip(expectedChip);
  }
  return true;
}

export function findPerformanceBenchmark(product: Pick<Product, 'name' | 'model' | 'category'>): PerformanceBenchmark | null {
  const entries = product.category === 'procesadores'
    ? CPU_BENCHMARKS
    : product.category === 'tarjetas-graficas' ? GPU_BENCHMARKS : [];
  const haystack = `${product.name} ${product.model}`;
  const match = entries.find((entry) => isPerformanceBenchmarkEvidenceValid(entry, product.category)
    && entry.pattern.test(haystack)
    && (product.category === 'tarjetas-graficas' ? matchesGpuVariant(product, entry) : matchesCpuVariant(product, entry)));
  if (!match) return null;
  const { pattern, ...benchmark } = match;
  void pattern;
  return benchmark;
}

export function supportsPerformanceBenchmarks(category: HardwareCategory): boolean {
  return category === 'procesadores' || category === 'tarjetas-graficas';
}
