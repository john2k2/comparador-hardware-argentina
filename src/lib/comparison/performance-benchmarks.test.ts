import { describe, expect, it } from 'vitest';
import { findPerformanceBenchmark } from './performance-benchmarks';

describe('findPerformanceBenchmark', () => {
  it('prioriza variantes específicas de GPU', () => {
    expect(findPerformanceBenchmark({ name: 'ASUS RTX 4070 Ti SUPER 16GB', model: 'RTX 4070 Ti Super', category: 'tarjetas-graficas' })?.model)
      .toBe('RTX 4070 Ti SUPER');
    expect(findPerformanceBenchmark({ name: 'Sapphire RX 7900 XTX', model: 'RX 7900 XTX', category: 'tarjetas-graficas' })?.model)
      .toBe('RX 7900 XTX');
  });

  it('distingue CPUs parecidos y no asigna datos a categorías ajenas', () => {
    expect(findPerformanceBenchmark({ name: 'AMD Ryzen 5 7600X AM5', model: '7600X', category: 'procesadores' })?.primaryScore)
      .toBe(13677);
    expect(findPerformanceBenchmark({ name: 'AMD Ryzen 5 7600', model: '7600', category: 'procesadores' })?.primaryScore)
      .toBe(13135);
    expect(findPerformanceBenchmark({ name: 'Mother B650 7600', model: 'B650', category: 'motherboards' })).toBeNull();
  });

  it('se abstiene ante un modelo no cubierto', () => {
    expect(findPerformanceBenchmark({ name: 'GPU futura desconocida', model: 'XYZ', category: 'tarjetas-graficas' })).toBeNull();
  });
});
