import { describe, expect, it } from 'vitest';
import { extractRamModelKey, normalizeIdentityText } from '@/lib/product-identity';
import { exactRamAttributes } from './ram-identity';

const name = 'Memoria RAM UDIMM Corsair Vengeance 32GB DDR5 6000MHz CL38 1.35V (2x16GB) Intel XMP GREY RGB';
const single = 'Memoria RAM UDIMM Kingston Fury Beast 16GB DDR5 5200MHz CL40 1.25V Single Negro';

describe('prueba explícita RAM sin cambiar las claves persistidas', () => {
  it('recupera GREY con kit, forma y CL explícitos y conserva perfil y título', () => {
    const key = extractRamModelKey(name);
    expect(key).toContain(':na');
    expect(exactRamAttributes(name)).toMatchObject({ capacity: '32', kit: '2x16', generation: 'ddr5',
      speed: '6000', latency: '38', form: 'dimm', color: 'grey', profile: 'xmp', condition: '' });
    expect(exactRamAttributes(name)?.title).toContain('1 35v 2x16gb intel xmp grey rgb');
    expect(extractRamModelKey(name)).toBe(key);
  });
  it.each(['GRAY', 'gris'])('canoniza el color explícito %s sin hacerlo negro', color => {
    expect(exactRamAttributes(name.replace('GREY', color))).toEqual(exactRamAttributes(name));
    expect(exactRamAttributes(name.replace('GREY', color))?.color).not.toBe('black');
  });
  it.each(['U-DIMM', 'U DIMM'])('canoniza forma explícita %s', form => {
    expect(exactRamAttributes(name.replace('UDIMM', form))).toEqual(exactRamAttributes(name));
  });
  it.each(['2 x 16 GB', '2 x16GB'])('canoniza distribución explícita %s', kit => {
    expect(exactRamAttributes(name.replace('2x16GB', kit))).toEqual(exactRamAttributes(name));
  });
  it.each(['2×16GB', '2*16GB'])('deja %s pendiente hasta que el subject preserve el delimitador', kit => {
    expect(exactRamAttributes(name.replace('2x16GB', kit))).toBeNull();
  });
  it('canoniza DDR 5 y CL 38 sin inferir los campos ausentes', () => {
    expect(exactRamAttributes(name.replace('DDR5', 'DDR 5').replace('CL38', 'CL 38'))).toEqual(exactRamAttributes(name));
  });
  it('Single explícito acredita 1x16, sin decodificar el SKU', () => {
    expect(exactRamAttributes(single)).toMatchObject({ capacity: '16', kit: '1x16', color: 'black' });
    expect(exactRamAttributes(single.replace('Single', '1x16GB'))).toEqual(exactRamAttributes(single));
    expect(exactRamAttributes(single.replace('Single', 'un módulo'))).toEqual(exactRamAttributes(single));
    expect(extractRamModelKey(single)).toContain('unknown-kit');
  });
  it('conserva SO-DIMM y alias explícitos, sin hacerlo DIMM', () => {
    const notebook = single.replace('UDIMM', 'SODIMM').replace('Beast', 'Impact');
    expect(exactRamAttributes(notebook.replace('SODIMM', 'SO-DIMM'))).toEqual(exactRamAttributes(notebook));
    expect(exactRamAttributes(notebook)?.form).toBe('sodimm');
  });
  it.each(['Single Rank', 'SingleRank', 'Single-Channel', 'Single Channel', 'Single / Dual Rank'])('no usa %s para contar módulos', marker => {
    expect(exactRamAttributes(single.replace('Single', marker))).toBeNull();
  });
  it('Single Rank puede coexistir con kit explícito sin acreditarlo por sí mismo', () => {
    expect(exactRamAttributes(single.replace('Single', '1x16GB Single Rank'))?.kit).toBe('1x16');
  });
  it('rechaza voltajes contradictorios también después de normalizar el subject', () => {
    expect(exactRamAttributes(normalizeIdentityText(`${name} 1.40V`))).toBeNull();
  });
  it('no convierte ausencia de RGB en afirmación y acepta el negativo explícito', () => {
    const negative = name.replace(' RGB', ' sin RGB');
    expect(exactRamAttributes(negative)?.model).toContain('non-rgb');
    expect(exactRamAttributes(name.replace(' RGB', ''))?.model).not.toContain('non-rgb');
    expect(exactRamAttributes(`${negative} RGB`)).toBeNull();
  });
  it.each([
    name.replace('2x16GB', ''), name.replace('UDIMM', ''), name.replace('CL38', ''), name.replace('GREY', ''),
    name.replace('32GB', '16GB'), name.replace('2x16GB', '2x8GB'), name.replace('2x16GB', '1x32GB') + ' 2 módulos',
    `${name} 1x32GB`, `${name} 3 módulos`, `${name} Single`, `${name} DDR4`, `${name} DDR 3`, name.replace('DDR5', 'DDR4/5'),
    `${name} 5200MHz`, `${name} CL40`, name.replace('CL38', 'CL38/40'), `${name} DIMM SODIMM`, `${name} Black`,
    `${name} Kingston`, `${name} Fury Beast`, name.replace('CL38', 'CL00'), `${name} OUTLET usado`, `${name} 1.40V`,
    `Combo ${name}`, `Adaptador ${name}`, `Disipador para ${name}`, `Kit de disipadores para ${name}`,
    `PC Gamer ${name}`, `${name} + Ryzen 5 5600`, `${name} LPX RS`,
    single.replace('Single', 'Single 2 módulos'), single.replace('Single', 'Single 2x8GB'),
    single.replace('Single', 'CMK16GX5M1B5200C40'),
  ])('rechaza omisión, accesorio o contradicción: %s', value => {
    expect(exactRamAttributes(value)).toBeNull();
  });
});
