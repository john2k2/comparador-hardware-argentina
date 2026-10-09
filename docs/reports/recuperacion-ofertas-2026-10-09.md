# Recuperación de ofertas recientes — 09/10/2026

Candidata local en `codex/recuperacion-ofertas-recientes`, basada en la revisión
publicada `cea0e3f23cd7cc1cbb45357bbce2e9b77e824184`. La implementación y su revisión
están terminadas localmente. Esta candidata todavía no está publicada.

La prioridad es que las ofertas elegibles ya guardadas lleguen a la portada y al
armador. No se añadieron tiendas ni se ampliaron las reglas de stock, identidad,
frescura o presupuesto. El checkout principal mezclado se conservó intacto.

## Resultado y causa

La portada seleccionaba las primeras 200 fichas por fecha de modificación del
producto. El armador seleccionaba las primeras 32 fichas agrupadas de cada
categoría. Ambos filtros se aplicaban antes de comprobar la observación de la
oferta. Una oferta nueva de una ficha antigua, o de una publicación individual,
podía quedar fuera aunque estuviese disponible y correctamente identificada.

El nuevo lector comienza por `product_prices.last_updated`, con stock conocido,
precio positivo y hasta tres horas. Conserva IDs y dictámenes de cada publicación,
y vuelve a validar identidad, categoría y fecha tras recuperar sus ofertas. Sus
dos consultas comparten un plazo máximo de siete segundos: hasta 160 observaciones
y 64 productos. Una respuesta fallida no se transforma en un catálogo vacío.

La portada usa esta selección para últimas ofertas y vuelve a leer un caché vacío
o con ofertas vencidas. La búsqueda manual y la restauración por ID del armador
conservan referencias históricas. No se cambian las reglas de bajas de precio.

Lectura anónima real terminada a las **20:06:35 UTC**; el código candidato usó
únicamente GET/HEAD con la clave pública, con escritura e historial desactivados
en el diagnóstico. Todas sus consultas devolvieron 200; la más lenta tardó 1.182 ms.

| Selección inicial | Publicada en ese corte | Lector candidato |
| --- | ---: | ---: |
| CPU elegibles | 3 | 15 |
| Motherboards elegibles | 1 | 30 |
| RAM elegibles | 0 | 1 |
| GPU elegibles | 1 | 8 |
| Almacenamiento elegible | 0 | 10 |
| Fuentes elegibles | 0 | 1 |
| Gabinetes elegibles | 0 | 2 |
| Refrigeración elegible | 0 | 0 |
| Últimas ofertas de portada | 0 | 4 |

Son productos elegibles dentro de ventanas acotadas, no cobertura completa ni
confirmación de todas las piezas de una PC. Las cifras pueden cambiar con cada
observación y vencimiento.

## Sugerencias que reservan las piezas necesarias

Al recuperar el catálogo se reprodujo otro fallo: sin una combinación posible
de CPU, GPU y fuente, la propuesta omitía la fuente y gastaba el remanente en
mejorar RAM o SSD. El armador ahora reserva la fuente antes de esas mejoras,
y prioriza video integrado confirmado si no alcanza para una placa dedicada.
Si una propuesta dedicada queda incompleta, evalúa una alternativa integrada y
sólo la adopta cuando la cotización queda completa dentro del máximo exacto.

Se reconoce una declaración explícita de video integrado; datos ausentes no lo
confirman. Negaciones y sufijos F/KF prevalecen sobre una ficha contradictoria,
incluidos sufijos separados y modelos de tres dígitos. La revisión independiente
encontró y cerró una omisión inicial en esa guarda.

Reproducción local sobre las mismas ofertas reales y con reloj detenido en el
corte, sin modificar sus fechas:

| Máximo | Antes, con la nueva lectura pero sugerencia anterior | Después |
| --- | --- | --- |
| $1.000.000 | Sin propuesta | Sin propuesta dentro del máximo |
| $1.500.000 | 5 piezas, sin fuente/GPU y refrigeración pendiente | 6 piezas por $1.465.270; refrigeración pendiente |
| $2.000.000 | 5 piezas por $1.985.428,87; fuente faltante | 6 piezas por $1.722.176,87; video integrado y cooler declarado |
| $3.000.000 | 7 piezas por $2.983.189; refrigeración pendiente | 6 piezas por $2.059.450,87; video integrado y cooler declarado |

La alternativa integrada no promete rendimiento gamer equivalente a una GPU.
La pantalla conserva BIOS, QVL, conectores, espacio e interfaz de almacenamiento
como comprobaciones pendientes y deja **total parcial, no confirmado** mientras
falten envíos. Las cantidades anteriores no son cotizaciones vigentes de compra.

