import { readFile } from 'node:fs/promises';
import { getServerSupabaseServiceClient } from '../../src/lib/server/supabase-server';
import { parseCatalogInterest } from '../../src/lib/catalog/analytics-interest';
const [path] = process.argv.slice(2);
if (!path) throw new Error('REFRESH_INTEREST_FILE_REQUIRED');
const rows = parseCatalogInterest(JSON.parse(await readFile(path,'utf8')));
const client = getServerSupabaseServiceClient();
if (!client) throw new Error('REFRESH_DATABASE_UNAVAILABLE');
// Validar IDs contra el catálogo: una página vieja puede no existir más.
let imported = 0;
for (let offset = 0; offset < rows.length; offset += 100) {
  const batch = rows.slice(offset,offset+100);
  const found = await client.from('products').select('id').in('id',batch.map(row=>row.product_id));
  if (found.error) throw new Error('REFRESH_READ_FAILED');
  const ids = new Set(found.data.map(row=>row.id));
  const valid = batch.filter(row=>ids.has(row.product_id));
  if (valid.length) {
    const result = await client.from('catalog_refresh_interest').upsert(valid,{onConflict:'product_id'});
    if (result.error) throw new Error('REFRESH_INTEREST_IMPORT_FAILED');
    imported += valid.length;
  }
}
process.stdout.write(JSON.stringify({ source:'analytics-unique-users', imported, skipped:rows.length-imported })+'\n');
