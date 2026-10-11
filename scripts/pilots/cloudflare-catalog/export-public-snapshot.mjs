// Sólo GET del catálogo público. Nunca exporta cuentas, alertas, secretos ni historial.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const destination = path.resolve(process.argv[2] ?? 'outputs/catalogo-local-cloudflare-2026-10-11/public-snapshot');
const envPath = process.argv[3] ?? '/Users/johnortiz/Documents/Proyectos/comparador-hardware-argentina/.env.local';
const schema = JSON.parse(await fs.readFile(path.join(destination, 'schema.json'), 'utf8'));
const env = await fs.readFile(envPath, 'utf8');
const value = name => (env.match(new RegExp('^' + name + '=(.*)$', 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const base = value('NEXT_PUBLIC_SUPABASE_URL');
const key = value('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || value('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (base !== 'https://zyiyziubpcpgoqlkcrie.supabase.co' || !key) throw new Error('Configuración pública inesperada');
const tables = ['stores', 'products', 'product_prices', 'catalog_price_summaries'];
const manifestPath = path.join(destination, 'manifest.json');
let manifest;
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
manifest ??= { source: base, publicGetOnly: true, atomicRemoteSnapshot: false, startedAt: new Date().toISOString(), tables: [] };
if (manifest.source !== base || !manifest.publicGetOnly || manifest.endedAt) throw new Error('Manifest de exportación inesperado o ya completo');
await fs.mkdir(destination, { recursive: true, mode: 0o700 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function read(table, columns, after) {
  const primaryKey = table === 'catalog_price_summaries' ? 'product_id' : 'id';
  const url = new URL(base + '/rest/v1/' + table);
  url.searchParams.set('select', columns.join(','));
  url.searchParams.set('order', primaryKey + '.asc');
  url.searchParams.set('limit', '1000');
  if (after !== null) url.searchParams.set(primaryKey, 'gt.' + after);
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(30000) });
    if (response.ok) {
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Respuesta de catálogo inválida');
      return { rows, primaryKey };
    }
    if (![429, 502, 503, 504].includes(response.status) || attempt === 2) throw new Error('Lectura ' + table + ' HTTP ' + response.status);
    await pause((attempt + 1) * 2000);
  }
}
for (const table of tables) {
  const columns = schema.columns.filter(column => column.table === table).map(column => column.name);
  if (!columns.length || columns.some(column => !/^[a-z_]+$/.test(column))) throw new Error('Columnas inesperadas');
  const filename = path.join(destination, table + '.jsonl');
  const completed = manifest.tables.find(record => record.table === table);
  if (completed) {
    const data = await fs.readFile(filename);
    if (crypto.createHash('sha256').update(data).digest('hex') !== completed.sha256) throw new Error('Exportación completada cambió');
    continue;
  }
  const digest = crypto.createHash('sha256');
  let last = null, count = 0, pages = 0;
  const ids = new Set();
  let resumed = false;
  try {
    const previous = await fs.readFile(filename + '.partial', 'utf8');
    if (previous && !previous.endsWith('\n')) throw new Error('Página parcial sin línea completa');
    for (const line of previous.split('\n').filter(Boolean)) {
      const row = JSON.parse(line), id = row[table === 'catalog_price_summaries' ? 'product_id' : 'id'];
      if (typeof id !== 'string' || ids.has(id)) throw new Error('ID repetido en copia parcial');
      ids.add(id); last = id; count++;
    }
    digest.update(previous); resumed = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const handle = await fs.open(filename + '.partial', resumed ? 'a' : 'wx', 0o600);
  const startedAt = new Date().toISOString();
  try {
    for (;;) {
      const { rows, primaryKey } = await read(table, columns, last);
      pages++;
      if (!rows.length) break;
      for (const row of rows) {
        // El orden lo define PostgreSQL/ICU; compararlo con UTF-16 de JS es incorrecto.
        if (typeof row[primaryKey] !== 'string' || ids.has(row[primaryKey])) throw new Error('ID repetido en ' + table);
        ids.add(row[primaryKey]);
        const line = JSON.stringify(row) + '\n';
        await handle.write(line); digest.update(line); last = row[primaryKey]; count++;
      }
      if (pages % 10 === 0) console.log(JSON.stringify({ table, count, pages }));
      await pause(300);
    }
  } finally { await handle.close(); }
  await fs.rename(filename + '.partial', filename);
  const record = { table, count, pagesThisAttempt: pages, resumed, terminatedOnEmptyPage: true, startedAt, endedAt: new Date().toISOString(), bytes: (await fs.stat(filename)).size, sha256: digest.digest('hex') };
  manifest.tables.push(record);
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(record));
}
manifest.endedAt = new Date().toISOString();
manifest.referenceNow = manifest.endedAt;
await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
