// Laboratorio físico PG17 aislado. Recibe metadatos y muestra explícitos, jamás env/URL de DB.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
export const privateRoot = path.join(root, 'tmp/restructuracion-2026-10-08');
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const childEnv = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
const allowedTables = ['products', 'product_prices', 'catalog_price_summaries', 'price_history'];
const types = new Set(['text','varchar','numeric','int4','int8','bool','uuid','jsonb','timestamptz','timestamp','_text','_uuid']);
const identifier = value => { assert.match(value, /^[a-z][a-z0-9_]{0,62}$/, 'SPACE_IDENTIFIER'); return value; };
const quote = value => `"${identifier(value)}"`;
const hash = value => createHash('sha256').update(value).digest('hex');
const unwrap = value => value?.data?.[0] ?? value;
const integer = value => Number.isSafeInteger(value) && value >= 0;

// Evita que un JSON disfrazado de metadatos ejecute funciones de sistema o SQL adicional.
export function validateIndex(index, table) {
  identifier(index.index_name);
  const sql = index.definition;
  assert.equal(typeof sql, 'string', 'SPACE_INDEX_DEFINITION');
  assert.ok(sql.length < 6000 && !/[;\u0000-\u001f]|--|\/\*|\*\//.test(sql), 'SPACE_INDEX_SQL');
  const prefix = `CREATE ${index.indisunique ? 'UNIQUE ' : ''}INDEX ${index.index_name} ON public.${table} USING `;
  assert.ok(sql.startsWith(prefix), 'SPACE_INDEX_TARGET');
  const code = sql.replace(/'(?:[^']|'')*'/g, "''");
  assert.ok(!/\b(?:SELECT|INSERT|UPDATE|DELETE|COPY|DO|CALL|ALTER|DROP|GRANT|TABLESPACE|PROGRAM|pg_[a-z_]+|dblink|lo_[a-z_]+)\b/i.test(code), 'SPACE_INDEX_UNSAFE');
  const functions = [...code.matchAll(/\b([a-z][a-z0-9_]*)\s*\(/gi)].map(match => match[1].toLowerCase());
  for (const name of functions) assert.ok(['btree','gin','include','where','regexp_replace','to_tsvector','coalesce','lower','upper','and','or','not'].includes(name), 'SPACE_INDEX_FUNCTION');
  assert.equal(index.indisvalid, true, 'SPACE_INVALID_INDEX');
  assert.equal(index.indisready, true, 'SPACE_UNREADY_INDEX');
  return sql;
}

export function normalizeInput(input) {
  // Un único formato validado: nunca aceptar SQL/types desde una forma legacy sin normalizar.
  assert.ok(input && Array.isArray(input.tables) && input.tables.length > 0, 'SPACE_TABLE_METADATA');
  const columns = [], indexes = [], top_tables = [];
  for (const table of input.tables) {
    assert.ok(allowedTables.includes(table.name), 'SPACE_TABLE_ALLOWLIST');
    for (const [position, c] of table.columns.entries()) {
      const type = c.type;
      assert.ok(typeof type === 'string', 'SPACE_COLUMN_TYPE');
      const match = /^(text|character varying|varchar|numeric|integer|bigint|boolean|uuid|jsonb|timestamp with time zone|timestamp without time zone|timestamptz|timestamp|int4|int8|bool)(\(\d+(?:,\d+)?\))?(\[\])?$/.exec(type);
      assert.ok(match, 'SPACE_COLUMN_TYPE');
      const aliases = {'character varying':'varchar',integer:'int4',bigint:'int8',boolean:'bool','timestamp with time zone':'timestamptz','timestamp without time zone':'timestamp'};
      const base = aliases[match[1]] ?? match[1];
      assert.ok(!match[2] || ['numeric','varchar','timestamp','timestamptz'].includes(base), 'SPACE_TYPE_MODIFIER');
      assert.ok(!match[3] || ['text','uuid'].includes(base), 'SPACE_ARRAY_TYPE');
      columns.push({table_name:table.name,schema_name:'public',column_name:c.name,udt_name:match[3]?'_'+base:base,
        physical_type:type,is_nullable:c.notNull?'NO':'YES',column_position:position+1,
        is_generated:c.generated?'ALWAYS':'NEVER',generation_expression:c.expression??null});
    }
    for (const i of table.indexes) indexes.push({table_name:table.name,schema_name:'public',index_name:i.name,
      definition:i.definition,bytes:i.bytes,idx_scan:i.scans,indisprimary:i.isPrimary,indisunique:i.isUnique,
      indisvalid:i.valid,indisready:i.ready??i.valid});
    const a = table.allocation;
    top_tables.push({table_name:table.name,schema_name:'public',estimated_rows:a.rowsEstimate,exact_rows:a.rows,
      heap_bytes:a.heapBytes,table_bytes:a.tableBytes,indexes_bytes:a.indexBytes,total_bytes:a.totalBytes,toast_bytes:a.toastBytes});
  }
  return {...input,schema:{columns,indexes},allocation:{top_tables,stats_reset:input.statsResetAt??null}};
}

export function validateInput(rawInput) {
  const input = normalizeInput(rawInput);
  assert.ok(input && !Array.isArray(input), 'SPACE_INPUT_OBJECT');
  const serialized = JSON.stringify(input);
  assert.ok(!/"(?:password|token|secret|authorization|service_role|api_key|user_id|email|phone)"\s*:|sb_secret_|Bearer\s+[A-Za-z0-9]|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20,}\./i.test(serialized), 'SPACE_SECRET_OR_PERSONAL_DATA');
  const schema = unwrap(input.schema), allocation = unwrap(input.allocation);
  assert.ok(Array.isArray(schema?.columns) && Array.isArray(schema?.indexes), 'SPACE_SCHEMA');
  assert.ok(Array.isArray(allocation?.top_tables), 'SPACE_ALLOCATION');
  assert.ok(input.representativeness && JSON.stringify(input.representativeness).length > 10, 'SPACE_SAMPLE_METHOD');
  assert.ok(!Number.isNaN(Date.parse(input.capturedAt)), 'SPACE_CAPTURE_DATE');
  assert.match(input.sourceVersion, /^17\./, 'SPACE_SOURCE_PG_VERSION');
  assert.ok(input.samples && !Array.isArray(input.samples), 'SPACE_SAMPLES');
  const tables = Object.keys(input.samples);
  assert.ok(tables.length > 0 && tables.length <= allowedTables.length, 'SPACE_TABLE_COUNT');
  for (const table of tables) {
    assert.ok(allowedTables.includes(table), 'SPACE_TABLE_ALLOWLIST');
    const rows = input.samples[table];
    assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 5000, 'SPACE_SAMPLE_BUDGET');
    const columns = schema.columns.filter(c => c.table_name === table).sort((a,b) => a.column_position-b.column_position);
    assert.ok(columns.length > 0, 'SPACE_COLUMNS');
    for (const column of columns) {
      identifier(column.column_name);
      assert.equal(column.schema_name, 'public', 'SPACE_COLUMN_SCHEMA');
      assert.ok(types.has(column.udt_name), 'SPACE_COLUMN_TYPE');
      assert.ok(!column.numeric_scale && !column.numeric_precision && !column.character_maximum_length, 'SPACE_TYPE_MODIFIER');
    }
    const names = columns.map(c=>c.column_name).sort();
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), names, 'SPACE_COMPLETE_ROW');
      for (const column of columns) if (column.is_nullable === 'NO') assert.notEqual(row[column.column_name], null, 'SPACE_REQUIRED_VALUE');
    }
    const indexes = schema.indexes.filter(i=>i.table_name===table);
    assert.ok(indexes.length > 0, 'SPACE_INDEXES');
    for (const index of indexes) validateIndex(index, table);
    const measured = allocation.top_tables.find(t=>t.table_name===table && t.schema_name==='public');
    assert.ok(measured && integer(measured.total_bytes) && integer(measured.heap_bytes) && integer(measured.indexes_bytes), 'SPACE_MEASURED_ALLOCATION');
  }
  return { ...input, schema, allocation, tables };
}

