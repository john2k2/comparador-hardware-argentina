import { readFile, writeFile } from 'node:fs/promises';
import { evaluateG02Readiness } from './lib/g02-readiness.mjs';
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Falta ${name}`);
  return args[index + 1];
}
// CSV RFC4180 suficiente para campos citados, comas y saltos de línea.
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (ch === ',' || ch === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (ch === '\n') { rows.push(row); row = []; }
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV incompleto');
  if (cell || row.length) rows.push([...row, cell.replace(/\r$/, '')]);
  const header = rows.shift();
  if (!header || new Set(header).size !== header.length) throw new Error('CSV inválido');
  return rows.filter(row => row.some(Boolean)).map(row => {
    if (row.length !== header.length) throw new Error('Fila CSV incompleta');
    return Object.fromEntries(header.map((key, i) => [key, row[i]]));
  });
}
const cycles = parseCsv(await readFile(option('--cycles'), 'utf8'));
const freshness = JSON.parse(await readFile(option('--freshness'), 'utf8'));
const sample = JSON.parse(await readFile(option('--sample'), 'utf8'));
const report = evaluateG02Readiness(cycles, freshness, sample.products.map(product => product.id));
const output = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(option('--output'), output);
console.log(output);
