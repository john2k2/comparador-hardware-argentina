import { importPreparedProductPublicKey, preparedProductPublicKeyId } from './prepared-product';

type Verifier = Readonly<{ key: CryptoKey; keyId: string }>;
// Sólo claves públicas inmutables. No conserva filas, dictámenes ni frescura.
const verifiers = new Map<string, Promise<Verifier>>();
const capacity = 2;

/** Comparte también una importación concurrente; una falla nunca queda cacheada. */
export async function preparedProductVerifier(encoded: string): Promise<Verifier> {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error('CATALOG_PREPARED_CONFIGURATION_INVALID');
  const cached = verifiers.get(encoded);
  if (cached) {
    verifiers.delete(encoded); verifiers.set(encoded, cached);
    return cached;
  }
  const pending = (async () => {
    const raw = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    if (raw.length !== 32 || btoa(String.fromCharCode(...raw)) !== encoded)
      throw new Error('CATALOG_PREPARED_CONFIGURATION_INVALID');
    const keyId = await preparedProductPublicKeyId(raw);
    const key = await importPreparedProductPublicKey(raw, keyId);
    return Object.freeze({ key, keyId });
  })();
  verifiers.set(encoded, pending);
  if (verifiers.size > capacity) verifiers.delete(verifiers.keys().next().value!);
  try { return await pending; }
  catch (error) {
    if (verifiers.get(encoded) === pending) verifiers.delete(encoded);
    throw error;
  }
}
