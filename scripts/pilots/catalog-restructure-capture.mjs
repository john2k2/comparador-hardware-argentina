// Captura acotada de catálogo público. Sólo GET; no es backup ni snapshot transaccional.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';

const root = path.resolve(import.meta.dirname, '../..');
const privateRoot = path.join(root, 'tmp/restructuracion-2026-10-08');
const origin = 'https://zyiyziubpcpgoqlkcrie.supabase.co';
const tables = new Map([['products','id'],['product_prices','id'],['catalog_price_summaries','product_id'],['price_history','id']]);
const byteBudget = 32 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function sampleOffsets(estimate) {
  assert.ok(Number.isSafeInteger(estimate) && estimate > 0, 'CAPTURE_ROW_ESTIMATE');
  return [...new Set(Array.from({length:5}, (_, i) => Math.floor(Math.max(0, estimate-1000)*i/4)))];
}

export function requestUrl(table, offset) {
  assert.ok(tables.has(table), 'CAPTURE_TABLE');
  assert.ok(Number.isSafeInteger(offset) && offset >= 0, 'CAPTURE_OFFSET');
  const url = new URL(`/rest/v1/${table}`, origin);
  url.search = new URLSearchParams({select:'*',order:`${tables.get(table)}.asc`,offset:String(offset),limit:'1000'}).toString();
  return url;
}

export async function capture(metadata, key, fetchImpl = fetch) {
  assert.ok(typeof key === 'string' && key.length > 20, 'CAPTURE_KEY_MISSING');
  assert.equal(metadata.tables.length, tables.size, 'CAPTURE_METADATA_TABLES');
  assert.deepEqual(metadata.tables.map(t=>t.name).sort(), [...tables.keys()].sort(), 'CAPTURE_METADATA_TABLES');
  const samples = {}, windows = [];
  let totalBytes = 0;
  const deadline = Date.now()+180000;
  for (const table of metadata.tables) {
    const rows = new Map();
    for (const offset of sampleOffsets(table.allocation.rowsEstimate)) {
      assert.ok(Date.now() < deadline, 'CAPTURE_DEADLINE');
      let response;
      try {
        response = await fetchImpl(requestUrl(table.name, offset), {method:'GET', redirect:'error',
          headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'},
          signal:AbortSignal.timeout(Math.min(20000, deadline-Date.now()))});
      } catch { throw new Error('CAPTURE_READ_FAILED'); }
      assert.equal(response.status, 200, 'CAPTURE_HTTP_STATUS');
      assert.match(response.headers.get('content-type') ?? '', /^application\/json/i, 'CAPTURE_CONTENT_TYPE');
      const reader = response.body.getReader(), chunks = [];
      try {
        while (true) {
          const {done,value} = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          assert.ok(totalBytes <= byteBudget, 'CAPTURE_BYTE_BUDGET');
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel(); }
      const bytes = Buffer.concat(chunks), batch = JSON.parse(bytes.toString('utf8'));
      assert.ok(Array.isArray(batch) && batch.length <= 1000, 'CAPTURE_PAGE_BUDGET');
      const columns = table.columns.map(c=>c.name).sort();
      for (const row of batch) {
        assert.deepEqual(Object.keys(row).sort(), columns, 'CAPTURE_COMPLETE_ROW');
        assert.equal(typeof row[tables.get(table.name)], 'string', 'CAPTURE_PRIMARY_KEY');
        rows.set(row[tables.get(table.name)], row);
      }
      windows.push({table:table.name,offset,rows:batch.length,bytes:bytes.length,sha256:digest(bytes),readAt:new Date().toISOString()});
    }
    assert.ok(rows.size > 0 && rows.size <= 5000, 'CAPTURE_SAMPLE_ROWS');
    samples[table.name] = [...rows.values()];
  }
  return {...metadata,samples,representativeness:{method:'five evenly spaced windows in primary-key order; 1000 rows maximum per window',
    estimatedPopulation:true,transactionalSnapshot:false,foreignKeyClosed:false,
    biasedByPrimaryKey:true,fullDatabaseMeasurement:false,windows,totalBytes,
    limitations:['Concurrent writes can shift offsets. UUID order is a spread, not guaranteed random sampling.',
      'Product text IDs correlate with source; five windows do not certify category/store coverage.',
      'Derived columns are captured values; the physical lab does not recreate generated expressions, triggers or observation RPCs.',
      'Sample is not a migration backup and cannot certify full production capacity or functional parity.']}};
}

async function privatePath(file, existing) {
  const resolved = path.resolve(file);
  assert.equal(path.dirname(resolved), privateRoot, 'CAPTURE_PATH_SCOPE');
  assert.match(path.basename(resolved), /^[a-zA-Z0-9-]+\.json$/, 'CAPTURE_FILE_NAME');
  assert.equal(await fs.realpath(privateRoot), privateRoot, 'CAPTURE_PARENT_SYMLINK');
  assert.equal((await fs.stat(privateRoot)).mode & 0o077, 0, 'CAPTURE_PRIVATE_DIRECTORY');
  if (existing) {
    assert.equal(await fs.realpath(resolved), resolved, 'CAPTURE_FILE_SYMLINK');
    const stat = await fs.stat(resolved);
    assert.equal(stat.mode & 0o077, 0, 'CAPTURE_PRIVATE_FILE');
    assert.ok(stat.size < 256*1024, 'CAPTURE_METADATA_BUDGET');
  }
  return resolved;
}

async function main() {
  assert.equal(process.argv.length, 4, 'CAPTURE_ARGUMENTS');
  const input = await privatePath(process.argv[2], true), output = await privatePath(process.argv[3], false);
  assert.notEqual(input, output, 'CAPTURE_OUTPUT_IS_INPUT');
  await assert.rejects(fs.stat(output), {code:'ENOENT'}, 'CAPTURE_OUTPUT_EXISTS');
  const metadata = JSON.parse(await fs.readFile(input, 'utf8'));
  const env = {...parse(await fs.readFile(path.join(root,'.env.local'))),...process.env};
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,''), origin, 'CAPTURE_PROJECT_SCOPE');
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const result = await capture(metadata, key);
  await fs.writeFile(output, JSON.stringify(result)+'\n', {flag:'wx',mode:0o600});
  console.log(JSON.stringify({success:true,readOnly:true,tables:Object.entries(result.samples).map(([name,rows])=>({name,rows:rows.length})),
    totalBytes:result.representativeness.totalBytes,output}));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(JSON.stringify({success:false,reason:/^CAPTURE_[A-Z_]+$/.test(error?.message)?error.message:'CAPTURE_FAILED',productionMutations:false}));process.exitCode=1;});
}
