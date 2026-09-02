import { describe, expect, it } from 'vitest';
import {
  gpuPerformanceTier,
  inferCpuSocket,
  inferMotherboardPlatform,
  inferPsuWatts,
  inferRamProfile,
  inferSsdCapacityGb,
  isCurrentGamingGpu,
  requiredPsuWatts,
} from '@/lib/seo/budget-build-compat';

describe('inferCpuSocket', () => {
  it('mapea Ryzen 5000 a AM4 y 7000/9000 a AM5 aunque el listing no diga el socket', () => {
    expect(inferCpuSocket('AMD Ryzen 5 5600')).toBe('am4');
    expect(inferCpuSocket('Procesador AMD Ryzen 5 7600X')).toBe('am5');
    expect(inferCpuSocket('Ryzen 7 7800X3D')).toBe('am5');
  });

  it('mapea Intel 12-14 a LGA1700 y rechaza Threadripper', () => {
    expect(inferCpuSocket('Intel Core i5 14600K')).toBe('lga1700');
    expect(inferCpuSocket('AMD Ryzen Threadripper 7960X')).toBeNull();
  });
});

describe('inferMotherboardPlatform', () => {
  it('infiere AM4/DDR4 y AM5/DDR5 por chipset aunque no figure DDR en el nombre', () => {
    expect(inferMotherboardPlatform('Mother ASUS Prime B450M-A II')).toEqual({
      socket: 'am4',
      ramGen: 'ddr4',
    });
    expect(inferMotherboardPlatform('Motherboard Gigabyte B650 Eagle AX')).toEqual({
      socket: 'am5',
      ramGen: 'ddr5',
    });
  });

  it('no trata una Arc B580 como chipset de mother', () => {
    expect(inferMotherboardPlatform('Gigabyte Intel Arc B580 12GB')).toBeNull();
  });

  it('no trata un gabinete ni un thermal pad como motherboard', () => {
    expect(inferMotherboardPlatform(
      'GABINETE NOVA CM-04Q1 MICRO ATX P/MOTHER A520M B550M H510M A620M',
    )).toBeNull();
    expect(inferMotherboardPlatform(
      'Thermal Pad Carbice Ice Pad para CPU AM4/AM5 con Nanotubos de Carbono',
    )).toBeNull();
  });
});

describe('inferRamProfile', () => {
  it('lee capacidad de un kit 2x16 y rechaza SODIMM', () => {
    expect(inferRamProfile('Kit Memoria 32GB (2x16GB) DDR5 5600')).toMatchObject({
      gen: 'ddr5',
      capacityGb: 32,
      form: 'unk',
    });
    expect(inferRamProfile('Memoria Kingston 16GB DDR5 5600 SODIMM')).toMatchObject({
      form: 'sodimm',
    });
  });
});

describe('inferPsuWatts y requiredPsuWatts', () => {
  it('no confunde 1550W con 550W', () => {
    expect(inferPsuWatts('Fuente 550W 80 Plus Bronze')).toBe(550);
    expect(inferPsuWatts('Fuente 1550W Platinum')).toBe(1550);
  });

  it('pide mas watts para una 4090 que una 4060', () => {
    expect(requiredPsuWatts('Ryzen 5 7600X', 'RTX 4090 24GB')).toBeGreaterThan(
      requiredPsuWatts('Ryzen 5 5600', 'RTX 4060 8GB'),
    );
    expect(requiredPsuWatts('Ryzen 5 7600X', 'RTX 4090 24GB')).toBeGreaterThan(650);
  });
});

describe('gpuPerformanceTier', () => {
  it('ordena 4060 por encima de 6600 y 5070 por encima de 4060', () => {
    expect(gpuPerformanceTier('GeForce RTX 4060 8GB')).toBeGreaterThan(
      gpuPerformanceTier('Radeon RX 6600 8GB'),
    );
    expect(gpuPerformanceTier('RTX 5070 12GB')).toBeGreaterThan(
      gpuPerformanceTier('RTX 4060 8GB'),
    );
    expect(gpuPerformanceTier('RTX 4060 8GB')).toBeGreaterThan(
      gpuPerformanceTier('GeForce RTX 5050 8GB'),
    );
  });
});

describe('isCurrentGamingGpu', () => {
  it('acepta 6600/4060 y rechaza una RX 580 o GTX 1060', () => {
    expect(isCurrentGamingGpu('Gigabyte RX 6600 Eagle 8GB')).toBe(true);
    expect(isCurrentGamingGpu('MSI RTX 4060 Ventus 8GB')).toBe(true);
    expect(isCurrentGamingGpu('Biostar Radeon RX 580 8GB GDDR5 2048SP')).toBe(false);
    expect(isCurrentGamingGpu('GTX 1060 6GB')).toBe(false);
  });
});

describe('inferSsdCapacityGb', () => {
  it('lee 1TB y descarta un 2230', () => {
    expect(inferSsdCapacityGb('SSD NVMe 1TB Gen4')).toBe(1024);
    expect(inferSsdCapacityGb('SSD NVMe 512GB 2230')).toBeNull();
  });
});
