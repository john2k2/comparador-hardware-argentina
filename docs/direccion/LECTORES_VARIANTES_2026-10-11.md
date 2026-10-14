# Lectores, asociaciones y datos RAM — 11/10/2026

Trabajo local en `correcciones-auditoria-web`, rama `codex/busqueda-funcional`, HEAD inicial `60f66e1`. Mantiene FullH4rd diferido, la cohorte privada de Cloudflare, la fecha de cierre y los límites del ensayo. No se publicó código ni se escribieron datos en Supabase. Los artefactos privados permanecen en `outputs/lectores-datos-ram-2026-10-11/` y no se incluyen en Git.

## Resultado local comprobado

Se corrigieron tres asociaciones hacia dos productos canónicos existentes. Las capturas públicas de LionTech y MaxTecno se contrastaron por URL, título principal, canonical y SHA256. MaxTecno duplica el título de producto en escritorio/móvil y agrega otros H1 en el pie; el adaptador admite exclusivamente títulos primarios idénticos. Un primario distinto o un canonical ajeno sigue rechazándose.

Las reparaciones conservaron íntegros precio, stock y fecha; después se consultaron las dos publicaciones mediante el lector real. A las 22:09 UTC los tres registros quedaron observados y comparables. No son tres publicaciones: dos registros de MaxTecno corresponden al mismo enlace.

| Modelo y variante | Tienda | Precio ARS del corte | Stock observado |
|---|---|---:|---|
| Corsair Vengeance 16 GB, DDR5 5200 CL40, kit 2x8 GB, GREY | LionTech | 570.297 | En stock |
| Kingston Fury Beast 16 GB, DDR4 3200 CL16, un módulo, negro RGB | MaxTecno | 394.823 | En stock |

La búsqueda local de `corsair grey` y `kingston rgb`, categoría RAM y precio mínimo cero, devolvió en cada caso la ficha canónica con su oferta comprobada. Evidencias: `visible-repaired.json`, `visible-refreshed.json` y `visible-search.json`. Las claves almacenadas de los productos se conservaron; algunos IDs históricos nombran otra categoría, pero se validó la categoría RAM de la fila destino.

## CompraGamer: caché y hora real

El consumidor transmite la hora de reserva mediante `observedAfter`; la caché anterior se revalida por HTTP, incluido ETag/304. Los lectores agrupado y compartido envían el máximo de las reservas del lote. La caché conserva la hora de recepción real y un error no la renueva. Los consumidores ordinarios mantienen su TTL de cinco minutos.

Prueba real en la base completa: tres solicitudes capturaron catálogo, categorías y marcas; el staging no modificó ofertas. La respuesta contenía 1.747 registros, de los cuales se guardaron 1.703 publicaciones mapeadas. Esto no acredita cobertura completa ni asociaciones correctas: se registraron 407 asociaciones exactas, 2.254 necesitadas de prueba de variante, 45 conflictos, 28 diferencias de categoría y 2.763 ofertas sin respuesta correspondiente.

Se seleccionaron seis ofertas conocidas elegibles y sin backoff protegido. Una revalidación posterior a todas las reservas actualizó las seis con identidad, precio y stock comprobados a las 22:16:04.547 UTC. La respuesta 304 informó cero bytes de cuerpo y sí cuenta como una solicitud HTTP. Las seis conservan esa misma hora real. Incluyen GPU, CPU con refrigeración y SSD; no se anuncia la totalidad de CompraGamer renovada. Evidencia: `cg-end-to-end.json`.

## Datos de fabricante por oferta

Cuatro ofertas CompraGamer de tres MPN Corsair recibieron metadata en `pilot_ram_enrichment`, por oferta, referencia de publicación y MPN literal. Se completaron kit, formato y otros atributos omitidos según la evidencia de fabricante. La captura real de las 22:15:57.489 UTC confirmó nuevamente las cuatro SKU y permitió revalidar los planes.

