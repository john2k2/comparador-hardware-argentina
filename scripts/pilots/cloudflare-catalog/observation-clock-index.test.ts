import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { installObservationClockIndex } from './observation-clock-index';
import { catalogReadDeadline } from '../../../src/lib/catalog/catalog-read-clock';
import { validateDatabase } from '../../mac-catalog-server';
function fixture(date: string | null) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE product_prices(id TEXT PRIMARY KEY,price REAL,row_json TEXT);CREATE TABLE pilot_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE summaries(comparable_stats_json TEXT,comparable_valid_until TEXT);CREATE INDEX summaries_valid_idx ON summaries(comparable_valid_until) WHERE comparable_stats_json IS NOT NULL');
  db.prepare('INSERT INTO product_prices VALUES(?,?,?)').run('offer',100000,JSON.stringify({last_updated:date}));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',JSON.stringify({counts:{product_prices:1},cache:{generation:'retained'}}));
  return db;
}
test('instala índice certificado, conserva observación y replay sin renovar reloj', () => {
  const db=fixture('2026-10-12T12:00:00.123Z');
  try {
    const raw=db.prepare('SELECT row_json FROM product_prices').get()!.row_json;
    const first=installObservationClockIndex(db), marker=db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value;
    assert.deepEqual(installObservationClockIndex(db),first);
    assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value,marker);
    assert.equal(db.prepare('SELECT row_json FROM product_prices').get()!.row_json,raw);
    assert.equal(JSON.parse(String(marker)).cache.generation,'retained');
    assert.equal(first.offers,1);
  }finally{db.close();}
});
test('rechaza formato sólo JS, sin índice ni certificación parcial', () => {
  for(const date of ['October 12, 2026 12:00:00 UTC']){
    const db=fixture(date);
    try {
      const before=db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value;
      assert.throws(()=>installObservationClockIndex(db),/OBSERVATION_CLOCK_DATE_MISMATCH/);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='prices_observed_idx'").get()!.n,0);
      assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value,before);
    }finally{db.close();}
  }
});

test('trunca submilisegundos antes de SQLite sin carry y conserva raw y offsets', async () => {
  for (const date of ['2026-10-12T12:00:00.123789Z', '2026-10-12T23:59:59.999789Z',
    '2026-10-12T12:00:00.999789+01:00', '2026-10-12T12:00:00.999789-03:30']) {
    const db = fixture(date);
    try {
      const raw = db.prepare('SELECT row_json FROM product_prices').get()!.row_json;
      const certificate = installObservationClockIndex(db);
      assert.equal(certificate.version, 2);
      const expected = Date.parse(date), clock = expected - 60_001;
      const plans: string[] = [];
      const adapter = { all: async () => [], first: async (sql: string, values: unknown[] = []) => {
        plans.push(...db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...values as never[]).map(row => String(row.detail)));
        return db.prepare(sql).get(...values as never[]);
      } };
      const snapshot = String(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value);
      assert.equal(await catalogReadDeadline(adapter, snapshot, clock, true), expected - 60_000);
      assert.equal(plans.filter(plan => /SEARCH product_prices USING INDEX prices_observed_idx/.test(plan)).length, 3);
      assert.equal(db.prepare('SELECT row_json FROM product_prices').get()!.row_json, raw);
    } finally { db.close(); }
  }
});

test('certificación rechazada revierte recreación del índice y un reader sin certificado válido falla cerrado', async () => {
  const db = fixture('2026-10-12T12:00:00.123789Z');
  const oldSql = "CREATE INDEX prices_observed_idx ON product_prices(strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(row_json,'$.last_updated'))) WHERE price>0";
  try {
    db.exec(oldSql);
    db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify({ counts: { product_prices: 2 } }));
    assert.throws(() => installObservationClockIndex(db), /OBSERVATION_CLOCK_COUNTS/);
    assert.equal(db.prepare("SELECT sql FROM sqlite_schema WHERE name='prices_observed_idx'").get()!.sql, oldSql);
    let calls = 0;
    const adapter = { all: async () => [], first: async () => { calls++; return { next_transition: null }; } };
    for (const certificate of [null, { version: 2, timestampPolicy: 'js-sql-ms-v1', validated: true, offers: 1 },
      { version: 3, timestampPolicy: 'js-sql-ms-v3', validated: true, offers: 1 }]) {
      await assert.rejects(catalogReadDeadline(adapter, JSON.stringify({ counts: { product_prices: 1 }, clock_observations: certificate }), Date.now(), true), /CATALOG_CLOCK_OBSERVATIONS_NOT_READY/);
    }
    assert.equal(calls, 0);
  } finally { db.close(); }
});

