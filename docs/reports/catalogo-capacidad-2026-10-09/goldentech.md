# GoldenTech: lector e integración probados localmente; publicación pendiente

Corte: 10/10/2026 02:12–02:19 UTC (09/10, 23:12–23:19 Santiago). Copia exclusiva `work/benchmarks-maximus-2026-10-09/repo`, rama `codex/goldentech-capacidad-20261009`, base `64a083088db20e94627d44b93f4cf1c6b4e99620`. Sin publicación, refresh remoto, escrituras DB remotas, credenciales, leases remotos ni cambios Maximus. La integración posterior usa PostgreSQL local aislado.

## Causa reproducida

El cero no demuestra una tienda sin stock. Hay dos causas distintas:

- Publicaciones retiradas: RAM XPG vieja, SkyHawk 8TB con sufijo `-2` y fuente ASUS TUF 1000W EVO devolvieron 404. Consulta API de seis referencias reales de producción devolvió sólo dos; no se reemplazan las cuatro ausentes por productos parecidos.
- Plantilla nueva incompatible: la misma RX 9070 puede responder con la ficha Impreza (`h1.entry-title`, `.product_field.price`, `.sku`) o con `.gt-ficha__title`, `.gt-ficha-cash__now` y `.gt-ficha__sku`. La solicitud de control del lector usa `SCRAPE_HEADERS` y recibió la segunda. `parseWooProductDetail` retornaba vacío por no reconocer su título; `verifyWooStoreProducts` lanzó `inconsistent-source` y rechazó todo el lote aunque API y DOM coincidían en precio, stock, SKU e ID.

Reproducción real antes: solicitudes 17/18, API 200 con dos registros, control 200, error `inconsistent-source`. Después: solicitudes 19/20, mismo lote de seis referencias y mismo transporte, dos observaciones de fuente. Esa primera captura no las persistió; la integración local posterior se describe abajo. El artefacto del ciclo anterior aportado por el coordinador registra GoldenTech 59 solicitudes, cero fallos de transporte y cero backoff; esto coincide con el defecto de corroboración. No atribuir todos los resultados históricos al único caso reproducido.

## Cambio mínimo

- `src/lib/scrapers/woocommerce-shared.ts`: reconoce exclusivamente la ficha personalizada GoldenTech, exige un principal, un título, un importe de efectivo/transferencia, canonical concordante y un ID inequívoco. Lee stock/SKU del principal, excluye recomendaciones `.gt-ficha-related` y conserva rechazo de variantes, moneda extranjera, reservas y ausencia de precio visible. No usa metadata para sanar el importe faltante de esta plantilla.
- `src/lib/scrapers/woocommerce-known-batch.ts`: etiqueta el importe GoldenTech corroborado como `special` (transferencia/efectivo), preserva centavos y añade rechazo de ID de publicación discordante entre API y DOM para GoldenTech. Mantiene la tolerancia vigente de un peso, el contraste de título, stock y SKU, y la observación original de API.
- `src/lib/scrapers/goldentech-detail.test.ts`: fragmento real de la nueva plantilla y negativos sintéticos identificados por sus modificaciones.

El precio API de RX 9070 `146022688` en unidad menor ARS de dos decimales coincide con `.gt-ficha-cash__now` `$ 1.460.226,88`. La ficha informa transferencia/efectivo; el importe para tarjeta/Mercado Pago es `$ 1.635.454,11`, el financiado `$ 1.898.294,94` y el importe sin impuestos `$ 1.206.799,07`. Ninguno de esos tres reemplaza al precio de transferencia. Se sigue el contrato compartido ya existente de MaxTecno: semántica por fuente y corroboración visible al inicio de ejecución. Si GoldenTech empieza a mezclar condiciones en su API, será necesario un contexto que guarde la condición corroborada por fuente; un Set de fuentes verificadas no transporta esa semántica.

**Integración local aprobada:** la migración `20261010022023_allow_goldentech_observed_special_price.sql` admite únicamente `special` de GoldenTech sobre la definición productiva constatada. Un guardia MD5 detiene su aplicación si esa definición cambió. No publicar el lector sin esta migración: producción aún conserva la lista anterior. La prueba local guarda ambas capturas sin alterar precio, stock, identidad ni fecha; sólo el HDD es comparable, la GPU queda pendiente de identidad.

## Verificación

- Antes: 13 pruebas nuevas, cinco fallaron por título/principal vacío y rechazo del lote; ocho negativos ya pasaban. Registro `tests-before.txt`.
- Después: cuatro archivos, 76 pruebas aprobadas (incluye 13 nuevas y las suites compartidas de WooCommerce y descubrimiento). Registro `tests-after.txt`.
- ESLint de los tres archivos: aprobado, salida vacía en `lint.txt`.
- Lote público real con el lector corregido: seis destinos, dos productos observados; dos solicitudes, sin fallos de transporte. `live-batch.json` conserva destinos, campos y métricas.
- Verificación integrada posterior: lint y TypeScript, **2.449 unitarias aprobadas / 2 omitidas**, **199 operativas**, build Next y **106 E2E**. Empaquetado OpenNext y Wrangler `--dry-run` aprobados con configuración local de prueba; ese bundle no se sube a producción. Incluyen ocho recorridos GoldenTech a 1440 y 390 px; las suites usan APIs sustituidas sobre el producto real mapeado desde SQL local, no una recuperación productiva.

