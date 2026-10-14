# Seguimiento posterior a la publicación — 14/10/2026

La guía de $3M conserva **7/7 ofertas por ARS2.847.725** en tienda, copia servida, API y página pública. Tres ciclos naturales de la Mac confirmaron la nueva copia. **La sincronización completa no está sana:** el primer proceso de guías de GitHub sobre la versión publicada falló al cargar una dependencia. Hay correcciones locales para ese arranque, Katech y el diagnóstico del puente; todavía no se activaron.

Commits locales revisados: `66039ea` (arranque Node), `63b1c14` (diagnóstico del puente) y `87e7b78` (fichas Katech y stock conservador). No están en producción.

Fuente de partida: `13acc7413cb1f2a95bde8229d69bda9a49dc1f2d`, rama `codex/correcciones-integrales-local-20261013`. La copia principal y el seguimiento de dirección se consultaron sin modificar sus archivos. Los siguientes resultados no renuevan la selección editorial ni acreditan ventas, retorno de usuarios o cobertura completa.

## Guía y precios

Comprobación de las siete publicaciones: 14/10 a las 13:32–13:33 UTC. Se consultó una vez el catálogo estructurado y se abrieron las siete fichas en Chrome, sin carrito ni compra. SKU exactos, stock informado, botón de compra y pago por depósito/transferencia coinciden. Ningún precio cambió respecto de la publicación.

| Pieza | SKU en comercio | Precio especial ARS | Última observación guardada UTC |
| --- | --- | ---: | --- |
| Ryzen 5 7600 con cooler | 100-100001015BOX | 360.150 | 14/10 12:53:25.241 |
| ASRock RX 9060 XT Challenger 16 GB | RX 9060XT CL 16GO | 947.350 | 14/10 12:53:25.241 |
| KLEVV BOLT V 32 GB, 2×16, DDR5-6000 CL28 | KD5AGUA80-60B280H | 872.200 | 14/10 12:32:19.247 |
| Kingston NV3 1 TB | SNV3S/1000G | 289.050 | 14/10 12:32:19.247 |
| MSI B650M Gaming WiFi | B650M GAMING WIFI | 188.985 | 14/10 12:32:19.247 |
| ASRock Steel Legend 750 W | SL-750G | 130.000 | 14/10 12:53:25.241 |
| Gabinete Antec | 0-761345-10232-2 | 59.990 | 14/10 12:32:19.247 |
| **Total** | | **2.847.725** | |

A las **13:37:58 UTC / 10:37:58 Santiago**, la guía pública mostró siete enlaces exactos y ese total en escritorio 1440 y móvil 390, sin desborde ni errores de página o peticiones funcionales en el recorrido guía → motherboard → regreso → portada. Analítica rechazada en contextos aislados, cero solicitudes GA/GTM detectadas. Un prefetch rechazado por Cloudflare por vista se clasificó aparte mediante cabeceras exactas; no se ocultaron otros 503.

Control posterior al tercer ciclo a las **14:02:37 UTC / 11:02:37 Santiago**: SQLite servida, API y documento público mantienen 7/7 y ARS2.847.725. Generación `mac-refresh-1791985773253`, ACK y hash concordantes. Este control no repite la revisión visual de 13:37.

La fecha de esta comprobación no reemplaza la fecha propia de las ofertas. Se cotejó la observación almacenada por URL, SKU, tienda, precio, stock y fecha; la deduplicación puede usar una fila agrupada más reciente de la misma publicación. Se conserva el máximo editorial de ARS3.300.000 y las comprobaciones de compatibilidad/extras documentadas en [GUIA_3M.md](GUIA_3M.md).

## Ciclos automáticos y límites

No se despachó ningún refresh ni se reinició el servicio en este seguimiento. El LaunchAgent existente conserva intervalo de 900 segundos; las horas reales de comienzo y final se registran por separado. Son ciclos Mac, no días útiles de la muestra G02 ni ejecuciones cron de GitHub.

| Comienzo UTC | Observadas / intentadas CompraGamer | Recibidas / únicas del puente | Admitidas / rechazadas | Resultado |
| --- | ---: | ---: | ---: | --- |
| 13:18:16 | 351 / 356 | 477 / 477 | 282 / 195 | Promovido, ACK confirmado 13:18:46 |
| 13:33:46 | 6 / 6 | 1.000 / 1.000 | 0 / 1.000 | Promovido, ACK confirmado 13:34:16 |
| 13:49:16 | 31 / 32 | 1.000 / 993 | 0 / 993 | Promovido, ACK confirmado 13:49:46 |

No se suman estos conteos como productos únicos. La selección depende de qué ofertas vencen; seis intentos no prueban por sí solos una regresión. El segundo y el tercer puente llegaron a su límite y los recibos publicados aún no conservan las razones de sus rechazos: no se atribuyen todos a GoldenTech ni a duplicados.

Último corte de cobertura de esa copia, 13:49:42 UTC: **6.593 observaciones recientes y 4.486 comparables recientes sobre 73.827 ofertas**, ventana de 24 horas. Sólo 2.698 destinos están soportados por la rotación local; 71.129 no lo están. Esto no equivale a ofertas comprables de tres horas ni al universo Supabase. El vencimiento de la ventana también reduce conteos entre cortes; no se atribuye esa diferencia a pérdida de filas. Presupuesto local registrado a las 14:02: 93.841/1.000.000 operaciones; es una política de la Mac, no una cuota de proveedor.

