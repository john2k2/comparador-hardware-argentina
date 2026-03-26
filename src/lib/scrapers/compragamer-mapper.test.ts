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
    expect(mapped?.specs).toMatchObject({
      SKU: 'RTX5070TI',
      Garantia: '36 meses',
      Stock: '2',
    });
  });
});
