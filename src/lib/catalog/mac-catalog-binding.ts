/** Inyección explícita del launcher Node. Este módulo no abre SQLite ni archivos. */
export const MAC_CATALOG_BINDING_SYMBOL = Symbol.for('__comparador_mac_catalog_binding__');

type SqlResult = { success: boolean; results: Record<string, unknown>[]; meta?: Record<string, unknown> };
export type MacCatalogBinding = {
  prepare(sql: string): { bind(...values: unknown[]): { all(): Promise<SqlResult> } };
};
const host = globalThis as unknown as Record<PropertyKey, unknown>;
function dataMethod(value: unknown, key: string): (...args: unknown[]) => unknown {
  if (!value || typeof value !== 'object') throw new Error('CATALOG_MAC_BINDING_INVALID');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'function')
    throw new Error('CATALOG_MAC_BINDING_INVALID');
  return descriptor.value;
}
function currentProvider(): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(host, MAC_CATALOG_BINDING_SYMBOL);
  if (!descriptor || !('value' in descriptor) || !descriptor.value)
    throw new Error('CATALOG_MAC_BINDING_REQUIRED');
  return descriptor.value;
}

/** Un cambio de proveedor durante una lectura invalida el resultado completo. */
export function captureMacCatalogBinding(): { binding: MacCatalogBinding; assertCurrent(): void } {
  const provider = currentProvider(), prepare = dataMethod(provider, 'prepare');
  function assertCurrent() {
    try {
      if (currentProvider() === provider && dataMethod(provider, 'prepare') === prepare) return;
    } catch { /* Una eliminación o accessor nuevo también invalida el proveedor. */ }
    throw new Error('CATALOG_MAC_BINDING_CHANGED');
  }
  return { binding: readonlyBinding(provider, prepare, assertCurrent), assertCurrent };
}

function readonlyBinding(provider: unknown, prepare: (...args: unknown[]) => unknown, assertCurrent: () => void): MacCatalogBinding {
  return Object.freeze({
    prepare(sql: string) {
      assertCurrent();
      const statement = prepare.call(provider, sql), bind = dataMethod(statement, 'bind');
      return Object.freeze({ bind(...values: unknown[]) {
        assertCurrent();
        const bound = bind.apply(statement, values), all = dataMethod(bound, 'all');
        return Object.freeze({ async all() {
          assertCurrent();
          const result = await all.call(bound);
          assertCurrent();
          return result as SqlResult;
        } });
      } });
    },
  });
}

/** Expone únicamente prepare/bind/all. El launcher abre la DB readOnly. */
export function registerMacCatalogBinding(binding: MacCatalogBinding): void {
  const prepare = dataMethod(binding, 'prepare');
  const readonly = readonlyBinding(binding, prepare, () => undefined);
  Object.defineProperty(host, MAC_CATALOG_BINDING_SYMBOL,
    { value: readonly, writable: true, configurable: true, enumerable: false });
}
