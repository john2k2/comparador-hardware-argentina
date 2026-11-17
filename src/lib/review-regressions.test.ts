import { describe, expect, it } from 'vitest';
import { resolveSafeNextPath } from '@/lib/client/auth';
import { buildProductIdentityKey, extractCpuModelKey, parseGpuChipSignature } from '@/lib/product-identity';
import { parseScrapedArsPrice } from '@/lib/scrapers/scraper-helpers';
import { matchesSearchQueryIntent } from '@/lib/search/search-ranking';

// Regresiones de la revisión del 16/11/2026.
describe('regresiones de la revisión', () => {
  it('un CPU Intel sin "Core" conserva su modelo y no se fusiona con otro', () => {
    expect(extractCpuModelKey('Procesador Intel i5 12400 LGA1700')).toBe('cpu:corei512400');
    expect(extractCpuModelKey('Procesador Intel Core i5 12400 LGA1700')).toBe('cpu:corei512400');
    expect(buildProductIdentityKey('procesadores', 'Procesador Intel i5 12400 LGA1700'))
      .not.toBe(buildProductIdentityKey('procesadores', 'Procesador Intel i5 13400 LGA1700'));
  });

  it('"RTX 4070 S" es una Super y la 4070 normal no cambia', () => {
    expect(parseGpuChipSignature('Placa de video RTX 4070 S 12GB')?.suffixes).toEqual(['super']);
    expect(parseGpuChipSignature('Placa de video RTX 4070 Ti S 16GB')?.suffixes).toEqual(['ti', 'super']);
    expect(parseGpuChipSignature('Placa de video RTX 4070 12GB')?.suffixes).toEqual([]);
  });

  it('una consulta con metacaracteres no lanza al evaluar la intención', () => {
    expect(() => matchesSearchQueryIntent('Mouse Logitech G502 Hero', 'logitech g502 hero a1++ x')).not.toThrow();
    expect(() => matchesSearchQueryIntent('Mouse Logitech G502 Hero', 'g502 (x) [a] c++ z')).not.toThrow();
  });

  it('el parser compartido de los scrapers no infla decimales largos ni centavos', () => {
    expect(parseScrapedArsPrice('248496.000000')).toBe(248_496);
    expect(parseScrapedArsPrice('$ 248.496,50')).toBe(248_497);
    expect(parseScrapedArsPrice('$ 248.496')).toBe(248_496);
    expect(parseScrapedArsPrice(248496)).toBe(248_496);
    expect(parseScrapedArsPrice('')).toBe(0);
  });

  it('el destino post-login no acepta barras invertidas ni caracteres de control', () => {
    expect(resolveSafeNextPath('/\\evil.com')).toBe('/');
    expect(resolveSafeNextPath('/%5Cevil.com')).toBe('/');
    expect(resolveSafeNextPath('/%09/evil.com')).toBe('/');
    expect(resolveSafeNextPath('/search?q=rtx')).toBe('/search?q=rtx');
  });
});
