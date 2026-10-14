import { describe, expect, it } from 'vitest';
import { attributeProofMatches, exactOfferAttributes, proveOfferAttributes, proveManufacturerRamAttributes } from './offer-attribute-proof';
import { readIdentityReview } from './offer-identity';
import { normalizeIdentityText } from '@/lib/product-identity';

describe('prueba de atributos exactos independiente de Jev', () => {
  it('memo puro conserva retornos mutables independientes y categoría en la clave',()=>{
    const name='AMD Ryzen 5 5600 BOX con cooler';
    const expected=exactOfferAttributes(name,'procesadores');expect(expected).not.toBeNull();
    const mutated=exactOfferAttributes(name,'procesadores')!;mutated.model='9999';mutated.packaging='tray';
    expect(exactOfferAttributes(name,'procesadores')).toEqual(expected);
    expect(exactOfferAttributes(name,'tarjetas-graficas')).toBeNull();
    expect(exactOfferAttributes(name.replace('5600','5600G'),'procesadores')?.suffixes).not.toBe(expected?.suffixes);
  });
  it('corrobora la serie AERO y conserva marca, chip, memoria y condición OC', () => {
    const name = 'PLACA DE VIDEO GeForce RTX 5070 12GB GIGABYTE AERO OC';
    const source = 'PLACA DE VIDEO GIGABYTE RTX 5070 AERO OC 12GB';
    expect(proveOfferAttributes(name, 'tarjetas-graficas', source)).toMatchObject({ attributes: { series: 'aero', edition: 'aero', clock: 'oc', memory: '12' } });
    for (const changed of [source.replace('AERO', 'GAMING'), source.replace('AERO', 'WINDFORCE'), source.replace('5070', '5070 Ti'), source.replace('12GB', '16GB'), source.replace('GIGABYTE', 'ASUS'), source.replace('OC', 'SIN OC'), source.replace(' OC', ''), source.replace(' AERO', '')]) {
      expect(proveOfferAttributes(name, 'tarjetas-graficas', changed)).toBeNull();
    }
  });
  it('corrobora el mismo CPU sin depender del orden comercial o la frecuencia de reloj', () => {
    const proof = proveOfferAttributes('AMD Ryzen 5 5600 6C/12T', 'procesadores', 'Microprocesador AMD Ryzen 5 5600 4.4GHz');
    expect(proof).toMatchObject({ method: 'exact-attributes', attributes: { family: 'ryzen5', model: '5600' } });
    expect(proveOfferAttributes('AMD Ryzen 5 5600', 'procesadores', 'AMD Ryzen 5 5600G')).toBeNull();
    expect(proveOfferAttributes('AMD Ryzen 5 5600 BOX', 'procesadores', 'AMD Ryzen 5 5600 TRAY')).toBeNull();
    expect(proveOfferAttributes('AMD Ryzen 3 4100 sin cooler OEM OUTLET','procesadores','AMD Ryzen 3 4100 c/ Cooler')).toBeNull();
    expect(proveOfferAttributes('AMD Ryzen 3 4100 con cooler','procesadores','AMD Ryzen 3 4100 sin cooler')).toBeNull();
    expect(proveOfferAttributes('AMD Ryzen 3 4100','procesadores','AMD Ryzen 3 4100 OUTLET')).toBeNull();
  });
  it('exige fabricante, serie y todas las variantes GPU, no sólo el chip', () => {
    expect(proveOfferAttributes('ASUS Dual RTX 5060 8GB OC EVO', 'tarjetas-graficas', 'GeForce RTX 5060 8GB ASUS DUAL OC EVO')).not.toBeNull();
    expect(proveOfferAttributes('Gigabyte RTX 5060 Eagle OC 8GB', 'tarjetas-graficas', 'Gigabyte RTX 5060 Eagle OC ICE 8GB')).toBeNull();
    expect(proveOfferAttributes('MSI RTX 5060 Shadow 2X OC 8GB', 'tarjetas-graficas', 'MSI RTX 5060 Shadow 8GB')).toBeNull();
    expect(proveOfferAttributes('RTX 5060 8GB', 'tarjetas-graficas', 'RTX 5060 8GB')).toBeNull();
  });
  it('no acredita RAM sin kit, forma, latencia y color explícitos', () => {
    const name = 'Memoria UDIMM Corsair Vengeance LPX Black 16GB (1x16GB) DDR4 3200MHz CL16';
    expect(proveOfferAttributes(name, 'memoria-ram', name)).not.toBeNull();
    expect(proveOfferAttributes(name, 'memoria-ram', name.replace('(1x16GB)', ''))).toBeNull();
    expect(proveOfferAttributes(name, 'memoria-ram', name.replace('LPX', 'RS RGB'))).toBeNull();
  });
  it('mantiene perfil, voltaje, condición y sufijos RAM al recuperar GREY y Single', () => {
    const name = 'Memoria RAM UDIMM Kingston Fury Beast 16GB DDR5 5200MHz CL40 1.25V Single Grey Intel XMP';
    const proof = proveOfferAttributes(name, 'memoria-ram', name)!;
    expect(proof).toMatchObject({ attributes: { kit: '1x16', color: 'grey', profile: 'xmp' } });
    for (const source of [name.replace('Intel XMP', 'AMD EXPO'), name.replace(' Intel XMP', ''),
      name.replace('1.25V', '1.35V'), name.replace(' 1.25V', ''), `${name} OUTLET`, `${name} RGB`,
      name.replace('Grey', 'Black'), name.replace(' Single', '')]) {
      expect(proveOfferAttributes(name, 'memoria-ram', source)).toBeNull();
    }
    expect(attributeProofMatches(proof, name, 'memoria-ram', name)).toBe(true);
    expect(attributeProofMatches(proof, name, 'memoria-ram', name.replace('Intel XMP', 'AMD EXPO'))).toBe(false);
    const old = { ...proof, attributes: { model: proof.attributes.model } };
    expect(attributeProofMatches(old, name, 'memoria-ram', name)).toBe(false);
  });
  it('revalida el subject RAM normalizado y serializado de Single/GREY', () => {
    const name = 'Memoria Ram UDIMM KINGSTON Fury Beast 16GB DDR5 5200MHz CL40 1.25V Single GRAY';
    const proof = proveOfferAttributes(name, 'memoria-ram', name)!;
    const review = { version: 1, status: 'consistent', reason: 'exact-attributes', reviewedAt: '2026-10-11T18:00:00Z',
      model: null, confidence: null, sourceIdentity: { title: name, listingRef: 'store:id:1' }, proof,
      subject: { name: normalizeIdentityText(name), category: 'memoria-ram', url: 'https://store.example/producto/1' } };
    expect(readIdentityReview(JSON.parse(JSON.stringify(review)))?.status).toBe('consistent');
    expect(readIdentityReview({ ...review, sourceIdentity: { ...review.sourceIdentity, title: name.replace('GRAY', 'Black') } })?.status).toBe('needs-review');
  });
  it('acredita SSD sólo con título completo idéntico tras normalizar mayúsculas y espacios', () => {
    const name = 'SSD Kingston NV3 1TB NVMe M.2';
    const proof = proveOfferAttributes(name, 'almacenamiento', ' SSD  KINGSTON NV3 1TB NVME M.2 ');
    expect(proof).toMatchObject({ attributes: { model: 'nv3', capacity: '1000', interface: 'pcie', form: 'm2',
      title: 'ssd kingston nv3 1tb nvme m 2' } });
    expect(attributeProofMatches(proof!, name, 'almacenamiento', name)).toBe(true);
    for (const source of [name.replace('Kingston', 'Samsung'), name.replace('NV3', 'NV2'),
      name.replace('1TB', '2TB'), name.replace('NVMe', 'SATA'), name.replace('M.2', '2.5'),
      name.replace('NVMe ', ''), name.replace('1TB', '1000GB'), `${name} Plus`, `${name} Gen4`,
      `${name} con disipador`, `${name} OUTLET`, `${name} OEM`, `${name} Black`, name.replace('NVMe', 'PCIe')]) {
      expect(proveOfferAttributes(name, 'almacenamiento', source)).toBeNull();
    }
  });
  it('no convierte el detector sin contradicciones en prueba de equivalencia', () => {
    const name = 'SSD Samsung 970 EVO Plus 1TB NVMe M.2 Gen3 con disipador';
    expect(exactOfferAttributes(name, 'almacenamiento')).not.toBeNull();
    for (const marker of ['Plus ', 'Gen3 ', 'con disipador', 'M.2 ', 'NVMe ']) {
      expect(proveOfferAttributes(name, 'almacenamiento', name.replace(marker, ''))).toBeNull();
    }
    expect(proveOfferAttributes(name, 'almacenamiento', name.replace('Gen3', 'Gen4'))).toBeNull();
    expect(proveOfferAttributes('SSD Kingston NV3 1TB', 'almacenamiento', 'SSD Kingston NV3 1TB')).toBeNull();
  });
  it('revalida el título SSD completo almacenado y rechaza una prueba de otra condición', () => {
    const name = 'SSD Kingston NV3 1TB NVMe M.2', proof = proveOfferAttributes(name, 'almacenamiento', name)!;
    expect(attributeProofMatches(proof, name, 'almacenamiento', `${name} OUTLET`)).toBe(false);
    const incomplete = { ...proof.attributes };
    delete incomplete.title;
    expect(attributeProofMatches({ ...proof, attributes: incomplete }, name, 'almacenamiento', name)).toBe(false);
  });
  it('revalida evidencia al leer JSONB sin depender del orden de claves ni inventar confianza', () => {
    const name = 'amd ryzen 5 5600', proof = proveOfferAttributes(name, 'procesadores', name)!;
    const reordered = { ...proof, attributes: Object.fromEntries(Object.entries(proof.attributes).reverse()) };
    expect(attributeProofMatches(reordered, name, 'procesadores', name)).toBe(true);
    const review = { version: 1, status: 'consistent', reason: 'exact-attributes', reviewedAt: '2026-10-02T14:00:00Z',
      model: null, confidence: null, sourceIdentity: { title: name, listingRef: 'store:id:1' }, proof: reordered,
      subject: { name, category: 'procesadores', url: 'https://store.example/producto/1' } };
    expect(readIdentityReview(review)?.reason).toBe('exact-attributes');
    expect(readIdentityReview({ ...review, sourceIdentity: { title: 'AMD Ryzen 5 5600G', listingRef: 'store:id:1' } })?.status).toBe('needs-review');
  });
});

