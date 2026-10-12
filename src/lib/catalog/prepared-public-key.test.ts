import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());
async function publicKey() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { pair, encoded: btoa(String.fromCharCode(...raw)) };
}
describe('verificador público compartido', () => {
  it('comparte importación concurrente y exige una clave sólo de verificación', async () => {
    const { pair, encoded } = await publicKey();
    const { preparedProductVerifier } = await import('./prepared-public-key');
    const spy = vi.spyOn(crypto.subtle, 'importKey');
    const values = await Promise.all(Array.from({ length: 12 }, () => preparedProductVerifier(encoded)));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(values.every(value => value === values[0])).toBe(true);
    expect(Object.isFrozen(values[0])).toBe(true);
    expect(values[0].key.extractable).toBe(false);
    expect(values[0].key.usages).toEqual(['verify']);
    const message = new TextEncoder().encode('corte independiente');
    const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, message);
    expect(await crypto.subtle.verify('Ed25519', values[0].key, signature, message)).toBe(true);
    await expect(crypto.subtle.sign('Ed25519', values[0].key, message)).rejects.toThrow();
  });
  it('acota la memoria, conserva claves distintas y vuelve a importar una desalojada', async () => {
    const keys = await Promise.all([publicKey(), publicKey(), publicKey()]);
    const { preparedProductVerifier } = await import('./prepared-public-key');
    const spy = vi.spyOn(crypto.subtle, 'importKey');
    const a = await preparedProductVerifier(keys[0].encoded);
    const b = await preparedProductVerifier(keys[1].encoded);
    expect(a.keyId).not.toBe(b.keyId);
    await preparedProductVerifier(keys[2].encoded);
    expect((await preparedProductVerifier(keys[0].encoded)).keyId).toBe(a.keyId);
    expect(spy).toHaveBeenCalledTimes(4);
  });
  it('una importación fallida se rechaza y un intento posterior puede recuperarse', async () => {
    const { encoded } = await publicKey();
    const { preparedProductVerifier } = await import('./prepared-public-key');
    const spy = vi.spyOn(crypto.subtle, 'importKey').mockRejectedValueOnce(new Error('IMPORT_FAILED'));
    await expect(preparedProductVerifier(encoded)).rejects.toThrow('IMPORT_FAILED');
    expect((await preparedProductVerifier(encoded)).key.type).toBe('public');
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it('rechaza entradas malformadas antes de consultar o importar claves', async () => {
    const { preparedProductVerifier } = await import('./prepared-public-key');
    const spy = vi.spyOn(crypto.subtle, 'importKey');
    for (const encoded of ['', 'a'.repeat(43)+'=', 'a'.repeat(44), 'a'.repeat(43)+'==', null]) {
      await expect(preparedProductVerifier(encoded as string)).rejects.toThrow('CONFIGURATION_INVALID');
    }
    expect(spy).not.toHaveBeenCalled();
  });
});
