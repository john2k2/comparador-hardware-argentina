import { describe, expect, it } from 'vitest';
import {
  buildProductIdentityKey,
  buildProductVariantKey,
  extractExactModelIdentity,
  extractGpuModelKey,
  isBundleLikeTitle,
  isCompleteComputerTitle,
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
    expect(isBundleLikeTitle('PC Armada Ryzen 5 9600X 32GB RTX 5070')).toBe(true);
    expect(isBundleLikeTitle('PC Creadores Intel Ultra 7 RTX 4070')).toBe(true);
    expect(isBundleLikeTitle('Computadora de escritorio Ryzen 7')).toBe(true);
  });

  it('extracts exact identities only for non-bundle titles', () => {
    expect(
      extractExactModelIdentity('perifericos', 'Mouse Logitech G502 X Gaming Black'),
    ).toBe('generic:logitech:mouse:g502-g502-x');

    expect(
      extractExactModelIdentity('perifericos', 'Logitech MK120 Combo Teclado + Mouse'),
    ).toBeNull();
  });

  it('keeps 4070 Ti Super and 7900 XTX distinct from their shorter siblings', () => {
    expect(extractGpuModelKey('ASUS RTX 4070 Ti 12GB')).toBe('gpu:rtx4070ti:12gb:asus:base');
    expect(extractGpuModelKey('ASUS RTX 4070 Ti Super 16GB')).toBe('gpu:rtx4070tisuper:16gb:asus:base');
    expect(extractGpuModelKey('Sapphire RX 7900 XT 20GB')).toBe('gpu:rx7900xt:20gb:sapphire:base');
    expect(extractGpuModelKey('Sapphire RX 7900 XTX 24GB')).toBe('gpu:rx7900xtx:24gb:sapphire:base');
  });

  it('separates RAM by form factor and family', () => {
    expect(buildProductIdentityKey('memoria-ram', 'Corsair Vengeance 16GB DDR5 SODIMM'))
      .not.toBe(buildProductIdentityKey('memoria-ram', 'Corsair Vengeance 16GB DDR5 DIMM'));
    expect(buildProductIdentityKey('memoria-ram', 'Kingston Fury Beast 32GB DDR5 5600'))
      .not.toBe(buildProductIdentityKey('memoria-ram', 'Kingston Fury Impact 32GB DDR5 5600 SODIMM'));
    expect(buildProductIdentityKey('memoria-ram', 'Kingston Fury Beast 32GB DDR5 5600'))
      .toContain('beast');
    expect(buildProductIdentityKey('memoria-ram', 'Kingston Fury Impact 32GB DDR5 5600 SODIMM'))
      .toContain('sodimm');
  });

  it('detects complete PCs that start with PC plus two component families', () => {
    expect(isCompleteComputerTitle(
      'PC AMD Ryzen 5 3400G 16GB RAM 512GB SSD wifi Gabinete RGB 650W Monitor 20"',
    )).toBe(true);
    expect(isCompleteComputerTitle('Cooler para Ryzen 5 5600X')).toBe(false);
    expect(isCompleteComputerTitle('AMD Ryzen 5 5600X')).toBe(false);
    expect(isCompleteComputerTitle(
      'Pc Escritorio Amd Ryzen 3 3200g | 16 Gb | 480gb | Wifi | Monitor Performance 24"',
    )).toBe(true);
    expect(isCompleteComputerTitle('Pc Amd Ryzen 7 5700-A520-1TB-16Gb-B580 12GB')).toBe(true);
    expect(isCompleteComputerTitle('Memoria RAM para PC 32GB DDR5')).toBe(false);
  });
});
