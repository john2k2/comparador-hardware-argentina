import type { HardwareCategory } from '@/lib/types';

// Criterios para resolver decisiones concretas; no son rankings de modelos.
export const CATEGORY_BUYING_HELP: Record<HardwareCategory, Array<{ situation: string; check: string }>> = {
  procesadores: [
    { situation: 'Actualizar una PC que ya tenés', check: 'Anotá el modelo y revisión de tu motherboard. Buscá el procesador exacto en su lista de soporte y la BIOS requerida antes de comparar precios. Sumá un cooler si la publicación no lo incluye.' },
    { situation: 'Armar desde cero', check: 'Hacé dos presupuestos completos: procesador + motherboard + RAM + refrigeración. Conservar memoria o cambiar de plataforma puede invertir la diferencia que ves entre los dos micros.' },
  ],
  'tarjetas-graficas': [
    { situation: 'Dos publicaciones con el mismo chip', check: 'Contrastá memoria, código del ensamblador y edición. Después revisá largo, grosor y conectores de esa placa concreta; compartir chip no vuelve idénticas las dos publicaciones.' },
    { situation: 'Elegir para un juego o programa', check: 'Buscá pruebas de ambos modelos en tu resolución y con los mismos ajustes. Separá cuadros renderizados de generación de cuadros y verificá las funciones que exige tu aplicación.' },
  ],
  motherboards: [
    { situation: 'Conservar tu procesador y RAM', check: 'Pedí el modelo completo y la revisión de la placa. Contrastá soporte de CPU, BIOS y generación de memoria. El socket o chipset, por sí solos, no cierran la compatibilidad.' },
    { situation: 'Agregar discos, Wi-Fi o más puertos', check: 'Hacé una lista de conexiones necesarias y contrastala con el manual. Comprobá si usar una ranura deshabilita otra conexión y si la variante publicada incluye Wi-Fi.' },
  ],
  'memoria-ram': [
    { situation: 'Comparar 1 × 16 GB con 2 × 8 GB', check: 'Ambas publicaciones suman 16 GB, pero ocupan distinta cantidad de ranuras. Anotá las libres, la generación y el código del kit. No sumes un segundo módulo distinto suponiendo que tendrá las mismas condiciones de estabilidad.' },
    { situation: 'Elegir una velocidad anunciada', check: 'Distinguí la configuración estándar del perfil XMP o EXPO. Contrastá el kit exacto con el soporte de CPU, motherboard y BIOS; el número del título no garantiza esa velocidad en cualquier equipo.' },
  ],
  almacenamiento: [
    { situation: 'La publicación sólo dice M.2', check: 'M.2 describe el formato: confirmá si la unidad usa SATA o PCIe/NVMe y si tu ranura admite esa interfaz y longitud. No compres sólo porque el conector parezca encajar.' },
    { situation: 'Comparar dos unidades de igual capacidad', check: 'Contrastá el código exacto, garantía y resistencia publicada. Separá velocidad anunciada de una medición en tu tarea; revisá también si necesitás disipador o accesorios que no estén incluidos.' },
  ],
  'fuentes-alimentacion': [
    { situation: 'Cambiar la placa de video', check: 'Contrastá la recomendación del ensamblador y los conectores necesarios con la fuente exacta. Revisá formato, espacio para cables y garantía; no elijas únicamente por los watts del título.' },
    { situation: 'Comparar dos fuentes de igual potencia', check: 'Pedí modelo y revisión completos, protecciones documentadas y cables incluidos. Una etiqueta de eficiencia no reemplaza esas comprobaciones. No reutilices cables modulares de otro modelo sin compatibilidad expresa del fabricante.' },
  ],
  gabinetes: [
    { situation: 'Reutilizar piezas de tu PC', check: 'Anotá formato de motherboard, largo y grosor de GPU, altura de cooler y largo de fuente. Contrastá las medidas disponibles con ventiladores, radiador y bandeja de discos instalados, no sólo con el gabinete vacío.' },
    { situation: 'Comparar dos precios parecidos', check: 'Contá ventiladores y accesorios incluidos y sumá los que falten. Confirmá conectores del frontal y cómo se alimenta la iluminación; una foto promocional puede mostrar piezas que no se venden con el gabinete.' },
  ],
  refrigeracion: [
    { situation: 'Instalar un cooler nuevo', check: 'Confirmá el kit de montaje para tu socket y los accesorios incluidos. Medí altura disponible, despeje de RAM y espacio alrededor de la motherboard antes de elegir.' },
    { situation: 'Instalar refrigeración líquida', check: 'Contrastá largo, grosor y posición del conjunto radiador + ventiladores con el gabinete. Revisá las conexiones de bomba y ventiladores, garantía y mantenimiento del modelo exacto.' },
  ],
  computadoras: [
    { situation: 'Comparar dos PCs armadas', check: 'Pedí una lista completa con modelos de CPU, GPU, RAM, SSD, motherboard y fuente. Dos títulos que dicen Ryzen 5 y 16 GB pueden esconder equipos distintos. Separá piezas documentadas de componentes que el vendedor puede sustituir.' },
    { situation: 'Evaluar el precio del equipo completo', check: 'Anotá si incluye armado, licencia, periféricos y envío. Contrastá garantía y posibilidades de ampliación; sin el detalle de los componentes no compares el total con una selección de piezas sueltas como si fueran equivalentes.' },
  ],
  perifericos: [
    { situation: 'Comparar versiones de un mismo modelo', check: 'Contrastá distribución del teclado, idioma, conectividad y accesorios. En monitores, verificá tamaño, resolución y código completo: una misma familia comercial puede incluir paneles distintos.' },
    { situation: 'Comprobar que funcione con tu equipo', check: 'Revisá conexiones y funciones admitidas por tu dispositivo. Confirmá política de cambios y garantía del comercio antes de elegir por una característica que todavía no pudiste probar.' },
  ],
};

export const CATEGORY_BUYING_SOURCES: Partial<Record<HardwareCategory, Array<{ label: string; href: string }>>> = {
  procesadores: [{ label: 'AMD: plataforma AM5 y memoria DDR5', href: 'https://www.amd.com/en/products/processors/chipsets/am5.html' }],
  'memoria-ram': [
    { label: 'Kingston: diferencias de generación y compatibilidad DDR', href: 'https://www.kingston.com/en/blog/pc-performance/ddr-memory-generation-differences' },
    { label: 'Intel: perfiles XMP y overclock de memoria', href: 'https://www.intel.com/content/www/us/en/gaming/extreme-memory-profile-xmp.html' },
  ],
  almacenamiento: [{ label: 'Kingston: unidades M.2 SATA y NVMe', href: 'https://www.kingston.com/en/blog/pc-performance/two-types-m2-vs-ssd' }],
};
