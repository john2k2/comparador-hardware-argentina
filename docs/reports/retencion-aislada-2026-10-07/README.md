# Retención aislada y capacidad con costo cero

Jonathan confirmó el 07/10/2026: **mantener costo cero y aceptar límites de alcance**. Es una decisión de presupuesto; no autoriza borrar historial, retirar índices, cambiar planes ni reducir la muestra de cobertura. El objetivo de ofertas fiables y vuelta de usuarios, ambos recorridos y G02 conserva sus condiciones.

## Resultado comprobado

La propuesta local de historial quedó en `eac9b6a`, desde `e420dc0`, rama `codex/retencion-comprobable`. [PLAN.md](PLAN.md) conserva el estado previo a la lectura productiva. La actualización vigente es este informe: el preflight productivo **sí completó**, el piloto mutante **no se ejecutó**. El código público sigue en `99d5917`; no se publicó esta candidata.

La lectura productiva del 07/10 a las **15:59:47.196007 UTC** examinó 1000 filas y encontró **36 candidatas** según la política 14/90/365 días. Conservó 147 filas recientes/futuras y encontró cero anteriores a 365 días dentro de esa ventana. Es un conteo exacto de la ventana y un límite inferior observado, sin estimación del total ni de bytes recuperables. No certifica que esas 36 filas sigan elegibles en un snapshot posterior.

[Recibo productivo](lectura/preflight-productivo.json) y [SQL exacto ejecutado](lectura/preflight-productivo.sql): transacción READ ONLY, cursor inicial explícito mediante ajuste local, timeout de tres segundos y ROLLBACK. No exportó IDs de productos, ofertas, usuarios ni cursores. Permisos compatibles y sin triggers/reglas DELETE ni cascadas salientes en ese corte. El tiempo cliente de 3183 ms incluye servicio/red y no es tiempo SQL ni una medición de latencia del producto.

## Verificación y alcance

Once grupos de escenarios en PostgreSQL 17.11 propio aprobaron conservación de fronteras, última observación del bucket completo, separación de oferta/tienda/producto, cuatro lotes de 250, conflicto de bloqueos, modificación/inserción concurrente, filtrado por RLS sintética y timeout. ROLLBACK conservó todas las filas; los commits fueron exclusivamente sintéticos. El cluster fue detenido. [Evidencia reproducible](evidencia-local.json), [harness](test-history.mjs) y [revisión independiente](revision-independiente.json), sin hallazgos materiales. La revisión no autoriza una operación destructiva.

Reproducción focalizada: `node docs/reports/retencion-aislada-2026-10-07/test-history.mjs`. El harness rechaza un servidor ajeno en su puerto, no acepta conexiones remotas ni carga las credenciales del proyecto. Los tiempos locales no predicen el costo en Supabase. No hubo cambios de aplicación: build y recorridos generales nuevos son N/A para esta unidad SQL de preparación.

La unidad integra preflight, piloto, fixture y oráculo/concurrencia: **591 líneas escritas**, más 410 generadas. Se hizo un pase de separación por comportamiento; separar sólo tipos de archivo habría dejado pruebas dependientes de un piloto ausente. Se conserva la unidad revisada y se reporta el exceso sobre 400; no se recortaron comentarios/pruebas ni se abrió una PR. Recomendación para una futura PR: declarar `size:exception` o diseñar una extracción de harness independiente con su propia verificación. Reversión local: retirar los seis archivos de `eac9b6a`, sin tocar contratos publicados. Después de un futuro COMMIT remoto no hay restauración demostrada.

## Mediciones que no deben confundirse

El frente anterior agotó tres consultas de conteo con timeout de tres segundos; sus conteos globales quedaron desconocidos. [Medición anterior](medicion-previa/PLAN.md) y [plan sin ANALYZE](medicion-previa/plan-sanitizado.json) muestran cinco SubPlans derivados de inlining, no cinco ejecuciones medidas. El preflight corregido materializa el cálculo y completó. No se repitieron los agregados globales, no se aumentó timeout ni se añadieron índices.

La base medía **929.205.395 bytes**, caché **245.424.128**, historial **176.209.920**; los índices del historial ocupaban **133.300.224**. La lectura nueva confirmó esos tamaños del historial. El piloto anterior eliminó exactamente 1000 eventos vencidos de caché y no disminuyó los tamaños físicos medidos. DELETE puede dejar espacio reutilizable y no demuestra bajar la cuota.

Aun restando hipotéticamente toda la caché quedan 683.781.267 bytes. Restar además todo el historial dejaría 507.571.347, sin margen suficiente frente a una referencia de 500 MB. Es una cuenta ilustrativa, **no una propuesta de eliminar esas tablas ni una prueba de reducción física realizable**. [Medición de relaciones e índices](../retencion-2026-10-07/capacidad/evidencia.json).

## Decisión y próximo trabajo

