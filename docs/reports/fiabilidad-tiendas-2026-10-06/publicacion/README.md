# Publicación de lectores, diagnóstico e ícono

**Publicado y comprobado: `99d5917b5ec185314d8ae081beb971894709ebcd`. La recuperación de cobertura sigue abierta.** Jonathan autorizó la recomendación de publicar lectores y diagnóstico sin aplicar índices ni limpiar datos. Después indicó que el ícono junto al nombre del sitio en Google era incorrecto. Se corrigió el favicon de plantilla usando el símbolo C que ya pertenecía al Comparador.

## Qué se publicó

La candidata de 36 fuentes `53d471e` se conserva en su rama original. El release agrega tres unidades: `0c9aeff` retira los índices del circuito automático de migraciones; `a9d188e` corrige ICO, icono Apple y metadata; `99d5917` identifica el release del harness público sin cambiar sus guardas de lectura. Los lectores y el diagnóstico coinciden con la candidata revisada.

Los dos índices y su prueba quedaron en [diferido](../diferido/). El workflow SQL y la prueba concurrente volvieron exactamente a la base anterior a esos índices. La publicación no ejecutó SQL remoto, limpieza, mantenimiento ni refresh manual. Los GET públicos pueden producir la telemetría habitual del sitio; no equivalen a una operación administrativa autorizada.

El push a `main` fue un avance normal desde `2dc40b8`. Workers Builds aprobó el build `9c2061cb-4ebf-49fc-be3f-35f52e2cbfc1`; Worker `652e3c18-4182-43d1-9d98-5f10afd67aa8`, número 194, quedó activo al **100%** desde **07/10/2026 14:53:32 UTC / 11:53:32 Santiago**. Las 40 definiciones de bindings coinciden con la versión anterior, incluidos valores públicos de configuración; no se inspeccionaron secretos. [Despliegue y fronteras](despliegue.json).

La copia principal con trabajo pendiente no se reseteó ni se integró a la fuerza. La evidencia posterior vive en `codex/evidencia-fiabilidad-2026-10-07`; esta rama local no sustituye al SHA publicado.

## Verificación

| Control | Resultado y alcance |
|---|---|
| [Verify 37640084761](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37640084761) | Lint/tipos; **1816 unitarias**, dos omitidas preexistentes; **25 operativas**; 75 migraciones, 13 archivos SQL y dos casos concurrentes en PostgreSQL efímero; **66 recorridos aislados**. [Conteos](ci.json) |
| Build local final | OpenNext aprobó ocho documentos públicos; incluye los archivos del favicon y la metadata final. No es una ejecución de migraciones remotas |
| Sitio público, HTTP | **32/32** controles de rutas, filtros, orden, paginación, metadatos, errores, acceso admin, robots/sitemap y guardas Worker. [Corte](http-publico.json) |
| Navegador público | **14/14**, escritorio y móvil, sin retry, flaky, fallos ni omisiones. Paridad API/tarjetas/detalle y selección local del armador. [Resultados](navegador-publico.json) |
| Confianza focalizada | Precio/lista/destino y fechas originales; referencias separadas; selección A/B recuperada al volver; carga del armador. Sin errores de página ni desborde en las dos fichas. [Corte real](confianza-publica.json) |
| Runtime de la versión | Ventana filtrada de 101,26 segundos: **dos eventos**, ambos `ok` de la versión publicada; cero excepciones y logs de error. Es una muestra acotada, no un SLO ni ausencia global de errores. [Eventos sanitizados](worker-publico.json) |
| Ícono público | Dos homes y ocho lecturas de assets entre apex/www: HTTP 200, metadata correcta y bytes idénticos a la candidata. Incluye la URL ICO estable y la variante automática de Next. [Evidencia](favicon-publico.json) |
| Revisión independiente | La separación de índices, favicon y harness pasó revisión de lectura sin un nuevo hallazgo material |

La prueba focalizada comenzó **15:02:07 UTC**. Ryzen 5600 conserva tres ofertas recientes comparables —Gaming City, Katech y Dinobyte— y nueve referencias; destacado y primera fila coinciden en **$233.700** de Gaming City. La Aero RTX 4060 sólo tiene una referencia con stock desconocido y no muestra un mínimo elegible. Son cortes del catálogo real; no certifican una compra futura ni una PC completa de siete piezas.

