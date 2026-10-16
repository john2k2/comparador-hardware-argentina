// QA montado local: PcBuilder real, datos sintéticos y cero llamadas externas.
// Ejecutar desde la raíz del proyecto; detener este proceso al terminar.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const port = Number(process.argv[2] ?? 3046);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error('Puerto de QA inválido');
await readFile(join(root, 'src/components/pc-builder/PcBuilder.tsx'));
const styles = (await readdir(join(root, '.next/static/chunks'))).filter(file => file.endsWith('.css'));
if (!styles.length) throw Error('Falta CSS compilado local; no ejecutar un build productivo desde este helper');

async function bundle() {
  const result = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { PcBuilder } from './src/components/pc-builder/PcBuilder';
      const now = new Date().toISOString();
      const definitions = [
        ['cpu', 'procesadores', 'AMD Ryzen 5 5600 con cooler', 100000],
        ['ram', 'memoria-ram', 'Kingston Fury 16GB DDR4 3200', 50000],
        ['gpu', 'tarjetas-graficas', 'MSI RTX 4060 8GB', 300000],
      ];
      const products = definitions.map(([slot, category, name, price]) => ({
        id: 'fixture-' + slot, slot, category, name, brand:'Fixture', model:name,
        specs:{}, createdAt:now, updatedAt:now,
        lowestPrice:price, highestPrice:price, averagePrice:price,
        prices:[{storeId:'fixture',storeName:'Tienda sintética',price,stock:'in-stock',
          installment:null,url:'https://store.example/' + slot,lastUpdated:now}],
      }));
      const reads = {};
      window.fetch = async (input, options) => {
        const url = new URL(String(input), location.origin);
        if (url.pathname !== '/api/pc-builder/catalog' || options?.method && options.method !== 'GET')
          throw Error('QA bloquea cualquier otra consulta o escritura');
        const slot = url.searchParams.get('slot');
        const ids = url.searchParams.getAll('id');
        const key = slot ?? 'ids';
        reads[key] = (reads[key] ?? 0) + 1;
        document.getElementById('fixture-reads').textContent = JSON.stringify(reads);
        if (slot === 'gpu' && reads.gpu === 1)
          return new Response(JSON.stringify({error:'Catálogo GPU no disponible (fixture503)'}), {status:503});
        const found = products.filter(product => ids.length ? ids.includes(product.id)
          : product.slot === slot && (slot !== 'gpu' || url.searchParams.get('q')));
        return new Response(JSON.stringify({products:found}));
      };
      createRoot(document.getElementById('root')).render(<PcBuilder initialBudget={null} />);
    ` },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
    plugins: [{ name: 'isolated-builder-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /^(next\/link|@\/lib\/analytics\/ga4|@\/components\/commercial\/(AdvisoryCta|OfferReportLink)|@\/components\/product\/MotherboardMemorySupport|\.\/RefreshOffersButton)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: root, contents:
        args.path === 'next/link' ? 'export default function Link({children, href}) {return <a href={href}>{children}</a>;}'
          : args.path.endsWith('/ga4') ? 'export const trackBudgetBuilder=()=>{}; export const trackPcBuilderAction=()=>{}; export const trackStoreClick=()=>{};'
            : 'export const ' + args.path.split('/').pop() + '=()=>null;',
      }));
    } }],
  });
  return result.outputFiles[0].text;
}

const server = createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; frame-ancestors 'none'");
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (path === '/fixture.js') {
      response.setHeader('Content-Type', 'application/javascript'); response.end(await bundle()); return;
    }
    if (/^\/static\/(chunks|media)\/[a-zA-Z0-9_.-]+\.(css|woff2)$/.test(path)) {
      const file = resolve(root, '.next' + path);
      response.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'font/woff2');
      response.end(await readFile(file)); return;
    }
    if (path !== '/') { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html lang="es" class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">'
      + styles.map(file => '<link rel="stylesheet" href="/static/chunks/' + file + '">').join('')
      + '</head><body><div class="border-4 p-4 font-body">FIXTURE LOCAL — sin catálogo real, Analytics, refresh o compras. Lecturas: <output id="fixture-reads" style="overflow-wrap:anywhere"></output></div><div id="root"></div><script src="/fixture.js"></script></body></html>');
  } catch { response.writeHead(500).end('QA_FIXTURE_ERROR'); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write('QA aislado: http://127.0.0.1:' + port + '\n'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
