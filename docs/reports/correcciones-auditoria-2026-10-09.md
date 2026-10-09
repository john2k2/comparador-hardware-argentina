# Correcciones de la auditoría web — 09/10/2026

Candidata local sobre `5ef6a9dfbb5b5dbeba59901fc76bb9202823f89a`, rama
`codex/correcciones-auditoria-web`. El checkout principal con cambios ajenos se
conservó intacto. Este documento registra correcciones y pruebas de la candidata;
no acredita recuperación de producción.

La implementación está cerrada localmente en nueve commits, con revisión
independiente y pruebas completadas. La publicación está pendiente de aprobación.

| Hallazgo | Corrección preparada | Límite que sigue abierto |
| --- | --- | --- |
| A01 · ofertas de otro producto | Guard de almacenamiento y exclusión visible sin caída de búsqueda | No se reparó la contaminación guardada en la base |
| A02 · falso éxito del armador | Estados honestos, conservación de selección y reintento | La corrección no genera ofertas nuevas |
| A03 · guías sin candidatas | Modelo completo antes del límite de ocho filas | Falta comprobar siete ofertas elegibles en el ciclo real |
| A04 · portada vacía | Lector requerido y guardado tras el ciclo existente | Falta observar el próximo corte publicado |
| A05 · contacto incoherente | Correo tomado en ejecución y cabeceras preservadas | Pendiente verificación con configuración productiva |
| A06 · sitemap incompleto ante fallos | Error temporal explícito, conteo válido y límites de espera | No modifica el rendimiento de la consulta SQL |
| A07 · CPU duplicadas | Dedupe conservador de variantes y mínimos | Sólo dentro de cada página |
| A08 · promoción antes de utilidad | Comparar y armar primero; afiliación después | No es un rediseño general |

## A04 — Guardado de la selección pública

El proceso de medición configuraba al escritor de Supabase, pero no al lector
público. Podía guardar una selección vacía como si hubiese leído el catálogo.
El guardado ahora exige ambos clientes, valida y limita el contenido público, y
conserva la fecha real de cada oferta. No publica relleno como bajas de precio.

Los procesos existentes reciben la clave pública de lectura; al terminar un ciclo
correcto `guides` o `priority`, se prepara la selección desde los datos ya guardados.
Este paso no vuelve a consultar tiendas ni modifica la cadencia del cron.

Evidencia de origen: el [proceso de medición del 09/10](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37938812977)
reportó el guardado público; la lectura de la fila confirmó cero ofertas y cero
bajas. Se comprobó la existencia de los nombres de los secretos, sin exponer valores.

Validación local: `save-observed-snapshot.test.ts` cubre lector ausente sin escritura,
error de lectura/escritura, vacío legítimo, sanitización y fechas. Forma parte de la
tanda focal de siete archivos y 83 pruebas aprobadas, registrada en
`outputs/correcciones-auditoria/unidades-estables.log`, y de `npm run verify`.
No se ejecutó el colector contra producción.

Reversión: retirar los cambios de los dos workflows y de
`save-observed-snapshot.ts` junto con su test. No requiere migración ni borrado de datos.
Pendiente productivo: observar un ciclo natural, su fila guardada y la portada
resultante. Mantener tres horas por oferta y el vencimiento del corte; un job verde
no demuestra por sí solo cobertura suficiente.

## A05 — Contacto y documentos públicos

`/contacto` se resuelve con la configuración de correo del servidor en ejecución.
Se excluye de los documentos prefabricados: antes la URL limpia podía mostrar
contacto pendiente mientras la variante con parámetros sí tenía correo. La caché
breve de ejecución sigue disponible. Los documentos que sí se generan conservan
también HSTS y Permissions-Policy.

Validación: test de caché sobre URL limpia, parámetros y navegación RSC; E2E
`contact-runtime.spec.ts` aprobado en Chrome sobre build local. Comprueba tres
enlaces de correo, la variante de asesoría y la navegación desde el armador con
`qa@example.test`. No abre el cliente de correo ni envía mensajes. La dirección
de prueba pertenece exclusivamente al entorno E2E.

Reversión: restaurar la lista de documentos y `public-document-cache`, con sus
tests y la variable de correo del harness. Antes de publicar, construir con la
configuración real; no reutilizar los artefactos del entorno E2E como publicación.

## A06 — Sitemap sin falsos vacíos

