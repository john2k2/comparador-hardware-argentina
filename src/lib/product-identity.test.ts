import { describe, expect, it } from 'vitest';
import {
  buildProductIdentityKey,
  buildProductVariantKey,
  extractExactModelIdentity,
  isBundleLikeTitle,
} from './product-identity';

describe('product identity', () => {
  it('preserves GPU variant from fallback context', () => {
    expect(
      buildProductIdentityKey(
        'tarjetas-graficas',
        'MSI RTX 5060 8GB',
        'MSI RTX 5060 Shadow 2X OC 8GB',
      ),
    ).toBe('tarjetas-graficas::gpu:rtx5060:8gb:msi:shadow');

    expect(
      buildProductIdentityKey(
        'tarjetas-graficas',
        'MSI RTX 5060 8GB',
        'MSI RTX 5060 Ventus 2X OC 8GB',
      ),
    ).toBe('tarjetas-graficas::gpu:rtx5060:8gb:msi:ventus');
  });

  it('keeps close peripheral variants separated', () => {
    expect(
      buildProductIdentityKey(
        'perifericos',
        'Mouse Logitech G502',
        'Mouse Logitech G502 X Gaming Black',
      ),
    ).toBe('perifericos::generic:logitech:mouse:g502-g502-x');

    expect(
      buildProductIdentityKey(
        'perifericos',
        'Mouse Logitech G502',
        'Mouse Logitech G502 Hero',
      ),
    ).toBe('perifericos::generic:logitech:mouse:g502-g502-hero');
  });

  it('marks bundles separately from single products', () => {
    expect(isBundleLikeTitle('Logitech MK120 Combo Teclado + Mouse')).toBe(true);
    expect(
      buildProductVariantKey(
        'perifericos',
        'Logitech MK120 Combo Teclado + Mouse',
      ),
    ).toBe('perifericos::bundle');
  });

  it('extracts exact identities only for non-bundle titles', () => {
    expect(
      extractExactModelIdentity('perifericos', 'Mouse Logitech G502 X Gaming Black'),
    ).toBe('generic:logitech:mouse:g502-g502-x');

    expect(
      extractExactModelIdentity('perifericos', 'Logitech MK120 Combo Teclado + Mouse'),
    ).toBeNull();
  });
});