Se revisaron las capturas [CPU escritorio](cpu-publico.png), [GPU móvil](gpu-publico.png) y [comparador al volver](comparador-publico.png): frescura y referencias legibles, sin superposiciones en esos cortes. El harness bloqueó diez intentos de limpieza de sesión anónima y dieciséis diagnósticos de Cloudflare; no hubo otra mutación intentada por la aplicación. No se visitaron tiendas ni enviaron formularios o solicitudes de refresh.

## Ícono en Google

El `/favicon.ico` previo era el triángulo de la plantilla. El nuevo ICO contiene el símbolo C en 16, 32, 48 y 256 px; Apple usa PNG de 180 px. El SVG original se conserva. Ambas homes anuncian el ICO y el PNG, permiten indexación y sirven los mismos archivos. El User-Agent Googlebot-Image de la prueba es simulado: no prueba que Google haya rastreado el cambio.

Google indica que volver a rastrear y procesar la home puede tomar días o semanas y que cumplir sus reglas no garantiza la aparición del favicon. [Documentación oficial, consultada 07/10](https://developers.google.com/search/docs/appearance/favicon-in-search). No se solicitó indexación ni se modificó Search Console. La corrección de la web está comprobada; la actualización del resultado de búsqueda sigue siendo externa.

## Operación y siguiente decisión

El último ciclo concluido al revisar la publicación todavía usó `2dc40b8`: [37626593331](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37626593331), disparo automático del Worker, de 13:12 a 13:29 UTC. Guardó **653 observaciones**, **295 comparables**, en **1299 intentos**, y terminó por deadline aunque el workflow figura success. Su preparación consumió 14.467 ms. Hay procesamiento útil previo; no se atribuye al release nuevo ni demuestra continuidad, 95% o cierre G02. [Corte anterior](ciclo-anterior.json). No se despachó un refresh para fabricar esa evidencia.

La inspección agregada de capacidad posterior registra DB **929.205.395 B**, caché **245.424.128 B** y **346.653/348.342** filas vencidas al corte fijo. Aun retirar físicamente toda la caché dejaría **683.781.267 B**; una limpieza aislada no demuestra volver bajo la cuota Free. El estado `read_only=off` del corte no acredita margen de capacidad.

La [propuesta de retención](../../retencion-2026-10-07/PLAN.md) quedó revisada y probada sólo con datos sintéticos: hasta 1000 eventos operativos vencidos, cuatro lotes de 250, corte fijo, revalidación bajo lock y ROLLBACK por defecto. El límite total es procedimental. Su ejecución necesita autorización específica por la pérdida de registros históricos; no hay restauración demostrada después del commit. No se ejecutó contra producción ni se presenta como solución de espacio.

La retención de historial tiene ejecución histórica demostrada, pero no una cadencia vigente demostrada. El endpoint `cleanup-history` también elimina ofertas fantasma: no usarlo como operación aislada de caché/historial. Índices, mantenimiento, cambios de plan y tareas de retención permanecen fuera de esta publicación. La prioridad siguiente es correlacionar un ciclo natural nuevo y recuperar las causas de la matriz por tienda sin cambiar la muestra o el denominador G02.

Una lectura pública de `/api/search?q=ryzen` tardó **7421 ms**. Las pruebas pasan, pero ese corte no demuestra una mejora sostenida de latencia. Las 16 fuentes sin evidencia suficiente y los límites anteriores de referencias/agregados siguen abiertos. Versus permanece aplazado; no hay nueva evidencia de retorno externo o ingresos.

## Integridad y reversión

[integridad-publicacion.json](integridad-publicacion.json) registra hashes de fuentes, informes, capturas y logs de verificación. Los logs completos y headers del tail siguen en `tmp/` ignorado; sólo se conserva el resumen sanitizado.

Rollback de código identificado: Worker anterior `5b529296-48ee-4431-a5e7-cc031a8667e9`, fuente `2dc40b8`. No hubo cambio de esquema que requiera rollback de DB. Retirar esta evidencia local no cambia el código publicado. No se ejecutó una reversión ni se retiraron guardas para aumentar cobertura artificialmente.
