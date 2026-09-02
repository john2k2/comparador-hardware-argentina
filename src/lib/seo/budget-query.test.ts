import { describe, expect, it } from 'vitest';
import {
  BUILDER_BUDGET_MAX,
  BUILDER_BUDGET_MIN,
  parseBuilderBudgetPesos,
} from '@/lib/seo/budget-query';

describe('parseBuilderBudgetPesos', () => {
  it('acepta pesos enteros y el formato argentino con puntos', () => {
    expect(parseBuilderBudgetPesos('1500000')).toBe(1_500_000);
    expect(parseBuilderBudgetPesos('1.500.000')).toBe(1_500_000);
    expect(parseBuilderBudgetPesos('  2000000  ')).toBe(2_000_000);
  });

  it('rechaza vacio, basura y montos fuera de rango', () => {
    expect(parseBuilderBudgetPesos(undefined)).toBeNull();
    expect(parseBuilderBudgetPesos('')).toBeNull();
    expect(parseBuilderBudgetPesos('abc')).toBeNull();
    expect(parseBuilderBudgetPesos('100')).toBeNull();
    expect(parseBuilderBudgetPesos(String(BUILDER_BUDGET_MIN - 1))).toBeNull();
    expect(parseBuilderBudgetPesos(String(BUILDER_BUDGET_MAX + 1))).toBeNull();
  });

  it('toma el primer valor si viene repetido en la query', () => {
    expect(parseBuilderBudgetPesos(['1800000', '999'])).toBe(1_800_000);
  });
});
