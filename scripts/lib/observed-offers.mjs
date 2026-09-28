/** Cuenta filas actualizadas y productos distintos; no acredita identidad ni compra real. */
export function createObservedOfferSummary() {
  const observedByStore = new Map();
  const productsByStore = new Map();
  const availableByStore = new Map();
  const products = new Set();

  return {
    add(rows) {
      for (const row of rows) {
        if (typeof row.store_id !== 'string' || !row.store_id
          || typeof row.product_id !== 'string' || !row.product_id) {
          throw new Error('Una observación no tiene tienda o producto válido.');
        }
        observedByStore.set(row.store_id, (observedByStore.get(row.store_id) ?? 0) + 1);
        const storeProducts = productsByStore.get(row.store_id) ?? new Set();
        storeProducts.add(row.product_id);
        productsByStore.set(row.store_id, storeProducts);
        products.add(row.product_id);
        const price = Number(row.price);
        if (['in-stock', 'low-stock'].includes(row.stock) && Number.isFinite(price) && price > 0) {
          availableByStore.set(row.store_id, (availableByStore.get(row.store_id) ?? 0) + 1);
        }
      }
    },
    getSummary() {
      const sum = (counts) => [...counts.values()].reduce((total, count) => total + count, 0);
      return {
        observedRows: sum(observedByStore),
        persistedProducts: products.size,
        observedByStore: Object.fromEntries(observedByStore),
        persistedProductsByStore: Object.fromEntries([...productsByStore].map(([id, ids]) => [id, ids.size])),
        availableObservedRows: sum(availableByStore),
        availableObservedByStore: Object.fromEntries([...observedByStore.keys()].map(id => [id, availableByStore.get(id) ?? 0])),
      };
    },
  };
}
