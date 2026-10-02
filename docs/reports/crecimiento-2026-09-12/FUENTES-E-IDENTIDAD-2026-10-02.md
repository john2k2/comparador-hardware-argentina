# Fuentes, publicaciones e identidad — 02/10/2026

El problema no era sólo la frecuencia del scraping. Había referencias de tiendas inconsistentes, revisiones heredadas de otra evidencia y resúmenes que elegían el mínimo histórico antes de considerar una alternativa actual. Esta entrega corrige esos contratos. No acredita cobertura sostenida, G02 cerrado, autorización de anuncios ni ventas.

## Evidencia y alcance

- 36 tiendas configuradas y 34 registradas en la base al control. `MAPA-FUENTES-2026-10-02.csv` separa inventario de código, lectura pública y permisos de usar precios.
- Una petición acotada por cada una de las 11 tiendas WooCommerce, a las 14:29 UTC: nueve APIs devolvieron una publicación validable. Gamers Point y Hardcore tuvieron errores/bloqueo; no se concluye que carezcan de API. Los 25 adaptadores restantes fueron mapeados en código, sin barrido pesado ni afirmación de salud actual de todos sus endpoints.
- CompraGamer y WizTech tienen endpoints JSON en sus adaptadores; Maximus usa un endpoint POST. Este inventario de código no equivale a contrato oficial ni a precios verificados en esta sesión. [WooCommerce documenta ID, SKU, permalink y filtros de productos](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/products/).
- Se corrigieron las bases del registro de XT-PC y PortalTech para concordar con sus adaptadores y los hosts registrados: `xt-pc.com.ar` y `portalstore.com.ar`. Las pruebas comprueban paridad de hosts y las 11 fuentes WooCommerce.
- Cuatro candidatas de RAM se leyeron por ID de API y ficha visible a las 15:17 UTC. Las cuatro informaron precio positivo y stock disponible en ese corte. Sus títulos omiten atributos necesarios para algunas fichas canónicas. Se conservan como candidatas en `FUENTES-CANDIDATAS-RAM-2026-10-02.json`; no se importaron, reasociaron ni acreditaron G02. Un SKU como RAM361 identifica a la tienda, no a Corsair.

## Reglas implementadas

1. Host registrado, HTTPS, ruta de publicación y parámetros de variante. Se quitan únicamente parámetros de seguimiento; se rechazan enlaces de sesión, API/admin, categorías y hosts ajenos. Descubrimiento por ID o slug explícito, hasta 24 objetivos, sin adivinar URLs de productos.
2. ID estable de la publicación, título observado, SKU de tienda, referencia de URL y fecha real de lectura separados del ID canónico. El lector HTML WooCommerce toma el ID del producto principal y no de recomendaciones. IDs principales contradictorios se rechazan.
3. Una evidencia nueva incompatible invalida el dictamen anterior. Persistencia de prioridad y cola solicitada guardan evidencia y condición de pago en la misma transacción, conservando locks, leases, historial e idempotencia. No se renueva una fecha de observación por una consulta de API o un dictamen de IA.
4. Atributos exactos completos y reproducibles pueden corroborar identidad sin llamar a Jev. Contradicciones explícitas se rechazan; títulos incompletos permanecen en revisión. No se inventa una confianza. Jev mantiene su umbral 0,8 y modelo configurado; se usa para las ambigüedades, recibe sólo evidencia pública mínima y su caché cambia de versión al cambiar el contrato. No se efectuó una consulta al MCP de decisiones de Jev: no estaba disponible.
5. La búsqueda considera stock conocido, identidad y observación <=24 h antes de elegir por tienda, precio, filtros y orden. Conserva alternativas e historial. Guías y armador mantienen <=3 h. El agregado se calcula al escribir y vence con la oferta; al leer no extiende el timestamp. Cambios de nombre/categoría/host revalidan el agregado.
6. La fase de lecturas compartidas tiene una reserva temporal para la rotación de otras fuentes, además del límite de filas. Se registran tiempos por fase, peticiones, bytes decodificados y fallos del transporte instrumentado. Un lote ya iniciado puede finalizar después del corte; no se promete una latencia exacta ni ahorro porcentual en todo el catálogo.
7. Analytics registra búsqueda resuelta y vista de ficha una vez por navegación, respeta consentimiento tardío y separa `contact_intent` de una consulta realmente recibida. Se instrumentaron salidas de comparativas sin fabricar IDs de producto. Los agregados autorizados por ficha siguen excluyendo estas otras superficies. Importación GA4 valida todos los IDs antes de una única escritura y exige confirmación; no se importaron datos previos al 03/10 ni ceros.
8. Destacados y detección de bajadas de portada usan fechas de ofertas elegibles; `updatedAt` de la ficha no sustituye una observación ausente. El caché de estas selecciones comprueba caducidad al leer. Los productos de respaldo conservan su indicador explícito.

