import type { HardwareCategory } from '@/lib/types';
import { isCompleteComputerTitle, parseGpuChipSignature } from '@/lib/product-identity';

export const HARDWARE_CATEGORIES: HardwareCategory[] = [
  'procesadores',
  'tarjetas-graficas',
  'motherboards',
  'memoria-ram',
  'almacenamiento',
  'fuentes-alimentacion',
  'gabinetes',
  'refrigeracion',
  'computadoras',
  'perifericos',
];

export function isHardwareCategory(value: string | null | undefined): value is HardwareCategory {
  return value !== null && value !== undefined && HARDWARE_CATEGORIES.includes(value as HardwareCategory);
}

export function inferHardwareCategoryFromName(name: string): HardwareCategory | undefined {
  if (isCompleteComputerTitle(name)) return 'computadoras';
  if (isCoolingProductTitle(name)) return 'refrigeracion';
  const primaryCategory = inferPrimaryComponentCategory(name);
  if (primaryCategory) return primaryCategory;
  const lowerName = name.toLowerCase();
  if (lowerName.includes('ryzen') || lowerName.includes('core i') || lowerName.includes('procesador')) {
    return 'procesadores';
  }
  if (
    parseGpuChipSignature(name)
    || lowerName.includes('radeon')
    || lowerName.includes('geforce')
    || lowerName.includes('placa de video')
    || lowerName.includes('tarjeta grafica')
  ) {
    return 'tarjetas-graficas';
  }
  if (lowerName.includes('mother') || lowerName.includes('placa madre')) {
    return 'motherboards';
  }
  if (lowerName.includes('ddr4') || lowerName.includes('ddr5') || lowerName.includes('ram')) {
    return 'memoria-ram';
  }
  if (lowerName.includes('ssd') || lowerName.includes('nvme') || lowerName.includes('hdd')) {
    return 'almacenamiento';
  }
  if (lowerName.includes('fuente') || lowerName.includes('psu')) {
    return 'fuentes-alimentacion';
  }
  if (lowerName.includes('gabinete') || lowerName.includes('case')) {
    return 'gabinetes';
  }
  if ((lowerName.includes('cooler') && !/^cooler ?master(?:$| )/.test(lowerName)) || lowerName.includes('refrigeracion') || lowerName.includes('ventilador')) {
    return 'refrigeracion';
  }
  if (
    lowerName.includes('mouse')
    || lowerName.includes('teclado')
    || lowerName.includes('keyboard')
    || lowerName.includes('monitor')
    || lowerName.includes('auricular')
    || lowerName.includes('headset')
    || lowerName.includes('headphone')
    || lowerName.includes('parlante')
    || lowerName.includes('speaker')
    || lowerName.includes('microfono')
    || lowerName.includes('microphone')
    || lowerName.includes('webcam')
    || lowerName.includes('camara web')
    || lowerName.includes('joystick')
    || lowerName.includes('gamepad')
    || lowerName.includes('mousepad')
    || lowerName.includes('alfombrilla')
    || lowerName.includes('logitech')
    || lowerName.includes('razer')
    || lowerName.includes('redragon')
    || lowerName.includes('steelseries')
    || lowerName.includes('keychron')
  ) {
    return 'perifericos';
  }
  return undefined;
}

export function inferDetailHardwareCategory(value: string): HardwareCategory {
  if (isCompleteComputerTitle(value.replace(/-/g, ' '))) return 'computadoras';
  if (isCoolingProductTitle(value.replace(/-/g, ' '))) return 'refrigeracion';
  const primaryCategory = inferPrimaryComponentCategory(value.replace(/-/g, ' '));
  if (primaryCategory) return primaryCategory;
  const normalized = value.toLowerCase();

  if (
    normalized.includes('rtx')
    || normalized.includes('radeon')
    || normalized.includes('geforce')
    || normalized.includes('rx ')
    || normalized.includes('placa de video')
    || normalized.includes('gpu')
  ) {
    return 'tarjetas-graficas';
  }

  if (
    normalized.includes('ryzen')
    || normalized.includes('core i')
    || normalized.includes('core-i')
    || normalized.includes('ultra ')
    || normalized.includes('procesador')
    || normalized.includes('cpu')
  ) {
    return 'procesadores';
  }

  if (normalized.includes('mother') || normalized.includes('placa madre')) {
    return 'motherboards';
  }

  if (normalized.includes('ddr4') || normalized.includes('ddr5') || normalized.includes('ram')) {
    return 'memoria-ram';
  }

  if (normalized.includes('ssd') || normalized.includes('nvme') || normalized.includes('hdd') || normalized.includes('disco')) {
    return 'almacenamiento';
  }

  if (normalized.includes('fuente') || normalized.includes('psu')) {
    return 'fuentes-alimentacion';
  }

  if (normalized.includes('gabinete') || normalized.includes('case')) {
    return 'gabinetes';
  }

  if (normalized.includes('cooler') || normalized.includes('refrigeracion') || normalized.includes('ventilador')) {
    return 'refrigeracion';
  }

  return 'perifericos';
}

