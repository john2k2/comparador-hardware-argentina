import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { installObservationClockIndex } from './observation-clock-index';
function fixture(date: string | null) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE product_prices(id TEXT PRIMARY KEY,price REAL,row_json TEXT);CREATE TABLE pilot_meta(key TEXT PRIMARY KEY,value TEXT)');
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
test('rechaza redondeo submilisegundo y formato sólo JS, sin índice ni certificación parcial', () => {
  for(const date of ['2026-10-12T12:00:00.123999Z','October 12, 2026 12:00:00 UTC']){
    const db=fixture(date);
    try {
      const before=db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value;
      assert.throws(()=>installObservationClockIndex(db),/OBSERVATION_CLOCK_DATE_MISMATCH/);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='prices_observed_idx'").get()!.n,0);
      assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value,before);
    }finally{db.close();}
  }
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
