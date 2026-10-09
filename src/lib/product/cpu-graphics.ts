import type { Product } from '@/lib/types';

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Sólo usamos declaraciones del producto o una familia con sufijo explícito G.
// La ausencia de datos no confirma una salida de video.
export function hasIntegratedGraphics(cpu: Product | undefined): boolean {
  if (!cpu) return false;
  const keys = new Set(['graficosintegrados', 'gpuintegrada', 'graficos']);
  const declared = Object.entries(cpu.specs ?? {})
    .filter(([key]) => keys.has(normalize(key).replace(/[^a-z0-9]/g, '')))
    .map(([, value]) => normalize(value)).join(' ');
  const name = normalize(cpu.name);
  if (/\b(no|sin|ninguno)\b/.test(declared)
    || /\b(?:sin|no|without)\s+(?:video|graficos|graphics|gpu)\b|\bno\s+(?:incluye|tiene|cuenta\s+con)\s+(?:video|graficos|graphics|gpu)\b/.test(name)
    || /\b\d{3,5}[\s-]*(?:k[\s-]*)?f\b/.test(name)) return false;
  return /\b(si|radeon|uhd|iris|intel graphics)\b/.test(declared)
    || /\b(?:radeon\s+graphics|con\s+graficos\s+integrados|intel\s+(?:uhd|iris)\s+graphics)\b/.test(name)
    || /\bryzen\b.*\b\d{4}g(?:t|e)?\b/.test(name);
}
