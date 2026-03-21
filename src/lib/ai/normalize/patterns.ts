export const TITLE_STOPWORDS = new Set([
  'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'CON', 'PARA', 'POR',
  'UN', 'UNA', 'NO', 'INCLUYE', 'INCLUIR', 'SIN', 'EN', 'AL',
]);

export const TITLE_NOISE_WORDS = new Set([
  'PROCESADOR', 'MICRO', 'CPU', 'PLACA', 'VIDEO', 'VGA',
  'MOTHERBOARD', 'MOTHER', 'MEMORIA', 'RAM',
  'GAMER', 'OFERTA', 'OEM', 'BOX',
  'NVIDIA', 'GEFORCE', 'RADEON', 'GRAPHICS', 'CARD',
  'EDITION', 'OC', 'PCI', 'PCIE', 'PCI-E', 'SERIES',
]);

export const BRAND_PATTERN = /\b(ASUS|GIGABYTE|MSI|ZOTAC|PALIT|INNO3D|ASROCK|PNY|XFX|SAPPHIRE|AMD|INTEL|KINGSTON|CORSAIR|G\.?SKILL|TEAMGROUP|CRUCIAL|PATRIOT|ADATA|XPG|SAMSUNG|SEAGATE|WD)\b/;
export const GPU_CHIP_PATTERN = /\b(RTX\s*\d{3,4}(?:\s*(?:TI|SUPER))?|GTX\s*\d{3,4}(?:\s*(?:TI|SUPER))?|RX\s*\d{3,4}(?:\s*XT)?|ARC\s*[A-Z]?\s*\d{3})\b/;
export const CPU_CHIP_PATTERN = /\b(RYZEN\s*[3579]\s*\d{3,5}[A-Z0-9]{0,3}|CORE\s*I[3579]\s*\d{4,5}[A-Z]{0,2}|PENTIUM\s*[A-Z0-9]+|CELERON\s*[A-Z0-9]+)\b/;
export const MEMORY_SIZE_PATTERN = /\b(\d{1,2}\s*G(?:B)?)\b/;
export const SOCKET_PATTERN = /\b(AM[45]|LGA\s*\d{3,4})\b/;
export const CHIPSET_PATTERN = /\b([ABHXZ]\d{3}[A-Z]{0,2})\b/;
export const STORAGE_SIZE_PATTERN = /\b(\d+(?:\.\d+)?\s*(?:TB|GB))\b/;
export const KNOWN_VARIANTS = [
  'DUAL', 'TUF', 'PRIME', 'EAGLE', 'WINDFORCE', 'VENTUS', 'SHADOW',
  'INFINITY', 'GAMING', 'AERO', 'STRIX', 'SUPRIM', 'TRINITY',
  'CHALLENGER', 'PULSE', 'NITRO', 'STEEL', 'TOMAHAWK',
];