## Errores y cambios preparados

**Arranque del productor GitHub.** El [run 38569747409](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/38569747409), iniciado automáticamente por el respaldo Cloudflare sobre `13acc741`, falló el 14/10 a las 13:12:04 UTC con `ERR_MODULE_NOT_FOUND` al importar `next/server`. El colector de portada falló igual. No hay evidencia de observaciones de ese intento; su recibo declara persistencia desconocida.

La reproducción local antes del arreglo falla al cargar el módulo, antes de alcanzar las guardas del runner. La corrección conserva el módulo real y resuelve los subpaths `next/server` y `next/headers` con la extensión `.js` requerida por Node ESM. El helper sólo se usa en los bundles CLI de actualización y medición; no modifica la aplicación Next ni permisos. Nuevas pruebas cargan el grafo real y comprueban que una ejecución sin autorización se rechace, además de importar los dos colectores desde un temporal como en Actions. Las pruebas anteriores sustituían los runners y no cubrían esta dependencia.

**Katech.** Nueve peticiones públicas acotadas entre 13:33 y 13:38 UTC confirman un rediseño de fichas. El lector anterior devolvió `null` para cinco capturas; el nuevo recupera SKU, ID, precio visible y condición de pago en las cinco. Cuatro informan reserva de 24/48 horas y siguen como stock desconocido. La quinta tiene stock pero es una PC sin RAM: no acredita un armado completo. Se preservan canonical/ID, precio principal, rechazo de moneda extranjera, layout anterior y separación entre descubrimiento API y oferta observada. El importador conserva la condición probada y rechaza un ID explícito contradictorio. No se persistieron estas reproducciones.

**GoldenTech.** Una lectura pública acotada a las 13:40:12 UTC encontró la observación del 14/10 10:16:18.351 con precio ARS1.202.121,97, stock informado y prueba abreviada a `model`. SQLite/API conservan 11/10 18:49:20.003 y stock desconocido. El productor del código actual ya genera los once atributos requeridos. El replay local acredita que la prueba abreviada sigue rechazada y que una revisión regenerada desde la evidencia capturada pasa únicamente en memoria, sin alterar precio, fecha o stock. No se copia esa aprobación a producción. Falta recuperar el runner y comprobar una observación natural nueva, admisión, ACK y API/tienda.

**Diagnóstico del puente.** El cambio local conserva conteos por tienda y motivo en los recibos, sin IDs, títulos, URLs ni mensajes arbitrarios. Valida sumas y límites, agrupa tiendas desconocidas, y mantiene `null` para productores antiguos que no entregan detalle. Un diagnóstico presente pero inconsistente impide promover. No modifica admisión de identidad, presupuesto ni frecuencias.

**FullH4rd.** Una lectura directa de categoría a las 13:33:09 UTC devolvió 403 y desafío de acceso. Se detuvo esa tienda, sin evasión ni observaciones nuevas. El estado del transporte desde GitHub requiere sus propios recibos; este corte sólo prueba el bloqueo desde el proceso local. Un arreglo de parsing no elimina ese bloqueo.

## Verificación y próxima evidencia

- Arranque y supervisión: **40/40**, tanto con Node local 26.5.0 como con **Node 22.23.3 de Actions**. Binario aislado obtenido de nodejs.org y hash contrastado con su manifiesto, sin instalación global.
- Puente/job Mac: **48/48**; runner Mac: **13/13**; replay GoldenTech: **8/8**.
- Katech/importador: **99/99** y cinco capturas reales con antes/después. La revisión independiente encontró dos P2 locales —importe exclusivamente tachado y negación de stock—; se reprodujeron once fallos antes de la corrección y se añadieron doce controles. Una segunda revisión detectó la variante «No está en stock»; se reprodujeron cinco fallos y se añadieron otros doce controles. Las negaciones ambiguas quedan unknown y nunca se activan por clase o subcadena positiva. Los cinco cuerpos originales conservan sus precios, SKU, condición y cuatro stocks desconocidos/uno informado.
- La revisión independiente final de Katech pasó **31 controles**: cinco capturas originales, doce casos de negación, ocho de disponibilidad positiva, cuatro de disponibilidad limitada y dos sin texto de stock. Los dos hallazgos P2 quedan cerrados en local, sin nuevos hallazgos materiales. También se revisaron los imports reales de Node 22 y los contratos de diagnóstico del puente.
- ESLint focal, TypeScript completo y diff sin errores.

La recuperación de producción permanece pendiente: publicar este lote con la autorización correspondiente, dejar transcurrir el siguiente ciclo natural y exigir el resultado de cada oferta, no sólo un workflow verde. El seguimiento diario existente conserva horario y permisos; no se crea otro monitor ni se despachan ciclos para producir evidencia artificial.

[Evidencia seleccionada con URLs, horarios, recibos y límites](SEGUIMIENTO_2026-10-14_EVIDENCIA.json). Capturas, cuerpos y logs completos están en `outputs/seguimiento-post-publicacion-2026-10-14/` de esta copia; no incluir ese directorio completo en Git. Reversión de los cambios locales: revertir únicamente las unidades de código de este seguimiento, sin restaurar DB, runtime o trabajo ajeno.
