/**
 * Redis Cache - Capa de cache distribuido con Upstash Redis
 * 
 * Ventajas sobre cache en memoria:
 * - Sobrevive deploys y reinicios
 * - Compartido entre múltiples instancias de Vercel
 * - Más rápido que consultas a Supabase
 * - Límite gratuito: 10,000 requests/día
 * 
 * Setup:
 * 1. Crear cuenta en https://upstash.com
 * 2. Crear un nuevo Redis database
 * 3. Copiar REST URL y TOKEN
 * 4. Agregar a .env.local:
 *    UPSTASH_REDIS_REST_URL=https://.../redis
 *    UPSTASH_REDIS_REST_TOKEN=...
 */

import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

let redisClient: Redis | null = null;
let triedInit = false;

function looksLikePlaceholder(value: string): boolean {
  return /^\[?sensitive\]?$/i.test(value)
    || /^(your[-_]|change[-_]?me|placeholder|example|x{3,})/i.test(value);
}

function hasValidRedisConfiguration(): boolean {
  // Redis es opcional. Si no se configuró ninguna variable, el fallback local
  // y Supabase funcionan sin generar ruido en cada arranque del Worker.
  if (!redisUrl && !redisToken) return false;

  if (!redisUrl || !redisToken || looksLikePlaceholder(redisUrl) || looksLikePlaceholder(redisToken)) {
    logger.warn('Configuracion incompleta de Redis; cache distribuido desactivado');
    return false;
  }

  try {
    if (new URL(redisUrl).protocol === 'https:') return true;
  } catch {
    // La advertencia generica evita imprimir la URL o el token configurados.
  }

  logger.warn('URL de Redis invalida; cache distribuido desactivado');
  return false;
}

function getRedisClient(signal?: AbortSignal): Redis | null {
  // Una señal por operación evita que un timeout contamine el cliente compartido.
  if (signal) {
    if (!hasValidRedisConfiguration() || signal.aborted) return null;
    try { return new Redis({ url: redisUrl!, token: redisToken!, signal, retry: false, enableAutoPipelining: false }); }
    catch { return null; }
  }
  if (redisClient) return redisClient;
  if (triedInit) return null;

  triedInit = true;

  if (!hasValidRedisConfiguration()) {
    return null;
  }

  try {
    redisClient = new Redis({
      url: redisUrl!,
      token: redisToken!,
    });
  } catch {
    logger.warn('No se pudo inicializar Redis; cache distribuido desactivado');
    return null;
  }

  return redisClient;
}

export async function getRedisCache<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  
  try {
    const value = await redis.get<T>(key);
    return value;
  } catch {
    logger.warn('[Redis] Get no disponible');
    return null;
  }
}

export async function setRedisCache(
  key: string, 
  value: unknown, 
  ttlSeconds: number
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  
  try {
    await redis.setex(key, ttlSeconds, value);
  } catch {
    logger.warn('[Redis] Set no disponible');
  }
}

export async function deleteRedisCache(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  
  try {
    await redis.del(key);
  } catch {
    logger.warn('[Redis] Del no disponible');
  }
}

export async function deleteRedisPattern(pattern: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  
  try {
    // Upstash Redis no soporta KEYS/SCAN en REST API
    // Por eso usamos un patrón de nombres estructurado
    // Ej: "comparador:home:featured" → scope:type:key
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    logger.warn('[Redis] Pattern delete no disponible');
  }
}

export function isRedisEnabled(): boolean {
  return !!getRedisClient();
}

/**
 * Una sola operación distribuida: crear o reparar la expiración antes del
 * incremento. Un fallo de red entre INCR y EXPIRE ya no puede dejar una clave
 * nueva permanente. Una clave heredada sin TTL conserva su cuenta al repararse.
 */
const INCR_WITH_EXPIRY_SCRIPT = `
local ttl = redis.call('TTL', KEYS[1])
if ttl == -2 then
  redis.call('SET', KEYS[1], 0, 'EX', ARGV[1], 'NX')
elseif ttl == -1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return redis.call('INCR', KEYS[1])
`;

export async function incrWithExpiry(key: string, ttlSeconds: number, signal?: AbortSignal): Promise<number | null> {
  const redis = getRedisClient(signal);
  if (!redis || !Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) return null;

  try {
    const count = await redis.eval(INCR_WITH_EXPIRY_SCRIPT, [key], [ttlSeconds]);
    return typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : null;
  } catch {
    // El proveedor puede incluir credenciales en sus errores. No imprimirlos.
    logger.warn('[Redis] Contador distribuido no disponible');
    return null;
  }
}

export async function getRedisTtlSeconds(key: string, signal?: AbortSignal): Promise<number> {
  const redis = getRedisClient(signal);
  if (!redis) return 0;

  try {
    const ttl = await redis.ttl(key);
    return ttl > 0 ? ttl : 0;
  } catch {
    logger.warn('[Redis] TTL no disponible');
    return 0;
  }
}
