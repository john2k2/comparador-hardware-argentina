export type EditorialMethodology = {
  updatedAt: string;
  sections: { title: string; text: string }[];
  sources: { name: string; url: string }[];
};

const ryzenSource = { name: 'AMD: ficha Ryzen 5 7600X, socket, memoria y refrigeración', url: 'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600x.html' };
const ryzen7600Source = { name: 'AMD: Ryzen 5 7600, AM5, DDR5 y Wraith Stealth', url: 'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html' };
const nvidiaSource = { name: 'NVIDIA: especificaciones RTX 4060 y RTX 4060 Ti (columnas diferentes)', url: 'https://www.nvidia.com/en-gb/geforce/graphics-cards/40-series/rtx-4060-4060ti/' };
const radeonSource = { name: 'AMD: ficha RX 7600, memoria y alimentación', url: 'https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7600.html' };

const methodology: Record<string, EditorialMethodology> = {
  'pc-gamer-1-millon': {
    updatedAt: '2026-10-09',
    sections: [
      { title: 'Un millón de referencia, con siete piezas', text: 'El objetivo es una PC de entrada completa con una referencia de un millón de pesos argentinos y hasta un 10% de margen entre revisiones semanales o a pedido en componentes. Elegimos Ryzen 5 5500 con Wraith Stealth, Arc A380 Challenger ITX OC de 6 GB, 16 GB DDR4, SSD SATA de 512 GB, ASRock B550M-HDV, Antec CSK650DC AR y gabinete Antec VX310. La selección se contrastó con publicaciones comprables; los importes visibles se calculan desde ofertas con stock informado, identidad coherente y observación de hasta tres horas. Se toma la siguiente oferta válida del mismo modelo cuando la más barata no sirve. Un subtotal con faltantes no representa una PC completa, y este corte no garantiza precios futuros ni ser la combinación más barata de todas las tiendas.' },
      { title: 'Lo que permite entrar en el presupuesto', text: 'Usamos un módulo de 16 GB: no ofrece dual channel y deja una ranura para una ampliación que requiere revisar QVL, código y BIOS. El SSD es SATA de 2,5 pulgadas, no NVMe. La A380 es una GPU de entrada; no la presentamos como equivalente a la RX 6600 de la selección anterior ni prometemos FPS, ajustes Ultra o resultados de una prueba propia. El rendimiento debe contrastarse para cada juego y aplicación, con drivers y Resizable BAR configurados.' },
      { title: 'Compatibilidad y preparación del armado', text: 'Ryzen 5 5500 usa AM4, DDR4 y PCIe 3.0; necesita GPU dedicada. La B550M-HDV admite la plataforma, pero la tienda debe confirmar la BIOS para ese CPU y Resizable BAR. Intel indica arranque UEFI, CSM desactivado, Above 4G Decoding y Resizable BAR para Arc. Conectá el monitor a la GPU. ASRock especifica un conector PCIe de 8 pines y recomienda fuente de 500 W para esta A380; confirmá ese cable en la CSK650DC AR de 650 W. No trasladamos especificaciones de otra revisión CSK al modelo AR. La placa de video mide 190 mm y el VX310 con UPC 0-761345-10232-2 admite mATX y hasta 320 mm de GPU. La tienda lo titula RGB y el fabricante ARGB: verificá el SKU, la alimentación de sus cuatro ventiladores y la variante de iluminación; no asumimos un conector ARGB en esta motherboard.' },
      { title: 'Condiciones de precio y costos adicionales', text: 'Compará el precio especial de contado o transferencia con el de cuotas: no son necesariamente iguales. El cooler debe estar incluido en la publicación del Ryzen 5 5500. El SSD necesita cable SATA de datos y alimentación SATA; confirmá que el paquete de la motherboard traiga el cable. Envío, armado, licencia, Wi-Fi si lo necesitás, monitor y periféricos se suman aparte. El margen editorial no garantiza cubrir esos costos. Confirmá stock, precio final, conectores y garantía con cada vendedor antes de pagar.' },
    ],
    sources: [
      { name: 'AMD: Ryzen 5 5500, plataforma y Wraith Stealth', url: 'https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5500.html' },
      { name: 'Intel: requisitos de sistema y Resizable BAR para Arc de escritorio', url: 'https://www.intel.com/content/www/us/en/support/articles/000091128/graphics/intel-arc-dedicated-graphics-family.html' },
      { name: 'ASRock: Arc A380 Challenger ITX 6GB OC, tamaño y alimentación', url: 'https://www.asrock.com/Graphics-Card/Intel/Intel%20Arc%20A380%20Challenger%20ITX%206GB%20OC/' },
      { name: 'ASRock: B550M-HDV, soporte de CPU, BIOS y QVL', url: 'https://www.asrock.com/mb/AMD/B550M-HDV/index.asp#CPU' },
      { name: 'ADATA: SU650 SATA de 2,5 pulgadas, código ASU650SS-512GT-R', url: 'https://webapi3.adata.com/storage/downloadfile/datasheet_ultimate_su650_25_inch_sata_ssd_v2.pdf' },
      { name: 'Antec: VX310 ARGB, UPC, formatos y dimensiones', url: 'https://antecplay.com/products/vx-310-argb-gaming-case' },
      { name: 'CompraGamer: CSK650DC AR, conectores PCIe 6+2 y SATA', url: 'https://compragamer.com/producto/Fuente_Antec_650W_80_Plus_Bronze_ATX_3_1_PCIe_5_1_CSK650DC_AR_18257' },
    ],
  },
  'pc-gamer-2-millones': {
    updatedAt: '2026-10-09',
    sections: [
      { title: 'Siete piezas dentro de la referencia', text: 'La revisión del 9 de octubre de 2026 cambia la selección a Ryzen 7 5700 con cooler, ASRock RX 9060 XT Challenger OC de 16 GB, Mancer Vant S de 16 GB DDR4 CL19, Kingston NV3 de 1 TB, ASRock B550M-HDV, ASRock SL-750G y Antec VX310. La referencia es de dos millones de pesos argentinos con hasta un 10% de margen entre revisiones semanales o a pedido. Contrastamos precio, condición de pago, SKU y stock en las publicaciones. Los importes visibles requieren además una observación persistida de cada oferta de hasta tres horas e identidad coherente; la lectura manual no rejuvenece esos registros. Una lista parcial no representa una PC completa. El corte no garantiza disponibilidad futura ni la mejor combinación de todas las tiendas.' },
      { title: 'Por qué AM4 y qué se pierde', text: 'La selección AM5 anterior ya excedía el margen con seis piezas en este corte. Pasamos a AM4 para conservar una GPU de 16 GB y un SSD NVMe de 1 TB. El 5700 ofrece ocho núcleos y dieciséis hilos para usos que puedan aprovecharlos; no lo elegimos por una promesa de más FPS. El Ryzen 5 5500 reduce el costo del CPU y puede convenir si el trabajo no aprovecha los núcleos extra. Un Ryzen 5 5600 con cooler es otra alternativa a contrastar con una oferta reciente; no usamos su precio vencido para afirmar ahorro actual. El 5700 es Cezanne y trabaja con PCIe 3.0: la B550M-HDV lo conecta a la GPU en x16 y al NV3 en Gen3 x4, aunque esos componentes anuncien generaciones superiores. No alcanza las velocidades Gen4 anunciadas del SSD y no ofrece el recorrido de plataforma de AM5.' },
      { title: 'RAM, cooler y BIOS antes del armado', text: 'La Mancer MCR-VNT3200-16GB es un módulo DDR4 de 16 GB, 3200 MHz y CL19, no un kit dual channel. La B550M-HDV tiene dos ranuras DDR4, pero no certificamos este código en su QVL ni garantizamos estabilidad al mezclar módulos. En este corte los kits alternativos de dos módulos vistos en tienda no tenían ofertas persistidas recientes elegibles: disponibilidad en una publicación y elegibilidad en el comparador son comprobaciones diferentes. La publicación seleccionada del Ryzen 7 5700 declara cooler incluido y Wraith Stealth en su descripción. ASRock admite el 5700 en la B550M-HDV desde BIOS P2.10; la versión entregada por la tienda queda pendiente de confirmación. La placa no tiene botón BIOS Flashback: pedí la actualización antes de recibirla si corresponde. El procesador necesita GPU dedicada; conectá el monitor a la RX 9060 XT.' },
      { title: 'Espacio, alimentación y costos adicionales', text: 'La RX 9060 XT Challenger OC mide 249 × 132 × 41 mm, requiere un conector PCIe de 8 pines y ASRock recomienda fuente de 550 W. La SL-750G de 750 W tiene PCIe 6+2 y EPS 4+4; usá sus cables originales y conectá solo la mitad correspondiente del EPS al conector CPU de cuatro pines de la B550M-HDV. La fuente mide 150 mm y el VX310 admite fuente de hasta 160 mm con cables y bandeja de HDD, y GPU de hasta 320 mm. El gabinete con UPC 0-761345-10232-2 incluye cuatro ventiladores; la tienda dice RGB en el título y ARGB en especificaciones. Confirmá su conexión de alimentación: esta motherboard no tiene header ARGB. CompraGamer declara que la SL-750G no incluye cable a 220 V: sumalo si no tenés uno adecuado. Los precios especiales de CompraGamer corresponden a depósito o transferencia y el de Rocket Hard a efectivo o transferencia; cuotas pueden costar más. Envío, armado, licencia, monitor y periféricos quedan fuera del total. No medimos FPS ni certificamos todo el armado: confirmá BIOS, cables y precio final antes de pagar.' },
    ],
    sources: [
      { name: 'AMD: Ryzen 7 5700, AM4, DDR4, PCIe 3.0 y Wraith Stealth', url: 'https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700.html' },
      { name: 'ASRock: soporte Ryzen 7 5700 Cezanne y BIOS P2.10 de B550M-HDV', url: 'https://www.asrock.com/support/cpu.asp?s=AM4&u=693' },
      { name: 'ASRock: B550M-HDV, memoria, enlaces PCIe y conectores', url: 'https://www.asrock.com/MB/AMD/B550M-HDV/index.asp' },
      { name: 'Rocket Hard: Ryzen 7 5700, publicación con cooler y condiciones de precio', url: 'https://rockethard.com.ar/hardware/procesador-amd/procesador-amd-ryzen-7-5700-s-video-integrado-c-cooler-am4-161776.html' },
      { name: 'ASRock: RX 9060 XT Challenger 16GB OC, tamaño y alimentación', url: 'https://www.asrock.com/Graphics-Card/AMD/Radeon%20RX%209060%20XT%20Challenger%2016GB%20OC/' },
      { name: 'Kingston: NV3 SNV3S/1000G, M.2 2280 NVMe', url: 'https://www.kingston.com/en/memory/search?partid=SNV3S%2F1000G' },
      { name: 'ASRock: SL-750G, dimensiones y conectores', url: 'https://www.asrock.com/Power-Supply/SteelLegend/SL-750G/' },
      { name: 'Antec: VX310 ARGB, UPC y espacio interior', url: 'https://antecplay.com/products/vx-310-argb-gaming-case' },
      { name: 'CompraGamer: Mancer Vant S 16 GB CL19, un módulo y SKU', url: 'https://compragamer.com/producto/Memoria_Mancer_DDR4_16GB_3200MHz_Vant_S_Black_CL19_21515' },
      { name: 'CompraGamer: SL-750G, cables y ausencia de cable a 220 V', url: 'https://compragamer.com/producto/Fuente_Asrock_750W_80_Plus_Gold_Steel_Legend_Full_Modular_ATX_3_1_PCIe_5_1_Cybenetics_Platinum_18173' },
    ],
  },
  'pc-gamer-3-millones': {
    updatedAt: '2026-10-09',
    sections: [
      { title: 'Tres millones de referencia', text: 'La selección reúne siete piezas: Ryzen 5 7600 con Wraith Stealth, ASRock RX 9060 XT Challenger OC de 16 GB, kit Patriot Viper Venom de 32 GB, SSD Kingston NV3 de 1 TB, MSI B650M GAMING WIFI, fuente ASRock SL-750G y gabinete Antec VX310. Priorizamos capacidad de RAM y memoria de GPU con una referencia de tres millones de pesos argentinos y hasta un 10% de margen entre revisiones semanales o a pedido. La cobertura consultada es limitada y puede haber otras combinaciones que convengan más para tu uso. Los precios visibles provienen de ofertas con stock informado, identidad coherente y observación de hasta tres horas; un subtotal incompleto no permite comprar toda la PC.' },
      { title: 'Memoria y posibilidades de ampliación', text: 'El kit PVV532G600C36K contiene dos módulos DDR5 de 16 GB y ocupa las dos ranuras de esta motherboard. La placa admite Ryzen 7000, DDR5 y EXPO; AMD especifica DDR5-5200 para el Ryzen 5 7600. Los 6000 anunciados son un perfil de overclock, no una frecuencia garantizada. No acreditamos que este código concreto esté en la QVL de MSI: consultá su lista para Ryzen 7000 y confirmá el SKU, la BIOS y el perfil disponible con la tienda. Arrancá con parámetros estándar y comprobá estabilidad antes de activar el perfil. Ampliar capacidad requerirá reemplazar el kit.' },
      { title: 'Compatibilidad física y alimentación', text: 'La MSI B650M GAMING WIFI es mATX y admite el SSD NVMe M.2 2280 en PCIe 4.0 x4. La RX 9060 XT Challenger OC elegida mide 249 × 132 × 41 mm, utiliza un conector PCIe de 8 pines y ASRock recomienda una fuente de 550 W. La SL-750G de 750 W aporta cables PCIe 6+2 y EPS 4+4; conectá cada uno a su función y usá solamente los cables originales de esa fuente. Mide 150 mm de largo, dentro del espacio de 160 mm indicado para el VX310 con cables y bandeja de HDD. El gabinete admite mATX y GPU de hasta 320 mm. Confirmá antes del armado los ventiladores y su alimentación; la tienda titula RGB y el fabricante ARGB para el mismo UPC 0-761345-10232-2. El cooler Wraith Stealth debe venir en la publicación del CPU seleccionada.' },
      { title: 'Rendimiento y costo final', text: 'No medimos FPS de este conjunto ni garantizamos 144 Hz o 4K Ultra en todos los juegos. Compará pruebas de los títulos y aplicaciones que usás con resolución, calidad y drivers equivalentes. Una GPU AMD no ofrece CUDA: verificá la compatibilidad de tu software antes de elegir. La publicación de la SL-750G no incluye cable a 220 V: sumalo si no tenés uno adecuado. Los precios especiales de contado o transferencia pueden diferir de las cuotas. Envío, armado, licencia, monitor y periféricos no forman parte del total; el margen hasta tres millones no garantiza cubrirlos. Verificá el precio final, stock y garantía con el vendedor antes de pagar.' },
    ],
    sources: [
      ryzen7600Source,
      { name: 'ASRock: RX 9060 XT Challenger 16GB OC, código, dimensiones y alimentación', url: 'https://www.asrock.com/Graphics-Card/AMD/Radeon%20RX%209060%20XT%20Challenger%2016GB%20OC/' },
      { name: 'MSI: B650M GAMING WIFI, AM5, DDR5, formato y almacenamiento', url: 'https://www.msi.com/Motherboard/B650M-GAMING-WIFI/Specification' },
      { name: 'MSI: soporte de B650M GAMING WIFI, CPU, BIOS y QVL', url: 'https://www.msi.com/Motherboard/B650M-GAMING-WIFI/support' },
      { name: 'Patriot: Viper Venom DDR5, perfiles y condiciones de compatibilidad', url: 'https://www.patriotmemory.com/en/products/viper-venom-ddr5-performance-ram' },
      { name: 'Kingston: NV3 SNV3S/1000G, formato e interfaz', url: 'https://www.kingston.com/en/memory/search?partid=SNV3S%2F1000G' },
      { name: 'ASRock: SL-750G, certificación, dimensiones y conectores', url: 'https://www.asrock.com/Power-Supply/SteelLegend/SL-750G/' },
      { name: 'Antec: VX310 ARGB, UPC, formatos y dimensiones', url: 'https://antecplay.com/products/vx-310-argb-gaming-case' },
    ],
  },
  'ryzen-5-7600x-vs-ryzen-7-5700x': {
    updatedAt: '2026-10-09',
    sections: [
      { title: 'Actualizar una PC existente', text: 'Si ya tenés AM4 y DDR4, el primer paso es comprobar si tu motherboard admite el 5700X y desde qué BIOS. Presupuestá procesador, refrigeración y cualquier actualización necesaria. Conservar piezas que ya funcionan puede cambiar la decisión aunque otro CPU sea más rápido en una prueba. No consideramos compatible una placa solo porque su socket diga AM4.' },
      { title: 'Armar desde cero', text: 'Compará dos listas completas: CPU, motherboard, RAM y cooler. El 7600X utiliza AM5 y DDR5, como documenta AMD; el precio del micro aislado no representa el costo de entrar a esa plataforma. No damos por incluido un cooler en el 5700X: verificá la publicación exacta y presupuestá uno si hace falta. La posibilidad de actualizar luego depende de la placa, su soporte y la BIOS, no solo del nombre de plataforma.' },
      { title: 'Qué sabemos del rendimiento', text: 'La review de TechPowerUp enlazada corresponde al 7600X. Una diferencia frente al 5600X no se puede transferir al 5700X. No hicimos un ensayo propio de estos dos CPU. Para una aplicación concreta, buscá una prueba que incluya ambos, misma versión del programa y configuración comparable. Para streaming, considerá si codificás en CPU o GPU antes de decidir por cantidad de núcleos.' },
      { title: 'Cómo tomar la decisión local', text: 'Compará ofertas de la misma variante y condiciones de garantía. Usá el costo completo de cada alternativa y el rendimiento del trabajo que realmente harás. Sin precios recientes de ambos lados no hay un ganador de precio actual. El total de una plataforma tampoco se obtiene restando solo los dos valores de CPU.' },
    ],
    sources: [ryzenSource],
  },
  'rtx-4060-vs-rx-7600': {
    updatedAt: '2026-10-09',
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
