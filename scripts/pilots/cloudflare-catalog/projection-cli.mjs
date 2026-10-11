// Calcula en SQLite privado y exporta sólo cambios. Nunca llama Cloudflare.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {rebuildProjection} from './projection.mjs';
import {createHash} from 'node:crypto';
import {estimateIndexMaintenance} from './incremental-sync.mjs';
import {chargeDailyBudget} from './daily-budget.mjs';
const [sqlite,sqlFile,...flags]=process.argv.slice(2);
const options=new Map();
for(let index=0;index<flags.length;index++) {
  if(flags[index]==='--bootstrap-lab') {options.set(flags[index],true);continue;}
  if(!['--now','--max-base-writes'].includes(flags[index])||flags[index+1]===undefined)throw new Error('Opción inválida');
  options.set(flags[index],flags[++index]);
}
if(!sqlite||!sqlFile||!existsSync(sqlite)||existsSync(sqlFile))throw new Error('Usar SQLITE_EXISTENTE NUEVO_SQL [--now ISO] [--max-base-writes N]');
const now=options.has('--now')?Date.parse(options.get('--now')):Date.now();
const max=Number(options.get('--max-base-writes')??10000);
if(!Number.isSafeInteger(max)||max<1)throw new Error('Presupuesto inválido');
const db=new DatabaseSync(sqlite);
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
try {
  db.exec('BEGIN');
  const marker=db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
  if(!marker)throw new Error('Snapshot incompleto');
  const meta=JSON.parse(marker.value);
  const bootstrapLab=options.has('--bootstrap-lab');
  if(bootstrapLab&&meta.projectionVersion===1)throw new Error('Bootstrap de laboratorio sólo para la construcción inicial');
  const generation=createHash('sha256').update(JSON.stringify(meta.hashes??{})).digest('hex');
  const result=rebuildProjection(db,{now,generation,affectedProductIds:meta.projectionVersion===1?[]:undefined});
  if(result.baseRowsWritten>max)throw new Error('Delta supera presupuesto base; no se aplicó');
  const estimatedIndexRows=estimateIndexMaintenance(db,result.statements.map(s=>({...s,bindings:s.values})));
  const estimatedRowsWritten=result.baseRowsWritten+estimatedIndexRows;
  const dailyBudget=bootstrapLab?null:chargeDailyBudget(db,{now,estimatedRowsWritten});
  result.baseRowsWritten+=dailyBudget?.ledgerBaseRowsWritten??0;
  if(result.baseRowsWritten>max)throw new Error('Delta con ledger supera presupuesto base; no se aplicó');
  if(dailyBudget?.statement)result.statements.push({...dailyBudget.statement,values:dailyBudget.statement.bindings});
  // Durante una importación por lotes la API falla explícitamente hasta el
  // último marcador. No ofrecer proyecciones parciales como catálogo completo.
  const sql=result.statements.length?["-- EXCLUSIVAMENTE importación local; no es un publicador remoto seguro.","DELETE FROM pilot_meta WHERE key='snapshot';",...(meta.projectionVersion===1?[]:[readFileSync(new URL('./projection.sql',import.meta.url),'utf8')])]:['-- Proyección vigente: cero escrituras.'];
  if(bootstrapLab)sql.unshift('-- Bootstrap de laboratorio: SIN acreditación de cuota gratuita.');
  if(dailyBudget?.statement)sql.push(dailyBudget.schemaSql);
  let finalMarker;
  for(const statement of result.statements) {
    if(statement.sql==="UPDATE pilot_meta SET value=? WHERE key='snapshot'") {
      finalMarker=`INSERT OR REPLACE INTO pilot_meta(key,value) VALUES('snapshot',${literal(statement.values[0])});`;
    } else {
      let index=0;sql.push(statement.sql.replaceAll('?',()=>literal(statement.values[index++]))+';');
    }
  }
  if(finalMarker)sql.push(finalMarker);
  // generation debe caber en las claves de cache. Usar hashes como identidad,
  // nunca publicar un blob enorme de metadata en el campo de generación.
  writeFileSync(sqlFile,sql.join('\n')+'\n',{flag:'wx'});
  db.exec('COMMIT');
  delete result.statements;
  console.log(JSON.stringify({...result,estimatedIndexRows,estimatedDeltaRowsWritten:estimatedRowsWritten,estimatedRowsWritten:dailyBudget?.charge??estimatedRowsWritten,dailyBudget,bootstrapLab,sqlFile,extraD1MarkerWrites:Number(result.baseRowsWritten>0),note:'Presupuesto local estimado acumulado UTC; no mide cuota compartida ni facturación remota.'},null,2));
}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
finally{db.close();}
