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

const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

let redisClient: Redis | null = null;
let warnedMissing = false;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  
  if (!redisUrl || !redisToken) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn('[Redis] UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN no configurados. Cache distribuido desactivado.');
    }
    return null;
  }
  
  redisClient = new Redis({
    url: redisUrl,
    token: redisToken,
  });
  
  return redisClient;
}

export async function getRedisCache<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  
  try {
    const value = await redis.get<T>(key);
    return value;
  } catch (error) {
    console.warn('[Redis] Get error:', error);
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
  } catch (error) {
    console.warn('[Redis] Set error:', error);
  }
}

export async function deleteRedisCache(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  
  try {
    await redis.del(key);
  } catch (error) {
    console.warn('[Redis] Del error:', error);
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
  } catch (error) {
    console.warn('[Redis] Pattern delete error:', error);
  }
}

export function isRedisEnabled(): boolean {
  return !!getRedisClient();
}
