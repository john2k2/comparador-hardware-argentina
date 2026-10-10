import { describe, expect, it } from 'vitest';
import { findPerformanceBenchmark, isPerformanceBenchmarkEvidenceValid } from './performance-benchmarks';

const cpu = (name: string, model = name) => ({ name, model, category: 'procesadores' as const });

// Corte independiente observado en las dos series del chart de Primate Labs.
describe('findPerformanceBenchmark', () => {
  it.each([
    ['AMD Ryzen 5 7600', 2484, 12979, 'amd-ryzen-5-7600'],
    ['AMD Ryzen 5 7600X', 2592, 13583, 'amd-ryzen-5-7600x'],
    ['AMD Ryzen 5 5600', 1930, 9167, 'amd-ryzen-5-5600'],
  ] as const)('usa el corte de las dos series del modelo exacto %s', (name, single, multi, slug) => {
    const benchmark = findPerformanceBenchmark(cpu(name));
    expect(benchmark).toMatchObject({
      sourceModel: name, primaryScore: multi, secondaryScore: single,
      benchmarkVersion: 'Geekbench 7', sourceUrl: 'https://browser.geekbench.com/processor-benchmarks',
      modelSourceUrl: `https://browser.geekbench.com/processors/${slug}`,
      consultedAt: '2026-10-10T01:19:01.876Z',
      comparisonGroup: 'geekbench-7-processor-chart-2026-10-09',
      evidenceReference: 'docs/reports/benchmarks-maximus-2026-10-09/benchmarks.md',
    });
    expect(benchmark?.primaryLabel).toContain('Geekbench 7');
    expect(benchmark?.methodology).toContain('no FPS');
  });

  it.each([
    ['AMD Ryzen 5 5600', 'Ryzen 5 7600'],
    ['AMD Ryzen 5 7600', '7600X'],
    ['Intel Core i5-14400F', 'Core i5-14600K'],
  ])('no traslada un benchmark entre nombre y modelo contradictorios: %s / %s', (name, model) => {
    expect(findPerformanceBenchmark(cpu(name, model))).toBeNull();
  });

  it.each([
    ['AMD Ryzen 5 5600', '5600', 'Ryzen 5 5600'],
    ['AMD Ryzen 5 7600X AM5', '7600X', 'Ryzen 5 7600X'],
    ['Intel Core i5-14400F', '14400F', 'Core i5-14400F'],
  ])('conserva una firma CPU abreviada compatible: %s / %s', (name, model, expected) => {
    expect(findPerformanceBenchmark(cpu(name, model))?.model).toBe(expected);
  });

  it.each(['Ryzen 7 9800X3D', 'Ryzen 9 9950X', 'Ryzen 9 9900X', 'Ryzen 7 9700X', 'Ryzen 5 9600X',
    'Ryzen 7 7800X3D', 'Ryzen 7 7700X', 'Ryzen 7 7700', 'Ryzen 5 7600X', 'Ryzen 5 7600',
    'Ryzen 9 5950X', 'Ryzen 9 5900X', 'Ryzen 7 5800X3D', 'Ryzen 7 5800X', 'Ryzen 7 5700X',
    'Ryzen 5 5600X', 'Ryzen 5 5600', 'Ryzen 5 5500', 'Core i9-14900K', 'Core i7-14700K',
    'Core i5-14600K', 'Core i5-14400F', 'Core i9-13900K', 'Core i7-13700K', 'Core i5-13600K', 'Core i5-13400F'])
  ('conserva procedencia del modelo exacto y versión en %s', model => {
    const benchmark = findPerformanceBenchmark(cpu(model));
    expect(benchmark).not.toBeNull();
    expect(isPerformanceBenchmarkEvidenceValid(benchmark!, 'procesadores')).toBe(true);
    expect(benchmark?.sourceModel).toBe(`${model.startsWith('Core ') ? 'Intel' : 'AMD'} ${model}`);
    expect(benchmark?.modelSourceUrl).toBe(`https://browser.geekbench.com/processors/${benchmark!.sourceModel.toLowerCase().replaceAll(' ', '-')}`);
  });

  it.each(['RTX 5090', 'RTX 4090', 'RTX 5080', 'RTX 4080 SUPER', 'RX 7900 XTX', 'RTX 5070 Ti',
    'RX 9070 XT', 'RX 7900 XT', 'RTX 4070 Ti SUPER', 'RX 9070', 'RTX 5070', 'RTX 4070 SUPER',
    'RTX 4070', 'RX 7800 XT', 'RTX 5060 Ti', 'RX 7700 XT', 'RX 9060 XT', 'RTX 4060 Ti',
    'RTX 5060', 'RTX 3060 Ti', 'RX 7600 XT', 'RTX 4060', 'Arc B580', 'RX 7600', 'RTX 3060 12GB',
    'RX 6700 XT', 'RX 6600 XT', 'RX 6600', 'RTX 3050 8GB', 'RX 580', 'RTX 3050 6GB',
    'RTX 3060 8GB', 'RTX 4090 Laptop 16GB', 'RX 580 2048SP 8GB'])
  ('se abstiene del índice GPU sin derivación y contexto verificables: %s', name => {
    expect(findPerformanceBenchmark({ name, model: name, category: 'tarjetas-graficas' })).toBeNull();
  });

  it('se abstiene ante categorías ajenas o modelos no cubiertos', () => {
    expect(findPerformanceBenchmark({ name: 'Mother B650 7600', model: 'B650', category: 'motherboards' })).toBeNull();
    expect(findPerformanceBenchmark(cpu('Ryzen 5 7500F'))).toBeNull();
  });
});

