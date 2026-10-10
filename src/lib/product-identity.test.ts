import { describe, expect, it } from 'vitest';
import {
  buildProductIdentityKey,
  buildProductVariantKey,
  extractExactModelIdentity,
  extractGpuModelKey,
  extractGpuBoardAttributes,
  isBundleLikeTitle,
  isCompleteComputerTitle,
} from './product-identity';

describe('product identity', () => {
  it('reconoce AERO para identidad sin cambiar la clave histórica de la publicación', () => {
    const name = 'PLACA DE VIDEO GIGABYTE RTX 5070 AERO OC 12GB';
    expect(extractGpuBoardAttributes(name)).toMatchObject({ brand: 'gigabyte', series: 'aero', edition: 'aero', clock: 'oc' });
    expect(extractGpuModelKey(name)).toBe('gpu:rtx5070:12gb:gigabyte:base:aero:oc');
    expect(buildProductIdentityKey('tarjetas-graficas', name)).toBe('tarjetas-graficas::gpu:rtx5070:12gb:gigabyte:base:aero:oc');
    expect(extractGpuModelKey(name.replace('AERO', 'GAMING'))).not.toBe(extractGpuModelKey(name));
    expect(extractGpuModelKey(name.replace('AERO', 'WINDFORCE'))).not.toBe(extractGpuModelKey(name));
    expect(extractGpuModelKey(name.replace('AERO', 'GAMING AERO'))).toBe('gpu:rtx5070:12gb:gigabyte:gaming:aero:oc');
  });
  it.each([
    'NB HP 15.6 VICTUS I5-12450 8G 512G W11H RTX3050 CD',
    'NB ASUS 15.6 R7-170 16GB 512GB RTX3050',
    'Not Lenovo Loq 15.6fhd I5 8gb Ssd512gb Rtx3050 W11',
  ])('reconoce una notebook abreviada aunque figure como GPU: %s', (name) => {
    expect(isCompleteComputerTitle(name)).toBe(true);
  });

  it('conserva las placas sueltas y los accesorios para notebook', () => {
    expect(isCompleteComputerTitle('Placa de video ASUS DUAL RTX 3050 6GB')).toBe(false);
    expect(isCompleteComputerTitle('Soporte notebook Lenovo')).toBe(false);
  });

  it('preserves GPU variant from fallback context', () => {
    expect(
      buildProductIdentityKey(
        'tarjetas-graficas',
        'MSI RTX 5060 8GB',
        'MSI RTX 5060 Shadow 2X OC 8GB',
      ),
    ).toBe('tarjetas-graficas::gpu:rtx5060:8gb:msi:shadow:2x:oc');

    expect(
      buildProductIdentityKey(
        'tarjetas-graficas',
        'MSI RTX 5060 8GB',
        'MSI RTX 5060 Ventus 2X OC 8GB',
      ),
    ).toBe('tarjetas-graficas::gpu:rtx5060:8gb:msi:ventus:2x:oc');
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

  it('keeps RAM series and unknown manufacturers separate', () => {
    expect(buildProductIdentityKey('memoria-ram', 'Corsair Vengeance LPX Black 16GB 3200 Mhz DDR4'))
      .not.toBe(buildProductIdentityKey('memoria-ram', 'Corsair Vengeance RS RGB 16GB 3200 Mhz DDR4'));
    expect(buildProductIdentityKey('memoria-ram', 'Lexar UDIMM DDR4 16GB 3200MHz'))
      .not.toBe(buildProductIdentityKey('memoria-ram', 'Mushkin Redline DDR4 16GB 3200MHz'));
    expect(extractExactModelIdentity('memoria-ram', 'Lexar UDIMM DDR4 16GB 3200MHz')).toBeNull();
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

it('separa kits, CL, color y RGB aunque la serie RAM coincida', () => {
  const key = (suffix: string) => buildProductIdentityKey('memoria-ram', `Corsair Vengeance RS 32GB DDR4 3200 ${suffix}`);
  expect(key('RGB 2x16GB CL16 Black')).not.toBe(key('2x16GB CL16 Black'));
  expect(key('RGB 2x16GB CL16 Black')).not.toBe(key('sin RGB 2x16GB CL16 Black'));
  expect(key('RGB 2x16GB CL16 Black')).not.toBe(key('RGB 1x32GB CL16 Black'));
  expect(key('RGB 2x16GB CL16 Black')).not.toBe(key('RGB 2x16GB CL18 Black'));
  expect(key('RGB 2x16GB CL16 Black')).not.toBe(key('RGB 2x16GB CL16 White'));
});

it('mantiene separadas ediciones de GPU aunque coincidan chip, marca y memoria', () => {
  const key = (name: string) => buildProductIdentityKey('tarjetas-graficas', name);
  expect(key('ASUS Dual RTX 5060 8GB EVO OC')).not.toBe(key('ASUS Dual RTX 5060 8GB ADVANCED OC'));
  expect(key('Gigabyte Eagle RTX 5060 8GB OC')).not.toBe(key('Gigabyte Eagle RTX 5060 8GB OC ICE'));
  expect(key('MSI Shadow RTX 5060 8GB 2X OC')).not.toBe(key('MSI Shadow RTX 5060 8GB 3X OC'));
  expect(key('ASUS Dual RTX 5060 8GB OC White')).not.toBe(key('ASUS Dual RTX 5060 8GB OC Black'));
  expect(key('ASRock AMD RX 7600 Challenger 8GB OC')).toBe(key('AMD Radeon RX 7600 ASRock Challenger OC 8GB'));
});

it.each(['Procesador AMD Ryzen 5 5600GT + Radeon Vega + Cooler', 'CPU Cooler Intel Performance (solo para PC armada)', 'Memoria RAM para notebook DDR5'])('no presenta %s como una computadora', name => {
  expect(isCompleteComputerTitle(name)).toBe(false);
});
it('conserva como paquete un CPU con memoria adicional', () => {
  expect(isCompleteComputerTitle('Procesador AMD Ryzen 5 5600G + Radeon Vega + memoria 16GB DDR4')).toBe(true);
});

it('conserva el paquete de memoria y CPU como bundle, aunque empiece con RAM', () => {
 expect(isCompleteComputerTitle('Memoria DDR4 16GB + Procesador AMD Ryzen 5 5600')).toBe(true);
});

it('no cuenta compatibilidad DDR5 como memoria incluida en una APU', () => {
 expect(isCompleteComputerTitle('Procesador AMD Ryzen 5 8600G + Radeon 760M AM5 DDR5')).toBe(false);
 expect(isCompleteComputerTitle('Procesador AMD Ryzen 5 8600G + Radeon 760M + 16GB DDR5')).toBe(true);
});

it.each(['PC Intel i7 12700 con SSD 240GB', 'Notebook Asus X515EA i3 4GB SSD 256GB'])('reconoce %s por el equipo explícito aunque omita familias completas', name => {
  expect(isCompleteComputerTitle(name)).toBe(true);
});
