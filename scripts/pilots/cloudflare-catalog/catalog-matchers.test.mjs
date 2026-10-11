import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { identityText, searchText, ramSearchText, catalogChip, prepareQuery, matchesPrepared, matchesProduct, matchesQuery, hasPortableHint } from './catalog-matchers.mjs';

const titles = [
  'MSI GeForce RTX 4070 Ti SUPER Ventus 3X 16GB', 'MSI RTX 4070 Ventus 12GB',
  'Asus RTX4070TiS TUF', 'RTX 4070 Ti S', 'RTX 4070 S', 'RTX4070Super',
  'AMD Radeon RX 7900 XTX Sapphire Nitro 24GB', 'RX 7900 XT', 'Intel Arc B580 12GB',
  'AMD Ryzen 5 7600 Box con cooler', 'AMD Ryzen 5 7600X Tray sin cooler',
  'AMD Ryzen 7 7800X3D', 'AMD Ryzen 5 5600GT', 'Ryzen 5700', 'Ryzen5 7600',
  'Intel Core i5-14600KF BOX', 'Core i7 14700K', 'Procesador 5700', '7600',
  'Memoria Kingston Fury Beast 32 GB DDR5 6000 MHz 2 x 16 GB CL30 RGB',
  'Memoria Kingston Fury Beast 32GB DDR5 6000mhz 2x16gb CL30 RGB',
  'Memoria Corsair Vengeance 16 GB DDR4 3200 MHz DIMM',
  'Memoria Kingston Impact 16GB DDR4 3200MHz SO-DIMM notebook',
  'Memoria RAM 16 GB DDR4 3200 MHz', 'RAM 16GB DDR5 6000',
  'Memoria 32 GB 2x16 DDR5 6000MHz', 'SSD Kingston NV3 1TB',
  'Fuente de alimentación Corsair 750W', 'Placa madre ASUS Prime B650',
  'Logitech G502 Lightspeed Mouse', 'Logitech G502 Hero', 'Gaming teclado K500',
  'GPU placa de vídeo RTX 4070', 'Memória RÁM Ñandú', 'İnTeL ÁÉÍÓÚ Ryzen',
  null, '', 'Sólo + un\ttexto\ncon símbolos 🎮', 'RAM\u00a016GB\u0085DDR4',
  'GPU\u200bRTX\ufeff4070', 'Kingston memoria para PC armada',
];
const queries = ['', 'rtx', 'rtx 4070', 'rtx4070ti', 'rtx 4070 ti super', '4070',
  'rx 7900 xt', 'rx 7900 xtx', 'arc b580', 'ryzen 7600', '7600', '7600x',
  'ryzen 5 7600', 'ryzen 7 7800x3d', 'core i5 14600kf', '5700 g', 'ram',
  'ram 16 gb ddr4', 'ram 32gb ddr5 6000', 'ddr5 2 x 16 gb 6000 mhz',
  'ddr5 2x16 6000', 'ddr4 notebook 16gb', 'memoria sodimm', 'kingston',
  'kingston impact 16gb', 'g502', 'g502 lightspeed', 'fuente de alimentacion',
  'placa madre prime', 'a', '+', '32 gb', '6000', 'cpu', 'gpu'];

test('normalización de texto y unidades conserva familias y Unicode', () => {
  assert.equal(identityText(' Pláca\tDE vídeo + Ñandú '), 'placa de video + nandu');
  assert.equal(searchText('Placas de video, procesadores y memoria RAM'), 'gpu cpu y ram');
  assert.equal(ramSearchText('RAM DDR5 32 GB 2 x 16 GB 6000 MHz'), 'ram ddr5 32gb 2x16gb 6000mhz');
  assert.equal(ramSearchText('DDR5 2x16 6000'), 'ddr5 2x16gb 6000mhz');
  assert.deepEqual(catalogChip('RTX 4070 Ti S', 'gpu'), ['rtx', '4070', 'ti super']);
  assert.deepEqual(catalogChip('RX7900XTX', 'gpu'), ['rx', '7900', 'xtx']);
  assert.deepEqual(catalogChip('Ryzen 7 7800X3D', 'cpu'), ['ryzen7', '7800', 'x3d']);
  assert.deepEqual(catalogChip('Core i5-14600KF', 'cpu'), ['corei5', '14600', 'kf']);
});