## Casos reales para navegador

| Caso / URL | Lectura UTC | Resultado de fuente | Qué verificar |
|---|---|---|---|
| [RX 9070 GIGABYTE GAMING 16G](https://goldentechstore.com.ar/producto/placa-de-video-gigabyte-amd-radeon-rx-9070-gaming-16g/) | API 02:19:20.920; DOM 02:19:23 | ARS 1.460.226,88; `in-stock`; ID 185476; SKU EL_GIGPDV9070G16; `special` | Título/variante, transferencia/efectivo y su diferencia con tarjeta; botón y disponibilidad 24–48 hs. |
| [SkyHawk 4TB SATA 64MB](https://goldentechstore.com.ar/producto/disco-duro-int-4tb-sata-6-gb-s-64mb-skyhawk/) | DOM 02:15:05; API 02:19:20.920 | ARS 423.813,07; `in-stock`; ID 184160; SKU EL_SEAHDSKY4TVX016; `special` API | Nombre completo, capacidad 4TB y condición de pago; se corroboró DOM antes del lote, el control compartido del lote posterior fue RX 9070. |
| [ASUS TUF GAMING 1000W EVO](https://goldentechstore.com.ar/producto/fuente-gamer-asus-tuf-gaming-1000w-evo/) | 02:15:11 | HTTP 404 y ausente API | Conservar ausencia de observación, sin rejuvenecer precio histórico ni inferir agotamiento. |

El caso de mother ROG Strix Z890-A asociado en catálogo a Prime Z890-P WiFi permanece negativo de identidad; no se sana cambiando su URL ni título. No se observó directamente su página, sólo ausencia de su slug en este lote API.

## Evidencia y límites

Directorio externo asignado: `work/catalogo-capacidad-2026-10-09/goldentech/` bajo el proyecto local. `requests.json` registra las **20/20 solicitudes**, incluidos redirects, URL, hora, HTTP, bytes, User-Agent y archivo. Intervalo mínimo entre fin e inicio de solicitudes: 2,1 s. No hubo 403/429. El especialista no realizó lecturas adicionales después de agotar ese límite. El coordinador abrió después una ficha HDD en Chrome para corroborar manualmente precio, SKU y condición visibles; esa visita y sus recursos no forman parte del presupuesto de solicitudes programáticas.

- `request-13.html`: ficha antigua RX 9070, User-Agent `Mozilla/5.0`, 02:15:01 UTC.
- `request-18.html`: ficha nueva exacta que produjo error con `SCRAPE_HEADERS`, 02:16:13 UTC; `new-template-fragment.html` conserva sólo canonical, moneda, precio, título, SKU, stock e ID.
- `request-20.html`: ficha nueva exacta después del arreglo; API `request-19.json`.
- `live-batch-before.json`, `live-batch.json`, `offline-reader-current.json`, `offline-reader-targets.json`, pruebas y resultados; `previous-run/catalog-adaptive-result.json` y `production-targets.json` aportados por el coordinador.

La API informó 1.647 publicaciones; ese total no demuestra productos comprables ni cobertura completa. Categorías API: procesadores 60, RAM 116, GPU 50, motherboards 108, fuentes 83, con categorías padre/hijo superpuestas. Hallazgo independiente: `/product-category/procesadores/` redirige a la landing `/procesadores/`, con 12 tarjetas; `/categoria/procesadores/` muestra 24 tarjetas en la primera página. El descubrimiento genérico aún usa la primera ruta. No se modificó ese flujo ni se recorrieron todas sus páginas; tratarlo como próxima unidad separada.


## Corrección de cuatro P2 de revisión — 10/10/2026 02:28 UTC

El replay independiente mostró que siete negativos podían ingresar al lote: título principal vacío suplido por un relacionado, precio/ID faltantes o IDs contradictorios sanados por JSON-LD, precio o principal ocultos y canonical adicional discordante. Era un defecto local real: la suite inicial del arreglo no cubría estos caminos completos. Se corrigió antes de la publicación.

- Nombre GoldenTech exclusivamente de `h1.gt-ficha__title` del principal; texto visible vacío termina en rechazo, sin buscar otro título.
- `.gt-ficha` presente conserva el rechazo del parser estricto: `fetchWooCommerceKnownOffer` no invoca el fallback genérico JSON-LD para esa ficha, incluyendo errores de ID, importe y canonical.
- Principal y señales excluyen nodos o ancestros con `hidden`, `aria-hidden="true"`, `display:none` o `visibility:hidden` inline. Se elimina también el texto de descendientes ocultos antes de interpretar título, precio, SKU y texto de stock. No se pretende simular CSS externo/computed styles; la evidencia sigue siendo HTML estático.
- Todos los enlaces canonical de la ficha deben corresponder a la publicación consultada. Se normalizan relativos, `www`, slash final y parámetros de tracking mediante URL y `sameListing`; canonicals equivalentes se admiten, contradictorios/malformados/vacíos se rechazan. No se elige el primero para resolver un conflicto.

Nuevas pruebas de lote completo agregan JSON-LD plausible a cada principal incompleto/contradictorio; incluyen las cuatro formas de ocultamiento y contenido oculto dentro del precio. Se preservan controles positivos de canonicals equivalentes y señales secundarias ocultas.

Evidencia antes: `tests-review-before.txt`, **31 fallos de 45 pruebas**. Después: `tests-review-after.txt`, **cuatro archivos / 108 pruebas aprobadas**; `lint-review.txt` vacío (aprobado). `guard-review-replay.cjs/.json` ejecutan una copia del script independiente sin modificar el artefacto original: captura completa `request-20.html` continúa aceptada (un producto), los siete negativos ahora retornan vacío y el lote falla con `inconsistent-source`. Transporte sustituido offline: **cero solicitudes remotas nuevas**; el presupuesto permanece 20/20.

El cambio adicional está limitado a `woocommerce-shared.ts`, `goldentech-detail.test.ts` y este informe; se conserva el cambio previo de condiciones/ID en `woocommerce-known-batch.ts` y los archivos SQL del coordinador. La nueva prueba offline no renueva las fechas del corte público, no persiste productos ni acredita recuperación de producción. La rerevisión independiente cerró los cuatro P2 y luego comprobó la coherencia de fixture, recibos SQL e identidad; no encontró nuevos defectos materiales. Publicación y recuperación natural siguen pendientes.


## Integración, página y reversión — coordinador

`persistence-proof.mjs/json` recorre la respuesta pública capturada → lector API → worker conocido → revisión de identidad vigente → función SQL local → mapper de lectura. La observación de ambas ofertas sigue siendo **10/10/2026 02:19:20.920 UTC**. Antes de la migración ambas devolvían `false` y conservaban su fila anterior; después se guardan con centavos y `special`. El HDD es elegible; la GPU conserva `needs-review/provider-unavailable` porque la identidad no obtiene prueba exacta en este laboratorio sin proveedor. No se modifica su título ni se inventa un dictamen.

El replay completo aplica **84 migraciones** y aprueba **17 archivos / 18 grupos SQL**, incluyendo concurrencia. Se preservan OID, propietario, ACL, `SECURITY INVOKER` y `search_path`. El bootstrap local sin modificaciones carece de permisos de tabla para `service_role`: el primer intento falló y queda en `sql-ci-initial-local-grants.*`. La prueba funcional posterior usa el propietario local, sin nuevos grants o BYPASSRLS. Acredita el comportamiento SQL y la conservación de permisos de función, **no una invocación productiva de service_role**.

`sql-rollback-replay.json` acredita reversión local a MD5 `062951d3e6d564e00328c24830b09e0e`, reaplicación al nuevo `bc53f4bbe746975547df512daf4b384c`, propiedades intactas y rechazo de aplicación sobre definición distinta. La reversión preparada no elimina observaciones. Cada laboratorio detuvo y eliminó exclusivamente su propio clúster temporal.

En Chrome, la ficha real del HDD mostró SKU `EL_SEAHDSKY4TVX016`, **$423.813,07 transferencia/efectivo**, tarjeta **$474.670,64** y disponibilidad **24–48 h**. El título indica 64 MB mientras la descripción indica 256 MB: esa discrepancia de texto del comercio no se normaliza ni se usa para cambiar la variante. La prueba de precio no acredita esas especificaciones.

La página real de la candidata se sirvió localmente con el resultado SQL capturado mediante un proxy GET limitado a loopback. Búsqueda interactiva: HDD a $423.813 (presentación habitual en pesos enteros), Golden Tech y fecha original; GPU aparece como ficha sin oferta comparable. Verificados 1440/390 px reales, sin desborde horizontal; consola sin errores/advertencias. `ui-desktop.png`, `ui-mobile.png` y `ui-pending-identity.*` conservan evidencia. Los servidores y pestañas de prueba se cerraron; no se modificó la web pública ni su analítica.

La recuperación remota exige publicación autorizada de esta unidad, aplicación de su migración y luego un ciclo natural con ACK/fila/API/UI corroborados. Cuatro slugs ausentes y la identidad pendiente permanecen fuera del resultado válido. La causa de descubrimiento por landing de categorías queda para otra unidad, sin ampliar este cambio.