test('recrea índice v1 en v2 y conserva certificados v1 al leer sin migrar', async () => {
  const db = fixture('2026-10-12T12:00:00.123Z');
  const oldSql = "CREATE INDEX prices_observed_idx ON product_prices(strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(row_json,'$.last_updated'))) WHERE price>0";
  try {
    db.exec(oldSql);
    const certificate = { version: 1, validated: true, timestampPolicy: 'js-sql-ms-v1', offers: 1 };
    const oldSnapshot = JSON.stringify({ counts: { product_prices: 1 }, clock_observations: certificate });
    const expected = Date.parse('2026-10-12T12:00:00.123Z'), clock = expected - 60_001;
    const adapter = { all: async () => [], first: async (sql: string, values: unknown[] = []) => db.prepare(sql).get(...values as never[]) };
    assert.equal(await catalogReadDeadline(adapter, oldSnapshot, clock, true), expected - 60_000);
    installObservationClockIndex(db);
    const nextSql = String(db.prepare("SELECT sql FROM sqlite_schema WHERE name='prices_observed_idx'").get()!.sql);
    assert.notEqual(nextSql, oldSql); assert.match(nextSql, /ltrim/i);
    const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT MIN(${nextSql.slice(nextSql.indexOf('ON product_prices(') + 18, nextSql.lastIndexOf(') WHERE'))}) FROM product_prices INDEXED BY prices_observed_idx WHERE price>0`).all();
    assert.ok(plan.some(row => String(row.detail).includes('prices_observed_idx')));
  } finally { db.close(); }
});

test('servidor acepta certificados v1/v2 correctos y rechaza pares de política mezclados', () => {
  const db = new DatabaseSync(':memory:'), fingerprint = 'a'.repeat(64);
  db.exec('CREATE TABLE products(id);CREATE TABLE product_prices(id);CREATE TABLE summaries(id);CREATE TABLE stores(id);CREATE TABLE pilot_meta(key TEXT PRIMARY KEY,value TEXT)');
  for (const table of ['products', 'product_prices', 'summaries', 'stores']) db.prepare(`INSERT INTO ${table} VALUES(?)`).run('fixture');
  const counts = { products: 1, product_prices: 1, catalog_price_summaries: 1, stores: 1 };
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog', JSON.stringify({ version: 1, fingerprint, complete: true, countsVerified: true, counts }));
  try {
    for (const [version, timestampPolicy, accepted] of [[1, 'js-sql-ms-v1', true], [2, 'js-sql-ms-v2', true], [1, 'js-sql-ms-v2', false], [2, 'js-sql-ms-v1', false]] as const) {
      db.prepare('INSERT OR REPLACE INTO pilot_meta VALUES(?,?)').run('snapshot', JSON.stringify({ counts, catalog: { version: 1, fingerprint, counts },
        clock_observations: { version, timestampPolicy, validated: true, offers: 1 } }));
      if (accepted) assert.doesNotThrow(() => validateDatabase(db, fingerprint));
      else assert.throws(() => validateDatabase(db, fingerprint), /MAC_SERVICE_DATABASE_CLOCK/);
    }
  } finally { db.close(); }
});
test('fecha inválida no gana frescura; conteo diferente impide certificar', () => {
  const db=fixture(null);
  try {
    assert.equal(installObservationClockIndex(db).offers,1);
    db.prepare('INSERT INTO product_prices VALUES(?,?,?)').run('other',1,JSON.stringify({last_updated:'not-a-date'}));
    assert.throws(()=>installObservationClockIndex(db),/OBSERVATION_CLOCK_COUNTS/);
    assert.equal(JSON.parse(String(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value)).clock_observations.offers,1);
  }finally{db.close();}
});

test('rechaza fechas que dependan de coerción de arrays u objetos JSON', () => {
  for(const raw of [['2026-10-12T12:00:00Z'],{date:'2026-10-12T12:00:00Z'},0,true]){
    const db=fixture(null);
    try{
      db.prepare('UPDATE product_prices SET row_json=?').run(JSON.stringify({last_updated:raw}));
      assert.throws(()=>installObservationClockIndex(db),/OBSERVATION_CLOCK_DATE_TYPE/);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='prices_observed_idx'").get()!.n,0);
    }finally{db.close();}
  }
});

test('fracciones ISO de cero a seis dígitos con Z y offsets preservan fechas originales', () => {
  for (const fraction of ['', '.1', '.12', '.123', '.1234', '.12378', '.123789', '.999789']) {
    for (const zone of ['Z', '+00:00', '+01:00', '-03:30']) {
      const date = '2026-10-12T23:59:59' + fraction + zone, db = fixture(date);
      try {
        assert.equal(installObservationClockIndex(db).offers, 1, date);
        assert.equal(JSON.parse(String(db.prepare('SELECT row_json FROM product_prices').get()!.row_json)).last_updated, date);
      } finally { db.close(); }
    }
  }
});
