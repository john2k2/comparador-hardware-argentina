# Correcciones integrales: cierre local

Fecha: 14/10/2026, madrugada de Santiago. Autorización de Jonathan: corregir y probar en local, sin publicar. El código queda en `codex/correcciones-integrales-local-20261013`; revisión de implementación `62820414a8d5e9a84b24fc97c67cb9227b70d9f8`. Los documentos de cierre se guardan en el commit posterior.

**Resultado:** portada, sincronización, errores auditados del catálogo y correcciones técnicas complementarias implementados y probados. No se publicó, no se escribieron datos remotos y no se cambió el servicio Mac instalado. La base principal con trabajo ajeno quedó fuera de esta integración.

Esta entrega acredita correcciones locales. La recuperación pública, la continuidad de los ciclos, las siete ofertas de la guía de $3M y la utilidad para compradores externos conservan sus comprobaciones posteriores. Los tests no convierten ingresos de $0 en un negocio validado.

**Qué cambió y por qué**

| Área | Corrección | Prueba relevante |
| --- | --- | --- |
| Portada | En modo Mac/SQL lee la misma generación que las fichas. Se quitaron una consulta global innecesaria y el acceso a otra caché de catálogo. La ruta falla con 503 explícito cuando el backend no está disponible | Cuatro ofertas reales coinciden en tienda, URL, precio y fecha entre SQLite, API y portada; escritorio 1440 px y móvil 390 px |
| Portada legacy | Un fallo parcial de guías permite guardar una selección válida. Se conserva el límite de 75 minutos para el snapshot y el de tres horas para las ofertas | Regresiones de éxito parcial, cancelación, corte vencido y oferta vencida |
| Coherencia editorial | Las tarjetas de guías se derivan de la selección editorial compartida; deja de anunciar AM5/8 GB para una guía AM4/16 GB | Recorrido de portada y pruebas de contenido |
| Sincronización | Puente de lectura pública del productor hacia una copia nueva. Exige misma publicación/variante, observación posterior, identidad y SKU coherentes; conserva stock y fecha originales | Tres ciclos reales válidos, rechazos registrados, casos de fallo, idempotencia, cursor y microsegundos |
| Categorías | MicroSD fuera de RAM/CPU, motherboard en motherboards y teléfonos fuera de CPU | Cinco filas reales reparadas y comprobadas en API |
| Variantes | Conserva separados DTX/DTXS 64 GB, Airone 60 negro/blanco, PRIME LC 360 normal/blanco y AORUS 5070 Ti INFINITY/MASTER | Regresiones de los cuatro pares y reparación de claves de la copia |
| Reparación de datos | Lista exacta de 13 IDs y nombres, copia aislada y reconstrucción de índices/proyección | Las tablas de ofertas, bases de precio, resúmenes y tiendas conservan sus hashes durante la reparación; después el puente cambia sólo observaciones admitidas |
| Fechas | Política v2 alinea lectura SQL con JavaScript sin reescribir fechas. Permite abrir generaciones v1 con su política anterior | 73.827 fechas reales comparadas: cero divergencias; matriz de offsets y fracciones; copia inválida rechazada antes de promover |
| Armador | Pregunta uso gaming/general, distribuye el presupuesto en consecuencia y muestra cobertura de candidatos. Evita preferir almacenamiento caro por capacidad sin justificarlo | Presupuesto, selección APU/GPU, persistencia del uso, compartir, guardado/recuperación y móvil |
| Sitemap | Índice y páginas de productos pasan por el backend de catálogo servido | Índice 200 y primera página 200 con 1.000 URLs; regresiones de backend roto y página vacía |
| Defensas | Polling limitado antes de consultar con privilegios; contador Redis con expiración atómica; plazo total de tres segundos en controles distribuidos | 51 pruebas focales y ensayo de dependencias colgadas con salida en aproximadamente tres segundos |
| Caché y métricas | Trabajo asociado a la vida de la respuesta, errores observables y escrituras con timeout | Pruebas de `after`, fallback fuera de Next, rechazo, agotamiento del tiempo y clientes de scrapers |
| Base/CI | Aislamiento entre dos usuarios y retención acotada entran al gate; se compilan y empaquetan ambos Workers | PostgreSQL 17 desechable, build completo de OpenNext, dos dry-runs y smoke local de Worker |

**Verificación final**

Evidencia conservada en `outputs/correcciones-locales-2026-10-14/`, fuera de Git. Los logs de intentos fallidos se conservan como diagnóstico; los archivos indicados aquí son los cierres finales.

| Comprobación | Resultado final | Recibo |
| --- | --- | --- |
| Lint y TypeScript | Aprobados | `verify-approved.log` |
| Aplicación | 3.196 pruebas aprobadas, dos omitidas por sus condiciones de ejecución | `verify-approved.log` |
| Operación, copia y sincronización | 312/312 aprobadas | `verify-approved.log` |
| Recorridos críticos Chrome | 110/110 aprobados en una ejecución de un minuto | `e2e-final-complete.log` |
| Migraciones y regresiones SQL | Migraciones reproducidas y 23 archivos de regresión aprobados | `migrations.log`, `sql-tests.log` |
| RLS entre usuarios | 30 comprobaciones, datos de prueba revertidos | `user-isolation.log` |
| Retención | Preserva activos, renovados, demanda y telemetría; acota lotes y permisos | `cache-retention.log` |
| Escrituras concurrentes SQL | Dos pruebas aprobadas; contrato de precios actuales también ejecutado | `sql-node.log` |
| Dependencias de producción | Auditoría npm: cero avisos conocidos en el corte | `dependency-audit.json` |
| OpenNext | Compilación completa aprobada; no se usó `--skipNextBuild` | `worker-build-full.log` |
| Empaquetado Worker Next y proxy Mac | Ambos dry-runs aprobados, sin upload/deploy | `worker-dry-run.log`, `proxy-worker-dry-run.log` |
| Worker ejecutado localmente | Documento y CSS 200; admin anónimo 401; datos ausentes 503 sin caché | `worker-local-smoke.json` |
| Catálogo real servido | Cuatro tuplas portada/ficha/SQLite coincidentes, cinco categorías correctas, sitemap y dos pantallas | `runtime-validation.json`, `runtime-home-1440.png`, `runtime-home-390.png` |
| Reinicio local | Misma generación y fingerprint; portada 200; origen directo sin token 401 | `runtime-restart-validation.json` |
| Integridad del corte | Origen sin cambios, hash de candidata correcto, 73.827 fechas consistentes | `candidate-summary.json` |

