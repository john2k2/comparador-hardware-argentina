import { normalizeDisplayText } from '@/lib/text-utils';
import type { Product } from '@/lib/types';

export type TechnicalFact = { label: string; value: string; source: 'specs' | 'description' | 'title' };

const LABELS: Record<string, string> = {
  marca: 'Marca', brand: 'Marca', modelo: 'Modelo', model: 'Modelo', mpn: 'Código del fabricante (MPN)',
  'part number': 'Código del fabricante (MPN)', socket: 'Socket', chipset: 'Chipset',
  nucleos: 'Núcleos', cores: 'Núcleos', hilos: 'Hilos', threads: 'Hilos',
  frecuencia: 'Frecuencia', frequency: 'Frecuencia', 'frecuencia base': 'Frecuencia base',
  'frecuencia turbo': 'Frecuencia turbo', tdp: 'TDP publicado',
  'capacidad de almacenamiento': 'Capacidad', capacidad: 'Capacidad', capacity: 'Capacidad',
  'tipo de memoria': 'Tipo de memoria', memorytype: 'Tipo de memoria', 'memory type': 'Tipo de memoria',
  'memoria ram': 'Memoria RAM', 'memoria de video': 'Memoria de video', vram: 'Memoria de video',
  velocidad: 'Velocidad publicada', speed: 'Velocidad publicada', latencia: 'Latencia', latency: 'Latencia',
  'velocidad de lectura': 'Velocidad de lectura', 'velocidad de escritura': 'Velocidad de escritura',
  'velocidad de lectura de transferencia': 'Velocidad de lectura de transferencia',
  conectividad: 'Conectividad', connectivity: 'Conectividad', interfaz: 'Interfaz', interface: 'Interfaz',
  'tipo de conector': 'Tipo de conector', connector: 'Conector',
  formato: 'Formato', formfactor: 'Formato', 'form factor': 'Formato',
  potencia: 'Potencia', wattage: 'Potencia', certificacion: 'Certificación publicada',
  dimensiones: 'Dimensiones', dimensions: 'Dimensiones', peso: 'Peso', weight: 'Peso',
  color: 'Color', garantia: 'Garantía publicada', warranty: 'Garantía publicada',
  'sistema operativo': 'Sistema operativo', 'cooler incluido': 'Cooler incluido',
  'graficos integrados': 'Gráficos integrados', 'integrated graphics': 'Gráficos integrados',
  resolucion: 'Resolución', 'tasa de refresco': 'Tasa de refresco', panel: 'Panel',
  'turbo boost': 'Frecuencia turbo publicada', 'cache total': 'Caché publicada', litografia: 'Litografía publicada',
  compatibilidad: 'Compatibilidad publicada', 'version oem': 'Presentación OEM',
  sensor: 'Sensor', 'velocidad de seguimiento': 'Velocidad de seguimiento', autonomia: 'Autonomía publicada',
  rgb: 'Iluminación', interruptores: 'Interruptores', software: 'Software', diseno: 'Diseño',
  'memoria integrada': 'Memoria integrada', 'incluye led de actividad': 'LED de actividad',
  'uso recomendado': 'Uso sugerido por la tienda',
};

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]/g, ' ').toLowerCase().trim();
}

// Texto de la publicación, nunca HTML ejecutable. Conservar separadores evita
// que las tablas/listas de la tienda terminen pegadas en una sola oración.
export function productDescriptionText(value: string | undefined): string {
  return normalizeDisplayText((value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi, (entity) => ({
      '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>',
    })[entity.toLowerCase()] ?? entity)
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, number: string) => {
      const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : parseInt(number, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }));
}

export function buildTechnicalSheet(product: Pick<Product, 'specs' | 'description'> & Partial<Pick<Product, 'name' | 'category'>>): TechnicalFact[] {
  const facts = new Map<string, TechnicalFact>();
  for (const [key, rawValue] of Object.entries(product.specs ?? {})) {
    const label = LABELS[normalizeKey(key)];
    const value = productDescriptionText(String(rawValue));
    // Sólo atributos reconocidos: SKU de tienda y SourceListingId no son MPN.
    if (label && value && value.toLowerCase() !== 'unknown') facts.set(label, { label, value, source: 'specs' });
  }
  const description = productDescriptionText(product.description);
  const normalized = normalizeKey(description);
  const keys = Object.keys(LABELS).sort((a, b) => b.length - a.length);
  // Algunas fuentes publican "velocidad de lectura de 130mb/s" sin dos puntos.
  const pattern = new RegExp(`(${keys.join('|')})\\s*:|velocidad de (lectura|escritura) de\\s+`, 'g');
  const matches = [...normalized.matchAll(pattern)];
  matches.forEach((match, index) => {
    const label = match[1] ? LABELS[match[1]] : LABELS[`velocidad de ${match[2]}`];
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? description.length;
    const value = description.slice(start, end).split(/[|✅⚙️🧊🔥]/u)[0].replace(/^[\s:;]+|[\s;]+$/g, '').trim();
    if (label && value && value.length <= 180 && !facts.has(label)) {
      facts.set(label, { label, value, source: 'description' });
    }
  });
  // Estos atributos están escritos en el título. No se consultan fichas de
  // otros modelos ni se infiere un MPN desde un SKU comercial.
  const title = productDescriptionText(product.name);
  const addTitleFact = (label: string, value: string | undefined) => {
    if (value && !facts.has(label)) facts.set(label, { label, value, source: 'title' });
  };
  if (['memoria-ram', 'almacenamiento', 'tarjetas-graficas'].includes(product.category ?? '')) {
    if (!facts.has('Capacidad') && !facts.has('Memoria de video') && !facts.has('Memoria RAM')) {
      addTitleFact('Capacidad publicada', title.match(/\b\d+(?:[.,]\d+)?\s*(?:GB|TB)\b/i)?.[0]);
    }
  }
  if (product.category === 'memoria-ram') {
    addTitleFact('Tipo de memoria', title.match(/\bDDR[345]\b/i)?.[0]);
    addTitleFact('Composición del kit', title.match(/\b\d+\s*x\s*\d+\s*GB\b/i)?.[0]);
    addTitleFact('Velocidad publicada', title.match(/\b\d{3,5}\s*(?:MHz|MT\/s)\b/i)?.[0]);
    addTitleFact('Latencia', title.match(/\bCL\s*\d{1,3}\b/i)?.[0]);
  }
  if (product.category === 'fuentes-alimentacion') addTitleFact('Potencia', title.match(/\b\d{3,4}\s*W\b/i)?.[0]);
  if (['procesadores', 'motherboards'].includes(product.category ?? '')) {
    if (!facts.has('Socket')) addTitleFact('Socket publicado', title.match(/\b(?:AM[45]|LGA\s*\d{3,4})\b/i)?.[0]);
  }
  if (product.category === 'procesadores') {
    const addDescriptionFact = (label: string, value: string | undefined) => {
      if (value && !facts.has(label)) facts.set(label, { label, value, source: 'description' });
    };
    addDescriptionFact('Núcleos', description.match(/\b(\d+)\s+(?:n[úu]cleos|cores)\b/i)?.[1]);
    addDescriptionFact('Hilos', description.match(/\b(\d+)\s+(?:hilos|threads)\b/i)?.[1]);
  }
  return [...facts.values()];
}
