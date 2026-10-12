// Preparación local: este comando sólo imprime un plan; nunca instala ni carga launchd.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRANSPORT_HEADER = 'x-comparador-origin-token';
const hex = /^[a-f0-9]{64}$/;
const fail = code => { throw new Error(code); };

export function loadRuntimeConfig(file) {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (config.version !== 1 || !Number.isSafeInteger(config.port) || config.port < 1024 || config.port > 65535)
    fail('MAC_SERVICE_CONFIG');
  for (const key of ['releaseDir', 'dataDir', 'transportSecretFile'])
    if (typeof config[key] !== 'string' || !isAbsolute(config[key])) fail('MAC_SERVICE_CONFIG_PATH');
  if (config.envFile !== undefined && (typeof config.envFile !== 'string' || !isAbsolute(config.envFile)))
    fail('MAC_SERVICE_ENV_PATH');
  if (!['.next', '.next-qa'].includes(config.buildDir)) fail('MAC_SERVICE_BUILD_DIR');
  if (config.pollMilliseconds !== undefined && (!Number.isSafeInteger(config.pollMilliseconds) || config.pollMilliseconds < 5000))
    fail('MAC_SERVICE_POLL');
  return { ...config, pollMilliseconds: config.pollMilliseconds ?? 15000 };
}

/** Leído sólo por el proceso servidor. El plan y los logs nunca incluyen su contenido. */
export function readTransportSecret(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
    || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) fail('MAC_SERVICE_SECRET_PERMISSIONS');
  const secret = readFileSync(file, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) fail('MAC_SERVICE_SECRET_FORMAT');
  return secret;
}

export function transportAuthorized(headers, secret) {
  const value = headers[TRANSPORT_HEADER];
  if (typeof value !== 'string') return false;
  const supplied = Buffer.from(value), expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function validatePointer(value) {
  if (!value || value.version !== 1 || typeof value.generation !== 'string'
    || !/^[a-zA-Z0-9_-]{1,120}$/.test(value.generation) || !hex.test(value.sha256) || !hex.test(value.fingerprint)
    || typeof value.database !== 'string' || !/^snapshots\/[a-zA-Z0-9_-]{1,120}\.sqlite$/.test(value.database))
    fail('MAC_SERVICE_POINTER');
  return { version: 1, generation: value.generation, database: value.database,
    sha256: value.sha256, fingerprint: value.fingerprint };
}

/** Nunca sigue enlaces ni abre una copia aún escribible o dependiente de un WAL. */
export function immutableDatabasePath(dataDir, pointer) {
  const root = resolve(dataDir), path = join(root, pointer.database);
  if (realpathSync(root) !== root || realpathSync(path) !== path
    || relative(root, path).startsWith('..' + sep)) fail('MAC_SERVICE_DATABASE_PATH');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o222) !== 0) fail('MAC_SERVICE_DATABASE_MUTABLE');
  if (existsSync(path + '-wal') || existsSync(path + '-shm') || existsSync(path + '-journal')) fail('MAC_SERVICE_DATABASE_SIDECAR');
  return path;
}

export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

export async function verifyImmutableCandidate(dataDir, value) {
  const pointer = validatePointer(value), path = immutableDatabasePath(dataDir, pointer), before = statSync(path);
  if (await hashFile(path) !== pointer.sha256) fail('MAC_SERVICE_DATABASE_HASH');
  immutableDatabasePath(dataDir, pointer);
  const after = statSync(path);
  if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs)
    fail('MAC_SERVICE_DATABASE_CHANGED');
  return { pointer, path };
}

/** Permite drenar respuestas antes de sustituir DB + fingerprint. */
export class RequestBarrier {
  active = 0;
  paused = false;
  waiters = [];
  enter() {
    if (this.paused) return null;
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      if (!this.active) this.waiters.splice(0).forEach(resolve => resolve());
    };
  }
  async drain() {
    this.paused = true;
    if (this.active) await new Promise(resolve => this.waiters.push(resolve));
  }
  resume() { this.paused = false; }
}

function xml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
export function createServicePlan({ stableRoot, nodeBinary, label = 'ar.com.comparador.mac-catalog' }) {
  if (!isAbsolute(stableRoot) || !isAbsolute(nodeBinary) || !/^[a-z0-9.-]+$/.test(label)) fail('MAC_SERVICE_PLAN_PATH');
  const root = resolve(stableRoot);
  if (/(^|\/)(outputs|\.codex|worktrees)(\/|$)/.test(root)) fail('MAC_SERVICE_UNSTABLE_ROOT');
  const release = join(root, 'release'), config = join(root, 'runtime.json'), logs = join(root, 'logs');
  const args = [nodeBinary, join(release, 'mac-catalog-server.mjs'), '--config', config];
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${xml(label)}</string>\n<key>ProgramArguments</key><array>${args.map(arg => '<string>' + xml(arg) + '</string>').join('')}</array>\n<key>WorkingDirectory</key><string>${xml(release)}</string>\n<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><true/>\n<key>ThrottleInterval</key><integer>15</integer>\n<key>ExitTimeOut</key><integer>40</integer>\n<key>StandardOutPath</key><string>${xml(join(logs, 'server.log'))}</string>\n<key>StandardErrorPath</key><string>${xml(join(logs, 'server-error.log'))}</string>\n</dict></plist>\n`;
  return { status: 'plan-only', installsService: false, label, stableRoot: root,
    runtimeConfig: { version: 1, releaseDir: release, dataDir: join(root, 'data'),
      transportSecretFile: join(root, 'private', 'transport-token'), envFile: join(root, 'private', 'runtime.env'),
      buildDir: '.next', port: 8825, pollMilliseconds: 15000 }, plist,
    requiredReleaseFiles: ['mac-catalog-server.mjs', 'package.json', 'next.config.ts', 'tsconfig.json', 'src/', '.next/', 'public/', 'node_modules/'],
    gates: ['Build completo Next (custom server no admite standalone).',
      'Node con node:sqlite; directorios privados, secreto 600, candidato SQLite 400 y current.json atómico.',
      'Archivo runtime.env explícito: conservar auth de usuario; variables NEXT_PUBLIC ya deben estar en el build.',
      'Probar reinicio, caída del túnel, promoción, rollback, y despertar con alimentación antes de activar.',
      'KeepAlive sólo reinicia procesos. LaunchAgent requiere login y no impide suspensión ni pérdida de Internet.',
      'Cloudflared requiere su propio servicio revisado; este plan no lo instala.'] };
}

if (process.argv[1] && basename(process.argv[1]) === 'mac-catalog-service.mjs'
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== 'plan') throw Error('Uso: node scripts/ops/mac-catalog-service.mjs plan /ruta/estable /ruta/node');
  process.stdout.write(JSON.stringify(createServicePlan({ stableRoot: args[1], nodeBinary: args[2] }), null, 2) + '\n');
}