Cada registro conserva títulos originales, hashes y procedencia por campo. Las filas completas de producto y precio permanecieron idénticas: no se renovó fecha, no se aprobó un precio y no se completaron specs globales de grupos con ofertas diferentes. Esta metadata todavía requiere integración revisada en el lector; no vuelve las cuatro ofertas comparables por sí misma. Evidencia: `metadata-applied.json` y `metadata-current-capture.json`; fuentes y límites en [FUENTES_RAM_FABRICANTE_2026-10-11.md](FUENTES_RAM_FABRICANTE_2026-10-11.md).

Integridad después de estas operaciones: 59.692 productos / 73.827 ofertas en la copia completa, incluyendo 7.160 ofertas RAM; muestra remota sin ampliación, 1.012 productos / 1.366 ofertas, incluyendo 46 registros RAM. Ambas SQLite pasaron integridad y claves foráneas. Tener esos registros no equivale a haber actualizado todos sus precios.

## Ciclo y caché de Cloudflare

Hubo fallos del ciclo automático por conexión antes de esta unidad. Una prueba manual volvió a completarse a las 22:08 UTC. El consumidor actualizado se activó mediante reemplazo atómico del bundle, conservando la configuración original. La primera ejecución del scheduler a las 22:16 completó tres intentos sin observaciones nuevas: 403, 404 y ficha sin precio comprobable. Conservó precios y fechas; el estado remoto costó una fila leída y cero escritas. No se presenta ese resultado como recuperación de tres ofertas.

Las primeras 48 búsquedas del ensayo actual devolvieron HTTP 200 y coincidieron con SQLite y el motor original, pero todas usaron BYPASS: leyeron **319.734 filas D1**. El marcador de proyección había vencido a las 19:00:25.906 UTC. Los ticks sin observaciones no mantenían la proyección, dejando la caché deshabilitada. La corrección del ciclo renueva únicamente estadísticas/proyección de reloj mediante un delta acotado, sin renovar precio, stock ni fecha.

La prueba conserva vencimiento el 12/10/2026 a las 15:03:10.335 UTC, intervalo de 900 segundos, hasta 200 ofertas/400 HTTP/20.000 escrituras remotas por día. El mantenimiento toma un tick propio cuando vence la proyección y deja las fuentes para el siguiente. Si las transiciones son frecuentes puede retrasar actualizaciones; debe medirse antes de ampliar la cobertura. El límite y el cierre del piloto no se extendieron.

Activación real a las 22:29:45 UTC: `maintained`, 14 filas de proyección cambiadas, **36 lecturas / 64 escrituras D1**, una sincronización y cero HTTP a tiendas. Se compararon las 1.366 filas completas de oferta antes/después: idénticas. Checkpoint, SQLite y marcador remoto coinciden; la configuración conserva el mismo SHA256. LaunchAgent reinstalado, una ejecución confirmada con salida cero y espera del siguiente tick de 900 segundos. El ledger local estimó 51 escrituras, mientras el recibo D1 confirmó 64: usar el recibo para consumo real.

Después del mantenimiento se repitieron las mismas 16 combinaciones de búsqueda, tres veces cada una: **48/48 coincidieron con SQLite y el motor original**. Hubo 16 MISS y 32 HIT, todos en SCL. Las lecturas bajaron de 319.734 a **72.173**, una reducción del **77,43%**; cada HIT usó una lectura/consulta para comprobar el marcador. La latencia media de ida/vuelta desde la Mac pasó de 1.320 a 548 ms. Es una medición de red y respuesta completa, no CPU. Las consultas frías todavía tardaron entre 873 y 2.173 ms: queda trabajo en esa demora inicial y no se promete búsqueda perfecta ni capacidad para tráfico real. Evidencias: `maintenance-confirmed.json`, `cloudflare-search-after.json`, `search-comparison.json`, `scheduler-confirmed.json`.

## Consumo y producción

