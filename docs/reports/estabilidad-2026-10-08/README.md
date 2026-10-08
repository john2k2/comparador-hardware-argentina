# Correcciones de rendimiento y continuidad preparadas

**La candidata está implementada, probada y revisada localmente. Todavía no está publicada.** La fuente pública leída sigue en `3b7107c`, Worker `9a5e47f0`. La candidata funcional quedó en `3d26daf`, rama `codex/capacidad-costo-cero`, sobre la corrección de reserva WooCommerce `6b91cfc` previamente preparada. No se escribió en producción durante este trabajo.

Jonathan pidió buscar una solución ejecutable porque la monetización exige estabilidad. La decisión es aprovechar el sistema existente y resolver causas medidas: lecturas repetidas, espera por escritura auxiliar, continuidad de guías y espacio del respaldo. Se conservan costo cero, identidad/stock/frescura, programaciones actuales y límites diarios. La capacidad física y la cobertura general siguen abiertas.

## Qué cambia

| Entrega | Resultado local | Límite material |
|---|---|---|
| Búsqueda | 20 solicitudes SSR iguales simultáneas comparten una RPC. La API entrega resultados antes de terminar la escritura de demanda. Conserva la señal de catálogo para vacíos auténticos. | Caché/proceso no garantiza rapidez para una búsqueda nueva ni entre isolates. La RPC de catálogo no cambió. |
| Continuidad y ofertas fiables | El respaldo existente también puede recuperar guías atrasadas, registrando su origen; conserva un despacho por evento y el mismo permiso. Incluye la corrección previa que trata reservas de WooCommerce como disponibilidad desconocida. | Guías compite con adaptativo; un inicio no prueba una oferta fresca. La reserva desconocida no cuenta como stock. |
| Capacidad | Selección de metadatos gzip con recuperación de ambos formatos, readback exacto antes del retiro y límite de expansión. La muestra real de cuatro lotes ahorra 75,01% del archivo total. | Es ahorro del archivo. No libera bytes físicos de PostgreSQL ni acelera el máximo diario de 1.000 eventos. |

El laboratorio de Next de producción real, con datos simulados y credenciales ficticias, midió 489 ms para la primera API y 6 ms para su repetición mientras la escritura auxiliar tardó 2.401 ms. Veinte HTTP SSR devolvieron 200 con una sola RPC. Son pruebas de comportamiento local: las búsquedas públicas iniciales de 6,1–6,9 segundos siguen siendo la línea base hasta desplegar y medir.

## Evidencia de cierre

- `npm run verify` final: lint y tipos aprobados, 2.064 unitarias aprobadas/dos omisiones previas y 150 operativas aprobadas/cero fallos. El caso de caché vacía señalado por el reviewer quedó corregido antes de esa ejecución.
- Treinta recorridos Chrome aprobados, sin fallos/omisiones/flaky, en 46,12 segundos. Cubren búsqueda, paginación, filtros, armador, hidratación/CSP y errores con fixtures explícitas. No certifican las ofertas de las tiendas. Secciones home sin base externa conservaron su fallback y avisos previstos del laboratorio.
- Build OpenNext del código web final y ocho documentos públicos aprobados; Wrangler `--dry-run` aprobado, sin upload. El cambio posterior de compresión sólo afecta el runner Node.
- Revisión independiente Sol/high de búsqueda/scheduler y compresión sin hallazgos materiales abiertos; 47 pruebas propias de compresión y dos verificaciones de gzip concatenado. La corrección anterior de WooCommerce también fue revisada: 41 pruebas aprobadas.
- Codec nuevo sobre cuatro selecciones privadas reales: 211.082 a 18.841 bytes, recuperación exacta y hash igual a cada manifiesto original. Conserva payloads/selecciones en custodia privada; aquí sólo se incluyen agregados.

Recibos: [verificación](verificacion.json), [laboratorio HTTP](runtime.json), [compresión real agregada](codec-real-aggregate.json). Las salidas completas se conservan en custodia local privada y los laboratorios reproducibles en `tmp/estabilidad-candidata-2026-10-08/`; no se publican credenciales ni payloads de los respaldos.

## Qué queda por demostrar

La base mide 937,26 MB al corte de 14:51 UTC. Hay 342.853 eventos vencidos pendientes; eliminar filas no equivale a reducir espacio físico. El diario ya comprobado retiró 1.000 con respaldo verificable, pero ese máximo tardaría al menos 343 días en cubrir el atraso sin nuevas entradas. [Plan de capacidad y sus límites](CAPACIDAD.md).

Al corte público, 7.660 de 34.550 componentes estaban observados en 24 horas, 22,17%. La muestra diaria G02 tenía siete de nueve fichas con cobertura; guías también conservaban slots pendientes. La medición de Cloudflare desde la publicación hasta 14:42 UTC tuvo 1.703 invocaciones y cero errores, mientras otra ventana de 24 horas cruzó publicaciones y tuvo seis errores. Ninguna de ellas es un SLA ni una medida de usuarios satisfechos.

La recomendación es publicar esta candidata, comprobar las rutas reales y leer 48 horas naturales de cadencia/observaciones, efecto sobre adaptativo y el siguiente archivo diario. Después preparar una operación independiente para drenar y recuperar capacidad, manteniendo margen y reduciendo catálogo activo si hace falta. La expansión de monetización debe seguir a ofertas útiles y retorno medidos; una batería de tests no prueba esos dos resultados.

Publicar este paquete no autoriza migraciones, VACUUM, índices, ampliación de retiro, re-runs diarios, otra programación ni cambios de plan. No se ejecutó ninguna de esas acciones para preparar esta entrega.

## Unidades y reversión

1. `8e0fe5b`: [API y señal de demanda](BUSQUEDA-API.md), 129 líneas añadidas/eliminadas; aplicada antes de SSR.
2. `590eff5`: [lectura SSR compartida](BUSQUEDA-SSR.md), 260 líneas; depende de la guardia de vacíos de la API.
3. `42c8e12`: [guías en el respaldo existente](CADENCIA.md), 526 líneas. Es la menor unidad cohesiva conservando pruebas y origen del runner; se registra una excepción recomendada de tamaño para un futuro PR, sin quitar tests para encajar.
4. `3d26daf`: [archivo comprimido](COMPRESION.md), 317 líneas. Después de generar un gzip nuevo, revertir el escritor requiere conservar el lector dual y el codec; el lector anterior sólo conoce JSON.

Cada unidad incluye sus pruebas y contrato. El cierre documental agrega este informe, el plan y agregados, sin otra funcionalidad. La revisión no aprobó despliegue: falta la confirmación textual final de Jonathan para publicar la candidata concreta.
