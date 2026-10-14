// Oráculo local aislado: sólo socket privado, sin conexiones ni escrituras remotas.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { verifySnapshot } from './snapshot-verify.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const cliArgs = process.argv.slice(2);
if (cliArgs.some(arg => arg.startsWith('--') && !['--start', '--stop'].includes(arg))
  || cliArgs.filter(arg => !arg.startsWith('--')).length > 1
  || (cliArgs.includes('--start') && cliArgs.includes('--stop'))) throw new Error('Usar [snapshot] [--start | --stop]');
const snapshot = path.resolve(cliArgs.find(arg => !arg.startsWith('--')) ?? path.join(root, 'outputs/catalogo-local-cloudflare-2026-10-11/public-snapshot'));
const statePath = path.join(snapshot, 'postgres-state.json');
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const environment = { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', ...process.env };
// No heredar destinos de conexión de un cliente del usuario.
for (const key of Object.keys(environment)) if (key.startsWith('PG')) delete environment[key];
const run = (name, args, input) => execFileSync(pg + name, args, { input, encoding: 'utf8', env: environment, maxBuffer: 10 * 1024 * 1024, timeout: 180000, stdio: ['pipe', 'pipe', 'pipe'] });

if (process.argv.includes('--stop') || process.argv.includes('--start')) {
  const state = JSON.parse(fs.readFileSync(statePath));
  const parent = fs.realpathSync(path.dirname(state.data));
  if (!path.basename(parent).startsWith('comparador-catalog-') || fs.realpathSync(state.data) !== path.join(parent, 'data')
    || fs.realpathSync(state.socket) !== path.join(parent, 'socket') || (fs.statSync(parent).mode & 0o077) !== 0
    || state.port !== '55527' || state.database !== 'catalog_pilot' || !state.noTcp) throw new Error('Directorio local inesperado');
  if (process.argv.includes('--start')) {
    run('pg_ctl', ['-D', state.data, '-l', path.join(parent, 'postgres.log'), '-o', `-h '' -k ${state.socket} -p 55527 -c cluster_name=catalog-pilot -c max_connections=20 -c shared_buffers=128MB`, '-w', 'start']);
    console.log('PostgreSQL privado del piloto iniciado');
  } else {
    run('pg_ctl', ['-D', state.data, '-m', 'fast', '-w', 'stop']);
    console.log('PostgreSQL del piloto detenido');
  }
  process.exit(0);
}
const meta = JSON.parse(fs.readFileSync(path.join(snapshot, 'schema.json')));
const manifest = await verifySnapshot(snapshot);
if (fs.existsSync(statePath)) throw new Error('Estado local existente: conservarlo y revisar antes de reemplazar');
const local = fs.mkdtempSync(path.join(os.tmpdir(), 'comparador-catalog-'));
fs.chmodSync(local, 0o700);
const data = path.join(local, 'data'), socket = path.join(local, 'socket');
fs.mkdirSync(socket, { mode: 0o700 });
const port = '55527', database = 'catalog_pilot';
const args = ['-X', '-h', socket, '-p', port, '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atq'];
const sql = query => run('psql', args, query);
run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--locale-provider=icu', '--icu-locale=en-US', '--encoding=UTF8']);
run('pg_ctl', ['-D', data, '-l', path.join(local, 'postgres.log'), '-o', `-h '' -k ${socket} -p ${port} -c cluster_name=catalog-pilot -c max_connections=20 -c shared_buffers=128MB`, '-w', 'start']);
run('createdb', ['-h', socket, '-p', port, '-U', 'postgres', database]);
if (sql('show listen_addresses;').trim() !== '' || sql('show data_directory;').trim() !== data) throw new Error('Aislamiento local no comprobado');
const state = { localOnly: true, noTcp: true, data, socket, port, database, referenceNow: manifest.referenceNow, sourceCaptureAtomic: false, imported: [] };
fs.writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
sql(fs.readFileSync(path.join(root, 'supabase/tests/bootstrap-local.sql'), 'utf8'));
for (const filename of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql') && name <= '20261010222700_narrow_catalog_search_seed.sql').sort()) {
  sql(fs.readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8'));
}
console.log('Esquema local y migraciones aplicados');
sql('truncate public.products cascade; truncate public.stores cascade;');
// Las tablas provienen de migraciones propias. Los valores entran como JSON, nunca como SQL.
for (const table of ['stores', 'products', 'product_prices', 'catalog_price_summaries']) {
  const columns = meta.columns.filter(column => column.table === table && column.generated !== 'ALWAYS').map(column => column.name);
  if (!columns.length || columns.some(column => !/^[a-z_]+$/.test(column))) throw new Error('Esquema de catálogo inesperado');
  const child = spawn(pg + 'psql', args, { env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
  const completion = once(child, 'close');
  child.stdin.write("begin; set local session_replication_role=replica; create temp table import_rows(data jsonb); copy import_rows from stdin with (format csv, quote E'\\x01', delimiter E'\\x02');\n");
  for (const line of fs.readFileSync(path.join(snapshot, table + '.jsonl'), 'utf8').split('\n')) {
    if (!line) continue;
    if (line.includes('\x01') || line.includes('\x02')) throw new Error('Carácter incompatible con COPY');
    if (!child.stdin.write(line + '\n')) await once(child.stdin, 'drain');
  }
  child.stdin.end('\\.\ninsert into public.' + table + '(' + columns.join(',') + ') select ' + columns.map(column => 'r.' + column).join(',') + ' from import_rows i cross join lateral jsonb_populate_record(null::public.' + table + ',i.data) r; commit;\n');
  const [code] = await completion;
  if (code !== 0) throw new Error('Importación local ' + table + ': ' + errors);
  const count = Number(sql('select count(*) from public.' + table));
  const expected = manifest.tables.find(record => record.table === table).count;
  if (count !== expected) throw new Error('Conteo local diferente en ' + table);
  state.imported.push({ table, count });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ table, count }));
}
sql('insert into public.products_search_lookup select id,category,catalog_identity,catalog_name,catalog_document from public.products where catalog_component;');
// Congelar sólo el reloj del oráculo, manteniendo los cuerpos vigentes del catálogo.
sql("create function public.pilot_now() returns timestamptz language sql stable as $$ select '" + manifest.referenceNow + "'::timestamptz $$;");
for (const routine of meta.functions.filter(routine => routine.name !== 'catalog_refresh_coverage')) {
  if (/pg_read_file|pg_ls_dir|lo_import|from program/i.test(routine.ddl)) throw new Error('Función local con acceso externo inesperado');
  sql(routine.ddl.replace(/\bnow\(\)/g, 'public.pilot_now()'));
}
sql('vacuum analyze public.products; vacuum analyze public.product_prices; vacuum analyze public.catalog_price_summaries; vacuum analyze public.products_search_lookup;');
state.ready = true;
state.databaseBytes = Number(sql('select pg_database_size(current_database());'));
fs.writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ ready: true, noTcp: true, databaseBytes: state.databaseBytes, referenceNow: state.referenceNow }));
