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

    expect(metadata.alternates?.canonical).toBe('https://www.comparador-hardware.com.ar/comparar/procesadores');
    expect(metadata.title).toEqual({ absolute: 'Comparar procesadores: precios AMD e Intel | Comparador Hardware Argentina' });
    expect(metadata.description).toBe(
      'Compará procesadores AMD Ryzen e Intel Core entre tiendas de Argentina. Precio, stock y costo de plataforma antes de comprar.',
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

    expect(metadata.title).toEqual({ absolute: 'Comparar placas de video: precios RTX y Radeon | Comparador Hardware Argentina' });
    expect(metadata.description).toBe(
      'Compará placas de video NVIDIA RTX y AMD Radeon entre tiendas de Argentina. Precio, stock y VRAM del mismo chip.',
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

  it('mantiene canonical de categoria en page>1 y noindex', () => {
    const metadata = resolveSearchMetadata({
      query: '',
      category: 'procesadores',
      stores: [],
      sortBy: 'relevance',
      page: 2,
    });

    expect(metadata.alternates?.canonical).toBe('https://www.comparador-hardware.com.ar/comparar/procesadores');
    expect(metadata.title).toEqual({ absolute: 'Comparar procesadores: precios AMD e Intel | Comparador Hardware Argentina' });
    expect(metadata.robots).toMatchObject({ index: false, follow: true });
  });
});
