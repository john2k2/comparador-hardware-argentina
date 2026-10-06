import { describe, expect, it } from 'vitest';
import { buildTechnicalSheet, productDescriptionText } from './technical-sheet';

describe('technical sheet from published evidence', () => {
  it('separates concatenated store fields without inventing a manufacturer code', () => {
    const facts = buildTechnicalSheet({ specs: { SKU: 'PEN038', SourceListingId: '729774' },
      description: 'marca: sandiskmodelo: ultra shiftcapacidad de almacenamiento: 64gbconectividad: usb 3.0tipo de conector: usb-aincluye led de actividad: sí' });
    expect(facts).toContainEqual({ label: 'Marca', value: 'sandisk', source: 'description' });
    expect(facts).toContainEqual({ label: 'Capacidad', value: '64gb', source: 'description' });
    expect(facts).toContainEqual({ label: 'Tipo de conector', value: 'usb-a', source: 'description' });
    expect(JSON.stringify(facts)).not.toMatch(/PEN038|729774|MPN/);
  });
  it('retains explicit MPN and structured values ahead of description claims', () => {
    const facts = buildTechnicalSheet({ specs: { MPN: 'PVS416G360C7K', Capacidad: '16GB' }, description: 'Capacidad: 32GB | Socket: AM5' });
    expect(facts.find((fact) => fact.label === 'Capacidad')?.value).toBe('16GB');
    expect(facts.find((fact) => fact.label.includes('MPN'))?.value).toBe('PVS416G360C7K');
  });
  it('separates a colon-free reading speed and does not duplicate a known capacity', () => {
    const facts = buildTechnicalSheet({ name: 'Pen Drive 64GB', category: 'almacenamiento', specs: {},
      description: 'Capacidad: 64gbincluye led de actividad: sívelocidad de lectura de 130mb/s' });
    expect(facts.find((fact) => fact.label === 'LED de actividad')?.value).toBe('sí');
    expect(facts.find((fact) => fact.label === 'Velocidad de lectura')?.value).toBe('130mb/s');
    expect(facts.filter((fact) => /Capacidad/.test(fact.label))).toHaveLength(1);
  });
  it('keeps onboard memory apart from seller advice and reads explicit CPU counts', () => {
    const mouse = buildTechnicalSheet({ specs: {}, description: 'Memoria integrada: 1 perfil onboard Uso recomendado: FPS, Battle Royale' });
    expect(mouse.find((fact) => fact.label === 'Memoria integrada')?.value).toBe('1 perfil onboard');
    const cpu = buildTechnicalSheet({ name: 'CPU LGA1700', category: 'procesadores', specs: {}, description: '4 núcleos y 8 hilos ✅ Socket: LGA1700' });
    expect(cpu).toContainEqual({ label: 'Núcleos', value: '4', source: 'description' });
    expect(cpu).toContainEqual({ label: 'Hilos', value: '8', source: 'description' });
    expect(cpu.filter((fact) => /Socket/.test(fact.label))).toHaveLength(1);
  });
  it('reads title attributes as published values, never claims QVL or performance', () => {
    const facts = buildTechnicalSheet({ name: 'Memoria Patriot DDR4 16GB (2x8GB) 3600MHz CL17', category: 'memoria-ram', specs: {}, description: 'SKU PVS416G360C7K' });
    expect(facts).toContainEqual({ label: 'Composición del kit', value: '2x8GB', source: 'title' });
    expect(facts).toContainEqual({ label: 'Tipo de memoria', value: 'DDR4', source: 'title' });
    expect(facts.some((fact) => /MPN|compatible|QVL/i.test(fact.label))).toBe(false);
  });
  it('does not add data when there is no technical evidence', () => {
    expect(buildTechnicalSheet({ specs: { SKU: '123', SourceListingId: '456' }, description: 'Producto gamer' })).toEqual([]);
  });
  it('keeps bullet-delimited fields from absorbing other claims', () => {
    const facts = buildTechnicalSheet({ specs: {}, description: '✅ Frecuencia base: 3.4 GHz ✅ Turbo Boost: hasta 4.5 GHz ✅ Socket: LGA1700 ✅ Versión OEM: Sin caja, sin cooler' });
    expect(facts.find((fact) => fact.label === 'Frecuencia base')?.value).toBe('3.4 GHz');
    expect(facts.find((fact) => fact.label === 'Socket')?.value).toBe('LGA1700');
  });
  it('removes markup/script content and preserves spacing and entities', () => {
    expect(productDescriptionText('<p>Modelo:&nbsp;A&amp;B</p><script>alert(1)</script><p>Socket: AM5</p>')).toBe('Modelo: A&B Socket: AM5');
  });
});
