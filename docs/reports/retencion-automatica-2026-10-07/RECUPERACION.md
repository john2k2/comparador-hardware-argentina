# Recuperación física y capacidad sostenible

**La retención de eventos puede frenar su acumulación; el retiro de 250 y un VACUUM normal no acreditan que la base entre en 500 MB.** Ensayo local terminado el 07/10/2026 a las 21:49:11 UTC, PG17.11 Homebrew. La base remota sigue sin recuperación física demostrada. No hubo conexión de este frente a Supabase, lectura de env, modificación de cuentas ni nuevo retiro remoto.

Encargo del coordinador: dimensionar recuperación física y operación a coste cero sobre `4f6c9d3`, rama `codex/capacidad-costo-cero`. Escritura limitada a este informe y `scripts/pilots/telemetry-capacity-recovery.mjs`. La copia no contiene `docs/direccion/README.md`: se consultó el documento vigente de la copia principal, cuyo corte de retiro es 21:25 UTC, además del AGENTS.md de esta copia. Cierre del ensayo: clúster propio sin TCP, DELETE/VACUUM/reinserción/VACUUM FULL medidos, restauración exacta de los seis campos del lote y clúster detenido. Eso no cierra D02 ni autoriza mantenimiento remoto.

## Evidencia anterior al ensayo

Los recibos privados `tmp/retiro-telemetria-2026-10-07/{baseline,postflight,presence-post}.json` registran 21:22–21:25 UTC:

| Medida | Antes | Después |
|---|---:|---:|
| Base, bytes físicos | 930.827.411 | 930.827.411 |
| Caché, tabla e índices | 245.456.896 | 245.456.896 |
| Historial, tabla e índices | 176.742.400 | 176.742.400 |
| operational-store-event, filas | 330.873 | 330.772 |
| operational-endpoint-event, filas | 14.077 | 13.928 |
| Activas en los once scopes | 1.681 | 1.681 |

Retiradas exactamente 101 tienda y 149 endpoint. Una lectura posterior independiente halló las 250 ausentes. Los otros nueve scopes conservaron sus conteos; eso no compara todas sus filas. El recibo `tmp/respaldo-telemetria-2026-10-07/restore-and-retirement-verified.json` conserva diez casos de recuperación local, no una recuperación completa de producción.

La lectura nueva ejecutada por el coordinador a **21:46:39 UTC**, `tmp/retencion-automatica-2026-10-07/capacity.json`, conserva base/caché/historial con los bytes de postflight. El conjunto de catálogo actual (`products`, `product_prices`, `catalog_price_summaries`) ocupa **456.237.056 B**, tabla e índices incluidos. Índices de las cinco tablas grandes: 486.522.880 B; no se suman otra vez sobre sus tamaños totales. Son estructuras que sostienen contratos, no bytes descartables por antigüedad o por un contador de lecturas. [Medición y contratos](../capacidad-2026-10-07/README.md).

Las estadísticas agregadas estiman 2.181 tuplas muertas y 337.509 vivas para caché; último autovacuum 02/10 22:44 UTC, 20 registrados. Esos estimadores difieren del conteo real y no miden bloat físico ni bytes recuperables. Los contadores acumulados de inserciones/updates no dan tasa sin período/reset; `stat_reset` vino NULL. Los índices de caché siguen siendo sólo PK/expires_at/scope, válidos y ready. No hay extensión de medición exacta de bloat en la lectura; no se instaló ninguna remotamente.

## Ensayo local reproducible

Comando: `node scripts/pilots/telemetry-capacity-recovery.mjs tmp/capacidad-2026-10-07/recovery-local-20261007.json`. El harness no acepta host/URL ni conexión configurable. Usa binarios fijos de PG17, env mínimo propio, `initdb` en un directorio nuevo privado, socket UNIX privado y `listen_addresses=''`. Comprueba `data_directory`, `cluster_name` y versión antes de las operaciones. Sólo detiene su propio clúster; no modifica servicios Homebrew.

CSV original privado de 250 filas, ligado al SHA-256 del recibo de restauración anterior. COPY por stdin; ningún payload o clave se imprime. Índices locales equivalentes a los tres del cache: PK de `cache_key`, `expires_at` y `scope`. Sentinel activo y tablas separadas de usuarios/precios/historia conservados. El ensayo sintético agrega 20.000 filas con payload de tamaño fijo, identidad propia y eliminación intercalada de 18.000; no pretende replicar distribución, bloat ni crecimiento de producción. Autovacuum apagado sólo dentro de este clúster para separar fases manuales.

Recibo privado agregado: `tmp/capacidad-2026-10-07/recovery-local-20261007.json`, inicio 21:49:09.588 y fin 21:49:11.261 UTC. Clúster detenido. Tiempos son wall clock con cliente incluido; CPU, red, latencia de Supabase y pico temporal de disco no fueron medidos.

