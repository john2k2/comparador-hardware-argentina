import { describe, expect, it } from 'vitest';
import { resolveSearchMetadata } from './search-page-metadata';

describe('search page metadata', () => {
  it('indexa solo la landing pura de categoria', () => {
    const metadata = resolveSearchMetadata({
      query: '',
      category: 'procesadores',
      stores: [],
      sortBy: 'relevance',
      page: 1,
    });

    expect(metadata.alternates?.canonical).toBe('https://www.comparador-hardware.com.ar/search?category=procesadores');
    expect(metadata.title).toEqual({ absolute: 'Procesadores AMD e Intel: precios | HardwareAR' });
    expect(metadata.description).toBe(
      'Compará precios de procesadores AMD Ryzen e Intel Core en tiendas de Argentina. Revisá stock, modelos y ofertas actuales antes de comprar.',
    );
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it('orienta la landing de placas de video a la consulta con mayor demanda', () => {
    const metadata = resolveSearchMetadata({
      query: '',
      category: 'tarjetas-graficas',
      stores: [],
      sortBy: 'relevance',
      page: 1,
    });

    expect(metadata.title).toEqual({ absolute: 'Placas de video RTX y Radeon: precios | HardwareAR' });
    expect(metadata.description).toBe(
      'Compará precios de placas de video NVIDIA GeForce RTX y AMD Radeon en Argentina. Encontrá stock y ofertas actuales en múltiples tiendas.',
    );
  });

  it('mantiene noindex en busquedas query-heavy', () => {
    const metadata = resolveSearchMetadata({
      query: 'rtx 5070',
      category: undefined,
      stores: [],
      sortBy: 'relevance',
      page: 1,
    });

    expect(metadata.alternates?.canonical).toBe('https://www.comparador-hardware.com.ar/search');
    expect(metadata.robots).toMatchObject({ index: false, follow: true });
  });
});
