// Diagnóstico offline de una publicación exacta; sólo escribe JSON en stdout.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { load as loadHtml } from 'cheerio';

const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const names = ['dinobyte-adaptive-window.json', 'dinobyte-sn3000-store-api.json',
  'dinobyte-sn3000.html', 'dinobyte-source-reads.json'];
const url = 'https://dinobyte.ar/producto/disco-solido-nvme-western-digital-green-sn3000-500gb/';
const modules = new Set(['price-utils.ts', 'price-freshness.ts', 'product-identity.ts',
  'quality/offer-identity.ts', 'quality/offer-attribute-proof.ts',
  'scrapers/listing-reference.ts', 'scrapers/source-contracts.ts', 'scrapers/static-data.ts',
  'scrapers/scraper-helpers.ts', 'scrapers/common-pagination.ts', 'scrapers/source-title.ts',
  'scrapers/brand-utils.ts', 'product-sanitizer.ts', 'text-utils.ts', 'product-images.ts',
  'catalog/hardware-categories.ts']);
const digest = text => createHash('sha256').update(text).digest('hex');

function boundedFile(file, maxBytes) {
  const resolved = realpathSync(file);
  const stats = statSync(resolved);
  assert(stats.isFile() && stats.size > 0 && stats.size <= maxBytes, 'Archivo vacío, inválido o demasiado grande');
  return readFileSync(resolved, 'utf8');
}