La ejecución local usó Node 26.5.0 y PostgreSQL 17. La CI está configurada para Node 22 y no se despachó remotamente. Las dos pruebas omitidas requieren habilitar expresamente un servicio de IA o una observación externa real; no se activaron para esta verificación local.

El smoke de Worker usa datos y credenciales de prueba; el 503 del endpoint de portada es deliberado porque ese Worker aislado no tiene el backend Mac. La prueba con catálogo real se realiza por separado a través del servidor y proxy locales. La configuración de rutas y su contrato tienen pruebas propias. No se presenta ese 503 esperado como prueba de portada productiva recuperada.

Se corrigió una prueba de microsegundos que generaba una fecha al final del mismo segundo y podía quedar después del corte. La observación de prueba ahora precede siempre la consulta. El cierre completo posterior quedó aprobado; no se ocultó ni deshabilitó esa prueba.

Una revisión independiente examinó sincronización, relojes, defensas, portada y CI. Sus hallazgos concretos se corrigieron y volvieron a probar. La revisión final acotada de la lectura de portada, ejecución SQL en contenedor y política generada no encontró hallazgos nuevos. GitHub Actions no se ejecutó remotamente: se preparó su gate y se ejecutaron las comprobaciones locales pertinentes.

**Medición sobre el catálogo real**

El corte tiene 59.692 productos, 73.827 ofertas y 34 tiendas. Son existencias de la base, no cantidad de ofertas elegibles. No se fabricaron observaciones ni se consultaron comercios para hacer subir esos números.

La primera lectura de portada pasó de **2.645 ms a 81 ms** después de evitar el recorrido global. Diez lecturas posteriores tuvieron mediana de **17 ms** y máximo de **42 ms**. La API alternativa dio mediana de 15 ms y máximo de 21 ms. Es una medición secuencial en esta Mac; no estima usuarios simultáneos ni latencia pública.

La copia usada en QA es `candidate-run-v6/candidate.sqlite`, generación `mac-refresh-1791948098734`. El último ciclo transfirió 998 filas, correspondientes a 997 ofertas únicas: 473 admitidas y 524 rechazadas. Duró 22 segundos con reconstrucción y certificación. El barrido inicial sigue incompleto. Detalle de límites, fechas y rechazos en [SINCRONIZACION.md](SINCRONIZACION.md).

El certificado temporal de promoción de ese corte venció el 14/10 a las 03:26:27 UTC. La copia queda como evidencia y para reproducción local; no queda lista para activarse días después sin preparar y certificar otra. La elegibilidad de cada oferta sigue venciendo según su observación original.

**Entregas locales conservadas**

| Commit | Unidad |
| --- | --- |
| `c67ef10` | Selección de portada después de fallo parcial y contenido editorial |
| `e2b204e` | Categorías y separación de variantes |
| `a5a3f3d` | Polling y expiración atómica |
| `a116cbf` | Reparación aislada de 13 fichas |
| `740def5` | Armador por uso y cobertura |
| `480cefe` | Deadline y cancelación de proveedores de rate limit |
| `f31e2f9` | Sincronización, cursor y política de fechas |
| `dd336a3` | Portada acotada y superficies sobre el mismo catálogo |
| `19f5a7d` | Vida de tareas de caché y métricas |
| `6282041` | Gates SQL, navegador y ambos Workers |

La integración parte de `5d9baa16a6e433143c40e2678f6f3744fc932a88`, que concilia la línea publicada de catálogo Mac con el trabajo local de identidad RAM. No se reinició, sobrescribió ni incorporó a ciegas el checkout principal divergente.

**Qué queda para publicación y seguimiento**

- Preparar un corte vigente, autorizar publicación y verificar las cinco ternas originales entre productor, copia, API, pantalla y comercio; observar ciclos naturales y la finalización del barrido inicial.
- Acreditar siete ofertas exactas, actuales y compatibles antes de presentar completa la guía de $3M. Reconocer correctamente un kit RAM no demuestra stock ni completa por sí solo la guía.
- Medir capacidad, continuidad y recuperación fuera de esta Mac. Ensayos y límites en [CAPACIDAD.md](CAPACIDAD.md).
- Recuperar autorización de GA4, comprobar eventos externos y realizar D03 con compradores. Mantener el seguimiento existente, sin confundir QA con tráfico externo.
- Registrar gastos y horas, y validar una señal comercial. La rentabilidad sigue sin demostrarse.

Se detuvieron al terminar los servidores y PostgreSQL desechables usados en QA. Las capturas, recibos y copias quedan conservados localmente para revisión.

No se crearon cuentas, cobros, campañas ni otro monitor. La finalización de este paquete local no altera D02, D03 o G02 ni autoriza ampliar AdSense.
