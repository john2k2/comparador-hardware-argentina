# Actualización de ofertas — 10 de octubre de 2026

## Destinos editoriales

Base de trabajo: `20be619`. La consulta de una pieza recortaba a ocho filas
antes de comprobar modelo y presentación. Ocho variantes recientes podían
ocultar el procesador exacto y dejarlo sin destino para comprobar su oferta.

El reader aplica filtros de nombre antes del límite: modelo, cooler incluido,
Wraith cuando corresponde y atributos del kit de RAM. El resolver conserva
las comprobaciones finales de identidad, precio, stock y tres horas. No se
ampliaron lecturas, concurrencia, ventana comprable ni margen editorial.

Cuatro regresiones reproducen el desplazamiento con reader, mapper y resolver
reales. Las consultas contra PostgREST recuperaron los destinos de los Ryzen
5500, 5700 y 7600, y de la RAM Patriot CL36: 351–1055 ms en este corte.
La lectura fue con credencial pública y sin persistencia. Los precios antiguos
siguen fuera del subtotal hasta obtener una observación nueva válida.

La lectura directa de CompraGamer corroboró 5500, 5700 y 7600 con stock.
La RAM 17061 devolvió `no-observation`: no acredita agotamiento ni disponibilidad.
Una corrección de selección no basta para presentar siete piezas comprables.

La evidencia detallada está en `outputs/actualizacion-ofertas-2026-10-10/`:
`guide-reader-runtime.json`, `fuentes-guia-lectura.json` y
`fuentes-restantes-lectura.json`. Es un corte, no una garantía futura.

## Lectura acotada de solicitudes de búsqueda

El plan consulta como máximo veinte señales agregadas de las últimas 24 horas
y selecciona hasta tres consultas elegibles después de validar texto y fecha.
Los contadores son solicitudes, no usuarios únicos ni demanda humana acreditada.

Cada consulta selecciona hasta cinco IDs mediante el documento indexado y
después hidrata sólo esas filas. Se usan la normalización de búsqueda existente,
prefiltros de chip/variante y kit explícito antes del límite, y los controles
finales de intención y categoría. Las referencias antiguas conservan su fecha;
permiten intentar comprobar una publicación, no acreditan que sea comprable.

La consulta general con totales agotó el tiempo SQL en la prueba real de
`ryzen`. La lectura separada de IDs y ofertas completó el plan de tres consultas
en 1999 ms en el corte previo a los últimos controles de variante. Un error de
DB es explícito; no se convierte en una lista vacía. La selección es acotada,
no representa toda la demanda ni toda la cobertura del mercado.

## Integración con el runner prioritario

El proceso existente atiende guías, después la muestra diaria cuando corresponde,
y finalmente las señales de búsqueda. La última fase admite hasta diez intentos,
dos destinos conocidos por producto y un presupuesto de tres minutos dentro
del remanente total. Omite productos con una oferta comparable de menos de
90 minutos. Guarda cada observación antes de admitir la siguiente y reserva
90 segundos para lectura, revisión y guardado. Es un límite de admisión: una
RPC que ya está en curso conserva su respuesta; no es un timeout duro de DB.

El recibo separa las observaciones de guías/muestra de las de búsqueda. Una
señal de búsqueda no acredita un ciclo diario útil G02. Sólo se cuentan ACK
confirmados; fecha, stock desconocido e identidad pendiente conservan sus reglas.
Un error de demanda deja evidencia fallida y conserva los guardados críticos.

La guarda distribuida de treinta minutos devuelve `deferred` cuando otra
ejecución reciente ya la consumió. El workflow conserva ese recibo sin inventar
conteos, sin refrescar la portada ni atribuir cobertura global a ese intento.
Un error real de la guarda falla por separado. No se cambiaron cron, scheduler,
índices, migraciones, RLS, retención ni ventanas de elegibilidad.

La revisión independiente detectó y se corrigieron el corte de demanda antes
de validar consultas, el presupuesto que omitía el tiempo de guardado, y la
selección de variantes por coincidencia parcial. La prueba final de lectura
completó el plan y tres casos CPU/GPU en 4509 ms; los casos de variantes tardaron
477–1071 ms. Evidencia: `demand-read-final.json`.
