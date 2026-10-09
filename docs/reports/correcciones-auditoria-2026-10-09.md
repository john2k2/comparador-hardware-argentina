# Correcciones de la auditoría web — 09/10/2026

Candidata local sobre `5ef6a9dfbb5b5dbeba59901fc76bb9202823f89a`, rama
`codex/correcciones-auditoria-web`. El checkout principal con cambios ajenos se
conservó intacto. Este documento registra correcciones y pruebas de la candidata;
no acredita recuperación de producción.

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
observada. La inspección independiente vuelve a verificarlo antes del cierre.

Reversión: las reglas CPU en `search-dedupe.ts` y sus tests; el puente público
descrito a continuación depende del nuevo dedupe. La fixture JSON reproduce
evidencia y no contiene credenciales. Límite: dedupe y orden sólo dentro de la
página recibida, sin prometer unicidad u orden global entre páginas.