Presupuesto cero confirmado. Conservar búsqueda, comparación, armador, identidad, frescura y muestra G02; posponer ampliación de fuentes/categorías y funciones que añadan almacenamiento hasta demostrar un tamaño sostenible. No reducir el denominador para aparentar recuperación. La compactación de 36 candidatas observadas no demuestra resolver capacidad y no justifica pedir permiso de borrado como trámite.

La [inspección acotada de capacidad](costo-cero/PLAN.md) y sus [metadatos](costo-cero/evidencia.json) separan tres candidatos:

| Candidato | Tamaño observado | Decisión de coordinación |
|---|---:|---|
| Una copia de `products.updated_at DESC` | 1.400.832 B | Duplicado exacto en claves, opciones, opclass, collation y dependencias inspeccionadas a las 16:05:27 UTC. Retiro preparable, pospuesto por escaso impacto sobre capacidad. |
| Índice histórico producto/tienda/tiempo | 33.030.144 B | Conservar: no duplicado exacto, planes y cargas pendientes. Cero scans registrados no prueba que sobre. |
| Índice histórico global por fecha | 5.881.856 B | Conservar: perder “Bajaron de precio” por este ahorro no resuelve el problema. |

Incluso restando los tres índices y toda la caché de manera hipotética quedarían **643.468.435 B**, 143.468.435 sobre la referencia decimal de 500.000.000 B. No se retiró ningún índice. Los tamaños del inventario anterior y del duplicado nuevo mantienen fechas distintas. El especialista recomienda preparar el duplicado; dirección lo considera mantenimiento secundario frente a una solución sostenible de almacenamiento. No se confunde esa recomendación con un cambio ya ejecutado.

El siguiente diseño debe limitar el almacenamiento que se genera, definir qué se conserva y comparar una candidata local de catálogo/historial/índices con ambos recorridos y G02. La capacidad no queda cerrada por congelar ampliaciones. Tampoco se presupone que reducir catálogo sea compatible con la muestra vigente: ese recorte necesitaría una decisión concreta con su pérdida de cobertura visible.

## Ciclo natural observado

El tail de la versión pública `652e3c18-4182-43d1-9d98-5f10afd67aa8` registró el evento `11 * * * *`, programado a las **16:11:09 UTC**, recibido a las **16:11:26.998289 UTC**: outcome `ok`, cero excepciones, `Catalog scheduler completed`, resultado **`deferred`**. [Recibo saneado](lectura/scheduler-tail.json). En `src/lib/catalog/scheduler.ts:58-67`, ese resultado corresponde a `check_api_rate_limit.allowed=false`; ese camino no envía el POST de dispatch. No se atribuye a falta de stock, fallo de scraping ni recuperación del catálogo.

La [ventana previamente medida](../retencion-2026-10-07/ciclo-natural/scheduler-gate.json) terminaba a las 16:11:32.516526 UTC; el evento terminó unos segundos antes. Esto es consistente con la postergación, no demuestra que el dispatch anterior haya sido aceptado ni explica su resultado perdido. No se modificó la guarda, se reinició el bucket ni se despachó manualmente. El observer terminó a las 16:12:31 UTC y no dejó procesos de tail. Diecinueve eventos no programados sólo se contaron: no se guardaron sus URLs, headers, cookies ni logs crudos.

El [listado inicial de GitHub](lectura/natural-inicio.json), 15:47:38 UTC, tenía como último run `37626593331`, código anterior `2dc40b8`. Las dos lecturas posteriores agotaron 20 y 10 segundos; [corte final](lectura/natural-final.json). El listado actual queda desconocido: esos timeouts no prueban ausencia de una ejecución. No se acredita un ciclo nuevo completo con observaciones guardadas/comparables de `99d5917`. D02/G02 sigue abierta hasta demostrar continuidad, cobertura y capacidad.

La captura inicial se corrigió al quitar un sampling-rate inválido para Wrangler; [diagnóstico sin credenciales](lectura/tail-diagnostico.json). Ese error del observer no es un fallo del scheduler. El [helper de captura](lectura/observe-scheduler.py) conserva sólo enums/códigos permitidos y metadatos programados; no sirve como monitor persistente ni crea una automatización.

La [copia del estado de dirección](direccion-corte/README.md) conserva el corte anterior al commit final de evidencia; los documentos de la copia principal siguen siendo la entrada vigente y no se mezclaron sus cambios ajenos. [Integridad de los artefactos](integridad.json) registra SHA-256 de cada archivo, incluidos snapshots generados. Esta unidad se revierte retirando README, costo-cero, lectura, direccion-corte y los dos recibos de revisión/integridad; conserva la propuesta `eac9b6a`, la medición `9acaefb`, el wrapper local y el código público.

Referencias: [cuota y tamaño de Supabase](https://supabase.com/docs/guides/platform/database-size), [recuperación de espacio PostgreSQL](https://www.postgresql.org/docs/17/routine-vacuuming.html#VACUUM-FOR-SPACE-RECOVERY). Una operación física, retiro de índices o limpieza remota requiere su propia candidata revisable y autoridad específica.