| Fase sintética | Filas | Heap B | Tabla más índices B | Heap reutilizable FSM B |
|---|---:|---:|---:|---:|
| Insertar 20.000 | 20.000 | 12.607.488 | 13.910.016 | 0 |
| DELETE de 18.000 | 2.000 | 12.607.488 | 13.910.016 | 0 |
| VACUUM sin truncar | 2.000 | 12.607.488 | 13.918.208 | 11.238.848 |
| Reinsertar las mismas 18.000 | 20.000 | 12.607.488 | 14.032.896 | 7.488 |
| Segundo retiro y VACUUM normal | 2.000 | 12.607.488 | 14.057.472 | 11.238.848 |
| VACUUM FULL | 2.000 | 1.261.568 | 1.449.984 | 0 |

DELETE devolvió **0 B**. VACUUM abrió espacio para la reinserción con **0 B de crecimiento del heap**, pero el índice de scope creció 114.688 B: reutilización del heap no garantiza tamaño constante de toda la base. VACUUM agregó mapas/espacios auxiliares en algunas fases; tampoco es siempre un delta negativo. FSM aproxima huecos disponibles del heap, no todo el espacio reutilizable de índices o TOAST.

VACUUM FULL devolvió **12.607.488 B de tabla e índices** y el delta de `pg_database_size` fue **12.591.104 B**. La diferencia conserva el efecto de otras estructuras de la base. Las 2.000 filas supervivientes mantuvieron su hash agregado; no se borraron sólo para mejorar la medición.

En la muestra original: DELETE de 250 conservó 204.800 B; VACUUM sin truncar marcó 97.728 B de heap libre. La restauración conservó exactamente los seis campos, mantuvo el heap en 98.304 B y agregó 16.384 B a la PK. El tamaño absoluto de esa tabla pequeña no estima ahorro del cache completo. No se extrapola gzip/CSV a páginas PostgreSQL.

## Ritmo y atraso

Postflight 21:25: las dos scopes suman **343.280 eventos vencidos**, con 1.420 activos. La lectura nueva del coordinador a **21:49:22 UTC**, `tmp/retencion-automatica-2026-10-07/ingress.json`, agrupa filas conservadas por creación UTC:

| Día completo UTC | Eventos de ambas scopes conservados |
|---|---:|
| 01/10 | 344 |
| 02/10 | 841 |
| 03/10 | 475 |
| 04/10 | 418 |
| 05/10 | 558 |
| 06/10 | 774 |

Son **3.410 / 6 = 568,33 eventos/día**, máximo de 841 en esos seis días completos. El 07/10 tiene 569, día parcial al corte; el 30/09 queda fuera del cálculo por la frontera del rango de expiración. Todos los TTL encontrados están a menos de cinco minutos de 48 h. `renewed_rows` marca todas las filas por `updated_at <> created_at`: los relojes del cliente/DB difieren también en una inserción nueva, por lo que **ese indicador no demuestra renovación**.

La lectura anterior móvil de 20:10 midió 3.942/7d y 664/24h; no se mezcla su período con los seis días nuevos. No son demanda humana ni predicción de crecimiento. Son filas aún presentes, no el total bruto de inserciones; el eventual efecto de retiros/ausencias anteriores queda abierto. El retiro respaldado de 250 de septiembre no reduce los días 01–06/10.

| Hipótesis de mantenimiento | Máximo teórico por día | Resultado con entrada observada |
|---|---:|---|
| Una entrega de 250/día | 250 | No sostiene 568,33/día ni pico de 841; atraso aumenta |
| Tope local preparado: cuatro entregas de 250/día | 1.000 | Si completa las cuatro, saldo medio 431,67/día: 796 días redondeados hacia arriba; con 841/día: 2.159 días |
| Una entrega de 250/hora, 24 completadas | 6.000 | Con entrada 568,33/día, piso teórico de 64 días para el atraso |
| Una entrega de 250/día sin entrada alguna | 250 | Piso de 1.374 días, ajeno al ritmo observado |

El coordinador prepara un máximo de cuatro lotes de 250 en la programación diaria existente, con corte de dos minutos. No se ejecutó remotamente ni se demostró que alcance 1.000. Las fórmulas son `ceil(343280/(1000-3410/6))`, `ceil(343280/(1000-841))` y `ceil(343280/(6000-3410/6))`: el atraso de 21:25 sirve de ancla, no de conteo sincronizado al nuevo corte. Las hipótesis mantienen tasa y éxito constantes; no son fechas comprometidas. La fila horaria no propone otro scheduler ni acredita 24 lotes. Programación existente, fallos, duración del respaldo, throughput REST, locks y límite de runner pueden reducir esos máximos.

El adaptativo tiene 17 minutos y máximo nominal de 2.500 ofertas por ejecución: esos límites son de revisión de ofertas, no de retiro de eventos. No se puede quitarles presupuesto de tiempo sin medir el nuevo trabajo y preservar cobertura. **Separar estabilización de entradas de un plan de drenaje del atraso.** Un techo de 1.000 puede sostener los días observados si se completa y no hay picos nuevos; su margen no resuelve el atraso con rapidez. La recuperación por etapas debe tener entregas respaldadas, límites/recibos y autorización propia antes de ampliar, seguida de medición física. No ampliar los cuatro lotes ni la cadencia sólo por esta tabla.

