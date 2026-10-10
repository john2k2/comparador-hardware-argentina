import { describe, expect, it } from 'vitest';
import { attributeProofMatches, proveOfferAttributes } from './offer-attribute-proof';
import { readIdentityReview } from './offer-identity';

describe('prueba de atributos exactos independiente de Jev', () => {
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
