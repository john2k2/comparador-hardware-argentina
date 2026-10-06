import type { Product, HardwareCategory } from '@/lib/types';
import { productDescriptionText } from './technical-sheet';
import { inferHardwareCategoryFromName } from '@/lib/catalog/hardware-categories';
import { parseListingFlags } from './listing-flags';

type ProductContent = { intro: string; tips: string[]; faqs: Array<{ question: string; answer: string }>; relatedTerms: string[] };

const CATEGORY_CHECKS: Record<HardwareCategory, string[]> = {
  procesadores: ['Confirmá socket y soporte del modelo exacto en la lista de CPUs de la motherboard.', 'Revisá versión de BIOS, presentación BOX/OEM y accesorios incluidos.'],
  'tarjetas-graficas': ['Compará chip, memoria, ensamblador y edición exactos: compartir GPU no implica compartir placa.', 'Revisá dimensiones, conectores de alimentación, potencia recomendada y salidas de video en la ficha del fabricante.'],
  motherboards: ['Confirmá socket, chipset, formato, revisión y variante con o sin Wi-Fi.', 'Consultá las listas de CPUs compatibles y QVL de memoria para la revisión y BIOS exactas.'],
  'memoria-ram': ['Compará generación DDR, capacidad total, cantidad de módulos, velocidad y latencia publicadas.', 'Verificá el código exacto del kit y las condiciones de la QVL de tu motherboard.'],
  almacenamiento: ['Compará capacidad, interfaz, formato y código del fabricante.', 'Confirmá velocidades y resistencia publicadas para el modelo exacto; no se deducen de la marca.'],
  'fuentes-alimentacion': ['Confirmá modelo, potencia, formato y conectores necesarios para tu equipo.', 'Una certificación de eficiencia no reemplaza las especificaciones de protecciones y garantía.'],
  gabinetes: ['Comprobá formato de motherboard y espacio máximo para GPU, cooler y radiadores.', 'Confirmá ventiladores, filtros y accesorios incluidos en esta publicación.'],
  refrigeracion: ['Verificá soportes incluidos y compatibilidad con el socket.', 'Compará dimensiones del cooler o radiador con el espacio disponible en tu gabinete.'],
  computadoras: ['Compará la configuración completa: CPU, GPU, RAM, almacenamiento, motherboard y fuente.', 'Confirmá armado, sistema operativo, accesorios, posibilidades de ampliación y garantía.'],
  perifericos: ['Compará modelo, edición, conectividad, color y accesorios de cada publicación.', 'Confirmá compatibilidad con tu sistema y condiciones de garantía en la tienda.'],
};

export function getProductContent(product: Product): ProductContent {
  const category = inferHardwareCategoryFromName(product.name) ?? product.category;
  const name = productDescriptionText(product.name);
  const tips = [...CATEGORY_CHECKS[category] ?? []];
  const faqs = [
    { question: '¿El precio incluye envío y otros gastos?', answer: 'El precio publicado corresponde a la oferta de la tienda. Confirmá envío, armado, medios de pago y cualquier costo adicional antes de pagar.' },
    { question: '¿Quién realiza la venta y da la garantía?', answer: 'La compra se realiza en la tienda de destino. Revisá sus condiciones de garantía, cambios y devolución; el comparador no vende este producto.' },
  ];
  if (category === 'procesadores') {
    const flags = parseListingFlags(product.name);
    const coolerAnswer = flags.coolerIncluded === true ? 'El título de esta publicación indica que incluye cooler. Confirmá los accesorios de esta variante con la tienda.'
      : flags.coolerIncluded === false ? 'El título de esta publicación indica que no incluye cooler. Necesitás una solución compatible; revisá socket y espacio del gabinete.'
      : 'La inclusión del cooler no está confirmada en esta ficha. Consultá la presentación exacta con la tienda.';
    faqs.unshift({ question: `¿${name} incluye cooler?`, answer: coolerAnswer });
    if (flags.integratedGraphics === false) tips.push('El título indica S/VIDEO: confirmá que tu equipo tenga una placa de video dedicada.');
  }
  if (/\b(?:pen\s*drive|pendrive|flash drive|memoria usb)\b/i.test(name)) {
    tips.splice(0, tips.length, 'Confirmá capacidad, tipo de conector USB y velocidades publicadas.', 'Revisá compatibilidad y garantía del modelo exacto. No confundas la velocidad de la interfaz con una velocidad medida de transferencia.');
  }
  return { intro: `Para comparar ${name}, revisá los datos publicados de la variante exacta. Esta orientación no es una prueba de rendimiento ni una certificación de compatibilidad.`,
    tips, faqs, relatedTerms: [] };
}
