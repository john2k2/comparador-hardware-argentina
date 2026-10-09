import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import { hydrateProducts } from '@/lib/product-serialization';
import { getRecentProductOffers } from '@/lib/product/product-page-metadata';
import auditRows from './search-dedupe-audit.fixture.json';
import { dedupeCpuSearchProducts, dedupeNearDuplicates, groupSearchProducts } from './search-dedupe';

// Las cuatro filas reales del GET público 09/10 16:37:22 UTC, sin nuevas fechas.
// Fuente: outputs/auditoria-web-2026-10-09/catalogo/cpu-search.json (principal).
const canonicalId = 'agrupado-procesadores-amd-ryzen-5-5600-1ru8te5';
function rows() { return hydrateProducts(auditRows as unknown as Product[]); }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T16:37:22Z')); });
afterEach(() => vi.useRealTimers());

describe('regresión de la búsqueda pública Ryzen 5600', () => {
  it.each([false, true])('agrupa tres títulos sin presentación y conserva BOX aparte, reversed=%s', (reverse) => {
    const input = reverse ? rows().reverse() : rows(); const snapshot = JSON.stringify(input);
    for (const dedupe of [dedupeCpuSearchProducts, dedupeNearDuplicates]) {
      const result = dedupe(input);
      expect(result).toHaveLength(2);
      const canonical = result.find(product => product.id === canonicalId)!;
      expect(canonical.name).toBe('Procesador Amd Ryzen 5 5600 6C/12T Sin Video');
      expect(canonical.lowestPrice).toBe(233700);
      expect(canonical.lowestPrice).toBe(getRecentProductOffers(canonical)[0].price);
      expect(canonical.prices.some(offer => offer.price === 229000)).toBe(true);
      expect(canonical.prices.find(offer => offer.price === 229000)!.lastUpdated.toISOString()).toContain('2026-09-22');
      expect(result.find(product => /BOX/.test(product.name))!.prices[0].price).toBe(287270.1);
    }
    expect(JSON.stringify(input)).toBe(snapshot);
  });
  it('no fusiona BOX/TRAY, refrigeración distinta ni presentación desconocida', () => {
    const base = rows()[1];
    const variants = ['AMD Ryzen 5 5600', 'AMD Ryzen 5 5600 BOX', 'AMD Ryzen 5 5600 TRAY',
      'AMD Ryzen 5 5600 con cooler', 'AMD Ryzen 5 5600 sin cooler'];
    const input = variants.map((name, index) => ({ ...base, id: `cpu-${index}`, name, model: name, prices: [] }));
    expect(dedupeCpuSearchProducts(input)).toHaveLength(5);
    expect(dedupeNearDuplicates(input.reverse())).toHaveLength(5);
    expect(groupSearchProducts(input, new Map(), [], '', 'procesadores')).toHaveLength(5);
  });
  it('normalizar el display no borra presentación ni cooler publicados', () => {
    const base = rows()[1];
    const input = ['AMD Ryzen 5 5600 BOX', 'AMD Ryzen 5 5600 TRAY'].map((name, index) => ({ ...base, id: `cpu-${index}`, name, model: name }));
    const normalized = new Map(input.map(product => [product.name, 'AMD Ryzen 5 5600']));
    expect(groupSearchProducts(input, normalized, [], '', 'procesadores')).toHaveLength(2);
  });
  it('una misma tienda conserva la publicación alternativa cuando la barata está pendiente', () => {
    const base = rows()[1]; const valid = base.prices.find(offer => offer.storeId === 'gamingcity')!;
    const bad = { ...valid, url: 'https://gamingcity.com.ar/ryzen-5-5600-tray-sin-cooler', price: 100,
      sourceIdentity: { title: 'CPU AMD Ryzen 5 5600 TRAY SIN COOLER', listingRef: 'gamingcity:id:123' } };
    const duplicate = { ...base, id: 'alias', prices: [bad] };
    const merged = dedupeCpuSearchProducts([duplicate, { ...base, prices: [valid] }])[0];
    expect(merged.prices).toHaveLength(2);
    expect(merged.lowestPrice).toBe(233700);
  });
});
