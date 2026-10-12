// Medición explícita del piloto: consultas acotadas, sin endpoints de producción.
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { sqliteAdapter } from './sqlite-adapter.mjs';
import { searchCatalog, validateParams } from './engine.mjs';
const [sqlite, tokenFile, output] = process.argv.slice(2);
if (!sqlite || !tokenFile || !output) throw new Error('Uso: SQLITE TOKEN_PRIVADO REPORTE_NUEVO');
const base = 'https://catalog-search-free-pilot-20261011.ortiz-jonathan.workers.dev';
const token = readFileSync(tokenFile, 'utf8').trim();
const db = new DatabaseSync(sqlite, { readOnly: true });
const marker = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value;
const cases = ['', 'q=RTX', 'q=Ryzen+5500', 'q=Logitech', 'q=DDR4', 'q=rt', 'q=producto-inexistente-zz', 'category=tarjetas-graficas', 'category=procesadores', 'category=memoria-ram', 'q=RTX&sortBy=price-asc', 'q=Ryzen&minPrice=0', 'q=RTX&page=2', 'q=Ryzen&store=dinobyte', 'q=RTX&maxPrice=1000000', 'q=Logitech&sortBy=name'];
const observations = [];
try {
  for (const query of cases) {
    const url = new URL('/api/search?' + query, base);
    const p = url.searchParams;
    const params = validateParams({ p_query: p.get('q') ?? '', p_category: p.get('category'), p_stores: p.getAll('store'), p_min_price: p.has('minPrice') ? Number(p.get('minPrice')) : null, p_max_price: p.has('maxPrice') ? Number(p.get('maxPrice')) : null, p_sort: p.get('sortBy') ?? 'relevance', p_page: Number(p.get('page') ?? 1), p_page_size: 12 });
    // Oracle local del mismo corte y contrato. No prueba cobertura del catálogo completo.
    const clock = Date.now();
    const expected = await searchCatalog(sqliteAdapter(db), params, { now: clock, snapshot: marker });
    if(p.has('category'))assert.ok(expected.total>0,`Categoría real sin resultados: ${query}`);
    if(p.get('q')==='producto-inexistente-zz')assert.equal(expected.total,0);
    assert.deepEqual(expected, await searchCatalog(sqliteAdapter(db), params, { now: clock, snapshot: marker, forceOriginal: true }), `Paridad de la proyección ${query}`);
    for (let repeat = 0; repeat < 3; repeat++) {
      const started = performance.now();
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
      const text = await response.text();
      const observation = { query, repeat, at: new Date().toISOString(), status: response.status, latencyMs: Math.round((performance.now() - started) * 100) / 100, cache: response.headers.get('X-Pilot-Cache'), rowsRead: response.headers.has('X-Pilot-D1-Rows-Read') ? Number(response.headers.get('X-Pilot-D1-Rows-Read')) : null, queries: response.headers.has('X-Pilot-D1-Queries') ? Number(response.headers.get('X-Pilot-D1-Queries')) : null, replicaQueries: Number(response.headers.get('X-Pilot-D1-Replica-Queries') ?? 0), serverTiming: response.headers.get('Server-Timing'), colo: response.headers.get('cf-ray')?.split('-').at(-1), sha256: createHash('sha256').update(text).digest('hex') };
      observations.push(observation);
      assert.equal(response.status, 200, `Respuesta ${query}: ${text.slice(0, 200)}`);
      assert.deepEqual(JSON.parse(text), expected, `Paridad ${query}`);
      observation.parity = true;
    }
  }
} finally {
  db.close();
  const report = { sample: true, endpoint: base, source: 'D1 meta por consulta; latencia de red desde Mac, NO CPU', requests: observations.length, successful: observations.filter(x => x.parity).length, rowsRead: observations.reduce((n, x) => n + (x.rowsRead ?? 0), 0), observations };
  writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ...report, observations: undefined }));
}
