import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureMacCatalogBinding, MAC_CATALOG_BINDING_SYMBOL, registerMacCatalogBinding } from './mac-catalog-binding';
const host = globalThis as unknown as Record<PropertyKey, unknown>;
afterEach(() => { delete host[MAC_CATALOG_BINDING_SYMBOL]; });
const result = { success: true, results: [{ value: 'public' }], meta: { rows_written: 0 } };
function provider(all = vi.fn(async () => result)) {
  return { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ all, run: vi.fn() })), run: vi.fn() })), batch: vi.fn(), privateField: 'not-returned' };
}
describe('binding explícito del catálogo Mac', () => {
  it('ausente falla sin instalar backend', () => {
    expect(() => captureMacCatalogBinding()).toThrow('CATALOG_MAC_BINDING_REQUIRED');
  });
  it('registro rechaza accessor sin ejecutarlo y no reemplaza proveedor anterior', () => {
    const first = provider(); registerMacCatalogBinding(first);
    const before = host[MAC_CATALOG_BINDING_SYMBOL], getter = vi.fn();
    const invalid = Object.defineProperty({}, 'prepare', { get: getter });
    expect(() => registerMacCatalogBinding(invalid as never)).toThrow('CATALOG_MAC_BINDING_INVALID');
    expect(getter).not.toHaveBeenCalled(); expect(host[MAC_CATALOG_BINDING_SYMBOL]).toBe(before);
  });
  it('wrapper congelado sólo expone prepare/bind/all y conserva SQL/resultados', async () => {
    const raw = provider(); registerMacCatalogBinding(raw);
    const { binding } = captureMacCatalogBinding();
    expect(Object.keys(binding)).toEqual(['prepare']); expect(Object.isFrozen(binding)).toBe(true);
    const statement = binding.prepare('SELECT value FROM pilot_meta');
    expect(Object.keys(statement)).toEqual(['bind']); expect(Object.isFrozen(statement)).toBe(true);
    const bound = statement.bind('snapshot'); expect(Object.keys(bound)).toEqual(['all']); expect(Object.isFrozen(bound)).toBe(true);
    expect(await bound.all()).toBe(result); expect(raw.prepare).toHaveBeenCalledWith('SELECT value FROM pilot_meta');
    expect(raw.batch).not.toHaveBeenCalled();
  });
  it('cambio del proveedor durante await rechaza resultado anterior', async () => {
    let release!: (value: typeof result) => void;
    registerMacCatalogBinding(provider(vi.fn(() => new Promise(resolve => { release = resolve; }))));
    const pending = captureMacCatalogBinding().binding.prepare('SELECT 1').bind().all();
    registerMacCatalogBinding(provider()); release(result);
    await expect(pending).rejects.toThrow('CATALOG_MAC_BINDING_CHANGED');
  });
  it('lector capturado no reutiliza proveedor sustituido entre solicitudes', () => {
    registerMacCatalogBinding(provider()); const captured = captureMacCatalogBinding();
    delete host[MAC_CATALOG_BINDING_SYMBOL];
    expect(() => captured.binding.prepare('SELECT 1')).toThrow('CATALOG_MAC_BINDING_CHANGED');
  });
});
