# Retención acotada preparada y capacidad dimensionada

**Candidata local revisada, todavía sin publicar ni activar. Capacidad física abierta.** Encargo de Jonathan «ok hace eso»: preparar retención dentro de la programación existente y dimensionar recuperación. No amplía la autorización anterior de retirar exactamente 250 eventos respaldados. Base de esta entrega: `4f6c9d3`, rama `codex/capacidad-costo-cero`; main remoto comprobado `614caa1`. No cambió código de la web ni el catálogo durante esta preparación.

El trabajo diario conserva el workflow y sus dos horarios. Agrega un job separado únicamente después del cron priority, sin afectar las revisiones horarias de guías ni sumar una programación. Predeterminado `inspect`, GET de metadatos sin escrituras. El modo `archive-retire` requiere aprobación explícita configurada y dos funciones SQL exclusivas del rol server; no basta publicar archivos para habilitarlo.

## Comportamiento y límites

- Sólo eventos operativos vencidos de endpoint/tienda. Cutoff fijo al menos cinco minutos anterior; activos, otros scopes e historial quedan fuera.
- Hasta cuatro lotes de 250: máximo 1.000 por ejecución diaria, 120 segundos y 5 MiB nuevos. Selector reserva 3 MiB por lote bajo un tope interno de contenedor de 50 MiB; ese tope no certifica saldo global de la cuenta ni es una reserva transaccional de Storage.
- Antes de cada retiro, tres objetos privados e inmutables: gzip, manifiesto y selección. Subida y descarga exacta, hashes y seis campos conservados, con números JSON grandes como texto. Recuperación de los objetos desde el hash custodiado; no es recuperación de toda la base.
- Un solo intento de retiro, comparación exacta de seis campos y conciliación GET independiente. Cambios o filas ausentes no se atribuyen como retiros propios. ACK perdido/inválido o conciliación fallida detienen ese run y conservan respaldo.
- No hay pausa persistente de futuros cron. Ante resultado desconocido, el operador debe pasar a `inspect` antes del siguiente ciclo y conciliar. No reintentar para convertir una respuesta incierta en éxito.
- Sólo recibo agregado con hashes como artefacto de 30 días; los payloads y la selección permanecen privados. Los respaldos no se borran al alcanzar el tope.

Las variables de activación no existen todavía en GitHub. Se verificaron los nombres de las credenciales server disponibles en GitHub, sin leer sus valores desde esa cuenta. No se publicó el workflow, no se instalaron funciones en Supabase ni se configuró el modo mutante.

## Evidencia de cierre

| Comprobación | Resultado y alcance |
|---|---|
| `npm run test:ops` | 133/133, cero fallos/omisiones; 37 nuevas: núcleo 16, transporte 9, CLI 10, workflow 2 |
| Transporte completo simulado | Cuatro lotes, 1.000 retiros reconocidos/conciliados, doce objetos privados; selector repetido read-only y retiro sin retry |
| PostgreSQL local | Siete grupos aprobados: precisión, diferencias/ausentes, validaciones, esquema, permisos/RLS y tope de archivos; fixtures revertidas |
| Supabase advisors local | CLI salida 0, sin hallazgos en el esquema mínimo de fixture; no es auditoría de producción |
| Inspección Supabase real | 07/10 22:07:38 UTC: un GET, HTTP 200, 1.004 ms, 250 metadatos; cero RPC, Storage o retiros |
| Recuperación física local | PG17.11 aislado; seis campos de las 250 originales restaurados exactamente; ensayo sintético separado de 20.000 filas |
| Calidad/revisión | ESLint de archivos nuevos y diff check aprobados; revisión independiente Sol/high cerrada sin hallazgos materiales abiertos |

La revisión corrigió el bloqueo del segundo selector, la atribución incorrecta de una fila ya ausente y la validación SQL de JSON inválido incluso si su fila falta. No se repitieron build/recorridos de Next.js: esta entrega sólo modifica scripts, workflow y SQL. No hay ejecución mutante real del modo automático ni duración/throughput remoto demostrados. [Recibo agregado](verificacion.json).

## La decisión de capacidad

La lectura real de 21:46 UTC mantiene **930.827.411 B de base**, caché 245.456.896 B e historial 176.742.400 B. No se ejecutó VACUUM ni otra eliminación en esta entrega. En el ensayo local, DELETE devolvió cero bytes; VACUUM normal habilitó reutilización del heap, y FULL redujo tamaño con condiciones de acceso/espacio que no se midieron remotamente. No se extrapola el ensayo a la base productiva. [Estudio completo](RECUPERACION.md).

Se conservaron 344–841 eventos por día en seis días UTC completos, media 568,33. Un máximo diario de 1.000 podría frenar la acumulación si se completa, pero el atraso anclado de 343.280 eventos tardaría **al menos 796 días** bajo esa hipótesis constante; 2.159 con el pico observado. Son escenarios teóricos, no fechas prometidas ni tasa bruta garantizada. **Este límite sirve para estabilizar; no resuelve el atraso.**

Incluso descontar hipotéticamente toda caché e historial deja **508.628.115 B** con los tamaños medidos. No es un mínimo compactado y tampoco conserva lo necesario. El conjunto de catálogo actual ocupa 456.237.056 B, tabla e índices. Antes de prometer costo cero sostenible, hay que medir estructuras activas y sus contratos; `idx_scan` bajo no autoriza eliminar índices.

Recomendación: publicar la candidata e instalar únicamente las dos funciones revisadas, habilitar hasta 1.000/día en el cron existente y medir su primer ciclo natural. La activación requiere autorización específica. En paralelo, la próxima unidad D02 debe preparar drenaje respaldado por etapas y estudiar espacio del catálogo activo, con ahorro físico comprobado antes de ampliar. El historial conserva carry-forward/día Buenos Aires; compactación, retiros mayores o simplificación de índices necesitan su propia candidata y decisión. No abrir otro proveedor ni otro scheduler para esquivar esta evidencia.

## Unidades y reversión

Seis unidades locales con pruebas/evidencia junto al comportamiento: [núcleo](CORE.md), [custodia y transporte](STORAGE.md), [RPC y regresión PG](RPC.md), [CLI y programación](SCHEDULER.md), [capacidad física](RECUPERACION.md) y este cierre. El recibo fija las cinco unidades de comportamiento; el hash del cierre documental se conserva en dirección y custodia privada. Cada unidad permanece debajo de 400 líneas añadidas/eliminadas.

Pasar a `inspect` detiene futuras mutaciones; quitar el job conserva la programación original. Revocar/retirar las dos funciones no restaura filas. Una restauración de eventos exige recuperar el archivo privado, preservar cambios posteriores y autorización concreta. Se conserva intacto el respaldo anterior del lote ya retirado. Esta preparación no autoriza borrar más datos, restaurar producción, cambiar índices/RLS/plan ni realizar mantenimiento físico.
