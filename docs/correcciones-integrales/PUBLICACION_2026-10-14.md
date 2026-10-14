# Publicación de correcciones del 14/10/2026

Jonathan autorizó revalidar las siete ofertas y publicar si conservaban sus condiciones. Se publicó la integración revisada y se comprobó el resultado sobre el dominio real. Este documento sucede al cierre local; no cambia las fechas ni los resultados históricos de VALIDACION.md.

## Guía de tres millones

Las siete publicaciones de CompraGamer se contrastaron con su fuente estructurada y páginas visibles entre 12:05 y 12:06 UTC: SKU exacto, precio especial, precio de lista, stock informado y botón de compra. No son exclusivas de combo/armado. Se volvieron a observar y guardar a las **12:32:19.247 UTC** (09:32 Argentina). En la verificación pública de **12:50:21 UTC**, SQLite, API, enlaces y página coincidieron: **7/7**, total **$2.847.725** por depósito/transferencia; suma de precios de lista **$3.164.139**. El máximo editorial permanece en $3.300.000.

| Publicación verificada | SKU de tienda | Precio especial ARS |
| --- | --- | ---: |
| [Procesador AMD Ryzen 5 7600 5.1GHz Turbo AM5 + Wraith Stealth Cooler](https://compragamer.com/producto/Procesador_AMD_Ryzen_5_7600_5_1GHz_Turbo_AM5_Wraith_Stealth_Cooler_14309) | 100-100001015BOX | $360.150 |
| [Placa de Video Asrock Radeon RX 9060 XT 16GB GDDR6 Challenger OC ](https://compragamer.com/producto/Placa_de_Video_Asrock_Radeon_RX_9060_XT_16GB_GDDR6_Challenger_OC_17960) | RX 9060XT CL 16GO | $947.350 |
| [Memoria KLEVV DDR5 32GB (2X16GB) 6000MHz BOLT V CL28](https://compragamer.com/producto/Memoria_KLEVV_DDR5_32GB_2X16GB_6000MHz_BOLT_V_CL28_21565) | KD5AGUA80-60B280H | $872.200 |
| [Disco Sólido SSD M.2 Kingston 1TB NV3 6000MB/s NVMe PCI-E Gen4 x4](https://compragamer.com/producto/Disco_Solido_SSD_M_2_Kingston_1TB_NV3_6000MB_s_NVMe_PCI_E_Gen4_x4_16872) | SNV3S/1000G | $289.050 |
| [Mother MSI B650M GAMING WIFI AM5 DDR5](https://compragamer.com/producto/Mother_MSI_B650M_GAMING_WIFI_AM5_DDR5_17076) | B650M GAMING WIFI | $188.985 |
| [Fuente Asrock 750W 80 Plus Gold Steel Legend Full Modular ATX 3.1 PCIe 5.1 Cybenetics Platinum](https://compragamer.com/producto/Fuente_Asrock_750W_80_Plus_Gold_Steel_Legend_Full_Modular_ATX_3_1_PCIe_5_1_Cybenetics_Platinum_18173) | SL-750G | $130.000 |
| [Gabinete Antec VX310 RGB Black 4x120mm Vidrio Templado ](https://compragamer.com/producto/Gabinete_Antec_VX310_RGB_Black_4x120mm_Vidrio_Templado_18607) | 0-761345-10232-2 | $59.990 |

Se conservan las comprobaciones de compatibilidad de GUIA_3M.md: cooler Wraith Stealth incluido; plataforma AM5, kit DDR5 2×16, GPU/fuente/gabinete compatibles documentalmente. No se promete QVL del kit, estabilidad a 6000, montaje probado ni FPS. Cable de alimentación de la fuente y conexión de los cuatro ventiladores requieren comprobación antes de comprar. Envío, armado, licencia y periféricos quedan fuera del total. La frescura continúa limitada a tres horas por oferta; no se prolongó por publicar.

## Qué quedó activo

Revisión de implementación: **6de6f5568b56b687eaa3e868000bbb4260e8e19e**. Cambios de publicación: 2c7ae0d (guías y certificados), 365de8f (presupuesto Mac), fb22693 (túnel) y 6de6f55 (diagnóstico). El build de aplicación corresponde al contenido de 365de8f; las dos unidades posteriores no modifican la aplicación Next.

- Worker principal: versión **51e2130c-5830-4fea-8632-e7b51fc12c2b**, tráfico 100%.
- Proxy de catálogo: versión **e062e5a2-b669-420e-a7cb-7ccc8f2a91ab**, 30 rutas verificadas para los dos hosts. Los patrones admiten query strings y el handler mantiene una allowlist estricta.
- Túnel privado: configuración v4, mismo host/destino y cierre 404; incorpora APIs de portada, sitemap y los tres slugs de guía. El contrato queda en scripts/cloudflare/mac-catalog-ingress.mjs. Auth, administración y escrituras no entran a esa allowlist.
- Servicio Mac: release estable correcciones-20261014, build de producción real, base readonly. Confirmación de generación/fingerprint a las 12:42:51 UTC, proceso administrado por launchd. No depende del worktree.
- Generación inicial: mac-refresh-1791981144328; SHA-256 8784d24a195699ecc43b6930bcc28134af73d43ef40a8d548be8a98d5c42e26b. Conservados rollback de configuración y copia manual del catálogo anterior.

La portada y las fichas usan el mismo catálogo. Se comprobaron públicamente cuatro ofertas de portada, las 13 reparaciones de categoría/identidad, cuatro pares de variantes separados y 1.000 URLs de la primera página del sitemap.

El barrido previo a publicar completó la ventana 13/10 12:12:31.069 → 14/10 12:12:31.069 UTC en diez lotes: 9.991 filas recibidas, 5.534 admitidas y 4.441 rechazadas, más 16 repeticiones de transporte excluidas. Se hicieron 50 GET y se transfirieron 27.359.094 bytes. No se escribieron datos remotos ni se admitieron identidades dudosas.

## Actualizador y límites

El servicio conserva el intervalo de 900 segundos. Se habilitó el puente de lectura pública: máximo 1.000 observaciones previas por ciclo con cursor y controles de identidad, además del lector CompraGamer con hasta 500 destinos. El límite de almacenamiento sigue en 8 GiB, reserva libre de 2 GiB y plazo de nueve minutos.

El presupuesto Mac heredado de 80.000 filas estimadas se había consumido (79.995), deteniendo nuevas persistencias aunque los ticks terminaran. Se separó del presupuesto D1 con una política explícita de 1.000.000 para persistencia local de observaciones. La migración preservó íntegramente los contadores anteriores: no reinicia consumo. No mide todas las escrituras SQLite; puente, inventario, copia e índices se contabilizan aparte. No se cambió un plan de pago ni una cuota remota.

Primer ciclo confirmado tras el arranque: **12:53:08–12:53:41 UTC**, 500 intentos, **493 observaciones/comparables**, siete sin observación, cuatro peticiones al comercio. El puente leyó 1.000 filas y rechazó las 1.000 en ese lote; no se presentan como sincronizadas. El corte nuevo fue confirmado por el runtime: **mac-refresh-1791982406058**, SHA-256 **984bc3a93f6327036665aea0035a35685d64cd640583130bc615a0a0224ade8e**. El contador Mac pasó a 84.995; el contador heredado quedó en 79.995.

Después de ese ciclo la guía siguió 7/7 y $2.847.725. La API utiliza observaciones de las 12:53:25 para CPU/GPU/fuente y 12:32:19 para las otras cuatro piezas, todas acreditadas por la misma URL y SKU exactos en SQLite. La ficha puede deduplicar una observación más reciente de esa publicación entre una fila agrupada y su hoja; esto no fabrica fechas.

## Comprobaciones e incidencias

- Build completo de Next/OpenNext con configuración pública real, empaquetado de ambos Workers y admisión remota del Worker nuevo. No se modificaron dependencias NPM ni migraciones.
- 328 pruebas operativas aprobadas antes de activar; cierre final de **336/336** tras incorporar ingress y diagnóstico seguro. Además, 30/30 focales del job con hijos Node reales y aceptación independiente de códigos/secretos. Lint y TypeScript focales aprobados. Las 3.208 pruebas de aplicación y 110 recorridos críticos corresponden al cierre local anterior; no se atribuyen a esta revalidación.
- Chrome público 1440 y 390 px: siete enlaces correctos, condiciones de pago visibles, guía → motherboard → regreso → índice → guía → armador → portada; 22 respuestas RSC por tamaño, sin errores de página, API o navegación. Capturas inspeccionadas visualmente.
- Se registraron tres prefetch rechazados por tamaño con el header explícito cf-speculation-refused y cuerpo vacío. Son rechazos de [Speed Brain](https://developers.cloudflare.com/speed/optimization/content/speed-brain/) para Workers, separados de las peticiones reales; cualquier otro 503 conserva carácter de fallo.
- El primer reinicio desde el instalador falló con error 5 de launchctl y produjo interrupciones breves. Se restauró la configuración anterior y se activó mediante comandos directos, comprobando proceso y ACK. La causa exacta del rechazo desde el subproceso no quedó demostrada; el modo 600 por sí solo no la explica.
- La primera comprobación pública detectó 404 en rutas que el túnel aún no admitía. Se corrigió únicamente su allowlist y se volvió a probar el recorrido completo.
- El primer RunAtLoad del actualizador falló sin promover a las 12:50:59. Su recibo antiguo no conservaba la causa interna. El siguiente arranque con la misma configuración terminó correctamente; no se atribuye una causa sin evidencia. El diagnóstico seguro del hijo queda reforzado para los ciclos siguientes.

Evidencia privada conservada en outputs/publicacion-correcciones-2026-10-14/: ofertas/report.json y capturas del comercio; barrido/; fresh-result.json; local-activation.json; qa-publica/validation.json y capturas; public-data-parity.json; post-cycle-validation.json; recibos de despliegue y configuraciones anterior/posterior. No se versionan tokens, bases ni trazas privadas.

## Límite del cierre

La publicación y un ciclo del actualizador están acreditados. La continuidad prolongada y el ritmo real de los ciclos se siguen midiendo; la Mac debe permanecer encendida y conectada. Los 59.693 productos, 73.827 filas de oferta y 34 tiendas no equivalen a cobertura reciente total. FullH4rd y las tiendas sin lector propio siguen pendientes de su evidencia; el puente sólo admite observaciones públicas que cumplen los contratos.

Se mantiene el seguimiento existente. Esta entrega no crea otro monitor, no acredita tráfico externo, ingresos ni rentabilidad y no amplía AdSense.
