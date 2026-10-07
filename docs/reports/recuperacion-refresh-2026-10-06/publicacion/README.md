# Publicación y verificación pública

**Las dos entregas están publicadas y comprobadas en el sitio. La recuperación del catálogo continúa abierta.** Jonathan autorizó publicar la candidata con «si hacelo». Código publicado: `2dc40b81f13dce4dcd108a5689256144e368b70d`; integra confianza en ofertas, diagnóstico de actualización y protección de identidad RAM. Corte: noche del 06/10 en Santiago; 07/10 UTC.

Se integró mediante un push normal a `main`, desde `f899ced`, sin forzar ni alterar la copia principal con cambios pendientes. Cloudflare Workers Builds completó el build `614607af-f61d-42d7-8c19-c32bd3f836df`. La versión `5b529296-48ee-4431-a5e7-cc031a8667e9` quedó activa al **100%** a las **01:45:25 UTC**. Las 40 definiciones de bindings coinciden con la versión anterior; no se leyeron valores secretos ni se cambiaron cuentas.

[publicacion.json](publicacion.json) conserva identidades del código, despliegue, comprobaciones de GitHub y límites. Este informe y sus capturas son una unidad posterior de evidencia local, sin cambiar ni reemplazar el código publicado. La rama candidata original se conserva en `2dc40b8`.

## Qué quedó demostrado

| Control | Resultado y alcance |
|---|---|
| GitHub Verify, run [37558527304](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37558527304) | Aprobado sobre `2dc40b8`: lint/tipos, **1.688 unitarias**, dos omitidas previas, **25 operativas**, regresiones SQL y dos casos de concurrencia, **66 recorridos de navegador con datos aislados**. SQL ejecutado en PostgreSQL efímero de CI |
| Navegador público, datos reales | **14/14**, escritorio y móvil, cero retries, flaky, fallos u omisiones. Búsqueda, filtro/orden/paginación, paridad de IDs API/tarjetas/detalle, guardar/restaurar CPU en armador, guía, rutas retiradas y sitemaps |
| Confianza pública focalizada | CPU escritorio y GPU móvil: destacado/lista/destino coinciden, fechas originales conservadas, referencias separadas, sin desborde horizontal ni excepciones de página. Comparador conserva A/B al regresar; armador carga |
| HTTP público | **32/32** comprobaciones de rutas, búsqueda, precios/filtros, metadatos, errores, acceso admin, robots, sitemap, llms y guardas Worker |
| RAM pública | **4 GET / 4 HTTP 200**; ambas fichas sin mínimo reciente destacado. Kingston no devuelve GamersPoint 3600; Corsair LPX permanece como referencia explícitamente pendiente |
| Worker durante la prueba focalizada | **20 eventos**, todos de la versión nueva y con outcome `ok`; cero excepciones y logs de nivel error. Ventana filtrada de 100,99 s; máximo CPU 189 ms y wall 3.111 ms |
| Inspección visual | Revisadas las capturas CPU escritorio, GPU móvil y comparador al regresar. Texto de frescura/referencias legible, sin superposición o desborde en esos cortes |

El corte focalizado comenzó a las **01:53:22 UTC**. Ryzen 5600 mostró tres ofertas recientes y nueve referencias; mínimo **$233.700**, Gaming City, igual en destacado y primera fila. La GPU Aero RTX 4060 tenía una observación sin stock y ningún destacado comparable; el mensaje explica que no hay ofertas aptas sin afirmar agotamiento general. Son observaciones puntuales, no garantías de compra futura.

Las pruebas públicas no visitan tiendas, envían formularios o pulsan comprobaciones. El harness focalizado bloquea todos los métodos distintos de GET/HEAD; clasifica por separado los intentos bloqueados de limpiar sesión anónima y diagnósticos Cloudflare. No hubo una mutación inesperada de la aplicación. Las pruebas de armador guardan una selección local; **no certifican siete piezas comprables y compatibles**.

## Incidente operativo que sigue abierto

El ciclo natural de [Adaptive catalog refresh, run 37558743501](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37558743501), sobre el código publicado, terminó fallido. El artefacto retiene **`REFRESH_SEED_TIMEOUT`**, cero intentos, cero observaciones y cero comparables: no llegó a adquirir ni a visitar una tienda. `claimDiagnostic` está ausente porque el fallo ocurre antes del claim, al preparar la cola mediante `seed_catalog_refresh_queue`.

El código `57014` se deduce del mapeo de la implementación que emite `REFRESH_SEED_TIMEOUT`; no se conservó como error RPC crudo en ese artefacto. No identifica por sí solo una subcausa de servidor. El diagnóstico del incidente histórico de claim permanece separado. [incidente-adaptativo.json](incidente-adaptativo.json) conserva el corte nuevo y la comparación de implementación.

