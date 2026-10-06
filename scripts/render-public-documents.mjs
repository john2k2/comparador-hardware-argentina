// Genera fuera del Worker documentos sin datos de cuenta ni precios variables.
// El nonce se sustituye al servir cada respuesta, incluido el texto de hidratación.
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const routes = ['/comparativa/comparar', '/guia/armar', '/acerca', '/contacto', '/privacidad', '/terminos', '/measurement-shell-build'];
const folder = path.join(root, 'public/__public-documents');
// Conservar el enlace del piloto público con el mismo flag del Worker.
const workerConfig = await fs.readFile(path.join(root, 'wrangler.jsonc'), 'utf8');
const affiliatePilot = workerConfig.match(/"ENEBA_AFFILIATE_PILOT_ENABLED"\s*:\s*"([01])"/)?.[1];
if (!affiliatePilot) throw new Error('Falta verificar el flag público del piloto para generar documentos.');
await fs.rm(folder, { recursive: true, force: true });
await fs.mkdir(folder, { recursive: true });
const reservation = net.createServer();
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production', MEASUREMENT_SHELL_BUILD: '1', ENEBA_AFFILIATE_PILOT_ENABLED: affiliatePilot, DISABLE_INTERNAL_BACKGROUND_REFRESH: '1', DISABLE_LIVE_SCRAPING: '1', ENABLE_ON_DEMAND_REFRESH: '0' },
});
let ready = false;
let failed = false;
server.stdout.on('data', (chunk) => { if (/Ready in/.test(chunk.toString())) ready = true; });
server.stderr.on('data', () => {});
server.on('error', () => { failed = true; });
server.on('exit', () => { failed = true; });
try {
  for (let i = 0; !ready && !failed && i < 80; i++) await new Promise((resolve) => setTimeout(resolve, 100));
  if (!ready) throw new Error('No se pudo iniciar la generación de documentos públicos.');
  for (const route of routes) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    const html = await response.text();
    const nonce = response.headers.get('x-content-security-policy-nonce');
    const policy = response.headers.get('content-security-policy');
    if (response.status !== 200 || response.headers.has('set-cookie') || !nonce || !/^[a-f0-9]{32}$/.test(nonce) || !policy?.includes(`'nonce-${nonce}'`) || html.length > 512_000 || /id=["']__next_error__|NEXT_HTTP_ERROR_FALLBACK/.test(html)) throw new Error(`Documento público no verificado: ${route}`);
    const headers = Object.fromEntries(['content-type', 'content-security-policy', 'x-content-security-policy-nonce', 'x-content-type-options', 'x-frame-options', 'referrer-policy'].flatMap((name) => {
      const value = response.headers.get(name);
      return value ? [[name, value.replaceAll(nonce, 'COMPARADOR_DOCUMENT_NONCE')]] : [];
    }));
    const result = { version: 1, route, headers, html: html.replaceAll(nonce, 'COMPARADOR_DOCUMENT_NONCE') };
    await fs.writeFile(path.join(folder, `${route.slice(1).replaceAll('/', '-')}.json`), JSON.stringify(result));
  }
  console.log(`Documentos públicos verificados: ${routes.length}. Sin consultas de cuentas ni recopilación de precios.`);
} finally { server.kill('SIGTERM'); }