## Guías: variante y consulta de fuente

Cuando la guía exige una latencia RAM, una CL distinta, ausente o ambigua queda
fuera de su selección y sus referencias. La guía CL36 ya no acepta una candidata
CL30. Se mantienen generación, kit, velocidad, identidad, stock y fechas.

La fuente 650W Gold se busca con `650w gold` antes del límite de ocho candidatas.
SQL de sólo lectura, con timeout de cuatro segundos, confirmó a las 20:08 UTC:
la consulta anterior devolvía ocho filas pero sólo dos Gold; la nueva devuelve
ocho Gold e incorpora candidatos antes excluidos. Esto no demuestra stock reciente.
No se renovó la selección editorial.

## Estado publicado observado por separado

El [ciclo natural de guías 37985335462](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37985335462)
corrió con la revisión anterior `cea0e3f`, de 20:12:20 a 20:13:37 UTC. Intentó 20
ofertas conocidas, obtuvo 18 observaciones y registró 15 comparables. No fue
despachado manualmente por este trabajo.

La lectura pública de las 20:19 UTC mostró:

- Guía $1M: **7 de 7**, total observado **$1.021.256**, dentro del margen editorial.
- Guía $3M: **7 de 7**, total observado **$2.984.190**.
- Guía $2M: **En preparación**, porque la selección supera el margen de $2.200.000.
- Portada: corte guardado a las 20:13:39 UTC, todavía **0 últimas ofertas / 0 bajas**.

La recuperación de las dos guías corresponde al ciclo natural del código ya
publicado, no a esta candidata. Se verificó su presentación pública; no se renovó
editorialmente ni se certificó de nuevo cada compatibilidad física o compra final.

## Verificación y evidencia

- Revisión independiente de lectura, caché y contratos del armador/guías: sin
  defectos materiales pendientes demostrados tras cerrar el caso F/KF.
- Verificación integrada: lint y tipos correctos, **2.243 unitarias aprobadas**
  (dos omitidas preexistentes) y **199 pruebas operativas aprobadas**.
- Build Next y build completo OpenNext aprobados con configuración QA aislada.
  Reutilizar directamente el build Next mediante `skipNextBuild` no funcionó:
  faltaba el archivo de trazas de middleware. El build completo produjo el Worker.
- **21 recorridos E2E** de portada, CSP/hidratación y armador aprobados.
- **10 recorridos adicionales** de reproducción local: portada y cuatro
  presupuestos, escritorio 1440 px y móvil 390 px. IDs seleccionados iguales al
  modelo, sin errores de ejecución ni desbordamiento horizontal.
- El primer intento de la reproducción usó la portada Node en lugar del documento
  público del Worker y una comparación sensible a mayúsculas. Se corrigió el
  harness; el resultado anterior se conserva como evidencia, no se atribuye al sitio.

Evidencia local bajo `outputs/recuperacion-ofertas-2026-10-09/`: lecturas, SQL,
diagnósticos, logs, reproducciones y capturas. `CANDIDATA.json` fija revisión y hashes.
Las imágenes remotas se sustituyen en la reproducción aislada; se comprueban
contenido, interacción y geometría, no exactitud de esas imágenes.

## Límites y cierre productivo pendiente

La ventana 160/64 no garantiza todas las ofertas elegibles; filas mal categorizadas
pueden consumir parte del primer corte. La segunda lectura incluye todas las
ofertas de esos productos y no fija un máximo de bytes. El plazo de siete segundos
acota el nuevo lector, no los lectores antiguos ni toda la portada.

La guía $2M necesita una renovación editorial con siete publicaciones verificadas
si se quiere restaurarla dentro de su referencia. Eso es distinto del armador
personal con video integrado. La cobertura de refrigeración sigue sin recuperarse
en el corte y no se inventaron piezas para completar $1,5M.

No hubo mutaciones SQL, migraciones, limpieza de caché/base, aprobación manual
de identidades, nuevas automatizaciones ni refresh manual. Los artefactos de build
son QA: una publicación debe reconstruir con la configuración real.

Tras autorizar esta candidata: publicar por la vía vigente, comprobar la carga
inicial del armador y esperar un ciclo natural que guarde la selección de portada.
Leer la respuesta pública y recorrer ambos tamaños. Si falla la lectura o empeora
la latencia, revertir los commits de esta candidata; no requiere reversión de datos.
La revisión publicada de retorno es `cea0e3f`, Worker
`759bf2d7-9f8a-438f-a2cb-b0195a47a27b`.
