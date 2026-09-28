# PC gamer hasta ARS 3.000.000 — corte del 28/09/2026

Jonathan pidió verificar la disponibilidad de todas las piezas antes de crear cada guía, y preparar la de tres millones únicamente con una selección comprable. El importe es un máximo. La regla quedó documentada en AGENTS.md y conserva el control de identidad y frescura por oferta.

## Ofertas y disponibilidad

Catálogo público oficial de CompraGamer consultado el 28/09/2026 a las 20:59:35 UTC: siete publicaciones vendibles, stock positivo, sin condición de combo ni outlet. El campo stock=10 no prueba diez unidades: se usa solo como señal positiva de disponibilidad. La guía de un millón se volvió a contrastar contra ese corte: siete referencias disponibles y suma ARS 994.303; su lectura pública conservaba 7/7.

Para la selección de tres millones se hizo una solicitud interactiva a la cola existente a las 21:06:08 UTC: `b4d908a9-8cbb-4c4f-b7ee-68e36d42fde4`, despacho `sent`. El [runner 36483815034](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36483815034) terminó success. Resultado completed, **7/7 observaciones actualizadas y comparables**. Supabase confirmó precio, stock y last_updated por oferta entre las 21:06:39.228 y 21:06:39.258 UTC, sin modificar fechas manualmente.

