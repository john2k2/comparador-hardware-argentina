// Copia reproducible a SQLite/D1 local; nunca invoca una cuenta remota.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySnapshot } from './snapshot-verify.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const TABLES = ['products', 'stores', 'product_prices', 'catalog_price_summaries'];
const forbidden = /^(access_token|refresh_token|password|secret|email|user_id|auth_uid)$/i;
export function assertPublicRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid public row');
  for (const key of Object.keys(row)) if (forbidden.test(key)) throw new Error(`Nonpublic field: ${key}`);
}
function text(value) { return value === null || value === undefined ? null : String(value); }
function iso(value) { return value ? new Date(value).toISOString() : null; }
function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Nonfinite SQL value'); return String(value); }
  return `'${String(value).replaceAll("'", "''")}'`;
}
export async function importSnapshot({ source, sqlite, d1Sql }) {
  source = resolve(source); sqlite = resolve(sqlite);
  if (existsSync(sqlite)) throw new Error('Target SQLite exists; use a new path');
  if (d1Sql && existsSync(d1Sql)) throw new Error('Target D1 SQL exists; use a new path');
  await verifySnapshot(source);
  const schema = readFileSync(join(here, 'schema.sql'), 'utf8');
  const db = new DatabaseSync(sqlite); db.exec(schema); db.exec('BEGIN');
  // D1 execute administra su transacción; no exportar BEGIN/COMMIT explícitos.
  const sql = d1Sql ? [schema] : null;
  const counts = {}, hashes = {}; let writes = 0;
  const insert = (table, columns, values) => {
    db.prepare(`INSERT INTO ${table}(${columns}) VALUES (${values.map(() => '?').join(',')})`).run(...values);
    if (sql) {
      const statement = `INSERT INTO ${table}(${columns}) VALUES (${values.map(sqlValue).join(',')});`;
      if (Buffer.byteLength(statement) > 100000) throw new Error(`D1 statement exceeds 100KB for ${table}`);
      sql.push(statement);
    }
    writes++;
  };
  try {
    for (const table of TABLES) {
      counts[table] = 0; const hash = createHash('sha256');
      for await (const line of createInterface({ input: createReadStream(join(source, `${table}.jsonl`)), crlfDelay: Infinity })) {
        if (!line) continue; hash.update(line + '\n');
        const row = JSON.parse(line); assertPublicRow(row); counts[table]++;
        if (table === 'products') {
          const publicProduct={...row};
          for(const key of ['catalog_name','catalog_document','catalog_identity','catalog_component']) delete publicProduct[key];
          insert('products','id,category,catalog_identity,catalog_name,catalog_document,catalog_component,grouped_identity,last_scraped_at,updated_at,row_json',[
            row.id,row.category,row.catalog_identity,row.catalog_name,row.catalog_document,Number(Boolean(row.catalog_component)),Number(row.id.startsWith('agrupado-')),iso(row.last_scraped_at),iso(row.updated_at),JSON.stringify(publicProduct)]);
          if(row.catalog_component) insert('product_substrings','id,document',[row.id,row.catalog_document]);
        }
        else if (table === 'stores') insert('stores','id,row_json',[row.id,JSON.stringify(row)]);
        else if (table === 'product_prices') insert('product_prices','id,product_id,store_id,price,url,row_json',[row.id,row.product_id,row.store_id,Number(row.price),text(row.url),JSON.stringify(row)]);
        else {
          insert('summaries','product_id,lowest,highest,average,available,urls,portable_listing,store_ids_json,comparable_stats_json,comparable_valid_until,comparable_latest_observed_at,row_json',[
            row.product_id,Number(row.lowest),Number(row.highest),Number(row.average),Number(row.available),text(row.urls),Number(Boolean(row.portable_listing)),JSON.stringify(row.store_ids ?? []),row.comparable_stats ? JSON.stringify(row.comparable_stats) : null,iso(row.comparable_valid_until),iso(row.comparable_latest_observed_at),'{}']);
          for (const [kind, offers] of [['historical',row.best_offers],['current',row.comparable_offers]]) for (const offer of offers ?? []) {
            insert('price_basis','product_id,kind,id,store_id,price,stock,url,observed_at',[row.product_id,kind,offer.id,offer.store_id,Number(offer.price),text(offer.stock),text(offer.url),iso(offer.last_updated)]);
          }
        }
      }
      hashes[table] = hash.digest('hex');
    }
    insert('pilot_meta','key,value',['snapshot',JSON.stringify({ counts, hashes })]);
    db.exec('COMMIT'); db.exec('ANALYZE');
    const check = db.prepare('PRAGMA integrity_check').get();
    if (check.integrity_check !== 'ok') throw new Error('SQLite integrity failure');
    db.close();
    if (sql) { sql.push('ANALYZE;'); writeFileSync(d1Sql,sql.join('\n')); }
    return { counts, hashes, sqliteBytes: statSync(sqlite).size, baseRowsWritten: writes,
      note: 'Rows written excludes secondary-index writes; full replacement is not a daily refresh strategy.' };
  } catch (error) { try { db.exec('ROLLBACK'); db.close(); } catch {} throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source,sqlite,d1Sql] = process.argv.slice(2);
  if (!source || !sqlite) throw new Error('Usage: node import-local.mjs SNAPSHOT_DIR NEW_SQLITE [NEW_D1_SQL]');
  console.log(JSON.stringify(await importSnapshot({source,sqlite,d1Sql}),null,2));
}
