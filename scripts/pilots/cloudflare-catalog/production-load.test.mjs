import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LOAD_SCHEMA, prepareProductionLoad, readProductionLoad, loadNextChunk, activateProductionLoad } from './production-load.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'catalog-load-'));
  const source = new DatabaseSync(join(directory, 'source.sqlite'));
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
    + readFileSync(new URL('./projection.sql', import.meta.url), 'utf8');
  source.exec(schema);
  const target = new DatabaseSync(join(directory, 'target.sqlite')); target.exec(schema + LOAD_SCHEMA);
  t.after(() => { source.close(); target.close(); rmSync(directory, { recursive: true }); });
  source.prepare("INSERT INTO stores VALUES('mexx',?)").run('{"id":"mexx"}');
  source.prepare("INSERT INTO products VALUES('p','memoria-ram','p','ram','ram',1,0,NULL,NULL,?)")
    .run('{"id":"p","category":"memoria-ram","name":"RAM","specs":{"capacity":32}}');
  source.prepare("INSERT INTO product_substrings VALUES('p','ram')").run();
  source.prepare("INSERT INTO product_prices VALUES('o','p','mexx',100,'https://mexx.test/p',?)")
    .run('{"id":"o","product_id":"p","store_id":"mexx","price":100,"url":"https://mexx.test/p","last_updated":"2026-10-11T01:00:00.000Z"}');
  source.prepare("INSERT INTO summaries VALUES('p',100,100,100,1,'https://mexx.test/p',0,'[\"mexx\"]',NULL,NULL,NULL,'{}')").run();
  source.prepare("INSERT INTO price_basis VALUES('p','historical','o','mexx',100,'in-stock','https://mexx.test/p','2026-10-11T01:00:00.000Z')").run();
  source.prepare("INSERT INTO search_projection VALUES('p','memoria-ram','p',1,100,100,100,1,0,'https://mexx.test/p',NULL,'9999-12-31T00:00:00.000Z')").run();
  source.prepare("INSERT INTO pilot_meta VALUES('snapshot',?)").run('{"counts":{"products":1,"product_prices":1,"catalog_price_summaries":1,"stores":1}}');
  const planDir = join(directory, 'plan');
  const plan = prepareProductionLoad({ sqlite: join(directory, 'source.sqlite'), directory: planDir, maxStatements: 2 });
  const db = {
    first: async (sql, params = []) => target.prepare(sql).get(...params),
    all: async (sql, params = []) => target.prepare(sql).all(...params),
    execute: async statements => {
      target.exec('BEGIN'); let rowsWritten = 0;
      try {
        for (const { sql, params } of statements) rowsWritten += Number(target.prepare(sql).run(...params).changes);
        target.exec('COMMIT'); return { rowsWritten };
      } catch (error) { target.exec('ROLLBACK'); throw error; }
    },
  };
  return { source, target, db, directory: planDir, plan, root: directory };
}
async function load(f) {
  for (const { sequence } of f.plan.chunks) await loadNextChunk({ ...f, sequence });
}

test('la carga parcial no habilita catálogo y se reanuda sin duplicar base sin PK', async t => {
  const f = fixture(t);
  assert.deepEqual(readProductionLoad(f.directory), f.plan);
  await loadNextChunk({ ...f, sequence: 1 });
  await assert.rejects(activateProductionLoad(f), /LOAD_INCOMPLETE/);
  assert.equal(f.target.prepare('SELECT COUNT(*) AS n FROM pilot_meta').get().n, 0);
  await load(f);
  const n = f.target.prepare('SELECT COUNT(*) AS n FROM price_basis').get().n;
  await load(f);
  assert.equal(f.target.prepare('SELECT COUNT(*) AS n FROM price_basis').get().n, n);
  const manifest = await activateProductionLoad(f);
  assert.equal(manifest.complete, true);
  assert.equal(manifest.fingerprint, f.plan.catalog.fingerprint);
  assert.equal(JSON.parse(f.target.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value).catalog.fingerprint, manifest.fingerprint);
  assert.equal(JSON.parse(f.target.prepare('SELECT row_json FROM product_prices').get().row_json).last_updated, '2026-10-11T01:00:00.000Z');
});