Se enviaron al coordinador consultas separadas READ ONLY con `statement_timeout='3s'` y `lock_timeout='500ms'`: metadatos/tamaños, índices, extensiones y estadísticas agregadas. El recibo `ingress-plan.json` confirma **Index Scan en api_cache_entries_expires_idx**, rango de ocho días, EXPLAIN sin ANALYZE; después se ejecutó el conteo. Created_at no tiene índice. La lectura se limita a ambas scopes y no expone payloads/keys ni usuarios. Este frente revisó los recibos locales; las lecturas remotas las realizó el coordinador.

## Opciones y límites de capacidad

El TTL de 48 h está en `src/lib/metrics/constants.ts:5`; `storage.ts:20` genera expiración y `storage.ts:44` lee sólo no vencidos, con límites de 1.500/1.000. La caducidad no retira las claves únicas. La retención conserva activos y los scopes ajenos; no reemplaza identidad, historial ni frescura de ofertas.

| Opción | Aporte | Condición pendiente |
|---|---|---|
| Retención acotada y VACUUM normal | Puede convertir filas retiradas en páginas reutilizables y estabilizar churn | Mantenimiento > entrada, estadísticas de autovacuum, duración real y límite de runner; no promete reducir cuota física |
| Compactar tabla con VACUUM FULL | Puede bajar tamaño físico tras retiros | Autorización separada, ventana sin acceso, margen temporal de disco y WAL; no ejecutado remotamente |
| Archivo de historial y posterior retiro equivalente | Reduce conjunto operativo si conserva consultas/series | Demostrar carry-forward/día Buenos Aires y restauración de cada entrega; después medir físico; 14/90/365 no implica eliminar todo por edad |
| Simplificar estructuras/índices de catálogo | Podría reducir costo permanente | Coordinador debe elegir contrato y demostrar consultas/identidad/latencia; idx_scan bajo no justifica retirar un índice |
| Catálogo operativo más chico | Puede imponer techo de costo cuando el mínimo no entra | Decisión de producto explícita, conservar histórico/identidad y denominador de cobertura; no reducirlo para declarar 95% |

PostgreSQL normal libera versiones muertas para reutilizar; puede devolver páginas vacías al final bajo condiciones específicas. FULL reescribe y necesita acceso exclusivo y espacio adicional mientras conserva la copia vieja. El ensayo intercalado evita depender de la excepción del tail. No se midió el pico de disco ni el bloqueo remoto; los 13,32 ms locales de FULL no son una ventana de producción. [Documentación oficial PG17](https://www.postgresql.org/docs/17/routine-vacuuming.html#VACUUM-FOR-SPACE-RECOVERY).

Con la medición postflight, aun descontando hipotéticamente el **100% de toda caché y todo historial**, queda `930827411 - 245456896 - 176742400 = 508628115 B`. Faltarían **8.628.115 B hasta 500.000.000 B**, o **58.628.115 B hasta el objetivo propuesto de 450.000.000 B**; además esa hipótesis elimina activos e historial necesario. No es un mínimo compactado: el resto podría contener espacio reutilizable o índices simplificables, todavía sin medir. Tampoco prueba que costo cero sea imposible. **Prueba que resolver sólo esos dos archivos no permite prometer 500 MB con las estructuras físicas medidas.** No se presenta un conjunto mínimo viable calculado ni un plan de pago nuevo.

El conjunto viable debe conservar catálogo/ofertas/resúmenes actuales e índices que sostienen identidad y búsqueda, usuarios/favoritos/alertas, colas de refresh, fuentes/inventarios, circuitos/demanda, ventana operativa de eventos y el historial necesario para bajas/series. Medirlo como datos más índices más auxiliares, con crecimiento entre mantenimientos y margen, antes de certificar 450 MB. Storage se presupuesta aparte: gzip no reduce páginas DB automáticamente.

## Verificación y siguiente decisión

`node --check` aprobado. Ejecución local completa con aserciones: 250 filas restauradas exactas, los dos retiros sintéticos de 18.000, FSM disponible mayor, heap reutilizado, FULL con tamaño menor, hash de supervivientes y sentinels intactos. Argumento de salida fuera del directorio permitido rechazado antes de crear clúster. No builds, cargas masivas, tests de aplicación ni operación remota ejecutados por este frente.

Siguiente acción del coordinador: aceptar el piloto local como evidencia del mecanismo; validar el máximo preparado de cuatro lotes dentro del límite runner antes de publicarlo y distinguir mantenimiento de un drenaje por etapas autorizado aparte. Preparar una propuesta de conjunto operativo que recupere, además, la brecha de al menos 58,6 MB hacia 450 MB sin perder activos/contratos; para compactación, obtener cuota/margen de volumen y ventana/locks antes de solicitar aprobación concreta. Retención automática local, publicación, autorización de retiros, mantenimiento remoto y D02 permanecen en sus gates separados.