describe('contrato de procedencia de benchmark', () => {
  const verified = () => findPerformanceBenchmark(cpu('AMD Ryzen 5 7600'))!;
  it.each([
    { sourceModel: '' },
    { sourceModel: 'not a CPU' },
    { modelSourceUrl: 'https://browser.geekbench.com/processor-benchmarks' },
    { modelSourceUrl: 'https://browser.geekbench.com/processors/no-real-cpu' },
  ])('no usa la identidad del benchmark para compensar una fuente sin firma: %o', invalidSource => {
    expect(isPerformanceBenchmarkEvidenceValid({ ...verified(), ...invalidSource }, 'procesadores')).toBe(false);
  });
  it('rechaza un modelo de fuente parseable pero incorrecto aunque el nombre del benchmark sea válido', () => {
    expect(isPerformanceBenchmarkEvidenceValid({ ...verified(), sourceModel: 'AMD Ryzen 5 5600' }, 'procesadores')).toBe(false);
  });
  it.each([
    { sourceModel: '' },
    { sourceModel: 'not a GPU' },
    { modelSourceUrl: 'https://www.techpowerup.com/gpu-specs/' },
    { modelSourceUrl: 'https://www.techpowerup.com/gpu-specs/geforce-rtx-3060.c3682' },
  ])('exige también la firma propia de la fuente y del enlace nominal GPU: %o', invalidSource => {
    // Sólo fixture del contrato: no incorpora evidencia GPU al catálogo real.
    const fixture = { ...verified(), model: 'RTX 3050 8GB', sourceModel: 'RTX 3050 8GB',
      benchmarkVersion: 'fixture-v1', comparisonGroup: 'fixture-gpu', sourceName: 'Fixture GPU',
      modelSourceUrl: 'https://www.techpowerup.com/gpu-specs/geforce-rtx-3050-8-gb.c3858' };
    expect(isPerformanceBenchmarkEvidenceValid(fixture, 'tarjetas-graficas')).toBe(true);
    expect(isPerformanceBenchmarkEvidenceValid({ ...fixture, ...invalidSource }, 'tarjetas-graficas')).toBe(false);
  });
  it('rechaza una página o fila de fuente de otra variante aunque el producto sea 7600', () => {
    expect(isPerformanceBenchmarkEvidenceValid({ ...verified(), modelSourceUrl: 'https://browser.geekbench.com/processors/amd-ryzen-5-7600x' }, 'procesadores')).toBe(false);
    expect(isPerformanceBenchmarkEvidenceValid({ ...verified(), sourceModel: 'AMD Ryzen 5 7600X' }, 'procesadores')).toBe(false);
  });
  it.each(['benchmarkVersion', 'evidenceReference', 'comparisonGroup', 'methodology', 'consultedAt'] as const)
  ('rechaza una entrada que carece de %s', field => {
    expect(isPerformanceBenchmarkEvidenceValid({ ...verified(), [field]: '' }, 'procesadores')).toBe(false);
  });
  it.each([0, -1, NaN, Infinity])('rechaza un puntaje inválido %s', primaryScore => {
    expect(isPerformanceBenchmarkEvidenceValid({ ...verified(), primaryScore }, 'procesadores')).toBe(false);
  });
});