test('timeout posterior al commit se concilia por recibo sin aplicar otra vez', async t => {
  const f = fixture(t), real = f.db.execute;
  f.db.execute = async s => { await real(s); throw Error('timeout'); };
  await assert.rejects(loadNextChunk({ ...f, sequence: 1 }), /timeout/);
  f.db.execute = real;
  assert.equal((await loadNextChunk({ ...f, sequence: 1 })).skipped, true);
});

test('lote corrupto, orden incorrecto y plan ajeno se rechazan antes de datos', async t => {
  const f = fixture(t);
  await assert.rejects(loadNextChunk({ ...f, sequence: 2 }), /OUT_OF_ORDER/);
  const first = f.plan.chunks[0];
  writeFileSync(join(f.directory, first.file), '[]');
  await assert.rejects(loadNextChunk({ ...f, sequence: 1 }), /HASH_MISMATCH/);
  f.target.prepare('INSERT INTO catalog_load_progress VALUES(1,?,?)').run('other', first.hash);
  await assert.rejects(loadNextChunk({ ...f, sequence: 1 }), /PROGRESS_CONFLICT/);
});

test('conflicto en una fila revierte también el progreso del lote', async t => {
  const f = fixture(t);
  f.target.prepare("INSERT INTO stores VALUES('mexx','{}')").run();
  await assert.rejects(loadNextChunk({ ...f, sequence: 1 }), /UNIQUE/);
  assert.equal(f.target.prepare('SELECT COUNT(*) AS n FROM catalog_load_progress').get().n, 0);
});

test('la activación verifica conteos, recibos y FTS; no basta terminar lotes', async t => {
  const f = fixture(t); await load(f);
  f.target.prepare('DELETE FROM product_substrings').run();
  await assert.rejects(activateProductionLoad(f), /FTS_COUNT_MISMATCH/);
  f.target.prepare("INSERT INTO product_substrings VALUES('p','ram')").run();
  f.target.prepare("UPDATE catalog_load_progress SET hash='wrong' WHERE sequence=1").run();
  await assert.rejects(activateProductionLoad(f), /CHUNK_RECEIPTS_MISMATCH/);
});

test('la identidad del catálogo sobrevive cambio de precio y exige nueva aprobación ante variante', t => {
  const f = fixture(t);
  const raw = JSON.parse(f.source.prepare('SELECT row_json FROM product_prices').get().row_json);
  f.source.prepare("UPDATE product_prices SET price=200,row_json=?").run(JSON.stringify({ ...raw, price: 200, last_updated: '2026-10-12T01:00:00.000Z' }));
  const price = prepareProductionLoad({ sqlite: join(f.root, 'source.sqlite'), directory: join(f.root, 'price-plan') });
  assert.equal(price.catalog.fingerprint, f.plan.catalog.fingerprint);
  assert.notEqual(price.hash, f.plan.hash);
  f.source.prepare("UPDATE products SET row_json=?").run('{"id":"p","category":"memoria-ram","name":"RAM","specs":{"capacity":16}}');
  const variant = prepareProductionLoad({ sqlite: join(f.root, 'source.sqlite'), directory: join(f.root, 'variant-plan') });
  assert.notEqual(variant.catalog.fingerprint, price.catalog.fingerprint);
});

test('activación tras timeout postcommit se concilia con el mismo plan y rechaza marcadores ajenos', async t => {
  const f = fixture(t); await load(f);
  const execute = f.db.execute;
  f.db.execute = async statements => { await execute(statements); throw Error('TIMEOUT_AFTER_COMMIT'); };
  await assert.rejects(activateProductionLoad(f), /TIMEOUT_AFTER_COMMIT/);
  f.db.execute = execute;
  assert.equal((await activateProductionLoad(f)).complete, true);
  f.target.prepare("UPDATE pilot_meta SET value='{}' WHERE key='production_catalog'").run();
  await assert.rejects(activateProductionLoad(f), /LOAD_ACTIVATION_CONFLICT/);
});

test('no se prepara una carga cuyo JSON cambió ID, categoría o precio frente a SQL', t => {
  const f = fixture(t);
  f.source.prepare("UPDATE products SET row_json=?").run('{"id":"wrong","category":"memoria-ram","name":"RAM"}');
  assert.throws(() => prepareProductionLoad({ sqlite: join(f.root, 'source.sqlite'), directory: join(f.root, 'bad-plan') }), /LOAD_PRODUCT_IDENTITY_MISMATCH/);
});
