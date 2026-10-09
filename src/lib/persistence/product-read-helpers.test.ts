import { describe, expect, it } from 'vitest';
import {
  applySharedProductFilters,
  buildSearchOrFilter,
  buildGuideSearchOrFilter,
  clampLimit,
  sanitizeSearchTerm,
} from '@/lib/persistence/product-read-helpers';

describe('product-read-helpers', () => {
  it.each([
    ['procesador 5500', '5500'],
    ['memoria ram ddr4', 'ddr4'],
    ['disco solido nv3', 'nv3'],
    ['asrock b550m hdv', 'b550m'],
    ['ryzen 5', null],
    ['procesadores amd', null],
  ])('prefiltra %s sin depender de sinónimos alfabéticos', (query, token) => {
    const filter = buildGuideSearchOrFilter(query)!;
    if (token) expect(filter).toContain(`catalog_document.ilike.%${token}%`);
    else expect(filter).not.toContain('catalog_document');
    for (const term of query.split(' ')) {
      expect(filter).toContain(`canonical_product_key.ilike.%${term}%`);
      expect(filter).toContain(`name.ilike.%${term}%`);
    }
  });

  it('clamps limits and sanitizes search text', () => {
    expect(clampLimit()).toBe(240);
    expect(clampLimit(99999)).toBe(1200);
    expect(clampLimit(12.8)).toBe(12);
    expect(sanitizeSearchTerm("RTX 5070,(OC)%")).toBe('RTX 5070 OC');
  });

  it('builds the OR filter expression used by DB-first queries', () => {
    expect(buildSearchOrFilter('ryzen 7600')).toContain('name.ilike.%7600%');
    expect(buildSearchOrFilter('ryzen 7600')).toContain('variant_key.ilike.%7600%');
    expect(buildSearchOrFilter('ryzen 7600')).not.toContain('%ryzen 7600%');
  });

  it('applies shared filters without changing call order semantics', () => {
    const calls: string[] = [];
    const builder = {
      eq(column: string, value: string) {
        calls.push(`eq:${column}:${value}`);
        return this;
      },
      gte(column: string, value: number) {
        calls.push(`gte:${column}:${value}`);
        return this;
      },
      lte(column: string, value: number) {
        calls.push(`lte:${column}:${value}`);
        return this;
      },
      or(expression: string) {
        calls.push(`or:${expression}`);
        return this;
      },
    };

    applySharedProductFilters(builder, {
      category: 'procesadores',
      minPrice: 100,
      maxPrice: 500,
      searchTerm: 'ryzen',
    });

    expect(calls).toEqual([
      'eq:category:procesadores',
      'gte:lowest_price:100',
      'lte:lowest_price:500',
      'or:name.ilike.%ryzen%,brand.ilike.%ryzen%,model.ilike.%ryzen%,normalized_title.ilike.%ryzen%,family_key.ilike.%ryzen%,variant_key.ilike.%ryzen%',
    ]);
  });
});
