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

  it.each([
    ['AMD Ryzen 5 5600', 'Ryzen 5 7600'],
    ['AMD Ryzen 5 7600', '7600X'],
    ['Intel Core i5-14400F', 'Core i5-14600K'],
  ])('no traslada un benchmark entre nombres y modelos CPU contradictorios: %s / %s', (name, model) => {
    expect(findPerformanceBenchmark({ name, model, category: 'procesadores' })).toBeNull();
  });

  it.each([
    ['AMD Ryzen 5 5600', '5600', 'Ryzen 5 5600'],
    ['AMD Ryzen 5 7600X AM5', '7600X', 'Ryzen 5 7600X'],
    ['Intel Core i5-14400F', '14400F', 'Core i5-14400F'],
  ])('conserva una firma CPU abreviada compatible: %s / %s', (name, model, expected) => {
    expect(findPerformanceBenchmark({ name, model, category: 'procesadores' })?.model).toBe(expected);
  });

  it.each(['RTX 3050 6GB', 'RTX 3050', 'RTX 3060 8GB', 'RTX 3060', 'RTX 4070 Ti 12GB',
    'RTX 4090 Laptop 16GB', 'RTX 4060 Ti 16GB', 'RTX 5060 Ti 8GB', 'RX 9060 XT 16GB', 'RX 580 2048SP 8GB'])
  ('no asigna un índice de otra variante a %s', name => {
    expect(findPerformanceBenchmark({ name, model: name, category: 'tarjetas-graficas' })).toBeNull();
  });

  it.each(['RTX 3050 8GB', 'RTX 3060 12GB'])('conserva el índice cuando la memoria declarada coincide: %s', name => {
    expect(findPerformanceBenchmark({ name: `MSI ${name} Ventus`, model: name, category: 'tarjetas-graficas' })?.model).toBe(name);
  });

  it.each([
    ['RTX 3050 6GB', 'RTX 3050 8GB'],
    ['RTX 3060 12GB', 'RTX 3060 Ti'],
    ['RTX 4070 Ti SUPER 16GB', 'RTX 4070'],
  ])('se abstiene si nombre y modelo se contradicen: %s / %s', (name, model) => {
    expect(findPerformanceBenchmark({ name, model, category: 'tarjetas-graficas' })).toBeNull();
  });
});
