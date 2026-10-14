import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {rebuildProjection} from './projection.mjs';
import {chargeDailyBudget} from './daily-budget.mjs';
const clock=Date.parse('2026-10-11T05:00:00Z');
const cli=new URL('./projection-cli.mjs',import.meta.url).pathname;
function setup(t,{projected=true}={}) {
  const dir=mkdtempSync(path.join(tmpdir(),'projection-cli-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const sqlite=path.join(dir,'catalog.sqlite'),sql=path.join(dir,'clock.sql');
  const db=new DatabaseSync(sqlite);db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',JSON.stringify({counts:{},hashes:{}}));
  if(projected)rebuildProjection(db,{now:clock,generation:'fixture'});
  db.close();
  const run=(...flags)=>spawnSync(process.execPath,[cli,sqlite,sql,'--now',new Date(clock+1000).toISOString(),...flags],{encoding:'utf8'});
  return {sqlite,sql,run};
}
function expire(sqlite) {
  const db=new DatabaseSync(sqlite),value=JSON.parse(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value);
  value.cache.validUntil=new Date(clock+1).toISOString();
  db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify(value));db.close();
}
test('CLI reloj no-op escribe sólo comentario y no crea ledger',t=>{
  const f=setup(t),r=f.run();assert.equal(r.status,0,r.stderr);
  const report=JSON.parse(r.stdout);assert.equal(report.baseRowsWritten,0);assert.equal(report.dailyBudget.charge,0);
  assert.doesNotMatch(readFileSync(f.sql,'utf8'),/INSERT|DELETE|CREATE/);
  const db=new DatabaseSync(f.sqlite);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='pilot_daily_write_budget'").get().n,0);db.close();
});
test('CLI coloca ledger antes del marcador final y cargo se reproduce en SQL',t=>{
  const f=setup(t);expire(f.sqlite);const r=f.run();assert.equal(r.status,0,r.stderr);
  const report=JSON.parse(r.stdout),sql=readFileSync(f.sql,'utf8');
  assert.equal(report.baseRowsWritten,2);assert.equal(report.estimatedRowsWritten,5);
  assert.ok(sql.indexOf('INSERT INTO pilot_daily_write_budget')<sql.lastIndexOf('INSERT OR REPLACE INTO pilot_meta'));
  const replica=new DatabaseSync(':memory:');replica.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  replica.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot','{}');
  replica.exec(readFileSync(new URL('./projection.sql',import.meta.url),'utf8'));replica.exec(sql);
  assert.equal(replica.prepare('SELECT used FROM pilot_daily_write_budget').get().used,5);
  assert.ok(JSON.parse(replica.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value).cache);replica.close();
});
test('CLI revierte marcador y ledger acumulado si se agota el día',t=>{
  const f=setup(t);expire(f.sqlite);
  let db=new DatabaseSync(f.sqlite);db.exec('BEGIN');chargeDailyBudget(db,{now:clock,estimatedRowsWritten:79993});db.exec('COMMIT');
  const before=db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value;db.close();
  const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED/);assert.equal(existsSync(f.sql),false);
  db=new DatabaseSync(f.sqlite);assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value,before);
  assert.equal(db.prepare('SELECT used FROM pilot_daily_write_budget').get().used,79997);db.close();
});
test('bootstrap explícito sólo construye una copia no proyectada y declara fuera de cuota',t=>{
  const f=setup(t,{projected:false}),r=f.run('--bootstrap-lab');assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(r.stdout).dailyBudget,null);assert.match(readFileSync(f.sql,'utf8'),/SIN acreditación de cuota gratuita/);
  const other=path.join(path.dirname(f.sql),'again.sql');
  const again=spawnSync(process.execPath,[cli,f.sqlite,other,'--bootstrap-lab'],{encoding:'utf8'});
  assert.notEqual(again.status,0);assert.equal(existsSync(other),false);
});