test('preparación separa modelo ambiguo, categoría RAM y candidato estable', () => {
  assert.equal(prepareQuery('7600').queryChip, null);
  assert.deepEqual(prepareQuery('7600', 'procesadores').queryChip, ['unknown', '7600', '']);
  assert.equal(prepareQuery('6000', 'memoria-ram').normalized, '6000mhz');
  assert.equal(prepareQuery('ram 2 x 16 gb ddr5 6000 mhz').candidate, '6000');
  assert.equal(prepareQuery('windspeed windgb', 'memoria-ram').candidate, 'windspeed');
});

test('variantes, nombre obligatorio y portátil conservan rechazos', () => {
  const product = name => ({ name, catalog_name: searchText(name), catalog_document: searchText(name) });
  assert.equal(matchesProduct(product('AMD RX 7600'), prepareQuery('7600')), true);
  assert.equal(matchesProduct(product('Ryzen 5 7600X'), prepareQuery('7600')), false);
  assert.equal(matchesProduct(product('MSI RTX 4070 Ti'), prepareQuery('rtx 4070 ti super')), false);
  assert.equal(matchesProduct(product('MSI RTX 4070 Super'), prepareQuery('rtx 4070 ti')), false);
  assert.equal(matchesProduct(product('Memoria RAM 16GB DDR4 3200MHz SO-DIMM'), prepareQuery('ram 16 gb ddr4')), false);
  assert.equal(matchesProduct(product('Memoria RAM 16GB DDR4 3200MHz SO-DIMM'), prepareQuery('ram 16 gb ddr4 sodimm')), false); // SO-DIMM y SODIMM no son tokens equivalentes en SQL.
  assert.equal(matchesProduct(product('Memoria RAM 16GB DDR4 3200MHz SODIMM'), prepareQuery('ram 16 gb ddr4 sodimm')), true);
  const mismatch = product('Memoria RAM 8 GB DDR4');
  mismatch.catalog_document += ' 16 gb';
  assert.equal(matchesProduct(mismatch, prepareQuery('ram 16 gb ddr4')), false);
  const series = product('MSI RTX 4070 Ventus'); series.catalog_document += ' gaming';
  assert.equal(matchesProduct(series, prepareQuery('rtx 4070 gaming')), false);
  assert.equal(hasPortableHint('https://store/item-memoria-so-dimm'), true);
});

test('normalización de todas las fichas del snapshot público', { skip: !process.env.CATALOG_MATCHER_SNAPSHOT_PRODUCTS }, async () => {
  const lines = createInterface({ input: createReadStream(process.env.CATALOG_MATCHER_SNAPSHOT_PRODUCTS), crlfDelay: Infinity });
  let rows = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    assert.equal(searchText(p.name), p.catalog_name, `catalog_name producto ${p.id}`);
    const document = searchText(`${p.name} ${p.brand ?? ''} ${p.model ?? ''} ${p.normalized_title ?? ''} ${p.family_key ?? ''} ${p.variant_key ?? ''} ${p.canonical_product_key ?? ''}`);
    assert.equal(document, p.catalog_document, `catalog_document producto ${p.id}`);
    rows++;
  }
  assert.ok(rows > 0, 'El snapshot no puede estar vacío');
  process.stdout.write(`Public snapshot normalization parity: ${rows} products, ${rows * 2} stored fields.\n`);
});

