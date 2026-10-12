import { describe, expect, it } from 'vitest';
import { exactRamAttributes } from './ram-identity';
import { captureRamSpecs, hasRamSubjectConflict, manufacturerRamEvidence, planRamEnrichment } from './ram-enrichment';

const mpn = 'CMG16GX4M1E3200C16';
const title = 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16';
function plan(value = title, manufacturerMpn = mpn, specs: Record<string, unknown> = {}) {
  const subject = { title: value, sku: manufacturerMpn, specs };
  return planRamEnrichment({ manufacturerMpn, target: subject, source: structuredClone(subject) });
}

describe('enriquecimiento RAM con tres MPN de fabricante acreditadas', () => {
  it.each([
    { kit: '2x8GB' }, { generation: 'DDR5' }, { speed: '6000MHz' }, { formFactor: 'SODIMM' },
    { kit: '1x16GB', Kit: '2x8GB' }, { generation: 'DDR4', generacion: 'DDR5' },
    { speed: '3200MHz', frecuencia: '3600MHz' }, { latency: 'CL16', latencia: 'CL18' },
  ])('detecta contradicción estructurada sin completar fabricante: %j', specs => {
    const completeTitle = `${title} 1x16GB UDIMM`;
    const subject = { title: completeTitle, specs: { SKU: 'unknown' } };
    expect(hasRamSubjectConflict(subject, { ...subject, specs: { SKU: 'unknown', ...specs } })).toBe(true);
  });
  it('admite campos equivalentes y contrasta atributos presentes entre sujetos sin inferir faltantes', () => {
    const subject = { title: `${title} 1x16GB UDIMM`, specs: { SKU: 'unknown', kit: '1 x 16 GB', generacion: 'DDR 4', frecuencia: '3200 MHz' } };
    expect(hasRamSubjectConflict(subject, { ...subject, specs: { SKU: 'unknown', formFactor: 'desktop' } })).toBe(false);
    expect(hasRamSubjectConflict({ title: 'RAM', specs: { kit: '1x16GB' } },
      { title: 'RAM', specs: { kit: '2x8GB' } })).toBe(true);
    expect(hasRamSubjectConflict({ title: 'RAM' }, { title: 'RAM' })).toBe(false);
  });
  it('captura specs originales que gobiernan contradicciones y no ignora tipos inválidos',()=>{
    expect(captureRamSpecs({SKU:mpn,kit:'2x8GB',Color:'Grey',Capacidad:32,Stock:'10'}))
      .toEqual({SKU:mpn,kit:'2x8GB',Color:'Grey',Capacidad:32});
    expect(captureRamSpecs({SKU:mpn,kit:['2x8GB']})).toBeNull();
    expect(captureRamSpecs({SKU:mpn,RGB:true})).toBeNull();
    expect(captureRamSpecs({SKU:mpn,capacityGB:NaN})).toBeNull();
    expect(captureRamSpecs({SKU:mpn,sku:'MEM755'})).toBeNull();
  });
  it('completa sólo kit y forma y revalida el título sin alterar su fuente original', () => {
    const result = plan();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected plan');
    expect(result.target.originalTitle).toBe(title);
    expect(result.target.enrichedTitle).toBe(`${title} 1x16GB UDIMM`);
    expect(result.target.attributes).toEqual(exactRamAttributes(result.target.enrichedTitle));
    expect(result.source.attributes).toEqual(result.target.attributes);
    expect(result.target.provenance.kit).toMatchObject({ source: 'manufacturer', value: '1x16', mpn,
      url: manufacturerRamEvidence[mpn].url });
    expect(result.target.provenance.color).toEqual({ source: 'original-title', value: 'black' });
  });
  it('completa los tres registros explícitos sin interpretar letras del MPN', () => {
    for (const [manufacturerMpn, value] of [
      [mpn, title], ['CMK8GX4M1E3200C16', 'Memoria Corsair DDR4 8GB 3200Mhz Vengeance LPX Black CL16'],
      ['CMK16GX5M1B5600C40', 'Memoria Corsair DDR5 16GB 5600MHz Vengeance CL40 Intel XMP 3.0'],
    ]) expect(plan(value, manufacturerMpn).ok).toBe(true);
    expect(plan(title, 'CMG32GX4M2E3200C16')).toEqual({ ok: false, reason: 'unknown-mpn' });
    expect(plan(title, 'constructor')).toEqual({ ok: false, reason: 'unknown-mpn' });
  });
  it('conserva objetos, precios, stock, fecha y datos ajenos al plan', () => {
    const subject = { title, sku: mpn, specs: { SKU: mpn, Garantia: '36 meses' },
      price: 523400, stock: 'low-stock', lastUpdated: '2026-10-10T12:13:31.308Z', canonicalKey: 'legacy' };
    const input = { manufacturerMpn: mpn, target: subject, source: structuredClone(subject) };
    const before = JSON.stringify(input);
    const result = planRamEnrichment(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/523400|low-stock|lastUpdated|canonicalKey|Garantia/);
  });
  it('acepta campos estructurados corroborados y registra su procedencia sin perder forma en título', () => {
    const result = plan(title, mpn, { kit: '1x16GB', formFactor: 'UDIMM', capacityGB: 16 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected plan');
    expect(result.target.enrichedTitle).toContain('1x16GB UDIMM');
    expect(result.target.provenance.kit?.source).toBe('original-specs');
  });
  it.each([
    ['generation', title.replace('DDR4', 'DDR5')], ['kit', `${title} 2x8GB`], ['kit', `${title} (2x8)`],
    ['capacity', title.replace('16GB', '32GB')], ['speed', title.replace('3200MHz', '3600MHz')],
    ['latency', title.replace('CL16', 'CL18')], ['latency', title.replace('CL16', 'C18')],
    ['form', `${title} SODIMM`], ['color', title.replace('Black', 'Grey')], ['color', `${title} White`],
    ['series', title.replace('RS', 'LPX')], ['lighting', title.replace('RGB', 'sin RGB')],
    ['brand', title.replace('Corsair', 'Kingston')],
  ])('rechaza contradicción explícita de %s', (field, value) => {
    expect(plan(value)).toMatchObject({ ok: false, reason: 'identity-conflict', field });
  });
  it('el RGB RS del proveedor no se convierte en Vengeance DDR5 sin RGB', () => {
    const result = plan('Memoria Corsair DDR5 16GB 5600MHz Vengeance RGB CL40 Black', 'CMK16GX5M1B5600C40');
    expect(result).toMatchObject({ ok: false, reason: 'identity-conflict', field: 'lighting' });
    expect(plan('Memoria Corsair DDR5 16GB 5600MHz Vengeance RGB RS CL40 Black', 'CMK16GX5M1B5600C40'))
      .toMatchObject({ ok: false, reason: 'identity-conflict', field: 'series' });
  });
  it('no agrega un negativo RGB a LPX por la ausencia del campo en fabricante', () => {
    const result = plan('Memoria Corsair DDR4 8GB 3200MHz Vengeance LPX CL16 Black', 'CMK8GX4M1E3200C16');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected plan');
    expect(result.target.enrichedTitle).not.toContain('sin RGB');
    expect(result.target.provenance.lighting).toBeUndefined();
    expect(plan('Memoria Corsair DDR4 8GB 3200MHz Vengeance LPX CL16 Black RGB', 'CMK8GX4M1E3200C16'))
      .toMatchObject({ ok: false, reason: 'identity-conflict', field: 'lighting-unverified' });
  });
  it.each(['EL_CMG16GX4M1E3200C16', 'IC_CMG16GX4M1E3200C16', 'MEM755', undefined])('rechaza SKU interna o ausente %s', sku => {
    expect(planRamEnrichment({ manufacturerMpn: mpn, target: { title, sku }, source: { title, sku: mpn } }))
      .toMatchObject({ ok: false, reason: 'sku-mismatch', side: 'target' });
  });
  it('contrasta ambos SKU y no ignora SKU contradictoria en specs', () => {
    expect(plan(title, mpn, { SKU: 'another' })).toMatchObject({ ok: false, reason: 'sku-mismatch' });
    expect(planRamEnrichment({ manufacturerMpn: mpn, target: { title, sku: mpn }, source: { title, sku: 'MEM755' } }))
      .toMatchObject({ ok: false, reason: 'sku-mismatch', side: 'source' });
  });
  it('no usa la igualdad de SKU para borrar sufijos o condiciones diferentes de fuente', () => {
    expect(planRamEnrichment({ manufacturerMpn: mpn, target: { title, sku: mpn }, source: { title: `${title} OUTLET`, sku: mpn } }))
      .toMatchObject({ ok: false, reason: 'identity-conflict', field: 'exact-title-proof' });
    expect(plan(`${title} + Ryzen 5 5600`).ok).toBe(false);
  });
  it('rechaza specs contradictorias y no fabrica QVL ni un color por foto', () => {
    expect(plan(title, mpn, { kit: '2x8GB' })).toMatchObject({ ok: false, reason: 'identity-conflict', field: 'kit' });
    const result = plan(title.replace('Black', ''), mpn, { image: 'white.png' });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/QVL|white.png/);
  });
});
