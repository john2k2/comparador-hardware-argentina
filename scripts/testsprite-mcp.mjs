// Carga exclusivamente la credencial de TestSprite; nunca lee .env.local.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const projectPath = fileURLToPath(new URL('../', import.meta.url));
const credentialsPath = new URL('../.env.testsprite.local', import.meta.url);
let fileKey;
try {
  fileKey = parse(readFileSync(credentialsPath)).TESTSPRITE_API_KEY;
} catch (error) {
  if (error.code !== 'ENOENT') {
    process.stderr.write('No se pudo leer la configuración local de TestSprite.\n');
    process.exit(1);
  }
}

const apiKey = (process.env.TESTSPRITE_API_KEY || fileKey || '').trim();
if (!apiKey) {
  process.stderr.write('Falta TESTSPRITE_API_KEY en .env.testsprite.local. Ver docs/testing/TESTSPRITE.md.\n');
  process.exit(1);
}

// No propagar credenciales de Supabase, cron u otros proveedores al MCP.
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot'].flatMap((name) =>
    process.env[name] ? [[name, process.env[name]]] : []),
);
const child = spawn('npx', ['--yes', '@testsprite/testsprite-mcp@0.0.46'], {
  cwd: projectPath,
  env: { ...env, API_KEY: apiKey },
  stdio: 'inherit',
});
child.on('error', () => {
  process.stderr.write('No se pudo iniciar TestSprite; comprobar Node.js >= 22 y npx.\n');
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
