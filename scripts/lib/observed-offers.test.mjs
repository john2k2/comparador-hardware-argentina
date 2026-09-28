import assert from 'node:assert/strict';
import test from 'node:test';
import { createObservedOfferSummary } from './observed-offers.mjs';

test('separa filas de productos distintos por tienda y conserva conteo entre páginas', () => {
  const summary = createObservedOfferSummary();
  summary.add([
    { store_id: 'a', product_id: 'cpu', price: 100, stock: 'in-stock' },
    { store_id: 'a', product_id: 'cpu', price: '120.50', stock: 'low-stock' },
  ]);
  summary.add([
    { store_id: 'a', product_id: 'gpu', price: 300, stock: 'in-stock' },
    { store_id: 'b', product_id: 'cpu', price: 110, stock: 'in-stock' },
  ]);
  const result = summary.getSummary();
  assert.equal(result.observedRows, 4);
  assert.equal(result.persistedProducts, 2);
  assert.deepEqual(result.observedByStore, { a: 3, b: 1 });
  assert.deepEqual(result.persistedProductsByStore, { a: 2, b: 1 });
  assert.equal(result.availableObservedRows, 4);
});

test('observar una publicación sin oferta comprable no acredita precio disponible', () => {
  const summary = createObservedOfferSummary();
  summary.add([
    { store_id: 'a', product_id: 'cpu', price: 100, stock: 'out-of-stock' },
    { store_id: 'b', product_id: 'gpu', price: 100, stock: 'unknown' },
    ...[0, -1, null, '', 'invalid', Infinity].map(price => ({ store_id: 'b', product_id: 'ram', price, stock: 'in-stock' })),
  ]);
  const result = summary.getSummary();
  assert.equal(result.observedRows, 8);
  assert.equal(result.persistedProducts, 3);
  assert.equal(result.availableObservedRows, 0);
  assert.deepEqual(result.availableObservedByStore, { a: 0, b: 0 });
});

test('el corte vacío es explícito y un corte previo no cambia al acumular nuevas páginas', () => {
  const summary = createObservedOfferSummary();
  const empty = summary.getSummary();
  assert.equal(empty.observedRows, 0);
  assert.equal(empty.availableObservedRows, 0);
  summary.add([{ store_id: 'a', product_id: 'cpu', price: 100, stock: 'in-stock' }]);
  assert.deepEqual(empty.observedByStore, {});
  assert.equal(summary.getSummary().observedRows, 1);
  assert.throws(() => summary.add([{ store_id: '', product_id: 'cpu' }]), /observación/);
});
