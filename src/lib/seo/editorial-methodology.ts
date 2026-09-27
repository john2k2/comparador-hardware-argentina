export type EditorialMethodology = {
  updatedAt: string;
  sections: { title: string; text: string }[];
  sources: { name: string; url: string }[];
};

const ryzenSource = { name: 'AMD: ficha Ryzen 5 7600X, socket, memoria y refrigeración', url: 'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600x.html' };
const nvidiaSource = { name: 'NVIDIA: especificaciones RTX 4060 y RTX 4060 Ti (columnas diferentes)', url: 'https://www.nvidia.com/en-gb/geforce/graphics-cards/40-series/rtx-4060-4060ti/' };
const radeonSource = { name: 'AMD: ficha RX 7600, memoria y alimentación', url: 'https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7600.html' };

const methodology: Record<string, EditorialMethodology> = {
  'pc-gamer-2-millones': {
    updatedAt: '2026-09-27',
    sections: [
      { title: 'Qué representa este presupuesto', text: 'Dos millones de pesos argentinos es el límite de selección de esta guía, no el precio garantizado de una PC completa. El sistema intenta combinar piezas compatibles por plataforma dentro del presupuesto con candidatos del catálogo. Una fila sin oferta muestra una referencia y queda fuera del total registrado. El conjunto consultado es limitado: puede haber una combinación mejor en una tienda o fuera de nuestra cobertura.' },
      { title: 'Decidir por el uso y la plataforma', text: 'Antes de elegir, anotá resolución del monitor, juegos o aplicaciones y piezas que ya tenés. Para una PC nueva, compará CPU, motherboard y RAM como un conjunto. La propuesta AM5 requiere memoria DDR5; una RAM DDR4 que tengas no se traslada a esa plataforma. El catálogo puede elegir otra combinación si faltan ofertas, por eso importa revisar los modelos finales y no comprar solo por el título de la guía.' },
      { title: 'Costos que no incluye el total', text: 'Sumá envío de cada tienda, armado, licencia del sistema, monitor y periféricos si los necesitás. El cooler también puede ser un gasto adicional: AMD indica que el Ryzen 5 7600X no incluye solución térmica en su caja estándar. Confirmá el contenido de la publicación, anclaje y altura del disipador. Una selección de siete filas no demuestra por sí sola que alcance para montar y usar la PC.' },
      { title: 'Comprobaciones antes de pagar', text: 'Revisá CPU admitida y BIOS en la página oficial de la motherboard, generación de RAM y código de kit en su QVL. Comprobá largo de GPU, altura de cooler, conectores de fuente y ventiladores incluidos. XMP o EXPO son perfiles de memoria: no garantizamos que cualquier kit alcance su frecuencia anunciada en toda combinación. Confirmá precio y stock en la tienda, especialmente si la fecha del registro es anterior.' },
    ],
    sources: [ryzenSource, nvidiaSource, radeonSource],
  },
  'ryzen-5-7600x-vs-ryzen-7-5700x': {
    updatedAt: '2026-09-27',
    sections: [
      { title: 'Actualizar una PC existente', text: 'Si ya tenés AM4 y DDR4, el primer paso es comprobar si tu motherboard admite el 5700X y desde qué BIOS. Presupuestá procesador, refrigeración y cualquier actualización necesaria. Conservar piezas que ya funcionan puede cambiar la decisión aunque otro CPU sea más rápido en una prueba. No consideramos compatible una placa solo porque su socket diga AM4.' },
      { title: 'Armar desde cero', text: 'Compará dos listas completas: CPU, motherboard, RAM y cooler. El 7600X utiliza AM5 y DDR5, como documenta AMD; el precio del micro aislado no representa el costo de entrar a esa plataforma. No damos por incluido un cooler en el 5700X: verificá la publicación exacta y presupuestá uno si hace falta. La posibilidad de actualizar luego depende de la placa, su soporte y la BIOS, no solo del nombre de plataforma.' },
      { title: 'Qué sabemos del rendimiento', text: 'La review de TechPowerUp enlazada corresponde al 7600X. Una diferencia frente al 5600X no se puede transferir al 5700X. No hicimos un ensayo propio de estos dos CPU. Para una aplicación concreta, buscá una prueba que incluya ambos, misma versión del programa y configuración comparable. Para streaming, considerá si codificás en CPU o GPU antes de decidir por cantidad de núcleos.' },
      { title: 'Cómo tomar la decisión local', text: 'Compará ofertas de la misma variante y condiciones de garantía. Usá el costo completo de cada alternativa y el rendimiento del trabajo que realmente harás. Sin precios recientes de ambos lados no hay un ganador de precio actual. El total de una plataforma tampoco se obtiene restando solo los dos valores de CPU.' },
    ],
    sources: [ryzenSource],
  },
  'rtx-4060-vs-rx-7600': {
    updatedAt: '2026-09-27',
    sections: [
      { title: 'Comparar la variante correcta', text: 'Estas dos GPU tienen 8 GB según sus fabricantes. La RTX 4060 Ti es otro modelo y no se debe mezclar con la 4060 aunque comparta una página oficial. En una oferta local comprobá chip, memoria, fabricante, tamaño y garantía. Una versión con otra refrigeración puede cambiar ruido y dimensiones; el nombre del chip solo no describe toda la placa.' },
      { title: 'Consumo y fuente', text: 'NVIDIA publica 115 W de potencia gráfica total para la RTX 4060 y AMD 165 W de potencia típica de placa para la RX 7600. Son especificaciones de GPU, no el consumo de toda la PC ni una medida propia. Ambos fabricantes publican recomendaciones de fuente; verificá además conectores y la ficha del ensamblador concreto. No elegimos una fuente únicamente por la suma de esos watts.' },
      { title: 'Rendimiento que importa para tu monitor', text: 'Separá resolución, calidad, ray tracing y uso de reescalado o generación de cuadros. Las reviews de TechPowerUp son pruebas externas de una configuración y fecha concretas; no garantizan los mismos FPS en tu equipo. Revisá especialmente los juegos o aplicaciones que usás. Tener 8 GB no asegura que todos los juegos admitan texturas máximas con igual fluidez.' },
      { title: 'Precio y condiciones antes de elegir', text: 'No asumimos que una marca siempre sea más barata ni tenga más stock en Argentina. Compará ofertas recientes, contado frente a cuotas, envío y garantía. Si ninguna oferta fue verificada recientemente, el dato anterior es una referencia y no una oportunidad vigente. La mejor alternativa depende de ese costo final y de funciones que realmente uses; no hay una ganadora universal por el título del artículo.' },
    ],
    sources: [nvidiaSource, radeonSource],
  },
};

export function getEditorialMethodology(slug: string): EditorialMethodology | null {
  return methodology[slug] ?? null;
}
