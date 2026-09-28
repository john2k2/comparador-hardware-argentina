import { describe, expect, it } from 'vitest';
import {
  canRequestNonPersonalizedAd,
  resolveTcfAdvertisingDecision,
  resolveUsAdvertisingDecision,
} from './consent-signals';

type TcData = Record<string, unknown>;

const validTcData: TcData = {
  gdprApplies: true,
  cmpStatus: 'loaded',
  eventStatus: 'useractioncomplete',
  isServiceSpecific: true,
  tcString: 'TC_Example.fixture',
  purpose: {
    consents: { '1': true },
    legitimateInterests: { '2': true, '7': true, '9': true, '10': true },
  },
  vendor: {
    consents: { '755': true },
    legitimateInterests: { '755': true },
    disclosedVendors: { '755': true },
  },
  publisher: { restrictions: {} },
};

function makeTcData(mutator?: (data: TcData) => void): TcData {
  const data = structuredClone(validTcData) as TcData;
  mutator?.(data);
  return data;
}

function section(data: TcData, key: string): TcData {
  return data[key] as TcData;
}

describe('señales de consentimiento para publicidad', () => {
  it('permite el fixture TCF válido', () => {
    expect(resolveTcfAdvertisingDecision(validTcData, true)).toBe('allowed');
  });

  it('considera fuera de ámbito GDPR un TCData reducido', () => {
    expect(resolveTcfAdvertisingDecision({ gdprApplies: false }, true)).toBe('not-applicable');
  });

  it.each([
    ['success falso', validTcData, false],
    ['gdprApplies ausente', makeTcData((data) => { delete data.gdprApplies; }), true],
    ['CMP en stub', makeTcData((data) => { data.cmpStatus = 'stub'; }), true],
    ['CMP UI visible', makeTcData((data) => { data.eventStatus = 'cmpuishown'; }), true],
    ['TC string vacío', makeTcData((data) => { data.tcString = ''; }), true],
    ['TC string global', makeTcData((data) => { data.isServiceSpecific = false; data.tcString = 'GLOBAL.fixture'; }), true],
  ] as Array<[string, unknown, boolean]>)('no autoriza con estado desconocido: %s', (_label, value, success) => {
    expect(resolveTcfAdvertisingDecision(value, success)).toBe('unknown');
  });

  it.each([
    ['P1 falso', (data: TcData) => { section(section(data, 'purpose'), 'consents')['1'] = false; }],
    ['P1 ausente', (data: TcData) => { delete section(section(data, 'purpose'), 'consents')['1']; }],
    ['consentimiento de Google falso', (data: TcData) => { section(section(data, 'vendor'), 'consents')['755'] = false; }],
    ['Google no divulgado', (data: TcData) => { delete section(section(data, 'vendor'), 'disclosedVendors')['755']; }],
    ['LI de propósito 7 falso', (data: TcData) => { section(section(data, 'purpose'), 'legitimateInterests')['7'] = false; }],
    ['LI de Google falso', (data: TcData) => { section(section(data, 'vendor'), 'legitimateInterests')['755'] = false; }],
  ] as Array<[string, (data: TcData) => void]>)('deniega anuncios con una señal insuficiente: %s', (_label, mutator) => {
    expect(resolveTcfAdvertisingDecision(makeTcData(mutator), true)).toBe('denied');
  });

  it.each([
    ['restricción 0', 0, 'denied', undefined, 'vendor'],
    ['restricción 1 usando solo LI', 1, 'denied', undefined, 'vendor'],
    ['restricción 1 con consentimiento P7', 1, 'allowed', true, 'vendor'],
    ['restricción 2 usando LI', 2, 'allowed', undefined, 'vendor'],
    ['restricción inválida 3', 3, 'denied', undefined, 'vendor'],
    ['restricción inválida string', '1', 'denied', undefined, 'vendor'],
    ['restricción malformada', ['1'], 'unknown', undefined, 'direct'],
  ] as Array<[string, unknown, 'allowed' | 'denied' | 'unknown', boolean | undefined, 'vendor' | 'direct']>)('aplica la restricción P7 para Google: %s', (_label, restriction, expected, consent7, shape) => {
    const result = resolveTcfAdvertisingDecision(makeTcData((data) => {
      section(section(data, 'publisher'), 'restrictions')['7'] = shape === 'direct'
        ? restriction
        : { '755': restriction };
      if (consent7 === true) section(section(data, 'purpose'), 'consents')['7'] = true;
    }), true);
    expect(result).toBe(expected);
  });

  it('usa LI para P7 cuando no existe una restricción explícita 1', () => {
    const data = makeTcData((value) => {
      delete section(section(value, 'purpose'), 'consents')['7'];
    });
    expect(resolveTcfAdvertisingDecision(data, true)).toBe('allowed');
  });

  it('apaga la autorización cuando se retira el consentimiento P1', () => {
    expect(resolveTcfAdvertisingDecision(validTcData, true)).toBe('allowed');
    const withdrawn = makeTcData((data) => {
      section(section(data, 'purpose'), 'consents')['1'] = false;
    });
    expect(resolveTcfAdvertisingDecision(withdrawn, true)).toBe('denied');
  });
});

describe('señales de consentimiento de Estados Unidos', () => {
  it.each([
    [1, 'not-applicable'],
    [2, 'denied'],
    [3, 'denied'],
    [0, 'unknown'],
    [undefined, 'unknown'],
    ['1', 'unknown'],
  ] as Array<[unknown, 'not-applicable' | 'denied' | 'unknown']>)('resuelve el estado US %s', (value, expected) => {
    expect(resolveUsAdvertisingDecision(value)).toBe(expected);
  });
});

describe('permiso propio para solicitar anuncios no personalizados', () => {
  it.each([
    ['EU allowed', true, 'allowed', 'not-applicable'],
    ['EU not-applicable', true, 'not-applicable', 'not-applicable'],
  ] as Array<[string, boolean, 'allowed' | 'not-applicable', 'not-applicable']>)('permite solo con señales regionales compatibles: %s', (_label, bootstrapAllowed, euDecision, usDecision) => {
    expect(canRequestNonPersonalizedAd(bootstrapAllowed, euDecision, usDecision)).toBe(true);
  });

  it.each([
    ['bootstrap falso', false, 'allowed', 'not-applicable'],
    ['EU desconocido', true, 'unknown', 'not-applicable'],
    ['EU denegado', true, 'denied', 'not-applicable'],
    ['US desconocido', true, 'allowed', 'unknown'],
    ['US denegado', true, 'allowed', 'denied'],
  ] as Array<[string, boolean, 'allowed' | 'denied' | 'unknown' | 'not-applicable', 'allowed' | 'denied' | 'unknown' | 'not-applicable']>)('mantiene bloqueada la solicitud si falla una condición: %s', (_label, bootstrapAllowed, euDecision, usDecision) => {
    expect(canRequestNonPersonalizedAd(bootstrapAllowed, euDecision, usDecision)).toBe(false);
  });
});