// La compatibilidad con Ryzen/RTX no convierte un cooler en CPU/GPU.
// Cooler Master también fabrica fuentes y gabinetes: la marca sola no basta.
function isCoolingProductTitle(value: string): boolean {
  const title = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return /^(?:cpu\s+cooler(?:\s*master)?|water\s*cooler|refrigeracion|ventilador|disipador|pasta\s+termica|thermal\s+pad)\b/.test(title)
    || /^cooler\s+(?!master\b)/.test(title)
    || /^cooler\s+master\s+(?:masterliquid|ml\d+\w*|hyper|liquid)\b/.test(title);
}

function inferPrimaryComponentCategory(value: string): HardwareCategory | undefined {
  const title = value.trim().toLowerCase();
  if (/^(?:mini\s*pc|minipc|barebone)\b/.test(title)) return 'computadoras';
  if (/^(?:pen\s*drive|pendrive|flash drive|memoria usb|memoria flash|tarjeta de memoria|sd\s+card)\b/.test(title)) return 'almacenamiento';
  if (/^(?:switch|hub|soporte|bracket|caddy|bandeja|adaptador)\b/.test(title)) return 'perifericos';
  if (/^(?:dell|hp|lenovo)\s+(?:soporte|bracket|caddy|bandeja|adaptador)\b/.test(title)) return 'perifericos';
  if (/^micro\s+sd\b/.test(title)) return 'almacenamiento';
  if (/^(?:micro(?!\s+sd\b)|procesador(?:es)?|cpu)\b/.test(title)) return 'procesadores';
  if (/^(?:placa de video|tarjeta grafica|gpu)\b/.test(title)) return 'tarjetas-graficas';
  if (/^(?:mouse|mousepad|teclado|auriculares?|headset|joystick|gamepad|webcam|monitor|parlante|escritorio|tabla para standing desk|silla)\b/.test(title)) return 'perifericos';
  if (/^(?:router|extensor de red|placa de red|placa wifi|adaptador(?: de red| wifi| bluetooth)|cable|ups|impresora|toner|powered usb hub|usb hub|elgato stream deck)\b/.test(title)) return 'perifericos';
  if (/^(?:motherboard|mother|placa madre)\b/.test(title)) return 'motherboards';
  if (/^(?:gabinete|case)\b/.test(title)) return 'gabinetes';
  if (/^(?:fuente|psu)\b/.test(title)) return 'fuentes-alimentacion';
  if (/^(?:memoria|ram)\b/.test(title)) return 'memoria-ram';
  if (/^(?:ssd|nvme|hdd|disco)\b/.test(title)) return 'almacenamiento';
  return undefined;
}

export function resolveHardwareCategoryForProduct(
  productName: string,
  explicitCategory?: HardwareCategory,
): HardwareCategory {
  if (isCompleteComputerTitle(productName)) return 'computadoras';
  return inferHardwareCategoryFromName(productName) ?? explicitCategory ?? inferDetailHardwareCategory(productName);
}

export function hardwareCategoryToSearchTerm(category: HardwareCategory): string {
  if (category === 'tarjetas-graficas') return 'placa de video';
  if (category === 'motherboards') return 'motherboard';
  if (category === 'memoria-ram') return 'memoria ram';
  if (category === 'almacenamiento') return 'ssd';
  if (category === 'fuentes-alimentacion') return 'fuente';
  if (category === 'gabinetes') return 'gabinete';
  if (category === 'refrigeracion') return 'cooler';
  if (category === 'perifericos') return 'perifericos';
  if (category === 'computadoras') return 'pc armada';
  return 'procesador';
}
