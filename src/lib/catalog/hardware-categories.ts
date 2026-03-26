import type { HardwareCategory } from '@/lib/types';

export const HARDWARE_CATEGORIES: HardwareCategory[] = [
  'procesadores',
  'tarjetas-graficas',
  'motherboards',
  'memoria-ram',
  'almacenamiento',
  'fuentes-alimentacion',
  'gabinetes',
  'refrigeracion',
  'perifericos',
];

export function isHardwareCategory(value: string | null | undefined): value is HardwareCategory {
  return value !== null && value !== undefined && HARDWARE_CATEGORIES.includes(value as HardwareCategory);
}

export function inferHardwareCategoryFromName(name: string): HardwareCategory {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('ryzen') || lowerName.includes('core i') || lowerName.includes('procesador')) {
    return 'procesadores';
  }
  if (lowerName.includes('rtx') || lowerName.includes('radeon') || lowerName.includes('geforce') || lowerName.includes('placa de video')) {
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
  if (lowerName.includes('cooler') || lowerName.includes('refrigeracion') || lowerName.includes('ventilador')) {
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
  return 'perifericos';
}

export function inferDetailHardwareCategory(value: string): HardwareCategory {
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

export function hardwareCategoryToSearchTerm(category: HardwareCategory): string {
  if (category === 'tarjetas-graficas') return 'placa de video';
  if (category === 'motherboards') return 'motherboard';
  if (category === 'memoria-ram') return 'memoria ram';
  if (category === 'almacenamiento') return 'ssd';
  if (category === 'fuentes-alimentacion') return 'fuente';
  if (category === 'gabinetes') return 'gabinete';
  if (category === 'refrigeracion') return 'cooler';
  if (category === 'perifericos') return 'perifericos';
  return 'procesador';
}