Los lectores distinguen respuesta vacía confirmada de fallo de transporte o datos
inválidos. Ante indisponibilidad, índice y páginas devuelven `503`, `no-store` y
`Retry-After`; una página vacía confirmada conserva `404`. Un último conteo válido
en memoria permite anunciar todas sus páginas, sin cachear esa contingencia.
Cada intento de lectura vence a los 2,5 segundos; el conteo admite dos intentos.

Validación: tests del lector y de ambos route handlers dentro de la tanda focal
de 83 pruebas aprobadas. Incluyen cero confirmado, `null`, cadena vacía, datos
malformados, excepciones, reintento y conservación del conteo válido. El harness
invoca los handlers y verifica estado, cabeceras y XML; no precisa navegador.

Reversión: `src/lib/seo/sitemap.ts`, ambos handlers y sus tests. No hay cambios SQL.
Límite: esto corrige la respuesta ante el fallo; no acelera por sí solo la consulta
productiva ni garantiza que Google ya haya vuelto a procesar el sitemap.

## A03 — Candidatas de las guías antes del límite

La búsqueda de una memoria Mancer Vant elegía «3200» como término de consulta y
agotaba la ventana de ocho filas con otros modelos. Se exigen los términos del
modelo antes de aplicar ese límite; cada término puede estar en título, marca,
modelo, título normalizado o clave canónica. La marca puede estar fuera del título.

La lectura productiva de diagnóstico encontró la Mancer almacenada; su oferta
estaba vencida y pendiente de revisión. Encontrar la fila no la vuelve comprable.
Se mantienen identidad, stock, tres horas por oferta y margen editorial del 10%.
El [ciclo de guías observado](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37957708442)
no probó recuperación de las siete piezas de cada guía.

Validación: contrato del lector en `product-read.test.ts`, incluyendo términos
repartidos entre campos y entrada vacía después de sanitizar. Tanda integrada
`npx vitest run src/lib/persistence/product-read.test.ts src/lib/search/read-initial-search-page.test.ts`:
30 pruebas aprobadas en el corte de integración, más la revisión independiente
del filtro corregido. El RPC se simula; la lectura de diagnóstico fue sólo lectura.

Reversión: retirar `buildGuideSearchOrFilter`, su uso exclusivo en el lector de
guías y la regresión correspondiente. No revertir el guard de identidad del lector
general. Pendiente: observar las ofertas guardadas por el próximo ciclo normal;
no se lanzó una comprobación manual ni se cambió la selección editorial.

## A01 — Identidad de almacenamiento

El guard compartido detecta contradicciones explícitas de medio, interfaz,
formato, ubicación interna/externa, marca, modelo y capacidad. La ficha de WD Green
auditada ya no puede usar un HDD WD Elements, una microSD Kingston o un SSD ADATA
como oferta de ese producto. La restricción alcanza ficha, mínimo vigente,
JSON-LD, guías, comparativas y armador. Una omisión de atributos no acredita
equivalencia. Un dictamen antiguo no prevalece sobre una contradicción explícita.

Validación: `storage-identity.test.ts` reproduce las tres URLs de la ficha pública,
incluye ofertas con fecha renovada sólo dentro de la fixture para aislar identidad,
y comprueba una siguiente oferta exacta. Verifica que datos y fechas originales
no cambien. `comparison-pricing.test.ts` cubre el consumidor de comparativas.
Ambos pasaron dentro de `npm run verify` y en revisión focal independiente.

Reversión: retirar el helper de almacenamiento y su llamada en `offer-identity`,
con la propagación de contexto a `comparison-pricing` y sus tests. El guard de
páginas descrito más adelante depende de esta protección para almacenamiento.
No se borró ni reescribió el catálogo: la contaminación almacenada sigue siendo
deuda a reparar por una operación posterior revisable.

## A02 — Armador y catálogos incompletos

La sugerencia distingue vacío, parcial y piezas seleccionadas dentro del máximo.
Usa ofertas elegibles de hasta tres horas y refrigeración vigente cuando corresponde.
Un resultado vacío conserva la selección manual y no emite `generate_pc_budget`.
Una PC con gráficos integrados conocidos puede prescindir de GPU dedicada; eso
se informa explícitamente y no se inventa compatibilidad certificada.

Los catálogos fallidos conservan su aviso y tienen un reintento específico. La
recuperación no pisa productos o fechas obtenidos mientras esperaba ni resucita
filas retiradas por una lectura posterior. Se bloquea también Enter durante carga.

