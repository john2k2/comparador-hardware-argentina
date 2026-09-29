import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
const env = { ...process.env, PGOPTIONS: '-c statement_timeout=10000 -c lock_timeout=8000' };
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
async function query(sql) {
  return (await exec('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env })).stdout.trim();
}
function transaction(sql, name) {
  const child = spawn('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    env: { ...env, PGAPPNAME: name }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let error = '';
  child.stdout.resume();
  child.stderr.on('data', chunk => { error += chunk; });
  const result = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(error)));
  });
  // La aserción espera ambas promesas, incluso si una falla antes de la otra.
  result.catch(() => {});
  return { child, result };
}
async function waitFor(sql) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await query(sql) === 't') return;
    await delay(40);
  }
  throw new Error('No se observó el bloqueo concurrente esperado');
}

test('dos escritores de ofertas mantienen precio, historial y resumen coherentes', { timeout: 20000 }, async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(env.PGHOST), 'Sólo base LOCAL');
  assert.match(env.PGDATABASE ?? '', /^catalog[_-]/, 'Exigir nombre de base de pruebas explícito');
  const id = `test-concurrent-${process.pid}`;
  const nameA = `${id}-a`, nameB = `${id}-b`;
  const offer = (store, price, observedAt) => ({ product_id: id, store_id: store,
    url: `https://example.invalid/${store}`, price, stock: 'in-stock',
    last_updated: observedAt, state_signature: `${store}:${price}` });
  const persist = offers => `select public.persist_catalog_offers(${literal(JSON.stringify(offers))}::jsonb);`;
  const before = new Date(Date.now() - 60000).toISOString();
  const first = new Date(Date.now() - 1000).toISOString();
  const second = new Date().toISOString();
  let a, b;
  await query(`insert into products(id,name,model,category) values(${literal(id)},'Concurrency','Concurrency','perifericos');`);
  try {
    await query(persist([offer('mexx', 100000, before), offer('venex', 200000, before)]));
    a = transaction(`begin; ${persist([offer('mexx', 110000, first), offer('venex', 210000, first)])} select pg_sleep(2); commit;`, nameA);
    await waitFor(`select exists(select 1 from pg_stat_activity where application_name=${literal(nameA)} and wait_event='PgSleep');`);
    b = transaction(persist([offer('venex', 190000, second)]), nameB);
    await waitFor(`select exists(select 1 from pg_stat_activity where application_name=${literal(nameB)} and wait_event_type='Lock');`);
    await Promise.all([a.result, b.result]);
    const summary = JSON.parse(await query(`select json_build_object('lowest',lowest,'highest',highest,'offers',cardinality(offer_ids)) from catalog_price_summaries where product_id=${literal(id)};`));
    assert.deepEqual(summary, { lowest: 110000, highest: 190000, offers: 2 });
    assert.equal(await query(`select count(*) from price_history where product_id=${literal(id)};`), '5');
    await query(persist([offer('venex', 190000, second)]));
    assert.equal(await query(`select count(*) from price_history where product_id=${literal(id)};`), '5', 'Reintentar no duplica eventos');
    assert.equal(await query(`select has_function_privilege('service_role','persist_catalog_offers_unlocked(jsonb)','execute');`), 'f');
    assert.equal(await query(`select public.delete_catalog_offers(${literal(JSON.stringify([offer('venex', 190000, second)]))}::jsonb);`), '1');
    assert.equal(await query(`select cardinality(offer_ids) from catalog_price_summaries where product_id=${literal(id)};`), '1');
  } finally {
    a?.child.kill(); b?.child.kill();
    await Promise.allSettled([a?.result, b?.result]);
    await query(`delete from products where id=${literal(id)};`);
    assert.equal(await query(`select count(*) from catalog_price_summaries where product_id=${literal(id)};`), '0');
  }
});
