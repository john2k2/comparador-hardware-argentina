# PC gamer hasta ARS 1.000.000 — corte del 28/09/2026

Solicitud: reconstruir `/guia/pc-gamer-1-millon` con siete componentes comprables y un **máximo**, no un gasto obligatorio de un millón. Este registro conserva un corte; no congela precio ni disponibilidad.

## Ofertas comprobadas

Fuente inicial: catálogo público oficial `https://static.compragamer.com/productos`, consultado a las 20:33 UTC. Se contrastaron ID de publicación, título, SKU, `vendible`, disponibilidad y precio especial. El valor de stock del catálogo no se interpreta como cantidad garantizada de unidades.

Actualización mediante la cola pública ya existente, solicitada interactivamente a las 20:41 UTC: solicitud `49309ad4-20aa-4aa0-b01d-b736dbf3d96d`, despacho `sent`. El [runner 36481019348](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36481019348) terminó `success`; el resultado de la solicitud fue `completed` con **7/7 resultados actualizados y comparables**, observados el 28/09 a las 20:42:27 UTC. Se comprobó la persistencia de precio, stock y fecha por oferta en Supabase.

| Pieza | Modelo de la publicación | ID CompraGamer | SKU publicado | ARS |
|---|---|---:|---|---:|
| CPU y cooler | Ryzen 5 5500 + Wraith Stealth | 13359 | 100-100000457BOX | 159.450 |
| GPU | ASRock Arc A380 Challenger ITX OC 6 GB | 19298 | A380 CLI 6GO | 266.691 |
| RAM | Mancer Vant S DDR4 16 GB 3200 CL19, un módulo | 21515 | MCR-VNT3200-16GB | 191.850 |
| SSD | ADATA SU650SS SATA 512 GB | 17143 | ASU650SS-512GT-R | 120.650 |
| Motherboard | ASRock B550M-HDV DDR4 AM4 | 10535 | B550M-HDV | 121.050 |
| Fuente | Antec CSK650DC AR 650 W Bronze | 18257 | CSK650DC AR | 74.252 |
| Gabinete | Antec VX310 Black, cuatro ventiladores | 18607 | 0-761345-10232-2 | 60.360 |
| **Total de componentes** | **Siete piezas** | | | **994.303** |

Margen respecto del máximo: **ARS 5.697**. Corresponde al precio especial de depósito/transferencia de la tienda, no a cuotas. La ficha de la fuente confirmó en Chrome el precio 74.252, stock disponible y los conectores PCIe 6+2 y seis SATA. No incluye envío, armado, licencia, conectividad Wi-Fi, monitor ni periféricos; el margen no garantiza cubrirlos.

## Selección, compatibilidad y límites

- CPU AM4 con cooler publicado; necesita placa de video dedicada. El monitor debe conectarse a la GPU.
- Motherboard B550M-HDV de formato mATX y DDR4. Confirmar la BIOS entregada para Ryzen 5 5500 y Resizable BAR con el vendedor; no se verificó la versión instalada en una unidad física. La sección dinámica de CPU del fabricante no llegó a mostrar su tabla en esta revisión; no se inventa una BIOS mínima.
- Intel incluye Ryzen 5000 con motherboard AMD serie 500 y Smart Access Memory en su guía de Arc. Configurar UEFI, CSM desactivado, Above 4G Decoding y Resizable BAR; revisar drivers. Ryzen 5 5500 usa PCIe 3.0. No se promete rendimiento Ultra ni un número de FPS, y la A380 no se presenta como equivalente a la RX 6600 anterior.
- A380 Challenger ITX OC: fabricante confirma 190 mm, dos ranuras, un conector PCIe de ocho pines y recomendación de fuente de 500 W. La ficha publicada de la CSK650DC **AR** confirma 650 W y PCIe 6+2; no se transfieren especificaciones de otra revisión CSK ni se confunde eficiencia 80 Plus con una evaluación integral de calidad.
- RAM de un módulo de 16 GB: no es dual channel. QVL y estabilidad del código Mancer no están acreditadas como combinación ensayada; revisar antes de ampliar o aplicar perfiles.
- SSD SATA de 2,5 pulgadas: fabricante confirma el SKU ASU650SS-512GT-R. Verificar cable SATA de datos incluido con la motherboard y alimentación de fuente. No sustituir por NVMe manteniendo el mismo importe.
- VX310: el fabricante publica el mismo UPC de la tienda, mATX/ATX/ITX, GPU hasta 320 mm y cuatro ventiladores. La tienda usa «RGB» y el fabricante «ARGB»; se conserva esa diferencia y se pide comprobar variante/conectores. No se promete control ARGB desde esta motherboard ni se mezclan fichas VX310M/Elite de otro UPC.

