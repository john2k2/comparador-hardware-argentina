import type { HardwareCategory } from '../types';

const COMPRAGAMER_PRODUCTS_URL = 'https://static.compragamer.com/productos';
const COMPRAGAMER_SUBCATEGORIES_URL = 'https://static.compragamer.com/categorias_sub';
const COMPRAGAMER_BRANDS_URL = 'https://static.compragamer.com/marcas';
const STATIC_CACHE_TTL_MS = 5 * 60 * 1000;

const SCRAPE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9',
  Origin: 'https://compragamer.com',
  Referer: 'https://compragamer.com/',
};

export interface CompraGamerImage {
  nombre?: string;
}

export interface CompraGamerProductResponse {
  id_producto?: number | string;
  nombre?: string;
  precioEspecial?: number | string;
  precioLista?: number | string;
  stock?: number | string;
  vendible?: number | boolean;
  id_subcategoria?: number | string;
  id_marca?: number | string;
  codigo_principal?: unknown;
  garantia?: number | string;
  imagenes?: CompraGamerImage[];
}

interface CompraGamerSubcategoryResponse {
  id?: number | string;
  nombre?: string;
}

interface CompraGamerBrandResponse {
  id?: number | string;
  nombre?: string;
}

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

let catalogCache: CacheEntry<CompraGamerProductResponse[]> | null = null;
let subcategoryMapCache: CacheEntry<Map<number, HardwareCategory>> | null = null;
let brandMapCache: CacheEntry<Map<number, string>> | null = null;

let inFlightCatalogRequest: Promise<CompraGamerProductResponse[]> | null = null;
let inFlightSubcategoryRequest: Promise<Map<number, HardwareCategory>> | null = null;
let inFlightBrandRequest: Promise<Map<number, string>> | null = null;

function nowMs(): number {
  return Date.now();
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCategoryFromSubcategoryName(name: string): HardwareCategory | null {
  const normalized = normalizeText(name);

  if (normalized.includes('procesador')) return 'procesadores';
  if (normalized.includes('placas de video') || normalized.includes('placa de video')) return 'tarjetas-graficas';
  if (normalized.includes('mother')) return 'motherboards';
  if (normalized.includes('memorias notebook') || normalized.includes('memorias')) return 'memoria-ram';
  if (normalized.includes('discos') || normalized.includes('ssd') || normalized.includes('optane')) return 'almacenamiento';
  if (normalized.includes('fuentes')) return 'fuentes-alimentacion';
  if (normalized.includes('gabinetes')) return 'gabinetes';
  if (normalized.includes('coolers') || normalized.includes('refrigeracion')) return 'refrigeracion';
  if (
    normalized.includes('periferico') ||
    normalized.includes('mouses') ||
    normalized.includes('mouse') ||
    normalized.includes('teclados') ||
    normalized.includes('teclado') ||
    normalized.includes('monitores') ||
    normalized.includes('monitor') ||
    normalized.includes('auriculares') ||
    normalized.includes('audio') ||
    normalized.includes('webcam') ||
    normalized.includes('microfono') ||
    normalized.includes('joystick') ||
    normalized.includes('gamepad')
  ) {
    return 'perifericos';
  }

  return null;
}

async function fetchJsonArray<T>(url: string, signal?: AbortSignal): Promise<T[]> {
  const res = await fetch(url, {
    headers: SCRAPE_HEADERS,
    signal,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${url}`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data as T[];
}

export async function getCompraGamerCatalog(signal?: AbortSignal): Promise<CompraGamerProductResponse[]> {
  if (catalogCache && catalogCache.expiresAt > nowMs()) {
    return catalogCache.value;
  }

  if (inFlightCatalogRequest) return inFlightCatalogRequest;

  inFlightCatalogRequest = fetchJsonArray<CompraGamerProductResponse>(COMPRAGAMER_PRODUCTS_URL, signal)
    .then((items) => {
      catalogCache = {
        value: items,
        expiresAt: nowMs() + STATIC_CACHE_TTL_MS,
      };
      return items;
    })
    .finally(() => {
      inFlightCatalogRequest = null;
    });

  return inFlightCatalogRequest;
}

export async function getCompraGamerSubcategoryMap(signal?: AbortSignal): Promise<Map<number, HardwareCategory>> {
  if (subcategoryMapCache && subcategoryMapCache.expiresAt > nowMs()) {
    return subcategoryMapCache.value;
  }

  if (inFlightSubcategoryRequest) return inFlightSubcategoryRequest;

  inFlightSubcategoryRequest = fetchJsonArray<CompraGamerSubcategoryResponse>(COMPRAGAMER_SUBCATEGORIES_URL, signal)
    .then((items) => {
      const map = new Map<number, HardwareCategory>();
      for (const item of items) {
        const subcategoryId = toPositiveInteger(item.id);
        const subcategoryName = String(item.nombre ?? '').trim();
        if (subcategoryId === null || !subcategoryName) continue;

        const inferredCategory = inferCategoryFromSubcategoryName(subcategoryName);
        if (inferredCategory) {
          map.set(subcategoryId, inferredCategory);
        }
      }

      subcategoryMapCache = {
        value: map,
        expiresAt: nowMs() + STATIC_CACHE_TTL_MS,
      };
      return map;
    })
    .finally(() => {
      inFlightSubcategoryRequest = null;
    });

  return inFlightSubcategoryRequest;
}

export async function getCompraGamerBrandMap(signal?: AbortSignal): Promise<Map<number, string>> {
  if (brandMapCache && brandMapCache.expiresAt > nowMs()) {
    return brandMapCache.value;
  }

  if (inFlightBrandRequest) return inFlightBrandRequest;

  inFlightBrandRequest = fetchJsonArray<CompraGamerBrandResponse>(COMPRAGAMER_BRANDS_URL, signal)
    .then((items) => {
      const map = new Map<number, string>();
      for (const item of items) {
        const brandId = toPositiveInteger(item.id);
        const brandName = String(item.nombre ?? '').trim();
        if (brandId === null || !brandName) continue;
        map.set(brandId, brandName);
      }

      brandMapCache = {
        value: map,
        expiresAt: nowMs() + STATIC_CACHE_TTL_MS,
      };
      return map;
    })
    .finally(() => {
      inFlightBrandRequest = null;
    });

  return inFlightBrandRequest;
}
