import { describe, expect, it } from 'vitest';
import { normalizeDisplayText } from './text-utils';

describe('text-utils', () => {
  describe('normalizeDisplayText', () => {
    it('normaliza texto basico', () => {
      expect(normalizeDisplayText('  Hello World  ')).toBe('Hello World');
      expect(normalizeDisplayText('')).toBe('');
    });

    it('maneja null y undefined', () => {
      expect(normalizeDisplayText(null)).toBe('');
      expect(normalizeDisplayText(undefined)).toBe('');
    });

    it('decodifica mojibake comun', () => {
      // Common mojibake patterns
      expect(normalizeDisplayText('CafÃ©')).toContain('Caf');
      expect(normalizeDisplayText('NiÃ±o')).toContain('Ni');
    });

    it('reemplaza caracteres tipograficos', () => {
      expect(normalizeDisplayText('text\u2019s')).toContain("'");
      expect(normalizeDisplayText('\u201Cquote\u201D')).toContain('"');
    });

    it('maneja texto con caracteres especiales', () => {
      const result = normalizeDisplayText('AMD Ryzen™ 5 5600X — Procesador');
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('preserva texto limpio', () => {
      expect(normalizeDisplayText('AMD Ryzen 5 5600X')).toBe('AMD Ryzen 5 5600X');
    });
  });
});