La credencial de lectura inicial venció; Wrangler renovó el acceso existente sin contratar un plan. Analytics a las 22:16:59 UTC informó para la base piloto 359.286 lecturas y 23.984 escrituras acumuladas del día, y 329 solicitudes del Worker con cero errores. CPU p50 1,241 ms / p99 8,579 ms: la introspección de GraphQL confirmó que los campos vienen en microsegundos. Este corte es anterior a parte de la prueba de caché; no representa el consumo final de la unidad ni necesariamente el agregado de toda la cuenta.

Las cuotas [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) son 5 millones de filas leídas y 100.000 escritas por día; [Workers Free](https://developers.cloudflare.com/workers/platform/limits/) admite 10 ms de CPU por invocación. Analytics tiene demora: conservar los recibos directos junto al agregado. Una muestra dentro de cuota no prueba capacidad para el catálogo completo o tráfico real.

Último corte de Analytics, 22:31:17 UTC: **679.058 lecturas / 24.048 escrituras D1**, 389 solicitudes del Worker, cero errores y CPU p50 1,405 ms / p99 9,011 ms. Todavía no incorpora todas las 48 consultas posteriores al mantenimiento: su consumo de 72.173 lecturas consta en los recibos directos. No sumar diferencias de Analytics como consumo exacto del turno. El margen de CPU p99 observado sigue siendo estrecho frente al límite gratuito.

La verificación de las 22:16:59 UTC mantuvo el deployment público `5b77fc37-9fea-48df-aca5-e1c43956f0a6` y la versión `4add74ae-b3f4-4165-8040-5f143505c977` al 100%, sin variación del etag ni fecha de modificación. Las nuevas RAM permanecen en la copia completa de la Mac; no se incorporaron a la cohorte remota cerrada.

El corte final de las 22:31:17 UTC volvió a confirmar exactamente el mismo deployment, versión, distribución, etag y fecha de modificación públicos. No se contrató ningún plan ni se publicó la rama.

## Pruebas y reversión

Revisión independiente de la unidad de lectores/variantes: 142/142 pruebas aprobadas, 95 Vitest y 47 Node; TypeScript y lint focal sin errores. Incluyen revalidación/cache fallida, reservas, asociaciones contradictorias, SKU interna/ausente, diferencias de kit/DDR/CL/formato/color/RGB y preservación de datos. Las pruebas reales descritas arriba complementan las fixtures.

Mantenimiento: 41/41 Node (26 ciclo, seis proyección, cuatro transporte, cinco presupuesto), TypeScript sin errores y lint sin errores; permanece un warning anterior por una variable del fixture. La revisión independiente encontró y cerró un caso que confirmaba cambios locales después de expirar el piloto. Los nuevos gates y dos reproducciones comprueban cierre durante estado remoto o cálculo: cero marcador/proyección/ledger/outbox nuevos, cero HTTP/sync y reserva liberada. La corrección se revisó nuevamente antes de activarla. Total de estas unidades: 183 pruebas aprobadas.

Revertir lectores o datos fabricante tiene límites independientes descritos en READERS.md, ASSOCIATIONS.md y el documento de fuentes. Antes de restaurar SQLite detener el scheduler; conservar la copia completa, la base comparable, resúmenes, proyección y marcador. No invertir sólo `product_id`. Para metadata retirar únicamente los cuatro registros privados documentados; restaurar código no borra observaciones reales. El bundle anterior y las copias previas permanecen en el directorio privado del ensayo.

Prioridad siguiente: integrar la evidencia MPN por publicación en el gate de ofertas y demostrar nuevas observaciones de las cuatro RAM; resolver URLs antiguas sólo con continuidad de identidad demostrada y ampliar lectores por familia. Reducir también el costo y demora de consultas frías, y medir postergación de fuentes/mantenimiento antes de ampliar el ensayo. Más de 200 proyecciones vencidas se rechazan sin cambios y requieren una unidad posterior por lotes. La base íntegra se conserva; su actualización confiable todavía no tiene cobertura total.