La comparación contra `f899ced` confirma que SQL/migraciones, nombre/argumentos de seed, workflow y wrapper no cambiaron. La llamada inicial y hasta dos reintentos con esperas de 500/1.000 ms ya existían; este código no define un timeout individual de la RPC. `phaseMs.preparation:0` no mide su tiempo fallido: ese contador sólo se asigna al terminar la preparación. El artefacto incluye una lectura de componentes de **8.103/34.413 en 24 h** y **1.302/34.413 en 3 h**; son observaciones existentes, no ofertas comparables ni recuperación aportada por este ciclo.

**Prioridad siguiente: reproducir y medir la preparación de cola antes de cambiar límites o reintentos.** Una cola que no termina de prepararse bloquea la utilidad de las reparaciones de fuentes. Después, corregir Maximus con detalle real corroborado y medir observaciones útiles con los denominadores existentes. Este run no cuenta como ciclo diario útil G02 ni acredita recuperación. No se despachó otro refresh desde esta tarea.

## Límites detectados

- El API conserva agregados históricos: Corsair RS devuelve `lowestPrice/highestPrice/averagePrice:276935` de una referencia LPX con stock desconocido e identidad conflictiva. El HTML no la destaca ni la presenta como comparable. Los lectores/agregados no cambiaron en este diff. Queda pendiente sanear o aclarar ese contrato; ejecutar una función local sobre el JSON no demuestra por sí solo el comportamiento servido.
- Kingston devuelve ocho referencias por API y nueve en HTML, incluida otra publicación Katech con fecha antigua. Ninguna se destaca como mínimo reciente. Esta diferencia requiere revisar lectores/cache sin aprobar identidad ni rejuvenecer fechas.
- Una primera lectura de listado GPU tardó **9.553 ms**; en el ensayo final, **1.784 ms**. El sitemap-index respondió 200 en **10.092 ms** y ese corte sólo enumeró el sitemap general. Son límites de latencia/contenido observados; no prueban una mejora sostenida, p95 o indexación completa.
- El primer probe de sitemap-index con urllib devolvió 403; el GET posterior con fetch devolvió XML 200. No se atribuye causa a ese rechazo sin evidencia adicional.
- El primer ensayo focalizado falló en su guardia de red al incluir diagnósticos Cloudflare y limpieza anónima entre mutaciones inesperadas. Todas las aserciones de producto habían pasado. Se corrigió esa clasificación conservando el bloqueo y las aserciones de precio, fecha, identidad y destino; el ensayo final aprobó.
- Meta del 95%, cobertura por fuente y muestra G02 siguen vigentes. No hay un nuevo corte de cobertura ni evidencia de retorno externo o ingresos. Versus permanece aplazado.

## Reproducir y conservar la evidencia

Desde la raíz de la worktree, ejecutar `PUBLIC_QA_OUTPUT_DIR=tmp/publicacion-repetida npx playwright test --config=playwright.public.config.ts public-site.spec.ts global-price-search.spec.ts --reporter=line,json`. Ejecutar `OFFER_CONFIDENCE_REPORT_DIR=tmp/confianza-publica-repetida node scripts/qa/verify-public-offer-confidence.mjs` para el corte focalizado; sólo admite HTTPS en el dominio público autorizado. Ejecutar `PUBLIC_QA_OUTPUT_DIR=tmp/http-publico-repetido PUBLIC_QA_WORKER=1 node scripts/validate-public-site.mjs` para HTTP. Los datos y resultados pueden cambiar con el catálogo real.

El harness calcula las expectativas con las funciones locales. Antes de atribuir otra repetición al release `2dc40b8`, verificar que esas fuentes corresponden a esa revisión y que esa versión sigue activa; el dominio o un HTTP 200 por sí solos no lo demuestran. Esta repetición sí conserva integridad de fuentes y los eventos identifican el Worker nuevo.

[navegador-publico.json](navegador-publico.json), [confianza-publica.json](confianza-publica.json), [http-publico.json](http-publico.json), [ram-publica.json](ram-publica.json) y [worker-publico.json](worker-publico.json) son evidencia seleccionada. [integridad.json](integridad.json) registra sus SHA256 y los de las capturas. Logs completos, headers, cookies, mensajes de error y rutas de challenge quedan en `tmp/` ignorado; no forman parte de esta unidad.

Frontera de reversión de la **evidencia**: retirar este directorio, el harness público y los enlaces añadidos a ambos informes; no altera código productivo. La versión Worker anterior `626c0842-a969-42bb-9f44-f43fc2b353c2` queda identificada como referencia para una eventual reversión operativa, que no se ejecutó. El incidente nuevo no demuestra una regresión que justifique retirar las guardas de identidad/precio.
