import { describe, expect, it } from 'vitest';
import type { HardwareCategory, Product } from '@/lib/types';
import { CATALOG_OFFER_FRESH_MS, OFFER_FRESH_MS } from '@/lib/price-freshness';
import { compareProducts } from './dynamic-comparison';

function product(id: string, price: number, specs: Record<string, string> = {}, category: HardwareCategory = 'procesadores'): Product {
  const now = new Date();
  return {
    id, name: id, category, brand: 'Marca', model: id, specs,
    prices: [{ storeId: 'mexx', storeName: 'Mexx', url: `https://www.mexx.com.ar/product/${id.toLowerCase().replaceAll(' ', '-')}`, price, stock: 'in-stock', installment: null, lastUpdated: now }],
    lowestPrice: price, highestPrice: price, averagePrice: price, createdAt: now, updatedAt: now,
  };
}

describe('compareProducts', () => {
  it('no recomienda por precio ni rendimiento por peso con una referencia de más de 3 h', () => {
    const left = { ...product('RTX 4060',400_000,{},'tarjetas-graficas'),model:'RTX 4060' };
    const right = { ...product('RX 7600',300_000,{},'tarjetas-graficas'),model:'RX 7600' };
    right.prices[0].lastUpdated = new Date(Date.now()-OFFER_FRESH_MS-60_000);
    const result = compareProducts(left,right);
    expect(result.rightPrice).toBe(300_000);
    expect(result.difference).toBe(100_000);
    expect(result.rightOffers).toHaveLength(1);
    expect(result.cheaperProductId).toBeNull();
    expect(result.valueWinnerProductId).toBeNull();
    expect(result.recommendation).toContain('últimas tres horas');
    expect(result.evidence.join(' ')).toContain('referencias del catálogo');
  });
  it('calcula diferencia de precio sin convertirla en benchmark', () => {
    const result = compareProducts(product('Ryzen A', 100_000), product('Ryzen B', 125_000));
    expect(result.cheaperProductId).toBe('Ryzen A');
    expect(result.difference).toBe(25_000);
    expect(result.differencePercent).toBe(25);
    expect(result.recommendation).toContain('no prueba mejor rendimiento por peso');
  });

  it('no usa el puntaje de RTX 3050 8 GB para recomendar la variante de 6 GB', () => {
    const result = compareProducts(product('RTX 3050 6GB', 100_000, {}, 'tarjetas-graficas'),
      product('RTX 4060 8GB', 300_000, {}, 'tarjetas-graficas'), 'gaming');
    expect(result.leftPrice).toBe(100_000);
    expect(result.leftBenchmark).toBeNull();
    expect(result.leftMetricScore).toBeNull();
    expect(result.valueWinnerProductId).toBeNull();
    expect(result.recommendation).not.toContain('conviene más');
    expect(result.evidence.join(' ')).toContain('No hay benchmarks compatibles');
  });

  it('descarta una presentación contradictoria antes de elegir la oferta de cada tienda', () => {
    const left = product('AMD Ryzen 5 5500 con Wraith Stealth', 100_000);
    left.prices[0].url = 'https://www.mexx.com.ar/product/ryzen-5-5500-sin-cooler';
    left.prices.push({ ...left.prices[0], price: 300_000, url: 'https://www.mexx.com.ar/product/ryzen-5-5500-con-wraith-stealth' });
    const right = product('AMD Ryzen 5 5600 con Wraith Stealth', 200_000);
    const result = compareProducts(left, right, 'gaming');
    expect(result.leftPrice).toBe(300_000);
    expect(result.leftOffers).toEqual([{ store: 'Mexx', price: 300_000 }]);
    expect(result.cheaperProductId).toBe(right.id);
    expect(left.prices).toHaveLength(2);
  });

  it('expone diferencias de plataforma para CPUs', () => {
    const result = compareProducts(product('CPU A', 100_000, { socket: 'AM4' }), product('CPU B', 120_000, { socket: 'AM5' }));
    expect(result.evidence.join(' ')).toContain('sockets distintos');
    expect(result.specificationRows).toContainEqual({ label: 'Socket', left: 'AM4', right: 'AM5' });
  });

  it('no recomienda por rendimiento cuando el modelo CPU contradice el nombre', () => {
    const left = { ...product('AMD Ryzen 5 5600', 200_000), model: 'Ryzen 5 7600' };
    const result = compareProducts(left, product('AMD Ryzen 5 5500', 200_000), 'productividad');
    expect(result.leftBenchmark).toBeNull();
    expect(result.valueWinnerProductId).toBeNull();
    expect(result.recommendation).not.toContain('conviene más');
  });

  it('ignora ofertas pendientes de validar identidad', () => {
    const left = product('GPU A', 100_000, {}, 'tarjetas-graficas');
    left.prices[0].identityReview = { status: 'pending', confidence: 0.2, reasons: ['modelo dudoso'] };
    const result = compareProducts(left, product('GPU B', 120_000, {}, 'tarjetas-graficas'));
    expect(result.leftPrice).toBeNull();
    expect(result.cheaperProductId).toBeNull();
  });

  it('recomienda por rendimiento por peso cuando hay evidencia para ambos modelos', () => {
    const result = compareProducts(
      { ...product('RTX 4060', 400_000, {}, 'tarjetas-graficas'), model: 'RTX 4060' },
      { ...product('RX 7600', 300_000, {}, 'tarjetas-graficas'), model: 'RX 7600' },
    );
    expect(result.leftBenchmark?.primaryScore).toBe(100);
    expect(result.rightBenchmark?.primaryScore).toBe(94);
    expect(result.valueWinnerProductId).toBe('RX 7600');
    expect(result.recommendation).toContain('rendimiento gráfico relativo por peso');
  });

  it('cambia la métrica según el uso y evita tratar Geekbench como FPS', () => {
    const left = { ...product('Ryzen 5 5600', 180_000), model: 'Ryzen 5 5600' };
    const right = { ...product('Ryzen 7 5700X', 240_000), model: 'Ryzen 7 5700X' };
    const daily = compareProducts(left, right, 'uso-diario');
    const gaming = compareProducts(left, right, 'gaming');

    expect(daily.metricLabel).toBe('rendimiento de un núcleo');
    expect(daily.valueWinnerProductId).not.toBeNull();
    expect(gaming.metricLabel).toBeNull();
    expect(gaming.valueWinnerProductId).toBeNull();
    expect(gaming.evidence.join(' ')).toContain('no usamos Geekbench como si fueran FPS');
  });

  it('no usa raster como benchmark de producción con GPU', () => {
    const result = compareProducts(
      { ...product('RTX 4060', 400_000, {}, 'tarjetas-graficas'), model: 'RTX 4060' },
      { ...product('RX 7600', 300_000, {}, 'tarjetas-graficas'), model: 'RX 7600' },
      'productividad',
    );
    expect(result.valueWinnerProductId).toBeNull();
    expect(result.evidence.join(' ')).toContain('aplicación concreta');
  });

  it('no declara un ganador por precio con una oferta antigua', () => {
    const left = product('GPU A', 100_000, {}, 'tarjetas-graficas');
    left.prices[0].lastUpdated = new Date(Date.now() - CATALOG_OFFER_FRESH_MS - 1);
    const result = compareProducts(left, product('GPU B', 120_000, {}, 'tarjetas-graficas'));

    expect(result.leftPrice).toBeNull();
    expect(result.difference).toBeNull();
    expect(result.cheaperProductId).toBeNull();
    expect(result.recommendation).toContain('precios recientes');
  });
});
