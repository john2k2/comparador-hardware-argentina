import { describe, expect, it } from 'vitest';
import { parseListingFlags } from './listing-flags';

describe('parseListingFlags', () => {
  it('lee S/VIDEO y C/COOLER en un título de CPU argentino', () => {
    expect(parseListingFlags('AMD RYZEN 5 5500X3D S/VIDEO C/COOLER')).toEqual({
      integratedGraphics: false,
      coolerIncluded: true,
    });
  });

  it('lee SIN COOLER / WOF como cooler excluido', () => {
    expect(parseListingFlags('Ryzen 7 7700X WOF')).toEqual({
      integratedGraphics: null,
      coolerIncluded: false,
    });
    expect(parseListingFlags('Intel Core i5 14400 SIN COOLER')).toEqual({
      integratedGraphics: null,
      coolerIncluded: false,
    });
  });

  it('no inventa flags cuando el título no los declara', () => {
    expect(parseListingFlags('AMD Ryzen 5 7600X')).toEqual({
      integratedGraphics: null,
      coolerIncluded: null,
    });
  });
});