Validación: `model.test.ts` y `client.test.ts` cubren frescura, stock desconocido,
máximo exacto, refrigeración, vacío/parcial/completo y actualización concurrente;
forman parte de la tanda focal de 83 pruebas. El harness de navegador incluye RAM
vencida con selección manual y ausencia de evento, GPU con primer `503`, reintento,
presupuesto, envío, cuotas, guardado, enlace y actualización parcial de ofertas.
El resultado final de navegador se registra al final de este documento.

Reversión: componentes y modelo del armador, helper de fusión en `client.ts`, tests
unitarios y escenarios añadidos a `pc-builder.spec.ts`. No cambia datos remotos.
Límite: arreglar el mensaje y el reintento no produce stock ni precios nuevos.

## A08 — Prioridad de la portada

La búsqueda ofrece accesos directos a comparar un componente y armar una PC.
La promoción afiliada pasa después de ofertas, guías y comparativas. Se conserva
la dirección visual retro existente, sin convertir esto en un rediseño general.

Validación: E2E con el piloto afiliado encendido, orden de bloques, destinos de
los accesos y ancho de 390 px sin desborde. Capturas de escritorio y móvil bajo
`outputs/correcciones-auditoria/capturas/`. Las imágenes remotas están bloqueadas
por el harness; las capturas acreditan estructura, no entrega de portadas externas.
Impeccable sobre los cuatro componentes cambiados: `[]`, sin hallazgos del detector.

Reversión: posición del bloque afiliado y accesos directos en `HomePageClient.tsx`,
junto con el escenario añadido a `home-page.spec.ts`.

## A07 — Duplicados de CPU sin perder variantes ni ofertas válidas

La muestra pública de cuatro filas Ryzen 5600 queda en dos tarjetas: tres nombres
sin presentación se reúnen con mínimo de $233.700; BOX $287.270,10 queda separado.
BOX, TRAY, cooler incluido, ausente y desconocido no se equiparan por omisión.
Se preservan publicaciones alternativas de una misma tienda y las observaciones
históricas, que no pueden ganar el mínimo vigente.

La revisión independiente reprodujo un caso adicional: dictámenes válidos ligados
a nombres distintos podían perder validez al cambiar el título tras fusionar.
Se conservan los sujetos originales y se rechaza la fusión de páginas si cambia
el mínimo vigente de las entradas o viola el rango pedido. Así, las ofertas
contractuales de $233.700 y $250.000 siguen visibles por separado; una tercera CPU
de $240.000 queda ordenada entre ambas. No se transfiere una aprobación de identidad.

Validación: fixture pública original con fechas intactas, tests de variantes y
alias revisados. Tanda final del especialista: siete archivos y 65 pruebas
aprobadas. API, caché y SSR conservan vigencia, total SQL 40 y offset 12 en la
fixture paginada. El caso adicional es contractual, no una incidencia productiva
observada. La inspección independiente lo verificó nuevamente antes del cierre.

Reversión: las reglas CPU en `search-dedupe.ts` y sus tests; el puente público
descrito a continuación depende del nuevo dedupe. La fixture JSON reproduce
evidencia y no contiene credenciales. Límite: dedupe y orden sólo dentro de la
página recibida, sin prometer unicidad u orden global entre páginas.

## A01/A07 — Integración pública, caché y render inicial

La página recibida de SQL aparta fichas con contradicción explícita y sin otra
oferta vigente utilizable; cuando existe alternativa válida, recalcula el precio
y reevalúa min/max. La caché aplica el mismo guard con los filtros de la consulta.
Después de la deduplicación se reordena la página por precio.

Se conserva el conteo SQL y se informa `identityExcludedOnPage` al usuario. Sólo
se recalcula el total de duplicados cuando la respuesta contiene todo el conjunto
y no hubo exclusiones. Una ficha contaminada no hace fallar las demás.

Validación: regresiones del loader SQL, helper de página, API, caché y SSR; E2E
comprueba una tarjeta válida y el aviso de exclusión. La integración del loader
simula la respuesta del RPC, y los demás tests conservan los módulos reales de
guard y dedupe. No presentan mocks como recuperación de la base productiva.

Reversión: retirar en conjunto el puente en `product-read`, los tipos y la
propagación API/SSR/caché, con la visualización del contador y sus tests. El guard
de dominio de almacenamiento puede permanecer. No hay migraciones. Para evaluar
una PR, mantener este conjunto coherente aunque exceda 400 líneas; dividir sólo
si se conserva el contrato completo, sin borrar evidencia para reducir el diff.