export async function privateFile(filename, { existing = true } = {}) {
  assert.equal(typeof filename, 'string', 'SPACE_PATH');
  assert.ok(!filename.includes('://'), 'SPACE_REMOTE_PATH');
  const absolute = path.resolve(filename);
  assert.equal(path.dirname(absolute), privateRoot, 'SPACE_PATH_SCOPE');
  assert.match(path.basename(absolute), /^[a-zA-Z0-9-]+\.json$/, 'SPACE_PATH_NAME');
  const parent = await fs.realpath(privateRoot);
  assert.equal(parent, privateRoot, 'SPACE_PARENT_SYMLINK');
  assert.equal((await fs.stat(parent)).mode & 0o077, 0, 'SPACE_PRIVATE_DIRECTORY');
  if (existing) {
    assert.equal(await fs.realpath(absolute), absolute, 'SPACE_FILE_SYMLINK');
    const stat = await fs.stat(absolute);
    assert.ok(stat.isFile() && stat.size <= 24 * 1024 * 1024, 'SPACE_FILE_BUDGET');
    assert.equal(stat.mode & 0o077, 0, 'SPACE_PRIVATE_FILE');
  }
  return absolute;
}

export function csvCell(value, type) {
  if (value === null) return '';
  if (type === 'jsonb') value = JSON.stringify(value);
  else if (type.startsWith('_')) value = `{${value.map(v=>v===null?'NULL':`"${String(v).replaceAll('\\','\\\\').replaceAll('"','\\"')}"`).join(',')}}`;
  else if (typeof value === 'boolean') value = value ? 'true' : 'false';
  return `"${String(value).replaceAll('"','""')}"`;
}