function run(sourceDirectory) {
  assert(path.isAbsolute(sourceDirectory), 'El directorio de evidencia debe ser absoluto');
  const directory = realpathSync(sourceDirectory);
  assert(statSync(directory).isDirectory(), 'No es un directorio');
  const input = Object.fromEntries(names.map(name => {
    const file = realpathSync(path.join(directory, name));
    assert(path.dirname(file) === directory, 'La evidencia no puede escapar del directorio explícito');
    return [name, boundedFile(file, 2 * 1024 * 1024)];
  }));
  const hashes = {};
  const cache = new Map();
  // Sólo módulos puros actuales. Sin process, fetch, timers ni acceso a
  // archivos dentro de la VM; cualquier dependencia nueva falla cerrada.
  function currentModule(relative) {
    assert(modules.has(relative), `Import no permitido: ${relative}`);
    if (cache.has(relative)) return cache.get(relative).exports;
    const file = realpathSync(path.join(root, 'src/lib', relative));
    assert(file === path.join(root, 'src/lib', relative), 'Módulo fuera de la copia autorizada');
    const source = boundedFile(file, 256 * 1024);
    hashes[relative] = digest(source);
    const moduleRecord = { exports: {} };
    cache.set(relative, moduleRecord);
    const localRequire = specifier => {
      if (relative === 'scrapers/common-pagination.ts' && specifier === 'cheerio') return { load: loadHtml };
      const resolved = specifier.startsWith('@/lib/') ? specifier.slice(6)
        : specifier.startsWith('.') ? path.posix.join(path.posix.dirname(relative), specifier) : null;
      assert(resolved !== null, `Dependencia externa no permitida: ${specifier}`);
      return currentModule(`${resolved}.ts`);
    };
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const execute = vm.runInNewContext(`(function(require, module, exports) { ${code}\n})`,
      { URL, URLSearchParams, Date }, { filename: file, timeout: 1000 });
    execute(localRequire, moduleRecord, moduleRecord.exports);
    return moduleRecord.exports;
  }
  const { isComparableStoreOffer } = currentModule('price-utils.ts');
  const { isOfferFresh, isCatalogOfferFresh } = currentModule('price-freshness.ts');
  const { buildIdentityEvidence, hasExplicitIdentityConflict, needsIdentityReview } = currentModule('quality/offer-identity.ts');
  // Extrae las funciones de detalle del archivo actual. Se omiten los imports
  // de red y los demás flujos; constructor, sanitización y helpers son reales.
  const parserSource = boundedFile(path.join(root, 'src/lib/scrapers/woocommerce-shared.ts'), 256 * 1024);
  hashes['scrapers/woocommerce-shared.ts'] = digest(parserSource);
  const parsedSource = ts.createSourceFile('woocommerce-shared.ts', parserSource, ts.ScriptTarget.ES2022, true);
  const functionNames = ['normalizeAbsoluteUrl', 'parseWooPrice', 'foreignWooCurrency', 'parseWooProductDetail'];
  const functions = parsedSource.statements.filter(statement => ts.isFunctionDeclaration(statement)
    && functionNames.includes(statement.name?.text));
  assert.equal(functions.length, functionNames.length, 'Cambió la estructura del parser de detalle');
  const code = ts.transpileModule(functions.map(statement => statement.getText(parsedSource)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const parserExports = { exports: {} };
  const parserContext = {
    ...currentModule('scrapers/scraper-helpers.ts'),
    ...currentModule('scrapers/listing-reference.ts'),
    normalizeIdentityText: currentModule('product-identity.ts').normalizeIdentityText,
    normalizeAbsolutePaginationUrl: currentModule('scrapers/common-pagination.ts').normalizeAbsoluteUrl,
    cheerio: { load: loadHtml }, URL, Date, exports: parserExports.exports,
  };
  vm.runInNewContext(code, parserContext, { timeout: 1000 });
  const window = JSON.parse(input[names[0]]);
  const api = JSON.parse(input[names[1]]);
  const receipts = JSON.parse(input[names[3]]);
  assert(Array.isArray(window.rows) && window.rows.length <= 12, 'La muestra debe permanecer puntual');
  const matches = window.rows.filter(row => row.store_id === 'dinobyte' && row.url === url);
  assert.equal(matches.length, 1, 'Debe existir una sola fila exacta');
  const row = matches[0];
  assert.equal(api.id, 3750614);
  assert.equal(api.permalink, url);
  assert.equal(api.name, row.name);
  assert.equal(api.sku, 'DIS731');
  assert.equal(row.source_identity.sourceId, String(api.id));
  assert.equal(row.source_identity.storeSku, api.sku);
  assert.equal(row.source_identity.title, api.name);
  assert.equal(api.prices.currency_code, 'ARS');
  assert.equal(api.prices.currency_minor_unit, 2);
  assert.equal(Number(api.prices.price) / 100, Number(row.price));
  assert.equal(api.is_on_backorder, true);
  assert.equal(api.stock_availability.class, 'available-on-backorder');
  const $ = loadHtml(input[names[2]]);
  const primaryStock = $('.stock').filter((_, element) =>
    $(element).parents('.related, .up-sells, .upsells, .cross-sells, .products, .w-grid-item').length === 0);
  assert.equal(primaryStock.length, 1);
  assert(primaryStock.hasClass('available-on-backorder'));
  assert.equal(primaryStock.text().trim(), 'Disponible para reserva');
  assert.equal($('h1').first().text().trim(), api.name);
  assert($('button[name="add-to-cart"]').toArray().some(element => $(element).attr('value') === String(api.id)));
  assert($('.sku').toArray().some(element => $(element).text().trim() === api.sku));
  for (const name of names.slice(1, 3)) {
    const receipt = receipts.find(item => item.file === name);
    assert(receipt && receipt.status === 200 && Number.isFinite(Date.parse(receipt.at)), 'Recibo de fuente ausente');
    assert.equal(receipt.finalUrl, name.endsWith('.html') ? url : 'https://dinobyte.ar/wp-json/wc/store/v1/products/3750614');
  }
  const offer = { storeId: row.store_id, url: row.url, price: Number(row.price), stock: row.stock,
    sourceIdentity: row.source_identity, identityReview: row.identity_review ?? undefined,
    lastUpdated: new Date(row.last_updated) };
  const product = { name: row.name, category: row.category };
  const evidence = buildIdentityEvidence(product.name, product.category, offer.url, offer.sourceIdentity.title);
  const comparable = isComparableStoreOffer(offer, product);
  const sameCutoff = Date.parse('2026-10-08T11:29:42Z');
  assert.equal(offer.stock, 'unknown');
  assert.equal(hasExplicitIdentityConflict(evidence), false);
  assert.equal(needsIdentityReview(offer, product), false);
  assert.equal(isOfferFresh(offer.lastUpdated.toISOString(), sameCutoff), true);
  assert.equal(isCatalogOfferFresh(offer.lastUpdated.toISOString(), sameCutoff), true);
  assert.equal(comparable, false);
  const htmlProduct = parserExports.exports.parseWooProductDetail(input[names[2]], url,
    { id: 'dinobyte', name: 'Dinobyte', baseUrl: 'https://dinobyte.ar' }, 'almacenamiento', api.slug);
  assert(htmlProduct, 'El HTML real no produjo una observación de detalle');
  assert.equal(htmlProduct.specs.SourceListingId, String(api.id));
  assert.equal(htmlProduct.specs.SKU, api.sku);
  assert.equal(htmlProduct.prices[0].price, offer.price);
  assert.equal(htmlProduct.prices[0].stock, 'unknown', 'La reserva HTML no debe convertirse en disponibilidad');
  assert.equal(isComparableStoreOffer(htmlProduct.prices[0], htmlProduct), false);
  // Contrafactual separado: sólo identifica la condición bloqueante en memoria.
  // No es una observación de tienda ni se contabiliza como oferta comparable.
  const hypothetical = isComparableStoreOffer({ ...offer, stock: 'in-stock' }, product);
  assert.equal(hypothetical, true);
  return { status: 'same-block-confirmed', case: { productId: row.product_id, sourceId: api.id,
    storeSku: api.sku, url, priceArs: offer.price, observedAt: offer.lastUpdated.toISOString(),
    actualComparable: comparable, blocker: 'stock-unknown', producerAttribution: 'unverified' },
  sourceContrast: { htmlReadAt: receipts.find(item => item.file === names[2]).at,
    apiReadAt: receipts.find(item => item.file === names[1]).at,
    isOnBackorder: api.is_on_backorder, availability: api.stock_availability,
    historicalStockAt1120: 'not-proven-by-later-read',
    htmlParserStock: htmlProduct.prices[0].stock, htmlParserComparable: false,
    htmlParserTimestamp: 'synthetic-constructor-time-not-a-new-observation' },
  contrafactualOnlyInMemory: { hypotheticalStock: 'in-stock', hypotheticalComparable: hypothetical,
    observedOffer: false },
  sourceSha256: Object.fromEntries(names.map(name => [name, digest(input[name])])), moduleSha256: hashes };
}

try {
  assert.equal(process.argv.length, 3, 'Uso: node scripts/diagnostics/dinobyte-reserva-2026-10-08.mjs /directorio/absoluto/de/evidencia');
  process.stdout.write(`${JSON.stringify(run(process.argv[2]), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Diagnóstico fallido'}\n`);
  process.exitCode = 1;
}
