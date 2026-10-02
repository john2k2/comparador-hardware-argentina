import { describe, expect, it } from 'vitest';
import { mapCompraGamerProduct, matchesCompraGamerProductQuery, normalizeCompraGamerText } from './compragamer-mapper';
import type { CompraGamerProductResponse } from './compragamer-catalog';

function buildRawProduct(overrides: Partial<CompraGamerProductResponse> = {}): CompraGamerProductResponse {
  return {
    id_producto: 12345,
    nombre: 'Placa de video ASUS RTX 5070 Ti',
    precioEspecial: '1249999',
    precioLista: '1299999',
    stock: 2,
    vendible: 1,
    id_subcategoria: 8,
    id_marca: 12,
    codigo_principal: ['SKU: RTX5070TI'],
    garantia: 36,
    imagenes: [{ nombre: 'rtx5070ti' }],
    ...overrides,
  };
}

describe('compragamer-mapper', () => {
  it.each([
    ['Notebook HP Core i7 16GB DDR4', 'computadoras'],
    ['Memoria notebook DDR4 16GB', 'memoria-ram'],
    ['CPU Cooler compatible con Ryzen 7600', 'refrigeracion'],
    ['Router Tp-Link Archer AX3000', 'perifericos'],
    ['Pasta Termica ID-Cooling Frost X25 4g', 'refrigeracion'],
  ])('clasifica la función principal del producto: %s', (nombre, category) => {
    const mapped = mapCompraGamerProduct({ item: buildRawProduct({ nombre }), subcategoryMap: new Map(), brandMap: new Map() });
    expect(mapped?.category).toBe(category);
  });
  it.each([['ARMADO DE PC ASUS',1750],['Usar Cooler CPU incluido en el procesador Intel',0]])('no fabrica un producto comprable para %s', (nombre,precioEspecial)=>{
    expect(mapCompraGamerProduct({item:buildRawProduct({nombre,precioEspecial}),subcategoryMap:new Map(),brandMap:new Map()})).toBeNull();
  });
  it('conserva la hora de observación del catálogo al mapear una respuesta cacheada', () => {
    const observedAt = new Date('2026-09-29T12:00:00Z');
    const mapped = mapCompraGamerProduct({ item: buildRawProduct({ observedAt }),
      subcategoryMap: new Map(), brandMap: new Map() });
    expect(mapped?.prices[0].lastUpdated).toEqual(observedAt);
  });
  it('normaliza queries y encuentra coincidencias por texto o id', () => {
    const product = buildRawProduct();
    expect(normalizeCompraGamerText('  RTX 5070   Ti  ')).toBe('rtx 5070 ti');
    expect(matchesCompraGamerProductQuery(product, 'rtx 5070 ti')).toBe(true);
    expect(matchesCompraGamerProductQuery(product, '12345')).toBe(true);
  });

  it('mapea productos crudos de CompraGamer a productos sanitizados del dominio', () => {
    const mapped = mapCompraGamerProduct({
      item: buildRawProduct(),
      subcategoryMap: new Map([[8, 'tarjetas-graficas']]),
      brandMap: new Map([[12, 'ASUS']]),
    });

    expect(mapped).not.toBeNull();
    expect(mapped?.id).toBe('cg-12345');
    expect(mapped?.category).toBe('tarjetas-graficas');
    expect(mapped?.brand).toBe('ASUS');
    expect(mapped?.prices[0].price).toBe(1_249_999);
    expect(mapped?.prices[0].stock).toBe('low-stock');
    expect(mapped?.image).toBe('https://imagenes.compragamer.com/productos/compragamer_Imganen_general_rtx5070ti-med.jpg');
    expect(mapped?.specs).toMatchObject({
      SKU: 'RTX5070TI',
      Garantia: '36 meses',
      Stock: '2',
    });
  });
});