export async function runLab(inputFilename, outputFilename) {
  const source = await privateFile(inputFilename), output = await privateFile(outputFilename, { existing:false });
  assert.notEqual(source, output, 'SPACE_DISTINCT_PATHS');
  // Reserva exclusiva del recibo antes de crear procesos; nunca sobrescribe evidencia.
  const handle = await fs.open(output, 'wx', 0o600);
  const startedAt = new Date().toISOString();
  let local, started = false, receipt;
  const run = (binary,args,input) => {
    try { return execFileSync(pg+binary,args,{ env:childEnv,input,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe'] }); }
    catch { throw new Error('SPACE_LOCAL_PG_OPERATION'); }
  };
  try {
    const sourceBytes = await fs.readFile(source);
    const input = validateInput(JSON.parse(sourceBytes));
    local = await fs.mkdtemp(path.join(os.tmpdir(),'comparador-space-'));
    await fs.chmod(local,0o700);
    const data = path.join(local,'data'), socket = path.join(local,'socket');
    await fs.mkdir(socket,{mode:0o700});
    const log = path.join(local,'server.log');
    await fs.writeFile(log,'',{flag:'wx',mode:0o600});
    const connection = ['-h',socket,'-p','55487','-U','postgres','-d','space_local','-X','-Atq','-v','ON_ERROR_STOP=1'];
    const query = sql => run('psql',connection,sql).trim();
    run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8']);
    // Un arranque con ACK incierto también requiere comprobar el clúster propio al salir.
    started = true;
    run('pg_ctl',['-D',data,'-l',log,'-o',`-h '' -p 55487 -k ${socket} -c autovacuum=off -c cluster_name=space-local -c shared_buffers=32MB`,'-w','start']);
    run('createdb',['-h',socket,'-p','55487','-U','postgres','space_local']);
    assert.equal(query('SHOW data_directory;'),data,'SPACE_CLUSTER_DIRECTORY');
    assert.equal(query('SHOW listen_addresses;'),'','SPACE_NO_TCP');
    assert.equal(query('SHOW cluster_name;'),'space-local','SPACE_CLUSTER_IDENTITY');
    const version = query('SHOW server_version;');
    assert.match(version,/^17\./,'SPACE_RUNTIME_VERSION');
    query('CREATE EXTENSION pg_trgm; CREATE EXTENSION pgstattuple;');
    const phases = [], baselineHashes = {}, hashCheckpoints = [];
    const measure = table => JSON.parse(query(`SELECT jsonb_build_object('table','${table}',
      'rows',(SELECT count(*) FROM public.${quote(table)}),'heapBytes',pg_relation_size(c.oid),
      'tableBytes',pg_table_size(c.oid),'toastBytes',CASE WHEN c.reltoastrelid=0 THEN 0 ELSE pg_total_relation_size(c.reltoastrelid) END,
      'indexBytes',pg_indexes_size(c.oid),'totalBytes',pg_total_relation_size(c.oid),
      'physicalTuples',(SELECT to_jsonb(s) FROM pgstattuple(c.oid) s),
      'indexes',(SELECT jsonb_agg(jsonb_build_object('name',i.relname,'bytes',pg_relation_size(i.oid),
        'definition',pg_get_indexdef(i.oid),'method',a.amname,
        'btreeStats',CASE WHEN a.amname='btree' THEN (SELECT to_jsonb(s) FROM pgstatindex(i.oid) s) ELSE NULL END) ORDER BY i.relname)
        FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_am a ON a.oid=i.relam WHERE x.indrelid=c.oid))
      FROM pg_class c WHERE c.oid='public.${table}'::regclass;`));
    const rowHash = table => query(`SELECT encode(sha256(convert_to(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'UTF8')),'hex') FROM public.${quote(table)} t;`);
    const phase = (name, sql='') => {
      const begin = performance.now();
      if(sql) query(sql);
      const wallMs = Math.round((performance.now()-begin)*100)/100;
      const result = {name,wallMs,tables:input.tables.map(measure),databaseBytes:Number(query('SELECT pg_database_size(current_database());'))};
      phases.push(result);
      return result;
    };
    for(const table of input.tables) {
      const columns = input.schema.columns.filter(c=>c.table_name===table).sort((a,b)=>a.column_position-b.column_position);
      query(`CREATE TABLE public.${quote(table)} (${columns.map(c=>`${quote(c.column_name)} ${c.physical_type??(c.udt_name.startsWith('_')?c.udt_name.slice(1)+'[]':c.udt_name)}${c.is_nullable==='NO'?' NOT NULL':''}`).join(',')});`);
      const csv = input.samples[table].map(row=>columns.map(c=>csvCell(row[c.column_name],c.udt_name)).join(',')).join('\n')+'\n';
      run('psql',[...connection,'-c',`COPY public.${quote(table)} FROM STDIN WITH(FORMAT csv)`],csv);
      // Verificar representación de arrays contra la entrada, antes de fijar el hash local.
      for (const column of columns.filter(c=>c.udt_name.startsWith('_'))) {
        const key = table==='catalog_price_summaries'?'product_id':'id';
        const loaded = JSON.parse(query(`SELECT jsonb_object_agg(${quote(key)},to_jsonb(${quote(column.column_name)})) FROM public.${quote(table)};`));
        assert.deepEqual(loaded,Object.fromEntries(input.samples[table].map(row=>[row[key],row[column.column_name]])),'SPACE_ARRAY_SOURCE_ROUNDTRIP');
      }
      for(const index of input.schema.indexes.filter(i=>i.table_name===table)) {
        query(validateIndex(index,table)+';');
        assert.equal(query(`SELECT pg_get_indexdef('public.${index.index_name}'::regclass);`),index.definition,'SPACE_INDEX_EXACT_REPLAY');
      }
      assert.equal(Number(query(`SELECT count(*) FROM public.${quote(table)};`)),input.samples[table].length,'SPACE_ROW_COUNT');
      baselineHashes[table] = rowHash(table);
    }
    hashCheckpoints.push({name:'fresh',hashes:{...baselineHashes}});
    const verifyHashes = name => {
      const hashes=Object.fromEntries(input.tables.map(table=>[table,rowHash(table)]));
      assert.deepEqual(hashes,baselineHashes,'SPACE_EXACT_ROWS');
      hashCheckpoints.push({name,hashes});
    };
    const fresh = phase('same-schema-fresh');
    // UPDATE que no cambia datos: presión de MVCC separada de renovación de fechas.
    const noop = input.tables.map(table=>{const column=input.schema.columns.find(c=>c.table_name===table);return `UPDATE public.${quote(table)} SET ${quote(column.column_name)}=${quote(column.column_name)};`;}).join('\n');
    for(let i=1;i<=3;i++) phase(`same-values-update-${i}`,noop);
    verifyHashes('after-same-values-updates');
    for(const table of input.tables) query(`VACUUM (TRUNCATE false, INDEX_CLEANUP on) public.${quote(table)};`);
    phase('same-values-vacuum');
    const refreshColumns = {products:['updated_at','last_scraped_at'],product_prices:['updated_at','last_updated'],catalog_price_summaries:['comparable_latest_observed_at','comparable_valid_until'],price_history:[]};
    const refresh = delta => input.tables.map(table=>{
      const columns=refreshColumns[table].filter(name=>input.schema.columns.some(c=>c.table_name===table&&c.column_name===name));
      return columns.length?`UPDATE public.${quote(table)} SET ${columns.map(name=>`${quote(name)}=${quote(name)}+interval '${delta} seconds'`).join(',')};`:'';
    }).join('\n');
    for(let i=1;i<=5;i++) phase(`synthetic-timestamp-update-${i}`,refresh(1));
    for(const table of input.tables) query(`VACUUM (TRUNCATE false, INDEX_CLEANUP on) public.${quote(table)};`);
    phase('synthetic-timestamp-vacuum');
    phase('restore-original-timestamps',refresh(-5));
    verifyHashes('after-timestamp-restoration');
    for(const table of input.tables) query(`VACUUM (FULL, ANALYZE) public.${quote(table)};`);
    const rebuilt = phase('same-schema-full-rebuilt');
    verifyHashes('after-full-rebuild');
    const estimates = input.tables.map(table=>{
      const measured=input.allocation.top_tables.find(t=>t.table_name===table&&t.schema_name==='public');
      const sample=fresh.tables.find(t=>t.table===table), final=rebuilt.tables.find(t=>t.table===table);
      const rows=measured.exact_rows??measured.estimated_rows??measured.n_live_tup;
      const valid=integer(rows)&&rows>=sample.rows;
      return {table,sampleRows:sample.rows,populationRows:rows,rowCountSource:measured.exact_rows!==undefined?'exact_rows':measured.estimated_rows!==undefined?'estimated_rows':'n_live_tup',
        measuredAllocation:measured,estimatedFreshBytes:valid?Math.round(sample.totalBytes/sample.rows*rows):null,
        estimatedRebuiltBytes:valid?Math.round(final.totalBytes/final.rows*rows):null,
        isEstimate:true,isRemoteBloatMeasurement:false,perIndex:sample.indexes.map(i=>({name:i.name,sampleBytes:i.bytes,estimatedBytes:valid?Math.round(i.bytes/sample.rows*rows):null,
          measuredBytes:input.schema.indexes.find(x=>x.index_name===i.name).bytes,scans:input.schema.indexes.find(x=>x.index_name===i.name).idx_scan}))};
    });
    receipt={localOnly:true,noTcp:true,sourceSha256:hash(sourceBytes),capturedAt:input.capturedAt,sourceVersion:input.sourceVersion,
      postgresVersion:version,localCodeVersion:input.sourceCommit??input.sourceCodeVersion??null,representativeness:input.representativeness,
      statsResetAt:input.allocation.stats_reset??null,startedAt,phases,estimates,
      exactRowsRestored:true,rowHashesSha256:baselineHashes,hashCheckpoints,thinAlternativeExecuted:false,
      localComparisons:input.tables.map(table=>({table,
        freshBytes:fresh.tables.find(t=>t.table===table).totalBytes,
        beforeFullBytes:phases.at(-2).tables.find(t=>t.table===table).totalBytes,
        rebuiltBytes:rebuilt.tables.find(t=>t.table===table).totalBytes,
        measuredLocalFullReturnedBytes:phases.at(-2).tables.find(t=>t.table===table).totalBytes-rebuilt.tables.find(t=>t.table===table).totalBytes})),
      limits:['Sample scaling is an estimate, not measured production bloat or guaranteed savings.',
        'Heap, TOAST and indexes are measured separately; tableBytes already includes TOAST and auxiliary forks.',
        'No remote index is declared unused from a scan counter without a reset/window and query contracts.',
        'Defaults, GENERATED expressions, constraints, triggers, RLS and production collation/storage settings are not replayed; all captured column values are loaded as ordinary columns with exact index definitions.',
        'Synthetic timestamp shifts preserve relative dates locally and are rolled back exactly; they are not valid offer observations.',
        'GIN pending pages and sample distribution/cardinality can make linear index extrapolation inaccurate.',
        'Local wall clock includes client overhead, not remote network, CPU time or service throughput.',
        'Production rewrite locks, peak disk/WAL and concurrent readers are not measured.'],clusterStopped:false,temporaryRemoved:false};
  } finally {
    let clusterStopped=!started;
    if(started) {
      try {
        let running=true;
        try {execFileSync(pg+'pg_ctl',['-D',path.join(local,'data'),'status'],{env:childEnv,stdio:['ignore','pipe','pipe'],timeout:10000});}
        catch(error) {if(error.status===3) running=false;else throw error;}
        if(running) run('pg_ctl',['-D',path.join(local,'data'),'-m','fast','-w','stop']);
        clusterStopped=true;
      } catch {clusterStopped=false;}
    }
    if(local&&clusterStopped) await fs.rm(local,{recursive:true,force:true});
    if(receipt) {
      receipt.clusterStopped=clusterStopped;receipt.temporaryRemoved=Boolean(local&&clusterStopped);receipt.completedAt=new Date().toISOString();
      if(!clusterStopped) receipt.cleanupError='SPACE_OWN_CLUSTER_STOP_FAILED';
      await handle.writeFile(JSON.stringify(receipt,null,2)+'\n');
    } else await handle.writeFile(JSON.stringify({success:false,localOnly:true,clusterStopped,outputIncomplete:true})+'\n');
    await handle.close();
    assert.ok(clusterStopped,'SPACE_OWN_CLUSTER_STOP_FAILED');
  }
  return receipt;
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length,4,'SPACE_ARGUMENTS');
    const receipt=await runLab(process.argv[2],process.argv[3]);
    console.log(JSON.stringify({success:true,localOnly:true,noTcp:true,clusterStopped:receipt.clusterStopped,temporaryRemoved:receipt.temporaryRemoved,output:path.resolve(process.argv[3]),estimates:receipt.estimates.map(x=>({table:x.table,sampleRows:x.sampleRows,estimatedFreshBytes:x.estimatedFreshBytes}))}));
  } catch(error) {
    console.error(JSON.stringify({success:false,localOnly:true,reason:/^[A-Z_0-9]+$/.test(error.message)?error.message:'SPACE_LAB_FAILED'}));
    process.exitCode=1;
  }
}
