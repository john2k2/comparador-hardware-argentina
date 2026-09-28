export type AdvertisingDecision = 'unknown' | 'allowed' | 'denied' | 'not-applicable';

const GOOGLE_VENDOR_ID = '755';
const BASIC_AD_PURPOSES = ['2', '7', '9', '10'];

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function flag(value: unknown, key: string): boolean {
  return record(value)?.[key] === true;
}

/** Filtro conservador para NPA; Google/CMP conservan validación del TC string completo. */
export function resolveTcfAdvertisingDecision(value: unknown, success: boolean): AdvertisingDecision {
  const data = record(value);
  if (success !== true || !data || typeof data.gdprApplies !== 'boolean') return 'unknown';
  // Fuera del ámbito GDPR, IAB no exige los campos de elección de TCData.
  if (data.gdprApplies === false) return 'not-applicable';
  if (data.cmpStatus !== 'loaded' || !['tcloaded', 'useractioncomplete'].includes(String(data.eventStatus))) return 'unknown';
  if (data.isServiceSpecific !== true || typeof data.tcString !== 'string'
    || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(data.tcString)) return 'unknown';

  const purpose = record(data.purpose);
  const vendor = record(data.vendor);
  const publisher = record(data.publisher);
  if (data.publisher !== undefined && !publisher) return 'unknown';
  const restrictions = record(publisher?.restrictions);
  if (publisher?.restrictions !== undefined && !restrictions) return 'unknown';
  for (const id of ['1', ...BASIC_AD_PURPOSES]) {
    if (restrictions?.[id] !== undefined && !record(restrictions[id])) return 'unknown';
  }
  if (!purpose || !vendor) return 'unknown';
  // El piloto exige divulgación de Google en TCF 2.3; no rescata strings antiguos.
  if (!flag(vendor.disclosedVendors, GOOGLE_VENDOR_ID)
    || !flag(vendor.consents, GOOGLE_VENDOR_ID) || !flag(purpose.consents, '1')) return 'denied';
  const purposeOneRestriction = record(restrictions?.['1'])?.[GOOGLE_VENDOR_ID];
  if (purposeOneRestriction !== undefined && purposeOneRestriction !== 1) return 'denied';

  for (const id of BASIC_AD_PURPOSES) {
    const restriction = record(restrictions?.[id])?.[GOOGLE_VENDOR_ID];
    if (restriction !== undefined && restriction !== 1 && restriction !== 2) return 'denied';
    const consent = flag(purpose.consents, id) && flag(vendor.consents, GOOGLE_VENDOR_ID);
    const legitimateInterest = flag(purpose.legitimateInterests, id) && flag(vendor.legitimateInterests, GOOGLE_VENDOR_ID);
    // Google registra estos fines con LI por defecto; cambiarlo requiere restricción de CMP.
    if (!(restriction === 1 ? consent : legitimateInterest)) return 'denied';
  }
  return 'allowed';
}

/** El primer piloto excluye estados de EE.UU. aplicables; no interpreta su opt-out como permiso global. */
export function resolveUsAdvertisingDecision(value: unknown): AdvertisingDecision {
  if (value === 1) return 'not-applicable';
  if (value === 2 || value === 3) return 'denied';
  return 'unknown';
}

/** Permiso propio de carga de Google, independiente de GA4 y de la decisión regional CMP. */
export function canRequestNonPersonalizedAd(
  bootstrapAllowed: boolean,
  euDecision: AdvertisingDecision,
  usDecision: AdvertisingDecision,
): boolean {
  return bootstrapAllowed
    && (euDecision === 'allowed' || euDecision === 'not-applicable')
    && usDecision === 'not-applicable';
}