describe('proof RAM fabricante revalidable con textos originales', () => {
  const title='Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16',sku='CMG16GX4M1E3200C16';
  const binding={storeId:'compragamer',url:'https://compragamer.com/producto/RAM_15558',listingRef:'compragamer:id:15558'};
  const subject={title,sku,specs:{SKU:sku}};
  function make(){return proveManufacturerRamAttributes(subject,subject,binding)!;}
  function review(){return {version:1,status:'consistent',reason:'manufacturer-ram',model:null,confidence:null,
    reviewedAt:'2026-10-11T22:30:00Z',subject:{name:normalizeIdentityText(title),category:'memoria-ram',url:binding.url},
    sourceIdentity:{title,storeSku:sku,listingRef:binding.listingRef},proof:make()};}
  it('completa identidad sin cambiar el título de la publicación y tolera orden JSON distinto',()=>{
    const value=JSON.parse(JSON.stringify(review()));
    expect(value.sourceIdentity.title).toBe(title);expect(value.proof.source.title).toBe(title);
    expect(value.proof.attributes.kit).toBe('1x16');expect(value.proof.attributes.form).toBe('dimm');
    value.proof=Object.fromEntries(Object.entries(value.proof).reverse());
    expect(readIdentityReview(value)?.status).toBe('consistent');
  });
  it.each([
    (v:ReturnType<typeof review>)=>{v.proof.attributes.kit='2x8';},
    (v:ReturnType<typeof review>)=>{v.proof.target.specs.kit='2x8GB';},
    (v:ReturnType<typeof review>)=>{v.proof.source.specs.formFactor='SODIMM';},
    (v:ReturnType<typeof review>)=>{v.proof.source.title=title.replace('Black','Grey');},
    (v:ReturnType<typeof review>)=>{v.proof.target.sku='MEM755';},
    (v:ReturnType<typeof review>)=>{v.sourceIdentity.storeSku='MEM755';},
    (v:ReturnType<typeof review>)=>{v.sourceIdentity.title=title.replace('CL16','CL18');},
    (v:ReturnType<typeof review>)=>{v.sourceIdentity.listingRef='compragamer:id:15522';},
    (v:ReturnType<typeof review>)=>{v.subject.url='https://compragamer.com/producto/RAM_15522';},
    (v:ReturnType<typeof review>)=>{v.subject.category='procesadores';},
  ])('rechaza modificación material tras serialización %#',change=>{
    const value=JSON.parse(JSON.stringify(review()));change(value);expect(readIdentityReview(value)?.status).toBe('needs-review');
  });
  it('conserva contradicciones estructuradas y no acepta MPN interna, faltante o desconocida',()=>{
    for(const source of [{...subject,specs:{SKU:sku,kit:'2x8GB'}},{...subject,specs:{SKU:sku,kit:['2x8GB']}},
      {...subject,sku:'EL_'+sku},{...subject,sku:undefined},{...subject,sku:'CMG32GX4M2E3200C16'}])
      expect(proveManufacturerRamAttributes(subject,source,binding)).toBeNull();
    expect(proveManufacturerRamAttributes(subject,subject,{...binding,listingRef:'compragamer:id:15522'})).toBeNull();
    expect(proveManufacturerRamAttributes(subject,subject,{...binding,storeId:'maxtecno'})).toBeNull();
  });
  it('recomputa specs vigentes del producto y necesita contexto explícito',()=>{
    const proof=make(),sourceIdentity=review().sourceIdentity;
    expect(attributeProofMatches(proof,title,'memoria-ram',title)).toBe(false);
    const context={targetSpecs:{SKU:sku},sourceIdentity,url:binding.url};
    expect(attributeProofMatches(proof,title,'memoria-ram',title,context)).toBe(true);
    for(const targetSpecs of [{},{SKU:'another'},{SKU:sku,color:'grey'},{SKU:sku,kit:'2x8GB'}])
      expect(attributeProofMatches(proof,title,'memoria-ram',title,{...context,targetSpecs})).toBe(false);
    for(const marker of ['*','×'])expect(attributeProofMatches(proof,title.replace('RGB RS',`RGB${marker}RS`),'memoria-ram',title,context)).toBe(false);
    expect(attributeProofMatches(proof,normalizeIdentityText(title),'memoria-ram',title,context)).toBe(true);
  });
});