// Esta prueba lee exclusivamente el PG local que creó el coordinador. No inicia
// servidores, no lee env de producción y no crea funciones/tablas.
test('paridad de helpers y matcher frente a PostgreSQL local', { skip: !process.env.CATALOG_MATCHER_PG_SOCKET }, () => {
  const socket = process.env.CATALOG_MATCHER_PG_SOCKET;
  assert.ok(socket.startsWith('/'), 'Se requiere socket absoluto, nunca host remoto');
  const run = sql => JSON.parse(execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql',
    ['-X', '-h', socket, '-p', process.env.CATALOG_MATCHER_PG_PORT ?? '55511', '-U', 'postgres', '-d', process.env.CATALOG_MATCHER_PG_DATABASE ?? 'catalog_pilot', '-Atq', '-v', 'ON_ERROR_STOP=1'],
    { input: `set statement_timeout='20s'; ${sql}`, encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 }));
  const literal = value => value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
  const helperValues = [...titles, ...queries, ...Array.from({ length: 33 }, (_, index) => `RAM${String.fromCodePoint(0x2000 + index)}16 GB`)];
  const helpers = run(`select jsonb_agg(jsonb_build_object('value',value,'identity',public.catalog_identity_text(value),'search',public.catalog_search_text(value),'ram',public.catalog_ram_search_text(value),'cpu',public.catalog_chip(value,'cpu'),'gpu',public.catalog_chip(value,'gpu'))) from (values ${helperValues.map(value => `(${literal(value)})`).join(',')}) t(value);`);
  for (const row of helpers) {
    assert.equal(identityText(row.value), row.identity, `identity ${JSON.stringify(row.value)}`);
    assert.equal(searchText(row.value), row.search, `search ${JSON.stringify(row.value)}`);
    assert.equal(ramSearchText(row.value), row.ram, `ram ${JSON.stringify(row.value)}`);
    assert.deepEqual(catalogChip(row.value, 'cpu'), row.cpu, `CPU ${JSON.stringify(row.value)}`);
    assert.deepEqual(catalogChip(row.value, 'gpu'), row.gpu, `GPU ${JSON.stringify(row.value)}`);
  }
  const preparations = queries.flatMap(query => [null, 'procesadores', 'memoria-ram', 'tarjetas-graficas'].map(category => ({ query, category })));
  const preparedRows = run(`with inputs as (select * from jsonb_to_recordset(${literal(JSON.stringify(preparations))}::jsonb) t(query text,category text)), raw as (
    select *,public.catalog_search_text(query) norm,public.catalog_chip(query,'gpu') gpu,coalesce(public.catalog_chip(query,'gpu'),public.catalog_chip(query,'cpu')) chip from inputs
  ), ram as (select *,coalesce(category='memoria-ram' or (category is null and chip is null and norm ~ '\\m(ddr[345]|ram|memoria)\\M'),false) ram_query from raw), normalized as (
    select *,case when ram_query then public.catalog_ram_search_text(norm) else norm end normalized from ram
  ) select jsonb_agg(jsonb_build_object('normalized',normalized,'words',array(select word from unnest(string_to_array(normalized,' ')) word where length(word)>1),
    'queryChip',case when ram_query or (normalized ~ '^[0-9]{3,5}$' and category is distinct from 'procesadores') then null else chip end,
    'kind',case when ram_query then 'ram' when gpu is null then 'cpu' else 'gpu' end,'ramQuery',ram_query,
    'candidate',(select word from (select case when ram_query then case when token ~ '^[0-9]+(gb|mhz)$' then regexp_replace(token,'(gb|mhz)$','') when token ~ '^[1-8]x[0-9]+gb$' then substring(token from 'x([0-9]+)') else token end else token end word from unnest(string_to_array(normalized,' ')) token) t where length(word)>1 order by (word ~ '[0-9]') desc,length(word) desc,word limit 1))) from normalized;`);
  for (let index = 0; index < preparations.length; index++) {
    const c = preparations[index];
    assert.deepEqual(prepareQuery(c.query, c.category), preparedRows[index], `preparation ${JSON.stringify(c)}`);
  }
  const cases = [];
  for (const title of titles.filter(title => typeof title === 'string')) for (const query of queries) for (const category of [null, 'procesadores', 'memoria-ram']) {
    const prepared = prepareQuery(query, category);
    const name = searchText(title), document = `${name} extra gaming 16gb`, urls = title.includes('Impact') ? 'https://example.test/so-dimm' : '';
    cases.push({ title, query, category, name, document, urls, ...prepared, portableHint: hasPortableHint(urls) });
  }
  const rows = run(`with inputs as (select * from jsonb_to_recordset(${literal(JSON.stringify(cases))}::jsonb) as t(title text,name text,document text,query text,category text,urls text,normalized text,words text[],"queryChip" text[],kind text,"portableHint" boolean)), checked as (select *,public.catalog_matches_prepared(title,name,document,normalized,words,"queryChip",kind,urls,"portableHint") matched,public.catalog_matches_query(title,document,query,urls) queried from inputs) select jsonb_agg(jsonb_build_object('matched',matched,'queried',queried)) from checked;`);
  assert.equal(rows.length, cases.length);
  for (let index = 0; index < cases.length; index++) {
    const c = cases[index];
    assert.equal(matchesPrepared(c), rows[index].matched, `prepared ${JSON.stringify(c)}`);
    assert.equal(matchesQuery(c.title, c.document, c.query, c.urls), rows[index].queried, `query ${JSON.stringify(c)}`);
  }
  process.stdout.write(`PG helper parity: ${helpers.length * 5} values; query preparation parity: ${preparations.length}; matcher parity: ${cases.length * 2} booleans.\n`);
});
