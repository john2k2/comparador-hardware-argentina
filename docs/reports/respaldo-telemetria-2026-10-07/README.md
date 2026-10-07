# Respaldo recuperable de telemetría y retiro del lote

**Estado actual, 07/10 21:25 UTC:** retiro específico autorizado y confirmado: 250 eventos, 149 endpoint/101 tienda, cero claves restantes en la lectura independiente. Tamaños físicos iguales; capacidad abierta. [Ejecución y conciliación posterior](ejecucion/README.md).

El resto de este documento conserva el corte de preparación anterior a esa autorización.

**Respaldo concreto cerrado, originales intactos.** Jonathan autorizó continuar las recomendaciones tras la primera medición de capacidad. Esta entrega respaldó los mismos 250 eventos, verificó recuperación y preparó su retiro/restauración para revisión. El permiso anterior del piloto de 1.000 filas no se amplía y el retiro remoto sigue pendiente.

## Resultado de preparación del 07/10/2026, anterior al retiro

| Verificación | Resultado |
|---|---|
| Selección exacta | 250 claves: 149 endpoint y 101 tienda; corte 20:10 UTC |
| Exportación completa | Seis campos, cinco lecturas GET de 50; CSV 101.582 B |
| Archivo canónico | NDJSON 120.359 B → gzip 10.711 B, 91,10% menos |
| Storage | Dos objetos nuevos/11.352 B; bucket privado existente |
| Recuperación sin gzip local | Descarga desde custodia de sólo manifiesto y selección |
| Recuperación en PG17.11 aislado | Diez casos aprobados; 250/seis campos iguales al CSV original |
| Origen a las 21:03:19 UTC | 250/seis campos sin cambios frente al respaldo |
| Acceso público/anónimo | Ambos objetos denegados, HTTP 400; cero políticas modificadas |
| Pruebas habituales | 96/96, sin omisiones, 2.272 ms; veinte nuevas |
| Revisión independiente | Sol/high; sin hallazgos materiales abiertos; SQL y hashes reconciliados |
| Datos retirados de producción | **0** |

Manifiesto SHA-256 **6558b3d3ccc94614e90a16264c835cd604a1f8afac18ef7791e50847e848a654**, gzip SHA 6c8bfa764172ada8f3390ecec69c3432dda3dd86bebf0c896faa89088ff9ce32. Código y documentos guardados sólo localmente en codex/capacidad-costo-cero. [Evidencia agregada](verificacion.json), [codec](CODEC.md), [Storage](STORAGE.md), [operación](OPERACION.md), [retiro y recuperación](RETIRO.md).

## Qué acredita esta entrega

La referencia de recuperación es el CSV original importado directamente a PostgreSQL, sin reconstruirlo desde el codec. Se compara contra el archivo descargado de Storage en los seis campos, incluyendo JSONB numérico y fechas con microsegundos. El harness recuperó después de un borrado confirmado sólo en su base local, evitó duplicación y conservó renovaciones/otros datos. Una fila con payload o created_at cambiado se excluye del retiro aunque conserve las cuatro anclas del preflight.

Preparados preview READ ONLY, apply de máximo 250 claves respaldadas y restore sin reemplazar filas existentes. El preparador no conecta ni ejecuta SQL. El último recibo identifica exactamente los tres archivos revisados; no usar la preparación anterior supersedida. Una aprobación eventual corresponde únicamente a ese lote, exige confirmar commit y no autoriza expansión ni mantenimiento.

Los originales en Supabase permanecen. El respaldo remoto y una copia local privada no son un backup global de Supabase ni un servicio independiente de recuperación ante pérdida de cuenta. No se probó restauración productiva, programación automática, ahorro físico o margen bajo cuota. No hay cambios de aplicación, scheduler, plan, índices, RLS ni despliegue.

## Capacidad que sigue pendiente

Lectura READ ONLY a las 21:03:19 UTC: base **930.827.411 B**, caché 245.456.896 B, historial 176.742.400 B. Storage: 21 objetos/102.016 B, privados. La observación es posterior a la medición de 20:08 y el sistema sigue escribiendo otros datos; no atribuir la diferencia sólo al respaldo. La reducción física demostrada sigue en cero. El 91,10% del gzip describe este archivo, no ahorro de esos bytes en la base ni proyección de todo el catálogo.

El retiro propuesto comprueba el mecanismo recuperable y su contabilización; 250 eventos no resuelven el presupuesto de 500 MB. Después de un retiro autorizado: reconciliar claves/commit, medir y preparar mantenimiento acotado dentro de la programación existente. La recuperación física y el conjunto activo siguen requiriendo dimensionamiento; el archivo completo de historial sigue sujeto a equivalencia por oferta y día Buenos Aires. [Primera medición y contratos](../capacidad-2026-10-07/README.md).

## Intentos y límites conservados

La revisión detectó que la primera descarga necesitaba gzip local: se corrigió a manifiesto custodiado antes del ensayo real. Se cambió el snapshot SQL a dollar quoting antes de preparar el lote final. Primer ensayo PG siete casos; luego nueve, diez con escapes y diez finales usando el restore SQL generado. Cada recibo se conserva, sin sustituir pruebas previas por el último resultado.

La prueba privada de acceso falló primero por una ruta de import antes de red, y luego por asumir que StorageUnknownError incluía statusCode. Se corrigió el import y se capturó HTTP en el transporte; no se interpretó ese error como permiso o rechazo probado. La prueba final documenta cuatro HTTP 400 reales. No se imprimieron claves/payloads ni se cambiaron políticas para superar el fallo.

Evidencia privada bajo tmp/respaldo-telemetria-2026-10-07 y copia en outputs/estudio-optimizacion-2026-10-07; permisos 0700/0600, ignorada por Git. El reporte público de código conserva agregados y hashes, nunca CSV, payloads o SQL con datos.