| Pieza | Publicación | Precio especial ARS | Stock observado | Fecha de oferta UTC |
|---|---|---:|---|---|
| CPU y cooler | [Procesador AMD Ryzen 5 7600 5.1GHz Turbo AM5 + Wraith Stealth Cooler](https://compragamer.com/producto/Procesador_AMD_Ryzen_5_7600_5_1GHz_Turbo_AM5_Wraith_Stealth_Cooler_14309) | 355.850 | in-stock | 2026-09-28 21:06:39.254+00 |
| Placa de video | [Placa de Video Asrock Radeon RX 9060 XT 16GB GDDR6 Challenger OC](https://compragamer.com/producto/Placa_de_Video_Asrock_Radeon_RX_9060_XT_16GB_GDDR6_Challenger_OC_17960) | 956.600 | in-stock | 2026-09-28 21:06:39.258+00 |
| RAM | [Memoria Patriot DDR5 32GB (2x16GB) 6000MHz Viper Venom CL36 XMP 3.0/AMD EXPO](https://compragamer.com/producto/Memoria_Patriot_DDR5_32GB_2x16GB_6000MHz_Viper_Venom_CL36_XMP_3_0_AMD_EXPO_17061) | 859.100 | in-stock | 2026-09-28 21:06:39.247+00 |
| SSD | [Disco Sólido SSD M.2 Kingston 1TB NV3 6000MB/s NVMe PCI-E Gen4 x4](https://compragamer.com/producto/Disco_Solido_SSD_M_2_Kingston_1TB_NV3_6000MB_s_NVMe_PCI_E_Gen4_x4_16872) | 291.850 | in-stock | 2026-09-28 21:06:39.228+00 |
| Motherboard | [Motherboard MSI B650M GAMING WIFI AM5](https://compragamer.com/producto/Mother_MSI_B650M_GAMING_WIFI_AM5_DDR5_17076) | 212.050 | in-stock | 2026-09-28 21:06:39.25+00 |
| Fuente | [Fuente Asrock 750W 80 Plus Gold Steel Legend Full Modular ATX 3.1 PCIe 5.1 Cybenetics Platinum](https://compragamer.com/producto/Fuente_Asrock_750W_80_Plus_Gold_Steel_Legend_Full_Modular_ATX_3_1_PCIe_5_1_Cybenetics_Platinum_18173) | 131.250 | in-stock | 2026-09-28 21:06:39.235+00 |
| Gabinete | [Gabinete Antec VX310 RGB Black 4x120mm Vidrio Templado](https://compragamer.com/producto/Gabinete_Antec_VX310_RGB_Black_4x120mm_Vidrio_Templado_18607) | 60.360 | in-stock | 2026-09-28 21:06:39.241+00 |

**Total de componentes: ARS 2.867.060. Margen hasta el máximo: ARS 132.940.** Son precios especiales de contado/depósito/transferencia; cuotas y otros medios pueden diferir. Envío, armado, licencia, monitor y periféricos se suman aparte. Las ofertas pueden cambiar y esto no prueba compra, reserva, cobertura de todo el mercado ni disponibilidad futura.

La GPU se revisó también en Chrome: título de 16 GB, SKU RX9060XT CL 16GO, ARS 956.600, stock disponible y dimensiones de 249 mm; otros medios ARS 1.062.889. No se añadió al carrito ni se compró.

## Selección y compatibilidad

- Ryzen 5 7600, código de caja 100-100001015BOX y Wraith Stealth explícito en la publicación. AM5 y DDR5; no se admiten 7600X, Ryzen 7 o versiones sin cooler como sustitución silenciosa.
- RX 9060 XT Challenger OC de **16 GB**, SKU RX9060XT CL 16GO. ASRock indica 249 × 132 × 41 mm, un PCIe de ocho pines y recomendación de 550 W. Se agregó una guarda general de capacidad de VRAM para no aceptar ocho GB aunque un título normalizado anuncie dieciséis.
- Patriot PVV532G600C36K: kit 2×16 GB DDR5-6000 CL36. No CL30, SO-DIMM ni módulos sueltos. Ocupa las dos ranuras de la MSI. Los 6000 son un perfil de overclock; el fabricante del CPU especifica DDR5-5200. No se acreditó presencia de este código en la QVL de MSI ni estabilidad física del conjunto: el texto pide confirmar código/BIOS y probar ajustes estándar antes del perfil.
- MSI B650M GAMING WIFI: AM5, soporte Ryzen 7000, DDR5, formato mATX y M.2 2280 PCIe 4.0 x4 para Kingston NV3 1 TB, SKU SNV3S/1000G. Wi-Fi 6E sujeto a región/sistema según MSI.
- ASRock SL-750G: 750 W, 80 Plus Gold, modular, 150×150×86 mm, EPS 4+4 y PCIe 6+2. Usar cables originales; no confundir EPS con PCIe ni mezclar cables de otras fuentes.
- Antec VX310, UPC 0-761345-10232-2: mATX, GPU hasta 320 mm y fuente hasta 160 mm con cables y bandeja de HDD. GPU de 249 mm y fuente de 150 mm dentro de esos límites. Tienda RGB y fabricante ARGB: se conserva advertencia de variante/ventiladores sin inventar un modelo distinto.
- Se retiraron claims no probados de 4K Ultra, 144 Hz, FPS, seis ventiladores, refrigeración no presupuestada y CUDA para esta GPU AMD. Elegir 32 GB RAM y 16 GB VRAM es una prioridad editorial dentro del presupuesto, no un benchmark ni una afirmación de superioridad universal frente a RTX 5070.

## Fuentes técnicas

- [AMD Ryzen 5 7600](https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html).
- [ASRock RX 9060 XT Challenger 16GB OC](https://www.asrock.com/Graphics-Card/AMD/Radeon%20RX%209060%20XT%20Challenger%2016GB%20OC/).
- [MSI B650M GAMING WIFI](https://www.msi.com/Motherboard/B650M-GAMING-WIFI/Specification) y [soporte/BIOS/QVL](https://www.msi.com/Motherboard/B650M-GAMING-WIFI/support).
- [Patriot Viper Venom DDR5](https://www.patriotmemory.com/en/products/viper-venom-ddr5-performance-ram).
- [ASRock SL-750G](https://www.asrock.com/Power-Supply/SteelLegend/SL-750G/).
- [Antec VX310](https://antecplay.com/products/vx-310-argb-gaming-case).

Jev 1.13.0 respondió consistent-text para CPU 0,95, GPU 0,92 y RAM 0,91 a las 21:06:39.928 UTC. Esta opinión contrasta identidad textual, no prueba stock, precio ni compatibilidad física. El MCP evaluate_options no estaba disponible en esta sesión; no se inventó una evaluación de prioridades.

## Validación y alcance

91 tests de siete archivos aprobados: selección completa, máximo exacto/por encima, rechazo de CPU distinto o sin cooler, VRAM incorrecta, oferta agotada/vencida y guardas de catálogo/FAQ/piloto. Fixture basada en el corte editorial, expresamente separada de la evidencia de tienda. Lint y TypeScript aprobados.

Build final aprobado sin avisos de lectura del catálogo. En la primera compilación hubo dos avisos de timeout de lectura de categorías de búsqueda, resueltos por su fallback; no se interpretan como prueba de confiabilidad global ni se mezclan con disponibilidad de las siete ofertas.

Runtime local de la guía con scraping y refresh internos desactivados: 7/7 ofertas, ARS 2.867.060, siete enlaces de tienda, fuentes y metodología visibles. Se detectó y corrigió un desbordamiento de descripciones de productividad: en la prueba final móvil de 390 px el ancho de contenido fue 378 px y no hubo errores/avisos JS. La corrección permite ajuste de línea y alcanza todas las guías. La guía no integra el piloto publicitario: las tres rutas exactas originales permanecen iguales y no se cargó proveedor AdSense.

Publicación y prueba pública pendientes del corte posterior. No cambia el cierre de G02/G19/G20/G23/G24, no cuenta el job manual como ciclo diario útil de G02, ni se habilitan anuncios o revisión AdSense.