## Validación proporcional

- Verificación completa: lint, TypeScript, 1.171 unitarias aprobadas y dos omitidas, 19 operativas aprobadas.
- Build y 43 pruebas críticas de navegador aprobadas con red y datos aislados: consentimiento, búsqueda directa, error de búsqueda sin falso evento, vista de producto sin duplicación artificial, filtros, paginación, auth, CSP y armador.
- Reconstrucción local UTF8 desde todas las migraciones, 13 escenarios SQL y dos pruebas de concurrencia aprobadas. Se contrastan precio alternativo, vencimiento sin nueva lectura, revisión inválida, fuente observada, hosts y privilegios.
- Prueba local PostgreSQL 17, 35.000 productos y 70.000 ofertas sintéticas: la primera versión recalculaba demasiado y tardó 5.168 ms en búsqueda global filtrada por precio. Se descartó ese diseño. El resumen vigente con vencimiento midió 132 ms; consulta específica, 5 ms; filtro global por una tienda, 3.004 ms. Este último conserva margen de mejora. No son p95 de producción, ahorro facturado ni muestras de demanda. La revalidación de 1.000 agregados midió 312 ms en ese entorno.

## Integración y rollback por unidades

Las siete migraciones son forward, preservan las ofertas, fechas, muestra fija y privilegios de escritura. Se aplicaron en orden antes del código que usa los nuevos RPC. La inicialización se hace en lotes de hasta 1.000 agregados y 20 segundos; la migración de activación rechaza habilitar la búsqueda si queda alguno sin inicializar. El orden de locks conserva producto antes del resumen y omite productos bloqueados para retomarlos. Los RPC anteriores quedan disponibles. Código se separa en unidades: contratos de fuentes; identidad/Jev; precio vigente SQL/TS; persistencia observada; distribución temporal; medición/portada; variantes de CPU y URLs canónicas.

Para rollback de aplicación se puede volver a la versión anterior después de conservar la evidencia observada; no revertir timestamps ni eliminar ofertas. El read model nuevo puede permanecer sin sus nuevos consumidores. Si fuera necesario revertir la consulta SQL, restaurar su definición previa como migración forward y conservar columnas/evidencia. No borrar estructuras para esconder diferencias. Los cambios ajenos del checkout principal no forman parte de esta entrega.

G02 continúa abierto. Última evidencia previa: seis fechas útiles distintas, 2/9 fichas de la muestra con oferta aceptada. Ni estas pruebas ni el hallazgo de cuatro publicaciones sustituyen siete ciclos diarios de prioridad, frescura observada y correspondencia de variante. Próxima revisión: artefactos automáticos posteriores a esta entrega, cobertura aceptada por tienda/ficha y discrepancias API/ficha. No despachar scraping desde el monitor ni modificar la muestra o los umbrales.

Estado de publicación y verificaciones posteriores se registra debajo; los resultados locales anteriores se mantienen como históricos.

## Revisión de la integración online

La primera tentativa de reconstrucción completa dentro del DDL excedió los 120 s del conector. Se confirmó ausencia de columnas/migración registrada y de operación activa: rollback, no resultado desconocido presentado como éxito. Se sustituyó por creación rápida, inicialización online acotada y activación posterior con guarda. Las pruebas de concurrencia verifican también el resumen corroborado; la fixture de inicialización conserva la fecha de oferta. No se reintentó la misma carga bloqueante.