La metodología y fuentes quedaron incorporadas a la guía. La tarjeta de portada pasó de prometer «1080p 60fps» a «Gaming de entrada». Se conservaron los controles de stock, identidad y observación ≤3 h; los estimados internos no se usan para completar una lista de compra.

## Identidad, Jev y correcciones de referencias

En este ciclo el proveedor de revisión semántica respondió: CPU `consistent`, modelo `jev-1.13.0`, confianza 0,93; GPU 0,93; RAM 0,88. Es una comprobación de coherencia textual de título/catálogo/enlace, no evidencia independiente de precio, stock, rendimiento o compatibilidad. No se cambiaron credenciales, cuota, umbral ni guardas para obtener estas ofertas.

Dos títulos de CompraGamer habían cambiado conservando el ID/SKU: SSD 17143 ahora explicita SATA y gabinete 18607 usa RGB. Se corrigieron exclusivamente sus URLs de oferta, preservando las fechas antiguas hasta que el runner efectuó la observación real. Se ajustó el título del gabinete a la publicación actual, sin inventar una observación de precio. No se borraron ni aprobaron manualmente revisiones pendientes de identidad.

## Fuentes técnicas

- [AMD Ryzen 5 5500 y cooler](https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5500.html).
- [Intel Arc Desktop Quick Start Guide](https://www.intel.com/content/www/us/en/support/articles/000091128/graphics/intel-arc-dedicated-graphics-family.html).
- [ASRock Arc A380 Challenger ITX OC](https://www.asrock.com/Graphics-Card/Intel/Intel%20Arc%20A380%20Challenger%20ITX%206GB%20OC/).
- [ASRock B550M-HDV](https://www.asrock.com/mb/AMD/B550M-HDV/index.asp#CPU).
- [ADATA SU650, SKU y SATA 2,5 pulgadas](https://www.adata.com/storage/downloadfile/datasheet_ultimate_su650_25_inch_sata_ssd_20231103.pdf).
- [Antec VX310 ARGB, UPC y medidas](https://antecplay.com/products/vx-310-argb-gaming-case).
- [CompraGamer CSK650DC AR, conectores y precio](https://compragamer.com/producto/Fuente_Antec_650W_80_Plus_Bronze_ATX_3_1_PCIe_5_1_CSK650DC_AR_18257).

## Validación y seguimiento

- 77 pruebas de selección, precios, catálogo, metadatos, FAQ, portada y exclusión publicitaria aprobadas; incluyen lista completa bajo el máximo, rechazo de CPU sin cooler/oferta vencida y detección de un total superior al millón.
- Lint y TypeScript aprobados. Build de producción aprobado. Un primer build mostró timeouts de lecturas generales de Search con fallback; el siguiente build terminó sin esos avisos. Eso no prueba recuperación sostenida de todas las rutas.
- Runtime local con scraping y refresh internos desactivados: 7/7 ofertas y ARS 994.303; siete enlaces de tienda y módulo editorial visibles. Publicación y comprobación pública quedan pendientes de su corte posterior.
- Esta solicitud interactiva no se suma a los siete ciclos diarios útiles de G02. G02 continúa abierto; tampoco se cierran G20 ni la preparación AdSense. La guía de un millón sigue fuera de las tres rutas del piloto publicitario.

Si una oferta supera las tres horas, comprobar la siguiente oferta elegible del mismo modelo. Si cambia el conjunto o excede un millón, volver a revisar selección completa y costos; no renovar fechas artificialmente ni mostrar este total histórico como actual.