## Verificación final y candidata

- `npm run verify`: lint y tipos aprobados; **2.196 tests unitarios aprobados,
  2 omitidos**, en 224 archivos aprobados y 2 omitidos; **199 tests operativos
  aprobados**. Recibo: `outputs/correcciones-auditoria/verify-final-cierre.log`.
- Chrome: matriz de 31 escenarios sobre armador, home, contacto, identidad, CSP,
  filtros y paginación; 30 pasaron en la corrida integrada. La nueva prueba de
  reintento tenía URLs de ejemplo insuficientes para la comprobación positiva del
  modelo. Se corrigió exclusivamente su fixture y la del caso RAM vencida;
  **ambos escenarios pasaron al repetirlos**. Quedan 31 escenarios distintos
  comprobados, con esa secuencia explícita en `e2e-cierre.log` y `e2e-reintento.log`.
  No se cambió la regla de producto para hacer pasar la prueba.
- Inspección visual de portada y armador en escritorio y 390 px; filtros también
  verificados a 320 px. Capturas guardadas. Detector Impeccable: sin hallazgos.
- Build Next.js aprobado. `opennextjs-cloudflare build` completo aprobado, con
  `worker.js` generado. El intento de reutilizar el build E2E mediante
  `--skipNextBuild` falló por falta del trace de middleware; la reconstrucción
  completa creó el trace y resolvió el empaquetado sin modificar código.
- Worker **local**: portada y las dos variantes de contacto respondieron 200 con
  CSP, HSTS y Permissions-Policy. Ambas páginas de contacto ofrecieron tres enlaces
  a `qa@example.test`. El proceso local se detuvo al terminar. No se enviaron correos.
- Siete documentos prefabricados contienen las cabeceras esperadas y no existe
  `contacto.json`. El paquete de QA no se reutiliza para publicar; se reconstruye
  con la configuración productiva.
- Revisión independiente: cerró los defectos de concurrencia del reintento, filtro
  de guías y contexto de dictámenes CPU. El último corte reprodujo API/caché/SSR y
  pasó 53 pruebas focales. No quedaron defectos materiales confirmados dentro del
  alcance revisado. No equivale a auditoría completa de seguridad o cobertura global.

Commits de implementación, en orden:

| Commit | Unidad |
| --- | --- |
| `f32c81d` | Guardado de la portada y workflows |
| `336a060` | Contacto y cabeceras de documentos |
| `b994fcc` | Disponibilidad del sitemap |
| `253dcff` | Selección de candidatas para guías |
| `97d2136` | Identidad de almacenamiento |
| `847131d` | Armador y recuperación |
| `bdefbb2` | Prioridad visual de la portada |
| `6bfaa3a` | Reglas de agrupación CPU y fixture de evidencia |
| `27853c6` | Integración pública de identidad, dedupe y caché |

La unidad CPU suma 740 líneas cambiadas, de las cuales 549 corresponden a la
fixture JSON de la captura pública. El puente público suma 459 líneas; se
conservó unido con sus regresiones API/SSR/caché. Si se abre PR, este exceso debe
quedar visible para el revisor; se recomienda conservar la unidad o dividirla
sólo si se mantiene el contrato. No se comprimieron tests ni evidencia para
aparentar menor tamaño.

El remoto `main` seguía en `5ef6a9d` al cierre. Los cambios de aplicación están
commiteados; sólo quedan evidencias locales sin seguimiento en
`outputs/correcciones-auditoria/`. Sin push, despliegue, migraciones, limpieza de
datos, cambios de cuentas ni ejecución manual de refresh.

## Comprobación posterior a una publicación aprobada

1. Construir y desplegar esta candidata con las variables reales; conservar el
   identificador de la versión previa para volver atrás si hay regresión.
2. Verificar las fichas contaminadas, búsqueda CPU, filtros/paginación, armador
   sin datos y reintento, contacto limpio y con parámetros, portada y sitemaps.
3. Observar el siguiente ciclo natural de guías y el corte público guardado.
   Contrastar siete ofertas elegibles por guía y sus fechas individuales; si no
   están, mantener el estado incompleto y tratar la recuperación como pendiente.
4. Separar una reparación de datos o dedupe global de esta publicación. Requieren
   candidata propia y evidencia; no se deducen de que este build haya pasado.
