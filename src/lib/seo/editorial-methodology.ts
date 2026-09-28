export type EditorialMethodology = {
  updatedAt: string;
  sections: { title: string; text: string }[];
  sources: { name: string; url: string }[];
};

const ryzenSource = { name: 'AMD: ficha Ryzen 5 7600X, socket, memoria y refrigeración', url: 'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600x.html' };
const ryzen7600Source = { name: 'AMD: Ryzen 5 7600, AM5, DDR5 y Wraith Stealth', url: 'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html' };
const nvidiaSource = { name: 'NVIDIA: especificaciones RTX 4060 y RTX 4060 Ti (columnas diferentes)', url: 'https://www.nvidia.com/en-gb/geforce/graphics-cards/40-series/rtx-4060-4060ti/' };
const radeonSource = { name: 'AMD: ficha RX 7600, memoria y alimentación', url: 'https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7600.html' };
const motherboardSource = { name: 'MSI: PRO B650M-B, formato mATX, DDR5 y PCIe 4.0', url: 'https://www.msi.com/Motherboard/PRO-B650M-B/Specification' };
const caseSource = { name: 'Cooler Master: Elite 302, formatos de motherboard y espacios internos', url: 'https://www.coolermaster.com/en-global/products/elite-302.html' };

const methodology: Record<string, EditorialMethodology> = {
  'pc-gamer-1-millon': {
    updatedAt: '2026-09-28',
    sections: [
      { title: 'Un máximo de un millón, con siete piezas', text: 'El objetivo es una PC de entrada completa dentro de un máximo de un millón de pesos argentinos en componentes. Elegimos Ryzen 5 5500 con Wraith Stealth, Arc A380 Challenger ITX OC de 6 GB, 16 GB DDR4, SSD SATA de 512 GB, ASRock B550M-HDV, Antec CSK650DC AR y gabinete Antec VX310. La selección se contrastó con publicaciones comprables; los importes visibles se calculan desde ofertas con stock informado, identidad coherente y observación de hasta tres horas. Se toma la siguiente oferta válida del mismo modelo cuando la más barata no sirve. Un subtotal con faltantes no representa una PC completa, y este corte no garantiza precios futuros ni ser la combinación más barata de todas las tiendas.' },
      { title: 'Lo que permite entrar en el presupuesto', text: 'Usamos un módulo de 16 GB: no ofrece dual channel y deja una ranura para una ampliación que requiere revisar QVL, código y BIOS. El SSD es SATA de 2,5 pulgadas, no NVMe. La A380 es una GPU de entrada; no la presentamos como equivalente a la RX 6600 de la selección anterior ni prometemos FPS, ajustes Ultra o resultados de una prueba propia. El rendimiento debe contrastarse para cada juego y aplicación, con drivers y Resizable BAR configurados.' },
      { title: 'Compatibilidad y preparación del armado', text: 'Ryzen 5 5500 usa AM4, DDR4 y PCIe 3.0; necesita GPU dedicada. La B550M-HDV admite la plataforma, pero la tienda debe confirmar la BIOS para ese CPU y Resizable BAR. Intel indica arranque UEFI, CSM desactivado, Above 4G Decoding y Resizable BAR para Arc. Conectá el monitor a la GPU. ASRock especifica un conector PCIe de 8 pines y recomienda fuente de 500 W para esta A380; confirmá ese cable en la CSK650DC AR de 650 W. No trasladamos especificaciones de otra revisión CSK al modelo AR. La placa de video mide 190 mm y el VX310 con UPC 0-761345-10232-2 admite mATX y hasta 320 mm de GPU. La tienda lo titula RGB y el fabricante ARGB: verificá el SKU, la alimentación de sus cuatro ventiladores y la variante de iluminación; no asumimos un conector ARGB en esta motherboard.' },
      { title: 'Condiciones de precio y costos adicionales', text: 'Compará el precio especial de contado o transferencia con el de cuotas: no son necesariamente iguales. El cooler debe estar incluido en la publicación del Ryzen 5 5500. El SSD necesita cable SATA de datos y alimentación SATA; confirmá que el paquete de la motherboard traiga el cable. Envío, armado, licencia, Wi-Fi si lo necesitás, monitor y periféricos se suman aparte. El margen hasta el millón es pequeño y no garantiza cubrir esos costos. Confirmá stock, precio final, conectores y garantía con cada vendedor antes de pagar.' },
    ],
    sources: [
      { name: 'AMD: Ryzen 5 5500, plataforma y Wraith Stealth', url: 'https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5500.html' },
      { name: 'Intel: requisitos de sistema y Resizable BAR para Arc de escritorio', url: 'https://www.intel.com/content/www/us/en/support/articles/000091128/graphics/intel-arc-dedicated-graphics-family.html' },
      { name: 'ASRock: Arc A380 Challenger ITX 6GB OC, tamaño y alimentación', url: 'https://www.asrock.com/Graphics-Card/Intel/Intel%20Arc%20A380%20Challenger%20ITX%206GB%20OC/' },
      { name: 'ASRock: B550M-HDV, soporte de CPU, BIOS y QVL', url: 'https://www.asrock.com/mb/AMD/B550M-HDV/index.asp#CPU' },
      { name: 'ADATA: SU650 SATA de 2,5 pulgadas, código ASU650SS-512GT-R', url: 'https://www.adata.com/storage/downloadfile/datasheet_ultimate_su650_25_inch_sata_ssd_20231103.pdf' },
      { name: 'Antec: VX310 ARGB, UPC, formatos y dimensiones', url: 'https://antecplay.com/products/vx-310-argb-gaming-case' },
      { name: 'CompraGamer: CSK650DC AR, conectores PCIe 6+2 y SATA', url: 'https://compragamer.com/producto/Fuente_Antec_650W_80_Plus_Bronze_ATX_3_1_PCIe_5_1_CSK650DC_AR_18257' },
    ],
  },
  'pc-gamer-2-millones': {
    updatedAt: '2026-09-27',
    sections: [
      { title: 'Qué representa este presupuesto', text: 'Dos millones de pesos argentinos es el límite objetivo de componentes. La selección se revisó para entrar en ese monto con ofertas comprobadas; no es un precio garantizado de PC armada. Si una oferta deja de estar disponible, elegimos la siguiente válida del mismo modelo o selección compatible. Solo mostramos piezas con oferta reciente y stock informado; un subtotal incompleto no alcanza para comprar el conjunto. La cobertura consultada es limitada y puede haber una combinación mejor.' },
      { title: 'Decidir por el uso y la plataforma', text: 'La selección conserva AM5 y usa Ryzen 5 7600, GPU de 8 GB, SSD NVMe de 1 TB y 16 GB DDR5 en un módulo. Reducir la RAM desde 32 GB permite respetar el presupuesto, pero limita capacidad y ancho de banda frente a dos módulos. Para ampliar, revisá BIOS y QVL, y preferí una combinación probada; mezclar módulos separados no garantiza estabilidad. AMD especifica DDR5-5200 para este CPU; el perfil de 5600 depende del conjunto. Una RAM DDR4 no sirve para esta plataforma.' },
      { title: 'Costos que no incluye el total', text: 'Esta selección exige una publicación del Ryzen 5 7600 que incluya Wraith Stealth, documentado por AMD para su caja estándar. Confirmá que la tienda entregue el cooler; una versión sin él requiere sumar refrigeración. Agregá envío de cada tienda, armado, licencia del sistema, monitor y periféricos si los necesitás. El margen hasta dos millones no garantiza que cubra esos servicios: depende del destino y de cada vendedor.' },
      { title: 'Comprobaciones antes de pagar', text: 'Esta selección mantiene MSI PRO B650M-B de formato mATX y Cooler Master Elite 302, que admite mATX y Mini-ITX; no reemplazamos esa placa por una ATX solo porque sea otra B650 más barata. Revisá CPU admitida y BIOS en la página oficial de la motherboard, generación de RAM y código de kit en su QVL. Comprobá largo de GPU con ventiladores instalados, altura de cooler, conectores de fuente y ventiladores incluidos. XMP o EXPO son perfiles de memoria: no garantizamos que cualquier kit alcance su frecuencia anunciada en toda combinación. Confirmá precio y stock en la tienda, especialmente si la fecha del registro es anterior.' },
    ],
    sources: [ryzen7600Source, nvidiaSource, radeonSource, motherboardSource, caseSource],
  },
  'pc-gamer-3-millones': {
    updatedAt: '2026-09-28',
    sections: [
      { title: 'Un máximo de tres millones', text: 'La selección reúne siete piezas: Ryzen 5 7600 con Wraith Stealth, ASRock RX 9060 XT Challenger OC de 16 GB, kit Patriot Viper Venom de 32 GB, SSD Kingston NV3 de 1 TB, MSI B650M GAMING WIFI, fuente ASRock SL-750G y gabinete Antec VX310. Priorizamos capacidad de RAM y memoria de GPU dentro del techo de tres millones de pesos argentinos. La cobertura consultada es limitada y puede haber otras combinaciones que convengan más para tu uso. Los precios visibles provienen de ofertas con stock informado, identidad coherente y observación de hasta tres horas; un subtotal incompleto no permite comprar toda la PC.' },
      { title: 'Memoria y posibilidades de ampliación', text: 'El kit PVV532G600C36K contiene dos módulos DDR5 de 16 GB y ocupa las dos ranuras de esta motherboard. La placa admite Ryzen 7000, DDR5 y EXPO; AMD especifica DDR5-5200 para el Ryzen 5 7600. Los 6000 anunciados son un perfil de overclock, no una frecuencia garantizada. No acreditamos que este código concreto esté en la QVL de MSI: consultá su lista para Ryzen 7000 y confirmá el SKU, la BIOS y el perfil disponible con la tienda. Arrancá con parámetros estándar y comprobá estabilidad antes de activar el perfil. Ampliar capacidad requerirá reemplazar el kit.' },
      { title: 'Compatibilidad física y alimentación', text: 'La MSI B650M GAMING WIFI es mATX y admite el SSD NVMe M.2 2280 en PCIe 4.0 x4. La RX 9060 XT Challenger OC elegida mide 249 × 132 × 41 mm, utiliza un conector PCIe de 8 pines y ASRock recomienda una fuente de 550 W. La SL-750G de 750 W aporta cables PCIe 6+2 y EPS 4+4; conectá cada uno a su función y usá solamente los cables originales de esa fuente. Mide 150 mm de largo, dentro del espacio de 160 mm indicado para el VX310 con cables y bandeja de HDD. El gabinete admite mATX y GPU de hasta 320 mm. Confirmá antes del armado los ventiladores y su alimentación; la tienda titula RGB y el fabricante ARGB para el mismo UPC 0-761345-10232-2. El cooler Wraith Stealth debe venir en la publicación del CPU seleccionada.' },
      { title: 'Rendimiento y costo final', text: 'No medimos FPS de este conjunto ni garantizamos 144 Hz o 4K Ultra en todos los juegos. Compará pruebas de los títulos y aplicaciones que usás con resolución, calidad y drivers equivalentes. Una GPU AMD no ofrece CUDA: verificá la compatibilidad de tu software antes de elegir. Los precios especiales de contado o transferencia pueden diferir de las cuotas. Envío, armado, licencia, monitor y periféricos no forman parte del total; el margen hasta tres millones no garantiza cubrirlos. Verificá el precio final, stock y garantía con el vendedor antes de pagar.' },
    ],
    sources: [
      ryzen7600Source,
      { name: 'ASRock: RX 9060 XT Challenger 16GB OC, código, dimensiones y alimentación', url: 'https://www.asrock.com/Graphics-Card/AMD/Radeon%20RX%209060%20XT%20Challenger%2016GB%20OC/' },
      { name: 'MSI: B650M GAMING WIFI, AM5, DDR5, formato y almacenamiento', url: 'https://www.msi.com/Motherboard/B650M-GAMING-WIFI/Specification' },
      { name: 'MSI: soporte de B650M GAMING WIFI, CPU, BIOS y QVL', url: 'https://www.msi.com/Motherboard/B650M-GAMING-WIFI/support' },
      { name: 'Patriot: Viper Venom DDR5, perfiles y condiciones de compatibilidad', url: 'https://www.patriotmemory.com/en/products/viper-venom-ddr5-performance-ram' },
      { name: 'ASRock: SL-750G, certificación, dimensiones y conectores', url: 'https://www.asrock.com/Power-Supply/SteelLegend/SL-750G/' },
      { name: 'Antec: VX310 ARGB, UPC, formatos y dimensiones', url: 'https://antecplay.com/products/vx-310-argb-gaming-case' },
    ],
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