## Publicación y corte final

Código publicado en main **5f230b0**. Workers Build **a6465a35-65eb-4bcc-b754-18268dbd8b64**, aprobado a las **17:04:34 UTC**; [CI 37038077196](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37038077196), aprobado a las **17:07:00 UTC**. Reconstruyó todas las migraciones y ejecutó 13 escenarios SQL, dos pruebas de concurrencia, 1.175 unitarias aprobadas (dos omitidas), 19 operativas y 43 críticas de navegador. Los controles locales anteriores se conservan como cortes previos.

- Inicialización online: **55.395 resúmenes** al corte de activación, cero pendientes; inicializador ejecutable sólo por service_role. Después de la guarda de variantes CPU se revalidaron **3.965 resúmenes** en ocho lotes acotados. A las **17:03:17 UTC** había siete migraciones registradas, cero resúmenes pendientes y ninguna fila CPU posterior al último cursor. Las altas posteriores conservan sus triggers. Estas operaciones recalculan agregados; no consultan tiendas, no renuevan precios/stock/fechas de oferta ni cuentan como refresh útil.
- La primera muestra pública detectó pérdida de centavos entre mínimo y oferta. Se corrigió la sanitización y se verificó de nuevo la paridad. Los valores observados conservan precisión; el formato visual puede redondear para mostrar pesos.
- Se encontró un error de variante reproducible: **/product/cg-18761**, Ryzen 3 4100 **sin cooler, OEM y outlet**, redirigía por 308 a una ficha de Ryzen 3 4100 **con cooler**. Se añadió correspondencia de variante a redirección, combinación de ofertas y aceptación TS/SQL, incluyendo BOX/TRAY/OEM, refrigeración explícita y condición outlet/usado/reacondicionado. Los IDs y fechas no se reasignaron. La ficha publicada conservó URL, título y item_id propios, con 200 en escritorio y 390 px.
- Muestra pública posterior: **11/11 rutas/consultas** aprobadas, incluyendo portada, CPU/GPU, fichas, comparativa y búsquedas por rango, tienda y paginación. Comprobación adicional de **4/4 APIs** con el contrato TS final: mínimo, alternativa elegible, orden y filtros concordantes. Escritorio y móvil sin desbordamiento ni errores JS en la muestra; búsqueda, vista y salida emitidos una vez, sin cargar Google antes de consentimiento. Se interceptó el proveedor y se impidió navegar a tiendas: acredita dataLayer, **no recepción en GA4**.

Evidencia fechada: **FUENTES-E-IDENTIDAD-EVIDENCIA-2026-10-02.json**. Ninguna lectura de la muestra visitó o refrescó tiendas. No se renovó una selección editorial de guías ni se activaron anuncios.

## G02 y siguientes decisiones

Corte adaptativo **16:24:13 UTC**: **8.946/34.240** prioritarias observadas <=24 h (**26,13%**); general **18.414/71.674**; **53.912** sin intento de la cola. Observación no implica oferta comprable ni identidad corroborada. Los denominadores cambian por altas y no representan una cohorte fija.

Corte de muestra fija **16:24:07 UTC**: **37/56** ofertas disponibles observadas <=24 h y **0/56** <=3 h; **0/9** fichas con oferta aceptada dentro de tres horas. El vencimiento respecto del priority de las 11:06 no demuestra agotamiento ni una regresión de scraping. Se conserva el corte previo de 2/9 y la muestra de nueve IDs. G02 sigue con **seis fechas útiles**, abierto; los lotes de agregados y las comprobaciones de esta entrega no suman fechas. El siguiente día útil tampoco cerrará G02 si falta calidad/frescura.

Las tres prioridades operativas son:

1. Corroborar las publicaciones pendientes con ID de tienda, SKU/MPN cuando exista, variante y ficha visible; resolver contradicciones con evidencia y conservar los casos sin atributos suficientes. Las cuatro candidatas RAM permanecen sin importar. No usar un SKU interno como MPN del fabricante.
2. Contrastar el primer runner automático posterior a 5f230b0: intentos, lecturas reales, comparables, tiempo por fase, fuente y errores. Al último acceso, los tres runs adaptativos disponibles usaban a2e2a88; por eso aún no hay medida real de costo/cobertura con esta entrega. No atribuir ahorro porcentual ni recuperación del proveedor a las pruebas.
3. Confirmar recepción GA4 de los eventos nuevos y realizar la primera extracción autorizada desde el **12/10**, usando días completos desde el 03/10, sin ceros sustitutos ni suma de usuarios de rutas equivalentes. La importación queda validada y atómica, pero no se ejecutó antes de esa fecha. Medir visitas, salidas y consultas recibidas por separado.

El monitor conserva estos controles, el G02 independiente y las reglas semanales de guías. Las propuestas de índices y el filtro global por tienda de 3.004 ms en el banco local siguen pendientes de planes/carga reales; esta entrega no acredita optimización total de las 36 fuentes.

## Tablero

Se creó el corte **outputs/project-tracker-2026-10-02-fuentes/Comparador-Hardware-Project-Tracker.xlsx** desde el tablero existente de 27/09. Sólo cambian C13, E13, C15, B50 y la altura de la nota. Conserva las **865 fórmulas**, Gantt, formato condicional, validaciones, paneles, hoja y nombres. La matriz de implementación queda en **MEJORAS-CODIGO-JEV-GA4-2026-10-02.csv**, con pendientes explícitos y fuentes, sin marcar G02 completo.


## Primera ejecución automática posterior — 02/10, 17:29 UTC

[Run 37039020510](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37039020510), HEAD 5f230b0, origen registrado cloudflare-fallback, sin despacho desde esta revisión. GitHub terminó success; el resultado interno fue deadline tras 17:11:54–17:29:07 UTC. Guardó **460 observaciones**, **238 comparables** de **1.499 intentos**, con **994 sin observación** y **45 fallos de fuente**. Los conteos cierran sin fallo de persistencia registrado. No se suman como productos únicos ni como otro día priority de G02.

Las fases medidas fueron: inventario 142.910 ms, preparación 12.030 ms, compartida 365.056 ms y rotación 499.748 ms. La reserva temporal dejó más de ocho minutos a la rotación. Se registraron **495 peticiones y 79.795.979 bytes decodificados** en 27 fuentes instrumentadas; no son bytes facturados ni prueba de ahorro porcentual. Katech completó **48/48** altas HTML, separadas de las 460 observaciones del barrido; los inventarios diarios quedaron deferred conforme a su agenda.

Cobertura al final: **9.245/34.240 (27,00%)** prioritarias observadas <=24 h; general **18.922/71.722**; **53.111** sin intento de cola. El denominador general aumentó en 48 altas. No alcanza la meta del 95% ni acredita identidad de todas esas observaciones. FullH4rd y Hardcore registraron bloqueos/backoff; se suspendieron intentos sin insistir a la tienda. Los 31 backoff skips no prueban 31 respuestas HTTP 429. El lote de componentes de CompraGamer y Dinobyte dejó muchas referencias sin lectura: hace falta corroborar IDs/URLs/presencia vigente, sin marcar agotamiento ni reasociar por similitud.

Nueva comprobación de los nueve IDs fijos, **17:36:01 UTC**: conserva **37/56** disponibles observadas <=24 h y **0/56** <=3 h, **0/9** fichas con oferta aceptada dentro de tres horas. El vencimiento continúa; este resultado no declara falta de stock. G02 sigue con seis fechas útiles y sus controles independientes.

El pendiente de primera medición del corte anterior queda cubierto por este artefacto, **FUENTES-E-IDENTIDAD-AUTOMATICO-2026-10-02.json**. M05 pasa a piloto medido, con continuidad/cobertura pendientes. El siguiente trabajo debe concentrarse en referencias sin lectura y asociaciones ambiguas, y en confirmar recepción GA4. El runner mantiene nuevas consultas Jev deshabilitadas; no hubo una consulta al MCP de decisiones.
