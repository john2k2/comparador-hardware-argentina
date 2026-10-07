// Ejecuta sólo la migración nueva y sus regresiones en un cluster PG17 propio, sin TCP.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const childEnv = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
const root = path.resolve(import.meta.dirname, '../..');
const outputRoot = path.join(root, 'tmp/retencion-automatica-2026-10-07');
async function main() {
  assert.equal(process.argv.length, 3, 'TELEMETRY_SQL_ARGUMENTS');
  const output = path.resolve(process.argv[2]);
  assert.equal(path.dirname(output), outputRoot, 'TELEMETRY_SQL_OUTPUT_SCOPE');
  assert.match(path.basename(output), /^sql-local-[a-zA-Z0-9-]+\.json$/, 'TELEMETRY_SQL_OUTPUT_NAME');
  const local = await fs.mkdtemp(path.join(os.tmpdir(), 'comparador-telemetry-sql-'));
  await fs.chmod(local, 0o700);
  const data = path.join(local, 'data'), socket = path.join(local, 'socket');
  await fs.mkdir(socket, { mode: 0o700 });
  const run = (binary, args, input) => execFileSync(pg + binary, args, {
    env: childEnv, input, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, stdio: ['pipe','pipe','pipe'],
  });
  const query = sql => run('psql', ['-h',socket,'-p','55490','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'], sql).trim();
  let started = false, receipt;
  try {
    run('initdb', ['-D',data,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8']);
    run('pg_ctl', ['-D',data,'-l',path.join(local,'server.log'),'-o',`-h '' -p 55490 -k ${socket} -c cluster_name=telemetry-sql-local`,'-w','start']);
    started = true;
    assert.equal(query('SHOW data_directory;'),data);
    assert.equal(query('SHOW listen_addresses;'),'');
    assert.equal(query('SHOW cluster_name;'),'telemetry-sql-local');
    const version = query('SHOW server_version;'); assert.match(version,/^17\./);
    query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text, metadata jsonb);
      GRANT USAGE ON SCHEMA storage TO service_role;
      GRANT SELECT ON storage.objects TO service_role;
      CREATE TABLE public.api_cache_entries(cache_key text PRIMARY KEY,scope text NOT NULL,payload jsonb NOT NULL,
        expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
      ALTER TABLE public.api_cache_entries ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,DELETE ON public.api_cache_entries TO service_role;
      CREATE INDEX api_cache_entries_expires_idx ON public.api_cache_entries(expires_at);
      CREATE INDEX api_cache_entries_scope_idx ON public.api_cache_entries(scope);`);
    query(await fs.readFile(path.join(root,'supabase/migrations/20261007215027_backed_telemetry_retention.sql'),'utf8'));
    query(await fs.readFile(path.join(root,'supabase/tests/backed_telemetry_retention.sql'),'utf8'));
    assert.equal(Number(query('SELECT count(*) FROM public.api_cache_entries;')),0,'TELEMETRY_SQL_FIXTURE_ROLLBACK');
    receipt = { completedAt:new Date().toISOString(),postgresVersion:version,localOnly:true,noTcp:true,
      schemaMigrationExecutedLocalOnly:true,productionChanges:false,fixtureRolledBack:true,
      groups:['six fields, numeric precision and microseconds','250 exact acknowledgements and repeat zero',
        'changed payload, created_at, updated_at and missing preserved','bounds and malformed snapshots rejected',
        'foreign keys and triggers fail closed','service-role access with RLS; public execution denied',
        'whole-bucket capacity cap and unknown metadata fail closed'],
      allGroupsPassed:true,clusterDirectory:local,clusterStopped:false };
  } finally {
    if (started) run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
  }
  receipt.clusterStopped = true;
  await fs.mkdir(outputRoot,{recursive:true,mode:0o700});
  await fs.writeFile(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({allGroupsPassed:true,localOnly:true,noTcp:true,clusterStopped:true})+'\n');
}
try { await main(); }
catch { process.stderr.write('TELEMETRY_SQL_LOCAL_FAILED\n'); process.exitCode=1; }
