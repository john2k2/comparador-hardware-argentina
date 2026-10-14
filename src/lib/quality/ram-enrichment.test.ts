import { describe, expect, it } from 'vitest';
import { attributeProofMatches, proveManufacturerRamAttributes } from './offer-attribute-proof';
import { exactRamAttributes } from './ram-identity';
import { captureRamSpecs, hasRamSubjectConflict, manufacturerRamEvidence, planRamEnrichment } from './ram-enrichment';

const mpn = 'CMG16GX4M1E3200C16';
const title = 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16';
function plan(value = title, manufacturerMpn = mpn, specs: Record<string, unknown> = {}) {
  const subject = { title: value, sku: manufacturerMpn, specs };
  return planRamEnrichment({ manufacturerMpn, target: subject, source: structuredClone(subject) });
}

describe('enriquecimiento RAM con tres MPN de fabricante acreditadas', () => {
  it('un conflicto en specs no contamina la extracción de otro sujeto con el mismo título',()=>{
    expect(hasRamSubjectConflict({title,specs:{capacity:32}})).toBe(true);
    expect(hasRamSubjectConflict({title,specs:{capacity:16}})).toBe(false);
    const first=plan();expect(first.ok).toBe(true);
    if(first.ok){first.target.attributes.kit='8x2';first.source.attributes.color='white';}
    expect(plan()).toMatchObject({ok:true,target:{attributes:{kit:'1x16',color:'black'}}});
  });
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


describe('KLEVV BOLT V con dos MPN auditadas, sin decodificar ni aprobar precio', () => {
  const sku = 'KD5AGUA80-60B280H';
  const title = 'Memoria KLEVV DDR5 32GB (2X16GB) 6000MHz BOLT V CL28';
  const subject = { title, sku, specs: { SKU: sku } };
  const binding = { storeId: 'compragamer', url: 'https://compragamer.com/producto/Memoria_KLEVV_DDR5_32GB_2X16GB_6000MHz_BOLT_V_CL28_21565', listingRef: 'compragamer:id:21565' };
  it('completa cg-21565 sólo con forma y gris acreditados; conserva título, sin RGB/voltaje/QVL inventados', () => {
    const result = planRamEnrichment({ manufacturerMpn: sku, target: subject, source: structuredClone(subject) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected plan');
    expect(result.target.enrichedTitle).toBe(`${title} UDIMM grey`);
    expect(result.target.attributes).toMatchObject({ model: expect.stringContaining('klevv:bolt-v'), capacity: '32', kit: '2x16', latency: '28', form: 'dimm', color: 'grey', profile: '' });
    expect(result.target.provenance.form).toMatchObject({ source: 'manufacturer', checkedAt: '2026-10-12', mpn: sku, url: manufacturerRamEvidence[sku].fieldUrls?.form });
    expect(result.target.provenance.lighting).toBeUndefined();
    expect(result.target.originalTitle).toBe(title);
    expect(JSON.stringify(result)).not.toMatch(/QVL|1\.35|1\.4|sin RGB/);
    const proof = proveManufacturerRamAttributes(subject, structuredClone(subject), binding);
    expect(proof).not.toBeNull();
    const sourceIdentity = { title, storeSku: sku, listingRef: binding.listingRef, sourceId: '21565' };
    expect(attributeProofMatches(proof!, title, 'memoria-ram', title, { targetSpecs: subject.specs, sourceIdentity, url: binding.url })).toBe(true);
    for (const changed of [{ ...binding, url: binding.url.replace('21565', '21562') }, { ...binding, storeId: 'katech' }, { ...binding, listingRef: 'compragamer:id:21562' }])
      expect(proveManufacturerRamAttributes(subject, subject, changed)).toBeNull();
    expect(attributeProofMatches(proof!, title, 'memoria-ram', title, { targetSpecs: subject.specs, sourceIdentity, url: binding.url.replace('21565', '21562') })).toBe(false);
  });
  it.each([
    ['color', `${title} White`], ['lighting-unverified', `${title} RGB`], ['lighting-unverified', `${title} sin RGB`],
    ['latency', title.replace('CL28', 'CL30')], ['kit', title.replace('2X16GB', '1X32GB')],
    ['form', `${title} SODIMM`], ['brand', title.replace('KLEVV', 'Corsair')],
    ['family', title.replace('BOLT V', 'CRAS V')], ['family', `${title} CRAS V`],
    ['profile', `${title} sin EXPO`], ['profile', `${title} XMP 2.0`], ['voltage-unverified', `${title} 1.5V`], ['voltage-unverified', `${title} 1.5 V`],
    ['profile', `${title} XMP2.0`], ['profile', `${title} XMP 3.1`],
  ])('rechaza mutación de %s conservando evidencia original', (field, value) => {
    expect(planRamEnrichment({ manufacturerMpn: sku, target: { ...subject, title: value }, source: subject }))
      .toMatchObject({ ok: false, reason: 'identity-conflict', field });
  });
  it.each([{ voltage: 1.5 }, { voltageV: '1.35V' }, { profile: 'XMP 2.0' }, { profile: 'EXPO' }, { manufacturer: 'Corsair' }])('no pierde contradicción de specs al serializar: %j', specs => {
    expect(proveManufacturerRamAttributes({ ...subject, specs: { SKU: sku, ...specs } }, subject, binding)).toBeNull();
  });
  it('preserva perfiles explícitos corroborables y rechaza diferencia entre destino y fuente', () => {
    const withProfiles = { ...subject, title: `${title} Intel XMP 3.0 AMD EXPO`, specs: { SKU: sku, profiles: 'Intel XMP 3.0 AMD EXPO' } };
    expect(proveManufacturerRamAttributes(withProfiles, withProfiles, binding)?.attributes.profile).toBe('xmp-expo');
    expect(proveManufacturerRamAttributes(withProfiles, { ...subject, title: `${title} AMD EXPO` }, binding)).toBeNull();
  });
  it('no aprueba SKU vecina/no auditada, ni MPN blanca asociada a CRAS 6400', () => {
    expect(planRamEnrichment({ manufacturerMpn: 'KD5AGU880-60B280H', target: subject, source: subject })).toEqual({ ok: false, reason: 'unknown-mpn' });
    expect(planRamEnrichment({ manufacturerMpn: sku, target: { ...subject, sku: 'KD5AGUA80-60A300I' }, source: subject })).toMatchObject({ ok: false, reason: 'sku-mismatch' });
    const white = { title: title.replace('CL28', 'White CL30'), sku: 'KD5AGUA80-60A300I', specs: { SKU: 'KD5AGUA80-60A300I' } };
    expect(planRamEnrichment({ manufacturerMpn: white.sku, target: white, source: white }).ok).toBe(true);
    expect(planRamEnrichment({ manufacturerMpn: white.sku, target: { ...white, title: 'Memoria KLEVV DDR5 32GB (2x16GB) 6400MHz CRAS V RGB CL32 White' }, source: white })).toMatchObject({ ok: false, field: 'family' });
  });
});
